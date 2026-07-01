import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { reverseEntry, autoEntryLaborCost, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Labor Costs [id] API
// ----------------------------------------------------------------------------
// GET    /api/labor-costs/[id]   — fetch single labor cost
// PUT    /api/labor-costs/[id]   — update; if amounts change AND a JE is linked,
//                                  reverse the old JE and post a fresh one with
//                                  the new amount (P1-2 HIGH-3 FIX). All inside
//                                  db.$transaction.
// DELETE /api/labor-costs/[id]   — reverse the linked JE then soft-delete the row
//                                  (P1-2 CRIT-6 FIX). All inside db.$transaction.
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const laborCost = await db.laborCost.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })
    if (!laborCost || laborCost.deletedAt) {
      return NextResponse.json({ error: 'تكلفة العمالة غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(laborCost)
  } catch (error) {
    console.error('Error fetching labor cost:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكلفة العمالة' }, { status: 500 })
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

    const existing = await db.laborCost.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'تكلفة العمالة غير موجودة' }, { status: 404 })
    }

    // Compute the new total amount if any cost-driving field changed
    const newWorkers = body.workers !== undefined ? parseInt(body.workers) : existing.workers
    const newDays = body.days !== undefined ? parseFloat(body.days) : Number(existing.days)
    const newDailyRate = body.dailyRate !== undefined ? parseFloat(body.dailyRate) : Number(existing.dailyRate)
    const newTotalAmount = newWorkers * newDays * newDailyRate

    const amountChanged =
      body.workers !== undefined ||
      body.days !== undefined ||
      body.dailyRate !== undefined

    const paymentSource =
      body.paymentSource !== undefined ? body.paymentSource : existing.paymentSource
    const paymentAccountCode =
      body.paymentAccountCode !== undefined ? body.paymentAccountCode : existing.paymentAccountCode
    const newDate = body.date !== undefined ? new Date(body.date) : existing.date

    // P1-2 HIGH-3 FIX: if amounts changed AND a JE is linked, reverse + recreate
    // the JE inside db.$transaction so the GL stays in sync with the subledger.
    if (amountChanged && existing.journalEntryId) {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // 1. Reverse the old JE (creates a proper reversal entry, original stays POSTED)
        await reverseEntry(existing.journalEntryId!, tx)

        // 2. Update the LaborCost row with the new values
        const updated = await tx.laborCost.update({
          where: { id },
          data: {
            ...(body.projectId !== undefined && { projectId: body.projectId }),
            ...(body.description !== undefined && { description: body.description }),
            workers: newWorkers,
            days: newDays,
            dailyRate: newDailyRate,
            totalAmount: newTotalAmount,
            date: newDate,
            paymentSource: paymentSource || null,
            paymentAccountCode: paymentAccountCode || null,
          },
          include: {
            project: { select: { id: true, code: true, name: true, costCenterId: true } },
          },
        })

        // 3. Post the fresh JE with the new amount
        const je = await autoEntryLaborCost({
          description: updated.description,
          amount: Number(updated.totalAmount),
          date: updated.date,
          costCenterId: updated.project?.costCenterId || undefined,
          paymentSource: (paymentSource === 'BANK' || paymentSource === 'CASH') ? paymentSource : undefined,
          paymentAccountCode: paymentAccountCode || undefined,
        }, tx)

        // 4. Link the new JE back to the LaborCost row
        await tx.laborCost.update({
          where: { id },
          data: { journalEntryId: je.id },
        })

        return await tx.laborCost.findUniqueOrThrow({
          where: { id },
          include: {
            project: { select: { id: true, code: true, name: true } },
          },
        })
      })

      return NextResponse.json(result)
    }

    // Non-amount changes (description, projectId, date only) — update in place.
    // No JE reversal needed because the amount hasn't changed.
    const data: Record<string, unknown> = {
      workers: newWorkers,
      days: newDays,
      dailyRate: newDailyRate,
      totalAmount: newTotalAmount,
    }
    if (body.projectId !== undefined) data.projectId = body.projectId
    if (body.description !== undefined) data.description = body.description
    if (body.date !== undefined) data.date = newDate
    if (body.paymentSource !== undefined) data.paymentSource = body.paymentSource
    if (body.paymentAccountCode !== undefined) data.paymentAccountCode = body.paymentAccountCode

    const laborCost = await db.laborCost.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(laborCost)
  } catch (error) {
    console.error('Error updating labor cost:', error)
    return NextResponse.json({ error: 'فشل في تحديث تكلفة العمالة' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.laborCost.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'تكلفة العمالة غير موجودة' }, { status: 404 })
    }

    // P1-2 CRIT-6 FIX: reverse the linked JE inside db.$transaction,
    // then soft-delete the LaborCost row. R12: never hard-delete a posted
    // financial document — soft-delete + reversal preserves the audit trail.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.laborCost.update({
        where: { id },
        data: { deletedAt: new Date(), journalEntryId: null },
      })
    })

    return NextResponse.json({ message: 'تم حذف تكلفة العمالة وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('Error deleting labor cost:', error)
    return NextResponse.json({ error: 'فشل في حذف تكلفة العمالة' }, { status: 500 })
  }
}
