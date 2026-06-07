import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Valid status transitions for Purchase Orders
const VALID_PO_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['PARTIALLY_RECEIVED', 'CANCELLED'], // Point of no return: cannot go back to DRAFT
  PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [], // Terminal state
  CANCELLED: [], // Terminal state
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        purchaseRequest: { select: { id: true, requestNo: true, status: true } },
        items: true,
        goodsReceipts: {
          select: { id: true, receiptNo: true, status: true, date: true },
        },
        invoices: {
          select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
        },
      },
    })

    if (!purchaseOrder) {
      return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
    }

    return NextResponse.json(purchaseOrder)
  } catch (error) {
    console.error('Error fetching purchase order:', error)
    return NextResponse.json({ error: 'فشل في تحميل أمر الشراء' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
    }

    // Handle status change
    if (body.status && body.status !== existing.status) {
      const allowedTransitions = VALID_PO_TRANSITIONS[existing.status] || []

      if (!allowedTransitions.includes(body.status)) {
        return NextResponse.json(
          {
            error: existing.status === 'APPROVED' || existing.status === 'PARTIALLY_RECEIVED' || existing.status === 'RECEIVED'
              ? 'لا يمكن الرجوع بعد الاعتماد - أمر الشراء معتمد ولا يمكن تحويله إلى مسودة'
              : existing.status === 'CANCELLED'
              ? 'لا يمكن تعديل أمر شراء ملغي'
              : existing.status === 'RECEIVED'
              ? 'أمر الشراء مستلم بالكامل ولا يمكن تغيير حالته'
              : `لا يمكن التحويل من ${existing.status} إلى ${body.status}`,
          },
          { status: 400 }
        )
      }

      // If changing to APPROVED, update the linked PR status to CONVERTED_TO_PO
      if (body.status === 'APPROVED' && existing.purchaseRequestId) {
        const pr = await db.purchaseRequest.findUnique({
          where: { id: existing.purchaseRequestId },
        })
        if (pr && pr.status === 'APPROVED') {
          await db.purchaseRequest.update({
            where: { id: existing.purchaseRequestId },
            data: { status: 'CONVERTED_TO_PO' },
          })
        }
      }

      const updated = await db.purchaseOrder.update({
        where: { id },
        data: { status: body.status },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          purchaseRequest: { select: { id: true, requestNo: true, status: true } },
          items: true,
          goodsReceipts: {
            select: { id: true, receiptNo: true, status: true, date: true },
          },
          invoices: {
            select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
          },
        },
      })

      return NextResponse.json(updated)
    }

    // General update - only allowed for DRAFT status
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل أمر شراء بعد الاعتماد - يمكن فقط تغيير الحالة' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.deliveryDate !== undefined) updateData.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null
    if (body.paymentTerms !== undefined) updateData.paymentTerms = body.paymentTerms
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.supplierId !== undefined) updateData.supplierId = body.supplierId
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null

    // Recalculate totals if items are updated
    if (body.items && Array.isArray(body.items)) {
      const items = body.items as { description: string; quantity: number; unit?: string; unitPrice: number }[]
      const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
        return sum + (item.quantity * item.unitPrice)
      }, 0)
      const vatRate = body.vatRate ?? existing.vatRate
      const vatAmount = subtotal * vatRate
      const totalAmount = subtotal + vatAmount

      updateData.subtotal = subtotal
      updateData.vatRate = vatRate
      updateData.vatAmount = vatAmount
      updateData.totalAmount = totalAmount
      updateData.items = {
        deleteMany: {},
        create: items.map((item: { description: string; quantity: number; unit?: string; unitPrice: number }) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || null,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      }
    }

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        purchaseRequest: { select: { id: true, requestNo: true, status: true } },
        items: true,
        goodsReceipts: {
          select: { id: true, receiptNo: true, status: true, date: true },
        },
        invoices: {
          select: { id: true, invoiceNo: true, status: true, totalAmount: true, paidAmount: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating purchase order:', error)
    return NextResponse.json({ error: 'فشل في تحديث أمر الشراء' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { goodsReceipts: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'أمر الشراء غير موجود' }, { status: 404 })
    }

    // Only allow deletion of DRAFT status POs
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف أمر شراء معتمد أو مستلم - يمكن فقط حذف المسودات' },
        { status: 400 }
      )
    }

    // Block deletion if there are linked goods receipts
    if (existing.goodsReceipts.length > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف أمر شراء مرتبط بإيصالات استلام' },
        { status: 400 }
      )
    }

    // Delete items first then the order
    await db.purchaseOrderItem.deleteMany({ where: { orderId: id } })
    await db.purchaseOrder.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف أمر الشراء بنجاح' })
  } catch (error) {
    console.error('Error deleting purchase order:', error)
    return NextResponse.json({ error: 'فشل في حذف أمر الشراء' }, { status: 500 })
  }
}
