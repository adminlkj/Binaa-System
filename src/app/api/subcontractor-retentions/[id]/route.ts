import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single subcontractor retention ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const retention = await db.subcontractorRetention.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    if (!retention) {
      return NextResponse.json({ error: 'Subcontractor retention not found' }, { status: 404 })
    }

    // Fetch linked journal entry if any
    let journalEntry = null
    if (retention.journalEntryId) {
      journalEntry = await db.journalEntry.findUnique({
        where: { id: retention.journalEntryId },
        include: { lines: { include: { account: { select: { code: true, name: true, nameAr: true } } } } },
      })
    }

    return NextResponse.json({
      ...retention,
      withheldAmount: Number(retention.withheldAmount),
      releasedAmount: Number(retention.releasedAmount),
      journalEntry,
    })
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor retention:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor retention' },
      { status: 500 }
    )
  }
}

// ============ PUT: Update retention (release retention) ============
// When `releasedAmount` is set, the retention transitions:
//   WITHHELD → PARTIALLY_RELEASED → FULLY_RELEASED
// A release JE (Dr RETENTION_PAYABLE / Cr SUBCONTRACTOR_AP or CASH) should be created
// by a dedicated release endpoint — this PUT only updates the bookkeeping fields.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.subcontractorRetention.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor retention not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot update a cancelled retention' }, { status: 400 })
    }

    // Compute new status based on releasedAmount
    const newReleased = body.releasedAmount !== undefined ? Number(body.releasedAmount) : Number(existing.releasedAmount)
    const totalWithheld = Number(existing.withheldAmount)
    let newStatus = existing.status
    if (newReleased >= totalWithheld - 0.01) {
      newStatus = 'FULLY_RELEASED'
    } else if (newReleased > 0) {
      newStatus = 'PARTIALLY_RELEASED'
    }

    const updated = await db.subcontractorRetention.update({
      where: { id },
      data: {
        ...(body.releasedAmount !== undefined && { releasedAmount: Number(body.releasedAmount) }),
        ...(body.status !== undefined ? { status: body.status } : { status: newStatus }),
        ...(body.releaseDate !== undefined && { releaseDate: body.releaseDate ? new Date(body.releaseDate) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      ...updated,
      withheldAmount: Number(updated.withheldAmount),
      releasedAmount: Number(updated.releasedAmount),
    })
  } catch (error) {
    console.error('[API] Failed to update subcontractor retention:', error)
    return NextResponse.json(
      { error: 'Failed to update subcontractor retention' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a subcontractor retention + reverse its JE ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.subcontractorRetention.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor retention not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Retention already cancelled' }, { status: 400 })
    }

    // Block cancellation if the retention has been partially released
    if (Number(existing.releasedAmount) > 0) {
      return NextResponse.json(
        { error: `Cannot cancel retention with ${Number(existing.releasedAmount)} released. Reverse the releases first.` },
        { status: 400 }
      )
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      await tx.subcontractorRetention.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
    })

    return NextResponse.json({ success: true, message: 'Subcontractor retention cancelled and JE reversed' })
  } catch (error) {
    console.error('[API] Failed to cancel subcontractor retention:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subcontractor retention' },
      { status: 500 }
    )
  }
}
