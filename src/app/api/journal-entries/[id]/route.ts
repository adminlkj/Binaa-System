import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
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

// PUT - Update journal entry status (e.g. DRAFT → POSTED) or other editable fields.
// This is the single entry point for "post a draft JE" from the UI.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Load the existing entry first to validate state transitions
    const existing = await db.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'القيد المحاسبي غير موجود' },
        { status: 404 }
      )
    }

    const nextStatus = body.status as string | undefined

    // Validate status transition if status is being changed
    if (nextStatus && nextStatus !== existing.status) {
      const allowedTransitions: Record<string, string[]> = {
        DRAFT: ['POSTED', 'CANCELLED'],
        POSTED: ['CANCELLED'], // POSTED → CANCELLED only via reversal, but allow direct cancel for manual correction
        CANCELLED: [], // terminal state
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

      // If posting (DRAFT → POSTED), validate the entry is balanced
      if (nextStatus === 'POSTED') {
        const totalDebit = existing.lines.reduce((s, l) => s + toNumber(l.debit), 0)
        const totalCredit = existing.lines.reduce((s, l) => s + toNumber(l.credit), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return NextResponse.json(
            {
              error: 'لا يمكن ترحيل قيد غير متوازن',
              totalDebit,
              totalCredit,
            },
            { status: 400 }
          )
        }
        if (existing.lines.length === 0) {
          return NextResponse.json(
            { error: 'لا يمكن ترحيل قيد بدون بنود' },
            { status: 400 }
          )
        }
      }
    }

    // Build update payload (only allow safe fields)
    const updateData: Record<string, unknown> = {}
    if (nextStatus) updateData.status = nextStatus
    if (typeof body.description === 'string') updateData.description = body.description
    if (body.date) updateData.date = new Date(body.date)

    const updated = await db.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        lines: {
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
    const message = error instanceof Error ? error.message : 'فشل في تحديث القيد المحاسبي'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
