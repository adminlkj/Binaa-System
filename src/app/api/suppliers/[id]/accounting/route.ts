import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { getAccountCodeByRole, AccountRole } from '@/lib/account-roles'

// GET /api/suppliers/[id]/accounting
// Returns accounting summary for a supplier:
// - Account code (3210 - الموردون / Suppliers Payable)
// - Current balance (total invoiced - total paid)
// - Number of journal entries linked to this supplier
// - Number of purchase invoices
// - Last transaction date
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Verify supplier exists
    const supplier = await db.supplier.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, nameAr: true },
    })

    if (!supplier) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }

    // Get total invoiced (non-cancelled purchase invoices)
    const invoiceAgg = await db.purchaseInvoice.aggregate({
      where: { supplierId: id, status: { not: 'CANCELLED' } },
      _sum: { totalAmount: true },
      _count: true,
    })

    // Get total paid (supplier payments)
    const paymentAgg = await db.supplierPayment.aggregate({
      where: { supplierId: id },
      _sum: { amount: true },
    })

    // Get journal entry stats — P5-CRIT-007 FIX:
    // JournalEntry has NO supplierId field. Query by sourceType + sourceId
    // where sourceId is the ID of a PurchaseInvoice or SupplierPayment belonging to this supplier.
    const supplierInvoiceIds = await db.purchaseInvoice.findMany({
      where: { supplierId: id },
      select: { id: true },
    })
    const supplierPaymentIds = await db.supplierPayment.findMany({
      where: { supplierId: id },
      select: { id: true },
    })

    const invoiceIdList = supplierInvoiceIds.map(i => i.id)
    const paymentIdList = supplierPaymentIds.map(p => p.id)

    const journalCount = await db.journalEntry.count({
      where: {
        deletedAt: null,
        OR: [
          ...(invoiceIdList.length > 0 ? [{ sourceType: 'PURCHASE_INVOICE', sourceId: { in: invoiceIdList } }] : []),
          ...(paymentIdList.length > 0 ? [{ sourceType: 'SUPPLIER_PAYMENT', sourceId: { in: paymentIdList } }] : []),
        ],
      },
    })

    // Get last journal entry date
    const lastEntry = await db.journalEntry.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(invoiceIdList.length > 0 ? [{ sourceType: 'PURCHASE_INVOICE', sourceId: { in: invoiceIdList } }] : []),
          ...(paymentIdList.length > 0 ? [{ sourceType: 'SUPPLIER_PAYMENT', sourceId: { in: paymentIdList } }] : []),
        ],
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Calculate current balance (what we owe the supplier = invoiced - paid)
    const totalInvoiced = toNumber(invoiceAgg._sum.totalAmount)
    const totalPaid = toNumber(paymentAgg._sum.amount)
    const currentBalance = Math.round((totalInvoiced - totalPaid) * 10000) / 10000

    // BA-08: resolve account code by role (SUPPLIER_AP) — no hardcoded code.
    const apCode = await getAccountCodeByRole(AccountRole.SUPPLIER_AP) || '—'

    return NextResponse.json({
      accountCode: apCode,
      accountNameAr: 'الموردون',
      accountNameEn: 'Suppliers Payable',
      currentBalance,
      totalInvoiced,
      totalPaid,
      journalEntryCount: journalCount,
      invoiceCount: invoiceAgg._count,
      lastTransactionDate: lastEntry?.date?.toISOString() || null,
    })
  } catch (error) {
    console.error('Error fetching supplier accounting info:', error)
    return NextResponse.json({ error: 'فشل في تحميل البيانات المحاسبية' }, { status: 500 })
  }
}
