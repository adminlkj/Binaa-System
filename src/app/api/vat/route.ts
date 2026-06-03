import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const vatReturns = await db.vATReturn.findMany({
      orderBy: { period: 'desc' },
    })
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
      return NextResponse.json({ error: 'يرجى تحديد السنة والربع بشكل صحيح' }, { status: 400 })
    }

    const period = `${year}-Q${quarter}`

    // Check if already exists
    const existing = await db.vATReturn.findUnique({ where: { period } })
    if (existing) {
      return NextResponse.json({ error: 'الإقرار لهذه الفترة موجود بالفعل' }, { status: 409 })
    }

    // Calculate date range for the quarter
    const startDate = new Date(year, (quarter - 1) * 3, 1)
    const endDate = new Date(year, quarter * 3, 0, 23, 59, 59, 999) // Last day of quarter

    // Sum VAT from Sales Invoices
    const salesInvoices = await db.salesInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { vatAmount: true },
    })
    const salesVAT = salesInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0)

    // Sum VAT from Purchase Invoices
    const purchaseInvoices = await db.purchaseInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { vatAmount: true },
    })
    const purchaseVAT = purchaseInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0)

    // Sum VAT from Subcontractor Invoices
    const subcontractorInvoices = await db.subcontractorInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
      },
      select: { vatAmount: true },
    })
    const subcontractorVAT = subcontractorInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0)

    // Sum VAT from Expenses
    const expenses = await db.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        vatAmount: { not: null },
      },
      select: { vatAmount: true },
    })
    const expenseVAT = expenses.reduce((sum, exp) => sum + (exp.vatAmount || 0), 0)

    // Purchase VAT = Purchase Invoices VAT + Subcontractor Invoices VAT + Expense VAT
    const totalPurchaseVAT = purchaseVAT + subcontractorVAT + expenseVAT

    // Calculate net VAT
    const netVAT = salesVAT - totalPurchaseVAT

    const vatReturn = await db.vATReturn.create({
      data: {
        period,
        salesVAT,
        purchaseVAT: totalPurchaseVAT,
        netVAT,
        status: 'DRAFT',
      },
    })

    return NextResponse.json(vatReturn, { status: 201 })
  } catch (error) {
    console.error('Error creating VAT return:', error)
    return NextResponse.json({ error: 'فشل في إنشاء إقرار الضريبة' }, { status: 500 })
  }
}

// PATCH: File a VAT return (update status to FILED)
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, action } = body

    if (!id) {
      return NextResponse.json({ error: 'يرجى تحديد الإقرار' }, { status: 400 })
    }

    if (action === 'FILE') {
      const vatReturn = await db.vATReturn.update({
        where: { id },
        data: {
          status: 'FILED',
          filedDate: new Date(),
        },
      })
      return NextResponse.json(vatReturn)
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (error) {
    console.error('Error updating VAT return:', error)
    return NextResponse.json({ error: 'فشل في تحديث إقرار الضريبة' }, { status: 500 })
  }
}
