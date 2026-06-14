import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

interface StatementLine {
  date: string
  reference: string
  description: string
  debit: number
  credit: number
  balance: number
  type: 'INVOICE' | 'PAYMENT'
  sourceId: string
}

// GET /api/account-statement/supplier?supplierId=...&dateFrom=...&dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    if (!supplierId) {
      return NextResponse.json(
        { error: 'معرف المورد مطلوب (supplierId)' },
        { status: 400 }
      )
    }

    // Get supplier info
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'المورد غير موجود' },
        { status: 404 }
      )
    }

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    // Get all purchase invoices for this supplier (not cancelled)
    const invoiceWhere: Record<string, unknown> = {
      supplierId,
      status: { not: 'CANCELLED' },
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) dateFilter.gte = dateFrom
      if (dateTo) dateFilter.lte = dateTo
      invoiceWhere.date = dateFilter
    }

    const invoices = await db.purchaseInvoice.findMany({
      where: invoiceWhere as Parameters<typeof db.purchaseInvoice.findMany>[0]['where'],
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        totalAmount: true,
        subtotal: true,
        vatAmount: true,
        status: true,
        notes: true,
      },
      orderBy: { date: 'asc' },
    })

    // Get all supplier payments for this supplier
    const paymentWhere: Record<string, unknown> = {
      supplierId,
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) dateFilter.gte = dateFrom
      if (dateTo) dateFilter.lte = dateTo
      paymentWhere.date = dateFilter
    }

    const payments = await db.supplierPayment.findMany({
      where: paymentWhere as Parameters<typeof db.supplierPayment.findMany>[0]['where'],
      select: {
        id: true,
        amount: true,
        date: true,
        reference: true,
        notes: true,
        paidFrom: true,
        paymentMethod: true,
      },
      orderBy: { date: 'asc' },
    })

    // Build statement lines
    const lines: StatementLine[] = []

    // Invoices = credits (increase payable)
    for (const inv of invoices) {
      lines.push({
        date: new Date(inv.date).toISOString(),
        reference: inv.invoiceNo,
        description: inv.notes || `فاتورة مشتريات - ${inv.invoiceNo}`,
        debit: 0,
        credit: r4(inv.totalAmount),
        balance: 0,
        type: 'INVOICE',
        sourceId: inv.id,
      })
    }

    // Payments = debits (decrease payable)
    for (const pay of payments) {
      lines.push({
        date: new Date(pay.date).toISOString(),
        reference: pay.reference || '',
        description: pay.notes || 'دفع للمورد',
        debit: r4(pay.amount),
        credit: 0,
        balance: 0,
        type: 'PAYMENT',
        sourceId: pay.id,
      })
    }

    // Sort by date
    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate opening balance (all transactions before dateFrom)
    let openingBalance = 0
    if (dateFrom) {
      const prevInvoices = await db.purchaseInvoice.findMany({
        where: {
          supplierId,
          status: { not: 'CANCELLED' },
          date: { lt: dateFrom },
        },
        select: { totalAmount: true },
      })
      const prevPayments = await db.supplierPayment.findMany({
        where: {
          supplierId,
          date: { lt: dateFrom },
        },
        select: { amount: true },
      })
      // For supplier: balance = total invoiced (payable) - total paid
      const totalPrevInvoiced = prevInvoices.reduce((s, i) => s + i.totalAmount, 0)
      const totalPrevPaid = prevPayments.reduce((s, p) => s + p.amount, 0)
      openingBalance = r4(totalPrevInvoiced - totalPrevPaid)
    }

    // Calculate running balance
    // For supplier statement: credit = increase payable, debit = decrease payable
    // Balance represents what we owe (positive = we owe, negative = they owe us)
    let runningBalance = openingBalance
    for (const line of lines) {
      // Credit increases what we owe, Debit decreases it
      runningBalance = r4(runningBalance + line.credit - line.debit)
      line.balance = runningBalance
    }

    // Calculate totals
    const totalInvoiced = r4(lines.filter(l => l.type === 'INVOICE').reduce((s, l) => s + l.credit, 0))
    const totalPaid = r4(lines.filter(l => l.type === 'PAYMENT').reduce((s, l) => s + l.debit, 0))
    const closingBalance = r4(openingBalance + totalInvoiced - totalPaid)

    return NextResponse.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        code: supplier.code,
        nameAr: supplier.nameAr,
        nameEn: supplier.nameEn,
      },
      openingBalance,
      lines,
      closingBalance,
      totalInvoiced,
      totalPaid,
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error generating supplier statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء كشف حساب المورد' },
      { status: 500 }
    )
  }
}
