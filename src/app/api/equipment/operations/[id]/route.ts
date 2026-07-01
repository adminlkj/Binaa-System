import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// DELETE /api/equipment/operations/[id] — delete the operation record.
// L3C-CRIT-005 FIX (original): previously DELETE returned 404 (no [id]/ directory).
// P1-2 CRIT-5 FIX (this revision): the POST at equipment/operations/route.ts
// creates (a) an EquipmentOperation row, (b) an EquipmentCost row (with a
// deterministic description `تشغيل {equipment.name} - {hours} ساعة`), and
// (c) a posted JournalEntry via autoEntryEquipmentCost.
//
// The previous DELETE only restored equipment status + deleted the
// EquipmentOperation row — leaving BOTH the EquipmentCost row AND its linked
// JE orphaned in the GL forever. GL project cost was overstated by every
// deleted operation.
//
// Fix: inside db.$transaction, find the EquipmentCost rows that match this
// operation (by projectId + date + description containing the equipment
// name), call reverseEntry on each journalEntryId, delete the EquipmentCost
// rows, restore equipment status, then delete the EquipmentOperation row.
// ============================================================================

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.equipmentOperation.findUnique({
      where: { id },
      include: {
        equipment: { select: { id: true, name: true, status: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'سجل التشغيل غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Find the linked EquipmentCost row(s) created by the POST handler.
      //    The POST generates description = `تشغيل {equipment.name} - {hours} ساعة`,
      //    so we match by projectId + date + description containing the equipment name.
      //    (Matching by description string is the only available linkage — the
      //    EquipmentOperation model has no operationId field on EquipmentCost.)
      const linkedCosts = await tx.equipmentCost.findMany({
        where: {
          projectId: existing.projectId || undefined,
          date: existing.date,
          description: { contains: existing.equipment?.name || '' },
        },
      })

      // 2. Reverse each linked JE + delete the EquipmentCost row.
      //    R12: never delete a posted financial document without reversing its JE.
      for (const cost of linkedCosts) {
        if (cost.journalEntryId) {
          await reverseEntry(cost.journalEntryId, tx)
        }
        await tx.equipmentCost.delete({ where: { id: cost.id } })
      }

      // 3. Restore equipment status to AVAILABLE if it was set to IN_USE.
      if (existing.equipment?.status === 'IN_USE') {
        await tx.equipment.update({
          where: { id: existing.equipmentId },
          data: { status: 'AVAILABLE' },
        })
      }

      // 4. Delete the operation record.
      await tx.equipmentOperation.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف سجل التشغيل وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('Error deleting equipment operation:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف سجل التشغيل'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
