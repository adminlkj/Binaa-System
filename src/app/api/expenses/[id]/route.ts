import { db } from '@/lib/db'
import { createJournalEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// GET /api/expenses/[id] — Get a single expense
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // If the expense has a journal entry, create a reversal entry and cancel the original
    if (existing.journalEntryId) {
      const originalEntry = await db.journalEntry.findUnique({
        where: { id: existing.journalEntryId },
        include: { lines: true },
      })

      if (originalEntry) {
        const accountIds = originalEntry.lines.map(l => l.accountId)
        const accounts = await db.account.findMany({ where: { id: { in: accountIds } } })
        const accountMap = new Map(accounts.map(a => [a.id, a.code]))

        const reversalLines = originalEntry.lines.map(line => ({
          accountCode: accountMap.get(line.accountId) || '',
          debit: line.credit,
          credit: line.debit,
          costCenterId: line.costCenterId || undefined,
          description: `Reversal: ${line.description || ''}`,
        }))

        await createJournalEntry({
          entryNo: `JE-REV-EXP-DEL-${Date.now()}`,
          date: new Date(),
          description: `Reversal for deleted Expense: ${existing.description}`,
          descriptionAr: `قيد عكسي لحذف مصروف: ${existing.description}`,
          lines: reversalLines,
          sourceType: 'EXPENSE_DELETE',
          sourceId: existing.id,
        })

        await db.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: { status: 'CANCELLED' },
        })
      }
    }

    await db.expense.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف المصروف بنجاح' })
  } catch (error) {
    console.error('Error deleting expense:', error)
    return NextResponse.json(
      { error: 'فشل في حذف المصروف' },
      { status: 500 }
    )
  }
}
