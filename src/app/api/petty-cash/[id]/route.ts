import { db } from '@/lib/db'
import { createJournalEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const entry = await db.pettyCash.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })
    if (!entry) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error fetching petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحميل السلفة النقدية' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.pettyCash.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }

    // Cannot modify entries with journal entries (posted)
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل سلفة مرحّلة محاسبياً' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}

    if (body.branchId !== undefined) data.branchId = body.branchId
    if (body.description !== undefined) data.description = body.description
    if (body.amount !== undefined) data.amount = parseFloat(body.amount) || 0
    if (body.date !== undefined) data.date = new Date(body.date)
    if (body.category !== undefined) data.category = body.category || null
    if (body.reference !== undefined) data.reference = body.reference || null

    const entry = await db.pettyCash.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحديث السلفة النقدية' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.pettyCash.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }

    // Reverse the journal entry if it exists
    if (existing.journalEntryId) {
      try {
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
            entryNo: `JE-REV-PC-DEL-${Date.now()}`,
            date: new Date(),
            description: `Reversal for deleted Petty Cash: ${existing.description}`,
            descriptionAr: `قيد عكسي لحذف سلفة نقدية: ${existing.description}`,
            lines: reversalLines,
            sourceType: 'PETTY_CASH_DELETE',
            sourceId: existing.id,
          })

          await db.journalEntry.update({
            where: { id: existing.journalEntryId },
            data: { status: 'CANCELLED' },
          })
        }
      } catch (accountingError) {
        console.error('Accounting reversal failed for petty cash delete:', accountingError)
      }
    }

    await db.pettyCash.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف السلفة النقدية بنجاح' })
  } catch (error) {
    console.error('Error deleting petty cash:', error)
    return NextResponse.json({ error: 'فشل في حذف السلفة النقدية' }, { status: 500 })
  }
}
