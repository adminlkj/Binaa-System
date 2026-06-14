import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET: List VAT returns with optional breakdown
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

      // Get sales invoice breakdown (Output VAT)
      const salesInvoices = await db.salesInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
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

      // Get progress claims breakdown (Output VAT)
      const progressClaims = await db.progressClaim.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] },
        },
        select: {
          id: true,
          claimNo: true,
          date: true,
          totalAmount: true,
          vatAmount: true,
          status: true,
        },
        orderBy: { date: 'desc' },
      })

      // Get purchase invoice breakdown (Input VAT)
      const purchaseInvoices = await db.purchaseInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
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

      // Get subcontractor invoice breakdown (Output VAT - reverse charge or Input VAT depending on context)
      const subcontractorInvoices = await db.subcontractorInvoice.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
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

      // Get expense breakdown (Input VAT)
      const expenses = await db.expense.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          vatAmount: { gt: 0 },
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

      // Auto-calculate totals
      const outputVat = salesInvoices.reduce((s, i) => s + toNumber(i.vatAmount), 0) +
        progressClaims.reduce((s, c) => s + toNumber(c.vatAmount), 0)
      const totalSales = salesInvoices.reduce((s, i) => s + toNumber(i.totalAmount), 0) +
        progressClaims.reduce((s, c) => s + toNumber(c.totalAmount), 0)

      const inputVatFromPurchases = purchaseInvoices.reduce((s, i) => s + toNumber(i.vatAmount), 0)
      const inputVatFromSub = subcontractorInvoices.reduce((s, i) => s + toNumber(i.vatAmount), 0)
      const inputVatFromExpenses = expenses.reduce((s, e) => s + toNumber(e.vatAmount), 0)
      const inputVat = inputVatFromPurchases + inputVatFromSub + inputVatFromExpenses
      const totalPurchases = purchaseInvoices.reduce((s, i) => s + toNumber(i.totalAmount), 0) +
        subcontractorInvoices.reduce((s, i) => s + toNumber(i.totalAmount), 0) +
        expenses.reduce((s, e) => s + toNumber(e.amount), 0)

      const netVat = outputVat - inputVat

      return NextResponse.json(serializeDecimal({
        declaration: vatReturns[0] || null,
        autoCalc: {
          outputVat,
          inputVat,
          netVat,
          totalSales,
          totalPurchases,
        },
        breakdown: {
          salesInvoices,
          progressClaims,
          purchaseInvoices,
          subcontractorInvoices,
          expenses,
        },
      }))
    }

    return NextResponse.json(serializeDecimal(vatReturns))
  } catch (error) {
    console.error('Error fetching VAT returns:', error)
    return NextResponse.json({ error: 'فشل في تحميل إقرارات الضريبة' }, { status: 500 })
  }
}

// POST: Create a new VAT return (snapshot - numbers are frozen after creation)
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
        { error: 'الإقرار لهذه الفترة موجود بالفعل - لا يمكن إنشاء إقرار مكرر' },
        { status: 409 }
      )
    }

    // Calculate date range for the quarter
    const startDate = new Date(year, (quarter - 1) * 3, 1)
    const endDate = new Date(year, quarter * 3, 0, 23, 59, 59, 999)

    // ===== OUTPUT VAT: Sales Invoices + Progress Claims =====
    const salesInvoices = await db.salesInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
      },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const totalSales = salesInvoices.reduce((sum, inv) => sum + toNumber(inv.totalAmount), 0)
    const outputVatFromSales = salesInvoices.reduce((sum, inv) => sum + toNumber(inv.vatAmount), 0)
    const salesInvoiceIds = JSON.stringify(salesInvoices.map(inv => inv.id))

    // Progress Claims
    const progressClaims = await db.progressClaim.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] },
      },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const outputVatFromClaims = progressClaims.reduce((sum, c) => sum + toNumber(c.vatAmount), 0)
    const totalSalesWithClaims = totalSales + progressClaims.reduce((s, c) => s + toNumber(c.totalAmount), 0)
    const outputVat = outputVatFromSales + outputVatFromClaims

    // ===== INPUT VAT: Purchase Invoices =====
    const purchaseInvoices = await db.purchaseInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
      },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const purchaseTotals = purchaseInvoices.reduce(
      (acc, inv) => ({
        amount: acc.amount + toNumber(inv.totalAmount),
        vat: acc.vat + toNumber(inv.vatAmount),
      }),
      { amount: 0, vat: 0 }
    )
    const purchaseInvoiceIds = JSON.stringify(purchaseInvoices.map(inv => inv.id))

    // ===== INPUT VAT: Subcontractor Invoices =====
    const subcontractorInvoices = await db.subcontractorInvoice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
      },
      select: { id: true, totalAmount: true, vatAmount: true },
    })
    const subTotals = subcontractorInvoices.reduce(
      (acc, inv) => ({
        amount: acc.amount + toNumber(inv.totalAmount),
        vat: acc.vat + toNumber(inv.vatAmount),
      }),
      { amount: 0, vat: 0 }
    )

    // ===== INPUT VAT: Expenses with VAT =====
    const expenses = await db.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        vatAmount: { gt: 0 },
      },
      select: { id: true, amount: true, vatAmount: true },
    })
    const expenseTotals = expenses.reduce(
      (acc, exp) => ({
        amount: acc.amount + toNumber(exp.amount),
        vat: acc.vat + toNumber(exp.vatAmount),
      }),
      { amount: 0, vat: 0 }
    )
    const expenseIds = JSON.stringify(expenses.map(exp => exp.id))

    // Total purchases = purchase invoices + subcontractor invoices + expenses
    const totalPurchases = purchaseTotals.amount + subTotals.amount + expenseTotals.amount
    const inputVat = purchaseTotals.vat + subTotals.vat + expenseTotals.vat

    // Calculate net VAT
    const netVat = outputVat - inputVat

    // Create the VAT return as a fixed snapshot
    const vatReturn = await db.vATReturn.create({
      data: {
        period,
        year,
        quarter,
        totalSales: totalSalesWithClaims,
        outputVat,
        totalPurchases,
        inputVat,
        netVat,
        salesInvoiceIds,
        purchaseInvoiceIds,
        expenseIds,
        status: 'DRAFT',
      },
    })

    return NextResponse.json(serializeDecimal({
      ...vatReturn,
      _meta: {
        message: 'VAT return created as a fixed snapshot. Numbers are frozen and will not change.',
        salesInvoiceCount: salesInvoices.length,
        progressClaimCount: progressClaims.length,
        purchaseInvoiceCount: purchaseInvoices.length,
        subcontractorInvoiceCount: subcontractorInvoices.length,
        expenseCount: expenses.length,
      }
    }), { status: 201 })
  } catch (error) {
    console.error('Error creating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء إقرار الضريبة' },
      { status: 500 }
    )
  }
}

// PATCH: Update VAT return status (DRAFT → FILED → PAID) or record payment
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, action, paymentReference, paymentDate } = body

    if (!id) {
      return NextResponse.json(
        { error: 'يرجى تحديد الإقرار' },
        { status: 400 }
      )
    }

    const existing = await db.vATReturn.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الإقرار غير موجود' },
        { status: 404 }
      )
    }

    if (action === 'FILE') {
      // DRAFT → FILED (immuatable after this)
      if (existing.status !== 'DRAFT') {
        return NextResponse.json(
          { error: 'لا يمكن تقديم إقرار ليس في حالة مسودة' },
          { status: 400 }
        )
      }

      const vatReturn = await db.vATReturn.update({
        where: { id },
        data: {
          status: 'FILED',
          filedDate: new Date(),
        },
      })
      return NextResponse.json(serializeDecimal(vatReturn))
    }

    if (action === 'PAY') {
      // FILED → PAID
      if (existing.status !== 'FILED') {
        return NextResponse.json(
          { error: 'لا يمكن تسجيل دفع لإقرار غير مقدم' },
          { status: 400 }
        )
      }

      if (!paymentReference) {
        return NextResponse.json(
          { error: 'رقم مرجع الدفع مطلوب' },
          { status: 400 }
        )
      }

      const vatReturn = await db.vATReturn.update({
        where: { id },
        data: {
          status: 'PAID',
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          paymentReference,
        },
      })
      return NextResponse.json(serializeDecimal(vatReturn))
    }

    return NextResponse.json({ error: 'إجراء غير معروف. الإجراءات المتاحة: FILE, PAY' }, { status: 400 })
  } catch (error) {
    console.error('Error updating VAT return:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث إقرار الضريبة' },
      { status: 500 }
    )
  }
}
