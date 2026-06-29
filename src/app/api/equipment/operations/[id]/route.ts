import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// DELETE /api/equipment/operations/[id] — delete the operation record.
// L3C-CRIT-005 FIX: previously DELETE returned 404 (no [id]/ directory existed).
// Note: equipment operations don't directly store a journalEntryId on the model
// (the JE is auto-created via autoEntryEquipmentCost but not linked back to the
// operation row). We delete the operation record; the JE remains as a historical
// accounting event. If you need to reverse the JE, use the journal-entries UI.
// ============================================================================
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.equipmentOperation.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل التشغيل غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      // Restore equipment status to AVAILABLE if it was set to IN_USE.
      const equipment = await tx.equipment.findUnique({
        where: { id: existing.equipmentId },
        select: { status: true },
      })
      if (equipment?.status === 'IN_USE') {
        await tx.equipment.update({
          where: { id: existing.equipmentId },
          data: { status: 'AVAILABLE' },
        })
      }
      await tx.equipmentOperation.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف سجل التشغيل بنجاح' })
  } catch (error) {
    console.error('Error deleting equipment operation:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف سجل التشغيل'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
