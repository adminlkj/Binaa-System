import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET /api/clients/[id]/accounting
// Returns accounting summary for a client:
// - Account code (1210 - العملاء / Clients Receivable)
// - Current balance (total invoiced - total paid)
// - Number of journal entries linked to this client
// - Number of sales invoices
// - Last transaction date
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Verify client exists
    const client = await db.client.findUnique({
      where: { id },
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

    // Get journal entry stats
    const journalCount = await db.journalEntry.count({
      where: { clientId: id, deletedAt: null },
    })

    // Get last journal entry date
    const lastEntry = await db.journalEntry.findFirst({
      where: { clientId: id, deletedAt: null },
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Calculate current balance (what the client owes us = invoiced - paid)
    const totalInvoiced = toNumber(invoiceAgg._sum.totalAmount)
    const totalPaid = toNumber(paymentAgg._sum.amount)
    const currentBalance = Math.round((totalInvoiced - totalPaid) * 10000) / 10000

    return NextResponse.json({
      accountCode: '1210',
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
