import { db } from '@/lib/db'
import { autoEntryPurchaseInvoice, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (status) where.status = status

    const invoices = await db.purchaseInvoice.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching purchase invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير الشراء' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, purchaseOrderId, date, dueDate, notes, items, vatRate = 0.15 } = body

    if (!supplierId || !date || !dueDate || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Auto-generate invoice number
    const lastInvoice = await db.purchaseInvoice.findFirst({
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/PI-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `PI-${String(nextNum).padStart(4, '0')}`

    const invoice = await db.purchaseInvoice.create({
      data: {
        invoiceNo,
        supplierId,
        purchaseOrderId: purchaseOrderId || null,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        notes: notes || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unitPrice: number }) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        items: true,
      },
    })

    // Auto-create accounting journal entry
    try {
      await initializeChartOfAccounts()
      await autoEntryPurchaseInvoice({
        invoiceNo: invoice.invoiceNo,
        supplierId: invoice.supplierId,
        subtotal: invoice.subtotal,
        vatRate: invoice.vatRate,
        vatAmount: invoice.vatAmount,
        totalAmount: invoice.totalAmount,
        date: invoice.date,
        expenseCategory: body.expenseCategory,
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for purchase invoice:', accountingError)
    }

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating purchase invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة الشراء' }, { status: 500 })
  }
}
