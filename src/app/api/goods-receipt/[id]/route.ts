import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const receipt = await db.goodsReceipt.findUnique({
      where: { id },
      include: {
        purchaseOrder: {
          select: { id: true, orderNo: true, status: true, supplierId: true },
        },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
        purchaseInvoice: {
          select: { id: true, invoiceNo: true, status: true },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    return NextResponse.json(receipt)
  } catch (error) {
    console.error('Error fetching goods receipt:', error)
    return NextResponse.json({ error: 'فشل في تحميل إيصال الاستلام' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.goodsReceipt.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    // Cannot modify after completion or if linked to a purchase invoice
    if (existing.status === 'COMPLETED') {
      // Only allow status change to CANCELLED
      if (body.status === 'CANCELLED') {
        const updated = await db.goodsReceipt.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: {
            purchaseOrder: { select: { id: true, orderNo: true, status: true } },
            supplier: { select: { id: true, name: true, code: true } },
            project: { select: { id: true, name: true, code: true } },
            items: true,
          },
        })
        return NextResponse.json(updated)
      }
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام مكتمل' },
        { status: 400 }
      )
    }

    // Cannot modify cancelled
    if (existing.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام ملغي' },
        { status: 400 }
      )
    }

    // Check if linked to a purchase invoice
    const linkedInvoice = await db.purchaseInvoice.findUnique({
      where: { goodsReceiptId: id },
    })
    if (linkedInvoice && body.items) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل إيصال استلام مرتبط بفاتورة مشتريات' },
        { status: 400 }
      )
    }

    // Handle status change
    if (body.status && body.status === 'COMPLETED') {
      const updated = await db.goodsReceipt.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: {
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          supplier: { select: { id: true, name: true, code: true } },
          project: { select: { id: true, name: true, code: true } },
          items: true,
        },
      })
      return NextResponse.json(updated)
    }

    // General update
    const updateData: Record<string, unknown> = {}
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.status !== undefined) updateData.status = body.status

    const updated = await db.goodsReceipt.update({
      where: { id },
      data: {
        ...updateData,
        ...(body.items && Array.isArray(body.items) && {
          items: {
            deleteMany: {},
            create: body.items.map((item: {
              description: string
              quantityOrdered: number
              quantityReceived: number
              quantityRemaining: number
              unitPrice: number
              totalPrice: number
              destination?: string
            }) => ({
              description: item.description,
              quantityOrdered: item.quantityOrdered,
              quantityReceived: item.quantityReceived,
              quantityRemaining: item.quantityRemaining,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice || (item.quantityReceived * item.unitPrice),
              destination: item.destination || 'INVENTORY',
            })),
          },
        }),
      },
      include: {
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating goods receipt:', error)
    return NextResponse.json({ error: 'فشل في تحديث إيصال الاستلام' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.goodsReceipt.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'إيصال الاستلام غير موجود' }, { status: 404 })
    }

    // Cannot delete completed receipts
    if (existing.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'لا يمكن حذف إيصال استلام مكتمل' },
        { status: 400 }
      )
    }

    // Cannot delete if linked to a purchase invoice
    const linkedInvoice = await db.purchaseInvoice.findUnique({
      where: { goodsReceiptId: id },
    })
    if (linkedInvoice) {
      return NextResponse.json(
        { error: 'لا يمكن حذف إيصال استلام مرتبط بفاتورة مشتريات' },
        { status: 400 }
      )
    }

    // Delete items first then the receipt
    await db.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } })
    await db.goodsReceipt.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف إيصال الاستلام بنجاح' })
  } catch (error) {
    console.error('Error deleting goods receipt:', error)
    return NextResponse.json({ error: 'فشل في حذف إيصال الاستلام' }, { status: 500 })
  }
}
