import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

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

    // Get journal entry stats
    const journalCount = await db.journalEntry.count({
      where: { supplierId: id, deletedAt: null },
    })

    // Get last journal entry date
    const lastEntry = await db.journalEntry.findFirst({
      where: { supplierId: id, deletedAt: null },
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Calculate current balance (what we owe the supplier = invoiced - paid)
    const totalInvoiced = toNumber(invoiceAgg._sum.totalAmount)
    const totalPaid = toNumber(paymentAgg._sum.amount)
    const currentBalance = Math.round((totalInvoiced - totalPaid) * 10000) / 10000

    return NextResponse.json({
      accountCode: '3210',
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
