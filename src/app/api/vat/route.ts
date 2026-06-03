import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const quarterParam = searchParams.get('quarter')

    const where: Record<string, unknown> = {}

    if (yearParam) {
      where.year = parseInt(yearParam)
    }
    if (quarterParam) {
      where.quarter = parseInt(quarterParam)
    }

    const vatReturns = await db.vATReturn.findMany({
      where,
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    })

    // If a specific year+quarter is requested, also return the breakdown data
    if (yearParam && quarterParam) {
      const year = parseInt(yearParam)
      const quarter = parseInt(quarterParam)
      const startDate = new Date(year, (quarter - 1) * 3, 1)
      const endDate = new Date(year, quarter * 3, 0, 23, 59, 59, 999)

      // Get sales invoice breakdown
      const salesInvoices = await db.salesInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          invoiceNo: true,
          date: true,
          totalAmount: true,
          vatAmount: true,
          status: true,
        },
        orderBy: { date: 'desc' },
      })

      // Get purchase invoice breakdown
      const purchaseInvoices = await db.purchaseInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          invoiceNo: true,
          date: true,
          totalAmount: true,
          vatAmount: true,
          status: true,
        },
        orderBy: { date: 'desc' },
      })

      // Get subcontractor invoice breakdown
      const subcontractorInvoices = await db.subcontractorInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          invoiceNo: true,
          date: true,
          totalAmount: true,
          vatAmount: true,
          status: true,
        },
        orderBy: { date: 'desc' },
      })

      // Get expense breakdown
      const expenses = await db.expense.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          vatAmount: { not: null },
        },
        select: {
          id: true,
          description: true,
          date: true,
          amount: true,
          vatAmount: true,
          category: true,
        },
        orderBy: { date: 'desc' },
      })

      return NextResponse.json({
        declaration: vatReturns[0] || null,
        breakdown: {
          salesInvoices,
          purchaseInvoices,
          subcontractorInvoices,
          expenses,
        },
      })
    }

    return NextResponse.json(vatReturns)
  } catch (error) {
    console.error('Error fetching VAT returns:', error)
    return NextResponse.json({ error: 'فشل في تحميل إقرارات الضريبة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const year = parseInt(body.year)
    const quarter = parseInt(body.quarter)

    if (!year || !quarter || quarter < 1 || quarter > 4) {
      return NextResponse.json(
        { error: 'يرجى تحديد السنة والربع بشكل صحيح' },
        { status: 400 }
      )
    }

    const period = `${year}-Q${quarter}`

    // Check if already exists
    const existing = await db.vATReturn.findUnique({ where: { period } })
    if (existing) {
      return NextResponse.json(
        { error: 'الإقرار لهذه الفترة موجود بالفعل' },
        { status: 409 }
      )
    }

    // Calculate date range for the quarter
    const startDate = new Date(year, (quarter - 1) * 3, 1)
    const endDate = new Date(year, quarter * 3, 0, 23, 59, 59, 999)

    // Sum from Sales Invoices (Output VAT)
    const salesInvoices = await db.salesInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true, vatAmount: true },
    })
    const totalSales = salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
    const outputVat = salesInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0)

    // Sum from Purchase Invoices (Input VAT)
    const purchaseInvoices = await db.purchaseInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true, vatAmount: true },
    })
    const purchaseTotals = purchaseInvoices.reduce(
      (acc, inv) => ({
        amount: acc.amount + (inv.totalAmount || 0),
        vat: acc.vat + (inv.vatAmount || 0),
      }),
      { amount: 0, vat: 0 }
    )

    // Sum from Subcontractor Invoices (Input VAT)
    const subcontractorInvoices = await db.subcontractorInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true, vatAmount: true },
    })
    const subTotals = subcontractorInvoices.reduce(
      (acc, inv) => ({
        amount: acc.amount + (inv.totalAmount || 0),
        vat: acc.vat + (inv.vatAmount || 0),
      }),
      { amount: 0, vat: 0 }
    )

    // Sum from Expenses (Input VAT)
    const expenses = await db.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        vatAmount: { not: null },
      },
      select: { amount: true, vatAmount: true },
    })
    const expenseTotals = expenses.reduce(
      (acc, exp) => ({
        amount: acc.amount + (exp.amount || 0),
        vat: acc.vat + (exp.vatAmount || 0),
      }),
      { amount: 0, vat: 0 }
    )

    // Total purchases = purchase invoices + subcontractor invoices + expenses
    const totalPurchases = purchaseTotals.amount + subTotals.amount + expenseTotals.amount
    const inputVat = purchaseTotals.vat + subTotals.vat + expenseTotals.vat

    // Calculate net VAT
    const netVat = outputVat - inputVat

    const vatReturn = await db.vATReturn.create({
      data: {
        period,
        year,
        quarter,
        totalSales,
        outputVat,
        totalPurchases,
        inputVat,
        netVat,
        status: 'DRAFT',
      },
    })

    return NextResponse.json(vatReturn, { status: 201 })
  } catch (error) {
    console.error('Error creating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء إقرار الضريبة' },
      { status: 500 }
    )
  }
}

// PATCH: Update VAT return status (DRAFT → SUBMITTED)
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, action } = body

    if (!id) {
      return NextResponse.json(
        { error: 'يرجى تحديد الإقرار' },
        { status: 400 }
      )
    }

    if (action === 'SUBMIT' || action === 'FILE') {
      const vatReturn = await db.vATReturn.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          filedDate: new Date(),
        },
      })
      return NextResponse.json(vatReturn)
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (error) {
    console.error('Error updating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث إقرار الضريبة' },
      { status: 500 }
    )
  }
}
