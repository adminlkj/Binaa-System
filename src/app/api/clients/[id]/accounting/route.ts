import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { getAccountCodeByRole, AccountRole } from '@/lib/account-roles'

// GET /api/clients/[id]/accounting
// Returns accounting summary for a client:
// - Account code (1210 - العملاء / Clients Receivable)
// - Current balance (total invoiced - total paid)
// - Number of journal entries linked to this client
// - Number of sales invoices
// - Last transaction date
//
// P6-CRIT-001 FIX: JournalEntry has NO clientId field. Query by sourceType + sourceId
// where sourceId is the ID of a SalesInvoice or ClientPayment belonging to this client.
// (Mirror of the P5-CRIT-007 fix applied to suppliers/[id]/accounting/route.ts.)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Verify client exists (and is not soft-deleted)
    const client = await db.client.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, name: true, nameAr: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    // Get total invoiced (non-cancelled sales invoices)
    const invoiceAgg = await db.salesInvoice.aggregate({
      where: { clientId: id, status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
      _count: true,
    })

    // Get total paid (client payments)
    const paymentAgg = await db.clientPayment.aggregate({
      where: { clientId: id },
      _sum: { amount: true },
    })

    // Get journal entry stats — query by sourceType+sourceId where the source
    // belongs to this client (SalesInvoice.clientId=id OR ClientPayment.clientId=id).
    const clientInvoiceIds = await db.salesInvoice.findMany({
      where: { clientId: id },
      select: { id: true },
    })
    const clientPaymentIds = await db.clientPayment.findMany({
      where: { clientId: id },
      select: { id: true },
    })

    const invoiceIdList = clientInvoiceIds.map((i) => i.id)
    const paymentIdList = clientPaymentIds.map((p) => p.id)

    const journalEntryFilter = {
      deletedAt: null,
      OR: [
        ...(invoiceIdList.length > 0
          ? [{ sourceType: 'SALES_INVOICE', sourceId: { in: invoiceIdList } }]
          : []),
        ...(paymentIdList.length > 0
          ? [{ sourceType: 'CLIENT_PAYMENT', sourceId: { in: paymentIdList } }]
          : []),
      ],
    }

    // If no linked sources at all, skip the JE queries (empty OR would match everything)
    const hasSources = invoiceIdList.length > 0 || paymentIdList.length > 0

    const journalCount = hasSources
      ? await db.journalEntry.count({ where: journalEntryFilter })
      : 0

    const lastEntry = hasSources
      ? await db.journalEntry.findFirst({
          where: journalEntryFilter,
          orderBy: { date: 'desc' },
          select: { date: true },
        })
      : null

    // Calculate current balance (what the client owes us = invoiced - paid)
    const totalInvoiced = toNumber(invoiceAgg._sum.totalAmount)
    const totalPaid = toNumber(paymentAgg._sum.amount)
    const currentBalance = Math.round((totalInvoiced - totalPaid) * 10000) / 10000

    // BA-08: resolve account code by role (CUSTOMER_AR) — no hardcoded code.
    const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR) || '—'

    return NextResponse.json({
      accountCode: arCode,
      accountNameAr: 'العملاء',
      accountNameEn: 'Clients Receivable',
      currentBalance,
      totalInvoiced,
      totalPaid,
      journalEntryCount: journalCount,
      invoiceCount: invoiceAgg._count,
      lastTransactionDate: lastEntry?.date?.toISOString() || null,
    })
  } catch (error) {
    console.error('Error fetching client accounting info:', error)
    return NextResponse.json({ error: 'فشل في تحميل البيانات المحاسبية' }, { status: 500 })
  }
}
