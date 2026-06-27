import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single subcontractor advance ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const advance = await db.subcontractorAdvance.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    if (!advance) {
      return NextResponse.json({ error: 'Subcontractor advance not found' }, { status: 404 })
    }

    // Fetch linked journal entry if any
    let journalEntry = null
    if (advance.journalEntryId) {
      journalEntry = await db.journalEntry.findUnique({
        where: { id: advance.journalEntryId },
        include: { lines: { include: { account: { select: { code: true, name: true, nameAr: true } } } } },
      })
    }

    return NextResponse.json({
      ...advance,
      amount: Number(advance.amount),
      recoveredAmount: Number(advance.recoveredAmount),
      journalEntry,
    })
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor advance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor advance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============ PUT: Update advance status (PENDING → SETTLED) ============
// Used to mark an advance as SETTLED when fully recovered.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.subcontractorAdvance.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor advance not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot update a cancelled advance' }, { status: 400 })
    }

    const updated = await db.subcontractorAdvance.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.recoveredAmount !== undefined && { recoveredAmount: Number(body.recoveredAmount) }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      recoveredAmount: Number(updated.recoveredAmount),
    })
  } catch (error) {
    console.error('[API] Failed to update subcontractor advance:', error)
    return NextResponse.json(
      { error: 'Failed to update subcontractor advance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a subcontractor advance + reverse its JE ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.subcontractorAdvance.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor advance not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Advance already cancelled' }, { status: 400 })
    }

    // Block cancellation if the advance has been partially recovered
    if (Number(existing.recoveredAmount) > 0) {
      return NextResponse.json(
        { error: `Cannot cancel advance with ${Number(existing.recoveredAmount)} recovered. Reverse the recoveries first.` },
        { status: 400 }
      )
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      await tx.subcontractorAdvance.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
    })

    return NextResponse.json({ success: true, message: 'Subcontractor advance cancelled and JE reversed' })
  } catch (error) {
    console.error('[API] Failed to cancel subcontractor advance:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subcontractor advance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
