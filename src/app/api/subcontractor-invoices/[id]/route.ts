import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single subcontractor invoice ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await db.subcontractorInvoice.findUnique({
      where: { id, deletedAt: null },
      include: {
        subcontractor: { select: { id: true, name: true, code: true, specialty: true } },
        project: { select: { id: true, name: true, code: true } },
        payments: {
          select: { id: true, paymentNo: true, paymentDate: true, amount: true, status: true },
          orderBy: { paymentDate: 'desc' },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Subcontractor invoice not found' }, { status: 404 })
    }

    // Fetch linked journal entry if any
    const journalEntry = invoice.journalEntryId
      ? await db.journalEntry.findUnique({
          where: { id: invoice.journalEntryId },
          include: { lines: { include: { account: { select: { code: true, name: true, nameAr: true } } } } },
        })
      : null

    return NextResponse.json({
      ...invoice,
      amount: Number(invoice.amount),
      vatRate: Number(invoice.vatRate),
      vatAmount: Number(invoice.vatAmount),
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      journalEntry,
    })
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor invoice' },
      { status: 500 }
    )
  }
}

// ============ PUT: Update a DRAFT subcontractor invoice ============
// Only DRAFT invoices can be edited. Posted (non-DRAFT) invoices must be cancelled + recreated.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.subcontractorInvoice.findUnique({ where: { id, deletedAt: null } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor invoice not found' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Cannot edit a posted invoice. Cancel it and create a new one.' },
        { status: 400 }
      )
    }

    const updated = await db.subcontractorInvoice.update({
      where: { id },
      data: {
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.projectId !== undefined && { projectId: body.projectId || null }),
      },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      vatRate: Number(updated.vatRate),
      vatAmount: Number(updated.vatAmount),
      totalAmount: Number(updated.totalAmount),
      paidAmount: Number(updated.paidAmount),
    })
  } catch (error) {
    console.error('[API] Failed to update subcontractor invoice:', error)
    return NextResponse.json(
      { error: 'Failed to update subcontractor invoice' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a subcontractor invoice + reverse its JE ============
// Soft-deletes the invoice (sets deletedAt) and reverses the linked journal entry.
// Blocks cancellation if the invoice has payments (must reverse payments first).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.subcontractorInvoice.findUnique({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { payments: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor invoice not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Invoice already cancelled' }, { status: 400 })
    }

    // Block cancellation if there are linked payments — must cancel payments first
    if (existing._count.payments > 0) {
      return NextResponse.json(
        { error: `Cannot cancel invoice with ${existing._count.payments} linked payment(s). Cancel the payments first.` },
        { status: 400 }
      )
    }

    // Reverse the linked journal entry (if any) and soft-delete the invoice in one transaction.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        // reverseEntry creates a proper reversal (swapped debit/credit) and keeps the original POSTED.
        await reverseEntry(existing.journalEntryId, tx)
      }

      await tx.subcontractorInvoice.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          deletedAt: new Date(),
        },
      })
    })

    return NextResponse.json({ success: true, message: 'Subcontractor invoice cancelled and JE reversed' })
  } catch (error) {
    console.error('[API] Failed to cancel subcontractor invoice:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subcontractor invoice' },
      { status: 500 }
    )
  }
}
