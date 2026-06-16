import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// PATCH: Mark maintenance as complete and restore equipment status to AVAILABLE
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const maintenance = await db.equipmentMaintenance.findUnique({
      where: { id },
      select: { id: true, equipmentId: true },
    })

    if (!maintenance) {
      return NextResponse.json({ error: 'سجل الصيانة غير موجود' }, { status: 404 })
    }

    const result = await db.$transaction(async (tx) => {
      // Update equipment status back to AVAILABLE
      await tx.equipment.update({
        where: { id: maintenance.equipmentId },
        data: { status: 'AVAILABLE' },
      })

      // Optionally update the maintenance nextDate or other fields
      const updatedMaintenance = await tx.equipmentMaintenance.update({
        where: { id },
        data: { completedAt: new Date() },
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
    return NextResponse.json({ error: 'فشل في إكمال الصيانة' }, { status: 500 })
  }
}
