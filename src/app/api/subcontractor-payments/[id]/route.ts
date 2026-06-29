import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single subcontractor payment ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payment = await db.subcontractorPayment.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        subcontractorInvoice: { select: { id: true, invoiceNo: true, projectId: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Subcontractor payment not found' }, { status: 404 })
    }

    // Fetch linked journal entry if any
    let journalEntry = null
    if (payment.journalEntryId) {
      journalEntry = await db.journalEntry.findUnique({
        where: { id: payment.journalEntryId },
        include: { lines: { include: { account: { select: { code: true, name: true, nameAr: true } } } } },
      })
    }

    return NextResponse.json({
      ...payment,
      amount: Number(payment.amount),
      journalEntry,
    })
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor payment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor payment' },
      { status: 500 }
    )
  }
}

// ============ PUT: Update payment status ============
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const existing = await db.subcontractorPayment.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor payment not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot update a cancelled payment' }, { status: 400 })
    }

    const updated = await db.subcontractorPayment.update({
      where: { id },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.chequeNo !== undefined && { chequeNo: body.chequeNo }),
      },
      include: {
        subcontractor: { select: { id: true, name: true, code: true } },
        subcontractorInvoice: { select: { id: true, invoiceNo: true, projectId: true } },
      },
    })

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
    })
  } catch (error) {
    console.error('[API] Failed to update subcontractor payment:', error)
    return NextResponse.json(
      { error: 'Failed to update subcontractor payment' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a subcontractor payment + reverse its JE + decrement invoice paidAmount ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.subcontractorPayment.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Subcontractor payment not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Payment already cancelled' }, { status: 400 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      // Reverse the linked journal entry
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      // Decrement the invoice paidAmount + revert status transition
      if (existing.subcontractorInvoiceId) {
        const updated = await tx.subcontractorInvoice.update({
          where: { id: existing.subcontractorInvoiceId },
          data: { paidAmount: { decrement: existing.amount } },
          select: { paidAmount: true, status: true },
        })

        // If paidAmount dropped to 0, revert status to DRAFT
        const paid = Number(updated.paidAmount)
        if (paid <= 0.01 && updated.status !== 'CANCELLED') {
          await tx.subcontractorInvoice.update({
            where: { id: existing.subcontractorInvoiceId },
            data: { status: 'DRAFT', paidAmount: 0 },
          })
        } else if (paid > 0 && updated.status === 'PAID') {
          // Was PAID, now partially paid
          await tx.subcontractorInvoice.update({
            where: { id: existing.subcontractorInvoiceId },
            data: { status: 'PARTIALLY_PAID' },
          })
        }
      }

      await tx.subcontractorPayment.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
    })

    return NextResponse.json({ success: true, message: 'Subcontractor payment cancelled, JE reversed, invoice paidAmount decremented' })
  } catch (error) {
    console.error('[API] Failed to cancel subcontractor payment:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subcontractor payment' },
      { status: 500 }
    )
  }
}
