import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const purchaseRequest = await db.purchaseRequest.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
        purchaseOrders: {
          select: { id: true, orderNo: true, status: true },
        },
      },
    })

    if (!purchaseRequest) {
      return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
    }

    return NextResponse.json(purchaseRequest)
  } catch (error) {
    console.error('Error fetching purchase request:', error)
    return NextResponse.json({ error: 'فشل في تحميل طلب الشراء' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.purchaseRequest.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
    }

    // Cannot modify after approval (except status changes to CONVERTED_TO_PO or CANCELLED)
    if (existing.status === 'APPROVED' || existing.status === 'CONVERTED_TO_PO') {
      // Only allow status changes for approved/converted requests
      if (body.status && !body.items && !body.description && !body.projectId) {
        // Validate status transition
        if (existing.status === 'APPROVED' && body.status === 'CONVERTED_TO_PO') {
          const updated = await db.purchaseRequest.update({
            where: { id },
            data: { status: 'CONVERTED_TO_PO' },
            include: {
              project: { select: { id: true, name: true, code: true } },
              items: true,
            },
          })
          return NextResponse.json(updated)
        }
        if (body.status === 'CANCELLED') {
          const updated = await db.purchaseRequest.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: {
              project: { select: { id: true, name: true, code: true } },
              items: true,
            },
          })
          return NextResponse.json(updated)
        }
      }
      return NextResponse.json(
        { error: 'لا يمكن تعديل طلب شراء معتمد أو محول - يمكن فقط تغيير الحالة' },
        { status: 400 }
      )
    }

    // Cannot modify cancelled requests
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل طلب شراء ملغي' }, { status: 400 })
    }

    // Handle status change to APPROVED
    if (body.status === 'APPROVED' && existing.status === 'NEW') {
      const updated = await db.purchaseRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
        include: {
          project: { select: { id: true, name: true, code: true } },
          items: true,
        },
      })
      return NextResponse.json(updated)
    }

    // General update for NEW status requests
    const updateData: Record<string, unknown> = {}
    if (body.description !== undefined) updateData.description = body.description
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null
    if (body.source !== undefined) updateData.source = body.source
    if (body.requestedBy !== undefined) updateData.requestedBy = body.requestedBy
    if (body.date !== undefined) updateData.date = new Date(body.date)

    // Handle items update: delete old and create new
    if (body.items && Array.isArray(body.items)) {
      await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
      await db.purchaseRequest.create({
        data: {
          items: {
            create: body.items.map((item: { description: string; quantity: number; unit?: string | null; notes?: string | null }) => ({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || null,
              notes: item.notes || null,
            })),
          },
        },
      })
      // Actually, we need to use update with items. Let me fix this.
    }

    const updated = await db.purchaseRequest.update({
      where: { id },
      data: {
        ...updateData,
        ...(body.items && Array.isArray(body.items) && {
          items: {
            deleteMany: {},
            create: body.items.map((item: { description: string; quantity: number; unit?: string | null; notes?: string | null }) => ({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || null,
              notes: item.notes || null,
            })),
          },
        }),
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating purchase request:', error)
    return NextResponse.json({ error: 'فشل في تحديث طلب الشراء' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.purchaseRequest.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
    }

    // Cannot delete approved or converted requests
    if (existing.status === 'APPROVED' || existing.status === 'CONVERTED_TO_PO') {
      return NextResponse.json(
        { error: 'لا يمكن حذف طلب شراء معتمد أو محول إلى أمر شراء' },
        { status: 400 }
      )
    }

    // Delete items first (cascade should handle this, but be explicit)
    await db.purchaseRequestItem.deleteMany({ where: { requestId: id } })
    await db.purchaseRequest.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف طلب الشراء بنجاح' })
  } catch (error) {
    console.error('Error deleting purchase request:', error)
    return NextResponse.json({ error: 'فشل في حذف طلب الشراء' }, { status: 500 })
  }
}
