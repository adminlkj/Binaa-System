import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { generateZatcaQRForInvoice } from '@/lib/zatca-qr'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const purchaseOrderId = searchParams.get('purchaseOrderId')
    const goodsReceiptId = searchParams.get('goodsReceiptId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId
    if (goodsReceiptId) where.goodsReceiptId = goodsReceiptId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (search) {
      where.OR = [
        { invoiceNo: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      supplier: { select: { id: true, name: true, code: true } },
      purchaseOrder: { select: { id: true, orderNo: true, status: true } },
      goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
      project: { select: { id: true, name: true, code: true, projectType: true } },
      items: true,
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const invoices = await db.purchaseInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(invoices)
    }

    const [data, total] = await Promise.all([
      db.purchaseInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.purchaseInvoice.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch supplier invoices:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier invoices', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
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
    const subtotal = gr.items.reduce((sum, item) => sum + toNumber(item.totalPrice), 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Build invoice items from GR items
    const invoiceItems = gr.items.map(item => ({
      description: item.description,
      quantity: item.quantityReceived,
      unitPrice: item.unitPrice,
      totalPrice: toNumber(item.quantityReceived) * toNumber(item.unitPrice),
    }))

    // Create invoice + accounting entry in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Auto-generate invoice number SI-XXX inside transaction
      const lastInvoice = await tx.purchaseInvoice.findFirst({
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

      const invoice = await tx.purchaseInvoice.create({
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
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })

      // P5-CRIT-001 FIX: DRAFT invoices must NOT have a journal entry.
      // The JE is created only when the invoice is approved (status → SENT)
      // via the supplier-invoices/[id] PUT route. Previously the POST created a JE
      // immediately, which meant DRAFT invoices appeared in the GL (R1 violation)
      // and the DRAFT→SENT transition was a no-op (journalEntryId already set).

      // Re-fetch to include journalEntryId (will be null for DRAFT)
      return await tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })
    })

    // Generate and store ZATCA QR code for the supplier invoice
    try {
      const company = await db.companySetting.findFirst()
      if (company && result) {
        const zatcaQr = generateZatcaQRForInvoice({
          date: result.date,
          totalAmount: toNumber(result.totalAmount),
          vatAmount: toNumber(result.vatAmount),
        }, {
          sellerName: company.nameEn || company.nameAr,
          vatNumber: company.taxNumber || '',
        })
        if (zatcaQr) {
          await db.purchaseInvoice.update({
            where: { id: result.id },
            data: { zatcaQr },
          })
        }
      }
    } catch (qrError) {
      console.error('[API] ZATCA QR generation failed for supplier invoice:', qrError)
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create supplier invoice:', error)
    return NextResponse.json({ error: 'Failed to create supplier invoice', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
