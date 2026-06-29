import { db } from '@/lib/db'
import { createPurchaseInvoiceJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { createJournalEntry, reverseEntry } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single purchase invoice ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await db.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true, taxNumber: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        project: { select: { id: true, name: true, code: true, projectType: true } },
        items: true,
      },
    })

    // If there's a linked journal entry, fetch it separately (PurchaseInvoice has journalEntryId but no relation)
    let journalEntry = null
    if (invoice?.journalEntryId) {
      journalEntry = await db.journalEntry.findUnique({
        where: { id: invoice.journalEntryId },
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      })
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
    }

    return NextResponse.json({ ...invoice, journalEntry })
  } catch (error) {
    console.error('[API] Failed to fetch purchase invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch purchase invoice' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a purchase invoice + reverse its JE ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.purchaseInvoice.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Invoice already cancelled' }, { status: 400 })
    }

    // Reverse the linked journal entry (if any) and mark invoice as CANCELLED in one transaction.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        // Use reverseEntry which creates a proper reversal and keeps the original POSTED.
        // This avoids the double-cancellation bug (original CANCELLED + reversal created).
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (revErr) {
          console.error('[API] Failed to reverse JE for purchase invoice:', revErr)
          throw revErr
        }
      }

      await tx.purchaseInvoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
    })

    return NextResponse.json({ success: true, message: 'Purchase invoice cancelled' })
  } catch (error) {
    console.error('[API] Failed to delete purchase invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete purchase invoice' },
      { status: 500 }
    )
  }
}
