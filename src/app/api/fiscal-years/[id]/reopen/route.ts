import { db } from '@/lib/db'
import { reverseEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============ POST: Reopen a closed fiscal year (admin override) ============
// Removes the closing marker, reopens all 12 periods, and optionally reverses the closing JE.
// The reversal now goes through reverseEntry() so all R1-R12 rules are enforced centrally.
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

    // Optionally reverse the closing JE using the unified reverseEntry().
    // This enforces all R1-R12 rules (balance, period, entryNo uniqueness, etc.)
    // instead of bypassing them with direct db.journalEntry.create.
    if (reverseJE && fiscalYear.closingJournalEntryId) {
      const closingJE = await db.journalEntry.findUnique({
        where: { id: fiscalYear.closingJournalEntryId },
      })

      if (closingJE && closingJE.status === 'POSTED' && !closingJE.isReversal) {
        // Check it's not already reversed
        const existingReversal = await db.journalEntry.findFirst({
          where: { reversedEntryId: closingJE.id, deletedAt: null },
        })
        if (!existingReversal) {
          // Use reverseEntry — it creates a proper reversal with swapped debit/credit,
          // keeps the original POSTED, and enforces all guard rules.
          const reversal = await reverseEntry(closingJE.id, db)
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
    const message = error instanceof Error ? error.message : 'فشل في إعادة فتح السنة المالية'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
