import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// ============ POST: Reopen a closed fiscal year (admin override) ============
// Removes the closing marker, reopens all 12 periods, and optionally reverses the closing JE
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const fiscalYear = await db.fiscalYear.findUnique({ where: { id } })
    if (!fiscalYear) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    if (fiscalYear.status !== 'CLOSED') {
      return NextResponse.json(
        { error: `لا يمكن إعادة فتح سنة بحالة: ${fiscalYear.status}` },
        { status: 400 }
      )
    }

    const reopenNotes = body.notes || 'أُعيد فتح السنة بواسطة مدير النظام'
    const reverseJE = body.reverseClosingJE !== false // default true

    let reversalEntryId: string | null = null
    let reversalEntryNo: string | null = null

    // Optionally reverse the closing JE
    if (reverseJE && fiscalYear.closingJournalEntryId) {
      const closingJE = await db.journalEntry.findUnique({
        where: { id: fiscalYear.closingJournalEntryId },
        include: { lines: true },
      })

      if (closingJE && closingJE.status === 'POSTED' && !closingJE.isReversal) {
        // Check it's not already reversed
        const existingReversal = await db.journalEntry.findFirst({
          where: { reversedEntryId: closingJE.id, deletedAt: null },
        })
        if (!existingReversal) {
          const reversalNo = `JE-REVERSE-CLOSE-${fiscalYear.name}-${Date.now()}`
          const reversal = await db.journalEntry.create({
            data: {
              entryNo: reversalNo,
              date: new Date(),
              description: `Reversal of year-end closing - ${fiscalYear.name}`,
              descriptionAr: `قيد عكسي لإعادة فتح السنة المالية ${fiscalYear.name}`,
              status: 'POSTED',
              sourceType: 'YEAR_REOPEN',
              sourceId: id,
              isSystem: true,
              isReversal: true,
              reversedEntryId: closingJE.id,
              lines: {
                create: closingJE.lines.map((line) => ({
                  accountId: line.accountId,
                  debit: line.credit, // swap debit/credit
                  credit: line.debit,
                  description: line.description,
                  costCenterId: line.costCenterId,
                })),
              },
            },
          })
          reversalEntryId = reversal.id
          reversalEntryNo = reversal.entryNo
        }
      }
    }

    // Reopen the fiscal year
    await db.fiscalYear.update({
      where: { id },
      data: {
        status: 'OPEN',
        closedAt: null,
        closedBy: null,
        closingNotes: reopenNotes,
      },
    })

    // Reopen all 12 periods
    await db.fiscalPeriod.updateMany({
      where: { fiscalYearId: id },
      data: { status: 'OPEN' },
    })

    return NextResponse.json({
      success: true,
      message: `تمت إعادة فتح السنة المالية ${fiscalYear.name} بنجاح`,
      reversalEntryId,
      reversalEntryNo,
      reopenedPeriods: 12,
    })
  } catch (error) {
    console.error('Error reopening fiscal year:', error)
    return NextResponse.json({ error: 'فشل في إعادة فتح السنة المالية' }, { status: 500 })
  }
}
