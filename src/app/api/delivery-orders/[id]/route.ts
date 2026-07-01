import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'

// GET: Single delivery order with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

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
    let client: { id: string; code: string; name: string; nameAr: string | null } | null = null
    let project: { id: string; code: string; name: string; nameAr: string | null } | null = null

    if (order.clientId) {
      client = await db.client.findFirst({
        where: { id: order.clientId, deletedAt: null },
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

// PATCH /api/delivery-orders/[id]
// P6-CRIT-008 FIX: this duplicate PATCH endpoint reintroduced the Phase 3 bug
// (equipment.status clobbering — no RENTED check). It now mirrors the corrected
// logic in /api/delivery-orders/route.ts PATCH:
//   - Use $transaction so the DO update + equipment update are atomic.
//   - When DELIVERED: only flip equipment to IN_USE if currently AVAILABLE.
//     If RENTED (active rental contract), leave the equipment status alone —
//     the rental contract owns it.
//   - When RETURNED: only flip to AVAILABLE if not RENTED.
//   - When CANCELLED: only revert to AVAILABLE if not RENTED.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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

    const newStatus = body.status as string | undefined

    const order = await db.$transaction(async (tx: PrismaTransaction) => {
      const updated = await tx.equipmentDeliveryOrder.update({
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

      // P3-BUG / P6-CRIT-008 fix: respect RENTED equipment state.
      if (newStatus === 'DELIVERED') {
        const currentEq = await tx.equipment.findUnique({
          where: { id: updated.equipmentId },
          select: { status: true },
        })
        if (currentEq?.status === 'AVAILABLE') {
          await tx.equipment.update({
            where: { id: updated.equipmentId },
            data: { status: 'IN_USE' },
          })
        }
        // If RENTED or any other state — leave it alone (rental contract owns the status).
      } else if (newStatus === 'RETURNED') {
        const currentEq = await tx.equipment.findUnique({
          where: { id: updated.equipmentId },
          select: { status: true },
        })
        if (currentEq?.status !== 'RENTED') {
          await tx.equipment.update({
            where: { id: updated.equipmentId },
            data: { status: 'AVAILABLE' },
          })
        }
      } else if (newStatus === 'CANCELLED') {
        if (existing.status === 'DELIVERED') {
          const currentEq = await tx.equipment.findUnique({
            where: { id: updated.equipmentId },
            select: { status: true },
          })
          if (currentEq?.status !== 'RENTED') {
            await tx.equipment.update({
              where: { id: updated.equipmentId },
              data: { status: 'AVAILABLE' },
            })
          }
        }
        // PENDING → CANCELLED: equipment was never changed, no revert needed.
      }

      return updated
    })

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
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

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

    // Only reset equipment status if it was changed by this order (DELIVERED state)
    // PENDING orders never changed equipment status, so no need to revert
    await db.equipmentDeliveryOrder.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'تم حذف أمر التوصيل بنجاح' })
  } catch (error) {
    console.error('Error deleting delivery order:', error)
    return NextResponse.json({ error: 'فشل في حذف أمر التوصيل' }, { status: 500 })
  }
}
