import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost, reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// PUT /api/equipment/maintenance/[id] — update a maintenance record.
// L3C-CRIT-002 FIX: previously the UI's Edit dialog always POSTed to the
// collection route (creating a duplicate). Now the UI calls this PUT endpoint.
// If cost changes, the existing JE is reversed and a fresh one is created.
// ============================================================================
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.equipmentMaintenance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل الصيانة غير موجود' }, { status: 404 })
    }

    const newCost = body.cost !== undefined ? parseFloat(body.cost) : Number(existing.cost)
    const costChanged = Math.abs(newCost - Number(existing.cost)) > 0.001

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // If cost changed and there's a linked JE, reverse it and create a fresh one.
      let newJournalEntryId = existing.journalEntryId
      if (costChanged && existing.journalEntryId) {
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (e) {
          console.error('Failed to reverse maintenance JE on update:', e)
          throw new Error('فشل في عكس القيد المحاسبي المرتبط بسجل الصيانة')
        }
        newJournalEntryId = null
      }

      await tx.equipmentMaintenance.update({
        where: { id },
        data: {
          ...(body.description !== undefined && { description: body.description }),
          ...(body.date !== undefined && { date: new Date(body.date) }),
          ...(body.cost !== undefined && { cost: newCost }),
          ...(body.supplierId !== undefined && { supplierId: body.supplierId || null }),
          ...(body.nextDate !== undefined && { nextDate: body.nextDate ? new Date(body.nextDate) : null }),
          ...(newJournalEntryId !== existing.journalEntryId && { journalEntryId: newJournalEntryId }),
        },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          supplier: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      // Create a fresh JE if cost > 0 and we reversed the old one.
      if (costChanged && newCost > 0) {
        const equipment = await tx.equipment.findUnique({
          where: { id: existing.equipmentId },
          select: { name: true },
        })

        let costCenterId: string | undefined
        const activeAllocation = await tx.resourceAllocation.findFirst({
          where: {
            resourceType: 'EQUIPMENT',
            resourceId: existing.equipmentId,
            startDate: { lte: new Date() },
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
          select: { projectId: true },
        })

        if (activeAllocation) {
          const project = await tx.project.findUnique({
            where: { id: activeAllocation.projectId },
            select: { code: true },
          })
          if (project) {
            const cc = await tx.costCenter.findFirst({ where: { code: project.code } })
            if (cc) costCenterId = cc.id
          }
        }

        const payFrom = body.supplierId !== undefined ? (body.supplierId ? 'AP' : 'CASH') : (existing.supplierId ? 'AP' : 'CASH')
        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment?.name || 'Unknown',
          costType: 'MAINTENANCE',
          amount: newCost,
          date: body.date ? new Date(body.date) : existing.date,
          payFrom: payFrom as 'CASH' | 'AP',
          costCenterId,
        }, tx)

        await tx.equipmentMaintenance.update({
          where: { id },
          data: { journalEntryId: entry.id },
        })
        newJournalEntryId = entry.id
      }

      return await tx.equipmentMaintenance.findUniqueOrThrow({
        where: { id },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          supplier: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error updating equipment maintenance:', error)
    const message = error instanceof Error ? error.message : 'فشل في تحديث سجل الصيانة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// DELETE /api/equipment/maintenance/[id] — reverse JE, restore equipment
// status, and delete the record.
// L3C-CRIT-003 FIX: previously DELETE returned 404 (no route.ts existed here).
// ============================================================================
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.equipmentMaintenance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل الصيانة غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      // Reverse the linked JE first to keep GL balanced.
      if (existing.journalEntryId) {
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (e) {
          console.error('Failed to reverse maintenance JE on delete:', e)
          throw new Error('فشل في عكس القيد المحاسبي المرتبط بسجل الصيانة')
        }
      }

      // Detach JE before delete.
      await tx.equipmentMaintenance.update({
        where: { id },
        data: { journalEntryId: null },
      })
      await tx.equipmentMaintenance.delete({ where: { id } })

      // Restore equipment status to AVAILABLE if it was set to MAINTENANCE by this record.
      const equipment = await tx.equipment.findUnique({
        where: { id: existing.equipmentId },
        select: { status: true },
      })
      if (equipment?.status === 'MAINTENANCE') {
        await tx.equipment.update({
          where: { id: existing.equipmentId },
          data: { status: 'AVAILABLE' },
        })
      }
    })

    return NextResponse.json({ message: 'تم حذف سجل الصيانة بنجاح' })
  } catch (error) {
    console.error('Error deleting equipment maintenance:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف سجل الصيانة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
