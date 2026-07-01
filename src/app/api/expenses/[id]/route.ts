import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// GET /api/expenses/[id] — Get a single expense
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params

    const expense = await db.expense.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true, projectType: true } },
        equipment: { select: { id: true, code: true, name: true } },
      },
    })

    if (!expense) {
      return NextResponse.json(
        { error: 'المصروف غير موجود' },
        { status: 404 }
      )
    }

    return NextResponse.json(expense)
  } catch (error) {
    console.error('Error fetching expense:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل المصروف' },
      { status: 500 }
    )
  }
}

// DELETE /api/expenses/[id] — Delete an expense
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.expense.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'المصروف غير موجود' },
        { status: 404 }
      )
    }

    // If the expense has a journal entry, create a reversal entry and cancel the original.
    // R12: never hard-delete a posted financial document — soft-delete + reversal preserves
    // the audit trail. Do all operations in a transaction.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        // Use unified reverseEntry() — creates proper reversal, keeps original POSTED.
        await reverseEntry(existing.journalEntryId, tx)
      }

      // Soft-delete (set deletedAt) instead of hard delete — preserves the audit trail.
      await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } })
    })

    return NextResponse.json({ message: 'تم حذف المصروف بنجاح' })
  } catch (error) {
    console.error('Error deleting expense:', error)
    return NextResponse.json(
      { error: 'فشل في حذف المصروف' },
      { status: 500 }
    )
  }
}
