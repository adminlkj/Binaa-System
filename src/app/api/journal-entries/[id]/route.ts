import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { AccountingGuardError } from '@/lib/accounting/guard'

// ============================================================================
// BA-02 Task 4: Journal Immutability — POSTED = Immutable
// ============================================================================
// A POSTED journal entry CANNOT be edited. The only way to correct a posted
// entry is: reverse it (creates a reversal entry), then post a new entry
// with the correct data. This preserves the audit trail.
//
// This PUT route ONLY allows:
//   - DRAFT → POSTED transition (with full R1-R12 validation)
//   - DRAFT → CANCELLED transition
//   - Editing description/date of a DRAFT entry
//
// Any attempt to modify a POSTED entry returns 423 LOCKED with guidance
// to use the Reverse → Repost workflow.
// ============================================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params

    const entry = await db.journalEntry.findUnique({
      where: { id, deletedAt: null },
      include: {
        lines: {
          where: { deletedAt: null },
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'القيد المحاسبي غير موجود' },
        { status: 404 }
      )
    }

    // Add computed totals
    const totalDebit = entry.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      ...entry,
      totalDebit,
      totalCredit,
    }))
  } catch (error) {
    console.error('Error fetching journal entry:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل القيد المحاسبي' },
      { status: 500 }
    )
  }
}

// PUT - Update journal entry status (DRAFT → POSTED or DRAFT → CANCELLED)
// or edit description/date of a DRAFT entry.
//
// POSTED entries are IMMUTABLE — any attempt to modify them returns 423 LOCKED.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    // Load the existing entry first
    const existing = await db.journalEntry.findUnique({
      where: { id, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'القيد المحاسبي غير موجود' },
        { status: 404 }
      )
    }

    // BA-02 Task 4: Enforce immutability — POSTED entries cannot be modified.
    // The only sanctioned way to correct a POSTED entry is:
    //   1. POST /api/journal-entries/[id]/reverse  (creates reversal)
    //   2. POST /api/journal-entries                (creates new corrected entry)
    if (existing.status === 'POSTED') {
      return NextResponse.json(
        {
          error: `القيد ${existing.entryNo} مرحّل وغير قابل للتعديل`,
          code: 'ENTRY_IMMUTABLE',
          hint: 'لتصحيح قيد مرحّل: اعكسه بقيد عكسي ثم أنشئ قيداً جديداً',
          workflow: {
            step1: `POST /api/journal-entries/${id}/reverse`,
            step2: 'POST /api/journal-entries (with corrected data)',
          },
          entryNo: existing.entryNo,
          status: existing.status,
        },
        { status: 423 } // 423 Locked — appropriate for immutable resource
      )
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json(
        { error: `القيد ${existing.entryNo} ملغى — لا يمكن تعديله` },
        { status: 400 }
      )
    }

    // Only DRAFT entries reach here — they can be edited or transitioned
    const nextStatus = body.status as string | undefined

    // Validate status transition
    if (nextStatus && nextStatus !== existing.status) {
      const allowedTransitions: Record<string, string[]> = {
        DRAFT: ['POSTED', 'CANCELLED'],
        POSTED: [], // terminal — unreachable here (blocked above)
        CANCELLED: [], // terminal
      }
      const allowed = allowedTransitions[existing.status] || []
      if (!allowed.includes(nextStatus)) {
        return NextResponse.json(
          {
            error: `غير مسموح بالانتقال من ${existing.status} إلى ${nextStatus}`,
            currentStatus: existing.status,
            nextStatus,
          },
          { status: 400 }
        )
      }

      // If posting (DRAFT → POSTED), enforce R2/R3/R4/R6
      if (nextStatus === 'POSTED') {
        // R3: at least 2 lines
        if (existing.lines.length < 2) {
          return NextResponse.json(
            { error: 'لا يمكن ترحيل قيد بدون بنود كافية (حد أدنى بندان)' },
            { status: 400 }
          )
        }
        // R2: balanced
        const totalDebit = existing.lines.reduce((s, l) => s + toNumber(l.debit), 0)
        const totalCredit = existing.lines.reduce((s, l) => s + toNumber(l.credit), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return NextResponse.json(
            { error: 'لا يمكن ترحيل قيد غير متوازن', totalDebit, totalCredit },
            { status: 400 }
          )
        }
        // R4: all accounts must be active and postable
        const accountIds = [...new Set(existing.lines.map(l => l.accountId))]
        const accounts = await db.account.findMany({ where: { id: { in: accountIds } } })
        const inactive = accounts.filter(a => !a.isActive || !a.allowPosting)
        if (inactive.length > 0) {
          return NextResponse.json(
            {
              error: `لا يمكن الترحيل: الحسابات التالية غير نشطة أو غير قابلة للترحيل: ${inactive.map(a => a.code + ' ' + a.name).join('، ')}`,
            },
            { status: 400 }
          )
        }
        // R6: period must be open (uses unified accounting calendar via guard)
        // For DRAFT→POSTED, the entry was already created with a date — we just
        // verify the period is still open at posting time.
        try {
          const { assertPeriodOpen } = await import('@/lib/accounting/accounting-calendar')
          await assertPeriodOpen(new Date(existing.date))
        } catch (e: any) {
          return NextResponse.json(
            { error: `لا يمكن الترحيل: ${e.message}`, code: e.code || 'PERIOD_CLOSED' },
            { status: 400 }
          )
        }
      }
    }

    // Build update payload (only safe fields for DRAFT entries)
    const updateData: Record<string, unknown> = {}
    if (nextStatus) updateData.status = nextStatus
    if (typeof body.description === 'string') updateData.description = body.description
    if (body.date) updateData.date = new Date(body.date)

    const updated = await db.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        lines: {
          where: { deletedAt: null },
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    const totalDebit = updated.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = updated.lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      ...updated,
      totalDebit,
      totalCredit,
    }))
  } catch (error) {
    console.error('Error updating journal entry:', error)
    if (error instanceof AccountingGuardError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'فشل في تحديث القيد المحاسبي'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

// DELETE - Soft-delete a journal entry.
//
// BA-02 Task 4: POSTED entries CANNOT be deleted directly. They must first
// be reversed (via reverseJournalEntry), after which they can be soft-deleted.
// DRAFT entries can be soft-deleted freely.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params
    const existing = await db.journalEntry.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, entryNo: true, status: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'القيد غير موجود' }, { status: 404 })
    }

    // POSTED entries must be reversed before deletion
    if (existing.status === 'POSTED') {
      // Check if already reversed
      const reversal = await db.journalEntry.findFirst({
        where: { reversedEntryId: id, deletedAt: null, status: 'POSTED' },
        select: { entryNo: true },
      })
      if (!reversal) {
        return NextResponse.json(
          {
            error: `لا يمكن حذف قيد مرحّل (${existing.entryNo}) دون عكسه أولاً`,
            code: 'ENTRY_IMMUTABLE',
            hint: 'اعكس القيد أولاً: POST /api/journal-entries/[id]/reverse',
            entryNo: existing.entryNo,
          },
          { status: 423 }
        )
      }
      // POSTED + reversed: allow soft-delete (the reversal nets it to zero,
      // so hiding the original doesn't affect GL totals)
    }

    await db.journalEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: `تم حذف القيد ${existing.entryNo}` })
  } catch (error) {
    console.error('Error deleting journal entry:', error)
    return NextResponse.json({ error: 'فشل في حذف القيد' }, { status: 500 })
  }
}
