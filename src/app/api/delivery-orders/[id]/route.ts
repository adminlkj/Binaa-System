import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: Single delivery order with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const order = await db.equipmentDeliveryOrder.findUnique({
      where: { id },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, pricingType: true, status: true, hourlyRate: true },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'أمر التوصيل غير موجود' }, { status: 404 })
    }

    // Enrich with client and project info
    let client = null
    let project = null

    if (order.clientId) {
      client = await db.client.findUnique({
        where: { id: order.clientId },
        select: { id: true, code: true, name: true, nameAr: true },
      })
    }

    if (order.projectId) {
      project = await db.project.findUnique({
        where: { id: order.projectId },
        select: { id: true, code: true, name: true, nameAr: true },
      })
    }

    return NextResponse.json({
      ...order,
      client: client || { id: order.clientId || '', code: '', name: 'غير معروف', nameAr: null },
      project,
    })
  } catch (error) {
    console.error('Error fetching delivery order:', error)
    return NextResponse.json({ error: 'فشل في تحميل أمر التوصيل' }, { status: 500 })
  }
}

// PATCH: Update delivery order status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.equipmentDeliveryOrder.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'أمر التوصيل غير موجود' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) {
      updateData.status = body.status
    }

    if (body.site !== undefined) {
      updateData.site = body.site || null
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes || null
    }

    if (body.returnDate !== undefined) {
      updateData.returnDate = body.returnDate ? new Date(body.returnDate) : null
    }

    const order = await db.equipmentDeliveryOrder.update({
      where: { id },
      data: updateData,
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, pricingType: true, status: true, hourlyRate: true },
        },
      },
    })

    // If returned, set equipment back to AVAILABLE
    if (body.status === 'RETURNED') {
      await db.equipment.update({
        where: { id: order.equipmentId },
        data: { status: 'AVAILABLE' },
      })
    }

    // If delivered, set equipment to IN_USE
    if (body.status === 'DELIVERED') {
      await db.equipment.update({
        where: { id: order.equipmentId },
        data: { status: 'IN_USE' },
      })
    }

    // If cancelled from PENDING, set equipment back to AVAILABLE
    if (body.status === 'CANCELLED' && existing.status === 'PENDING') {
      await db.equipment.update({
        where: { id: order.equipmentId },
        data: { status: 'AVAILABLE' },
      })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Error updating delivery order:', error)
    return NextResponse.json({ error: 'فشل في تحديث أمر التوصيل' }, { status: 500 })
  }
}

// DELETE: Delete a delivery order (only PENDING status)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.equipmentDeliveryOrder.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'أمر التوصيل غير موجود' }, { status: 404 })
    }

    // Only PENDING orders can be deleted
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'لا يمكن حذف أمر توصيل إلا في حالة الانتظار' },
        { status: 403 }
      )
    }

    // Set equipment back to AVAILABLE if it was set to IN_USE
    await db.equipment.update({
      where: { id: existing.equipmentId },
      data: { status: 'AVAILABLE' },
    })

    await db.equipmentDeliveryOrder.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'تم حذف أمر التوصيل بنجاح' })
  } catch (error) {
    console.error('Error deleting delivery order:', error)
    return NextResponse.json({ error: 'فشل في حذف أمر التوصيل' }, { status: 500 })
  }
}
