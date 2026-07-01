import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Valid status transitions for Purchase Requests
const VALID_PR_TRANSITIONS: Record<string, string[]> = {
  NEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['CONVERTED_TO_PO', 'CANCELLED'], // Cannot go back to NEW
  CONVERTED_TO_PO: [], // Terminal state - cannot change further
  CANCELLED: [], // Terminal state
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params

    const purchaseRequest = await db.purchaseRequest.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
        purchaseOrders: {
          select: { id: true, orderNo: true, status: true, totalAmount: true },
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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.purchaseRequest.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
    }

    // Handle status change
    if (body.status && body.status !== existing.status) {
      const allowedTransitions = VALID_PR_TRANSITIONS[existing.status] || []

      if (!allowedTransitions.includes(body.status)) {
        // Provide specific error messages
        if (existing.status === 'APPROVED' && body.status === 'NEW') {
          return NextResponse.json(
            { error: 'لا يمكن الرجوع من حالة معتمد إلى جديد - لا يمكن التراجع عن الاعتماد' },
            { status: 400 }
          )
        }
        if (existing.status === 'CONVERTED_TO_PO') {
          return NextResponse.json(
            { error: 'لا يمكن تغيير حالة طلب شراء تم تحويله إلى أمر شراء' },
            { status: 400 }
          )
        }
        if (existing.status === 'CANCELLED') {
          return NextResponse.json(
            { error: 'لا يمكن تعديل طلب شراء ملغي' },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: `لا يمكن التحويل من ${existing.status} إلى ${body.status}` },
          { status: 400 }
        )
      }

      const updated = await db.purchaseRequest.update({
        where: { id },
        data: { status: body.status },
        include: {
          project: { select: { id: true, name: true, code: true } },
          items: true,
          purchaseOrders: {
            select: { id: true, orderNo: true, status: true, totalAmount: true },
          },
        },
      })

      return NextResponse.json(updated)
    }

    // General update - only allowed for NEW status
    if (existing.status !== 'NEW') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل طلب شراء معتمد أو محول - يمكن فقط تغيير الحالة' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (body.description !== undefined) updateData.description = body.description
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null
    if (body.source !== undefined) updateData.source = body.source
    if (body.requestedBy !== undefined) updateData.requestedBy = body.requestedBy
    if (body.date !== undefined) updateData.date = new Date(body.date)

    // Handle items update
    if (body.items && Array.isArray(body.items)) {
      updateData.items = {
        deleteMany: {},
        create: body.items.map((item: { description: string; quantity: number; unit?: string | null; notes?: string | null }) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || null,
          notes: item.notes || null,
        })),
      }
    }

    const updated = await db.purchaseRequest.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
        purchaseOrders: {
          select: { id: true, orderNo: true, status: true, totalAmount: true },
        },
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
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.purchaseRequest.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
    }

    // Only allow deletion of NEW status PRs
    if (existing.status !== 'NEW') {
      return NextResponse.json(
        { error: 'لا يمكن حذف طلب شراء معتمد أو محول إلى أمر شراء - يمكن فقط حذف الطلبات الجديدة' },
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
