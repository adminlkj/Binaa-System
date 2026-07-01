import { requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { type PrismaTransaction } from '@/lib/accounting/engine'

// PATCH: Mark maintenance as complete, restore equipment status to AVAILABLE,
// and record completion timestamp. P3-CRIT-004 + P3-HIGH-007.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const maintenance = await db.equipmentMaintenance.findUnique({
      where: { id },
      select: { id: true, equipmentId: true, status: true },
    })

    if (!maintenance) {
      return NextResponse.json({ error: 'سجل الصيانة غير موجود' }, { status: 404 })
    }

    if (maintenance.status === 'COMPLETED') {
      return NextResponse.json({ error: 'سجل الصيانة مكتمل بالفعل' }, { status: 400 })
    }

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // P3-HIGH-006: Only restore equipment to AVAILABLE if no other IN_PROGRESS maintenance exists
      const otherActiveMaintenance = await tx.equipmentMaintenance.count({
        where: {
          equipmentId: maintenance.equipmentId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          id: { not: id },
        },
      })

      if (otherActiveMaintenance === 0) {
        await tx.equipment.update({
          where: { id: maintenance.equipmentId },
          data: { status: 'AVAILABLE' },
        })
      }

      // P3-CRIT-004: Use real schema fields (status + completedAt)
      const updatedMaintenance = await tx.equipmentMaintenance.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          ...(body.nextDate ? { nextDate: new Date(body.nextDate) } : {}),
        },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true, status: true } },
          supplier: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      return updatedMaintenance
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error completing maintenance:', error)
    const message = error instanceof Error ? error.message : 'فشل في إكمال الصيانة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
