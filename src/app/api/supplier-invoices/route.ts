import { db } from '@/lib/db'
import { autoEntryPurchaseInvoice, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const purchaseOrderId = searchParams.get('purchaseOrderId')
    const goodsReceiptId = searchParams.get('goodsReceiptId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId
    if (goodsReceiptId) where.goodsReceiptId = goodsReceiptId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    // Only return invoices that have a goodsReceiptId (supply chain invoices)
    where.goodsReceiptId = { not: null }

    const invoices = await db.purchaseInvoice.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching supplier invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير الموردين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { goodsReceiptId, date, dueDate, supplierInvoiceNo, supplierInvoiceDate, attachmentPath, notes, vatRate = 0.15 } = body

    // RULE: Must have goodsReceiptId - cannot create without GR
    if (!goodsReceiptId) {
      return NextResponse.json(
        { error: 'لا يمكن إنشاء فاتورة مورد بدون إيصال استلام - يجب تحديد إيصال الاستلام أولاً' },
        { status: 400 }
      )
    }

    if (!date || !dueDate) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate goods receipt exists
    const gr = await db.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: {
        items: true,
        purchaseOrder: { select: { id: true, orderNo: true } },
      },
    })

    if (!gr) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    // Check if GR already has a purchase invoice linked
    const existingInvoice = await db.purchaseInvoice.findUnique({
      where: { goodsReceiptId },
    })
    if (existingInvoice) {
      return NextResponse.json(
        { error: 'إيصال الاستلام مرتبط بالفعل بفاتورة مشتريات' },
        { status: 400 }
      )
    }

    // System auto-pulls from GR: supplierId, projectId, purchaseOrderId
    const supplierId = gr.supplierId
    const projectId = gr.projectId
    const purchaseOrderId = gr.purchaseOrderId

    // System calculates subtotal, vat, total from GR items
    const subtotal = gr.items.reduce((sum, item) => sum + item.totalPrice, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Auto-generate invoice number SI-XXX
    const lastInvoice = await db.purchaseInvoice.findFirst({
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/SI-(\d+)/)
      if (!match) {
        // Try PI pattern too since there might be existing PI-XXX invoices
        const piMatch = lastInvoice.invoiceNo.match(/PI-(\d+)/)
        if (piMatch) nextNum = parseInt(piMatch[1]) + 1
      } else {
        nextNum = parseInt(match[1]) + 1
      }
    }
    const invoiceNo = `SI-${String(nextNum).padStart(4, '0')}`

    // Build invoice items from GR items
    const invoiceItems = gr.items.map(item => ({
      description: item.description,
      quantity: item.quantityReceived,
      unitPrice: item.unitPrice,
      totalPrice: item.quantityReceived * item.unitPrice,
    }))

    const invoice = await db.purchaseInvoice.create({
      data: {
        invoiceNo,
        supplierId,
        purchaseOrderId,
        goodsReceiptId,
        projectId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        supplierInvoiceNo: supplierInvoiceNo || null,
        supplierInvoiceDate: supplierInvoiceDate ? new Date(supplierInvoiceDate) : null,
        attachmentPath: attachmentPath || null,
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        notes: notes || null,
        items: {
          create: invoiceItems,
        },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة المورد' }, { status: 500 })
  }
}
