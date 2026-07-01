import { requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// DELETE /api/equipment/fuel/[id] — reverse JE and delete the fuel log.
// L3C-CRIT-004 FIX: previously DELETE returned 404 (no [id]/ directory existed).
// ============================================================================
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.equipmentFuelLog.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل الوقود غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (e) {
          console.error('Failed to reverse fuel JE on delete:', e)
          throw new Error('فشل في عكس القيد المحاسبي المرتبط بسجل الوقود')
        }
      }
      await tx.equipmentFuelLog.update({
        where: { id },
        data: { journalEntryId: null },
      })
      await tx.equipmentFuelLog.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف سجل الوقود بنجاح' })
  } catch (error) {
    console.error('Error deleting fuel log:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف سجل الوقود'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
