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

// GET /api/account-statement/customer?clientId=...&dateFrom=...&dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    if (!clientId) {
      return NextResponse.json(
        { error: 'معرف العميل مطلوب (clientId)' },
        { status: 400 }
      )
    }

    // Get client info
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
    })

    if (!client) {
      return NextResponse.json(
        { error: 'العميل غير موجود' },
        { status: 404 }
      )
    }

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    // Get all sales invoices for this client (not cancelled)
    const invoiceWhere: Record<string, unknown> = {
      clientId,
      status: { not: 'CANCELLED' },
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) dateFilter.gte = dateFrom
      if (dateTo) dateFilter.lte = dateTo
      invoiceWhere.date = dateFilter
    }

    const invoices = await db.salesInvoice.findMany({
      where: invoiceWhere as Parameters<typeof db.salesInvoice.findMany>[0]['where'],
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        totalAmount: true,
        netAmount: true,
        vatAmount: true,
        status: true,
        notes: true,
      },
      orderBy: { date: 'asc' },
    })

    // Get all client payments for this client
    const paymentWhere: Record<string, unknown> = {
      clientId,
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) dateFilter.gte = dateFrom
      if (dateTo) dateFilter.lte = dateTo
      paymentWhere.date = dateFilter
    }

    const payments = await db.clientPayment.findMany({
      where: paymentWhere as Parameters<typeof db.clientPayment.findMany>[0]['where'],
      select: {
        id: true,
        amount: true,
        date: true,
        reference: true,
        notes: true,
        receivedIn: true,
      },
      orderBy: { date: 'asc' },
    })

    // Build statement lines
    const lines: StatementLine[] = []

    // Invoices = debits (increase receivable)
    for (const inv of invoices) {
      lines.push({
        date: new Date(inv.date).toISOString(),
        reference: inv.invoiceNo,
        description: inv.notes || `فاتورة مبيعات - ${inv.invoiceNo}`,
        debit: r4(inv.totalAmount),
        credit: 0,
        balance: 0, // will be calculated
        type: 'INVOICE',
        sourceId: inv.id,
      })
    }

    // Payments = credits (decrease receivable)
    for (const pay of payments) {
      lines.push({
        date: new Date(pay.date).toISOString(),
        reference: pay.reference || '',
        description: pay.notes || 'تحصيل من العميل',
        debit: 0,
        credit: r4(pay.amount),
        balance: 0, // will be calculated
        type: 'PAYMENT',
        sourceId: pay.id,
      })
    }

    // Sort by date
    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate opening balance (all transactions before dateFrom)
    let openingBalance = 0
    if (dateFrom) {
      const prevInvoices = await db.salesInvoice.findMany({
        where: {
          clientId,
          status: { not: 'CANCELLED' },
          date: { lt: dateFrom },
        },
        select: { totalAmount: true },
      })
      const prevPayments = await db.clientPayment.findMany({
        where: {
          clientId,
          date: { lt: dateFrom },
        },
        select: { amount: true },
      })
      const totalPrevInvoiced = prevInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
      const totalPrevPaid = prevPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
      openingBalance = r4(totalPrevInvoiced - totalPrevPaid)
    }

    // Calculate running balance
    let runningBalance = openingBalance
    for (const line of lines) {
      runningBalance = r4(runningBalance + line.debit - line.credit)
      line.balance = runningBalance
    }

    // Calculate totals
    const totalInvoiced = r4(lines.filter(l => l.type === 'INVOICE').reduce((s, l) => s + Number(l.debit || 0), 0))
    const totalPaid = r4(lines.filter(l => l.type === 'PAYMENT').reduce((s, l) => s + Number(l.credit || 0), 0))
    const closingBalance = r4(openingBalance + totalInvoiced - totalPaid)

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        code: client.code,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
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
    console.error('Error generating customer statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء كشف حساب العميل' },
      { status: 500 }
    )
  }
}
