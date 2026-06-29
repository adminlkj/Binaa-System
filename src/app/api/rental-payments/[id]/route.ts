import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: Fetch a single rental payment ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payment = await db.clientPayment.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Rental payment not found' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('[API] Failed to fetch rental payment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rental payment' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Cancel a rental payment + reverse its JE ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.clientPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Rental payment not found' }, { status: 404 })
    }

    if (existing.deletedAt) {
      return NextResponse.json({ error: 'Payment already cancelled' }, { status: 400 })
    }

    // Reverse the linked journal entry (if any) and soft-delete the payment in one transaction.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        // Use reverseEntry which creates a proper reversal and keeps the original POSTED.
        // This avoids the double-cancellation bug.
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (revErr) {
          console.error('[API] Failed to reverse JE for rental payment:', revErr)
          throw revErr
        }
      }

      // Soft-delete the payment
      await tx.clientPayment.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      // If linked to an invoice, decrement the paidAmount
      if (existing.invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: existing.invoiceId },
        })
        if (invoice) {
          const newPaidAmount = Math.max(0, toNumber(invoice.paidAmount) - toNumber(existing.amount))
          let newStatus = invoice.status
          if (newPaidAmount === 0) {
            // P3-BUG: 'APPROVED' is not a valid InvoiceStatus value.
            // Valid enum: DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED.
            // When a payment is reversed and paidAmount returns to 0, the invoice
            // is still issued (JE was posted) → use 'SENT'.
            newStatus = 'SENT'
          } else if (newPaidAmount < toNumber(invoice.totalAmount)) {
            newStatus = 'PARTIALLY_PAID'
          }
          await tx.salesInvoice.update({
            where: { id: existing.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          })
        }
      }
    })

    return NextResponse.json({ success: true, message: 'Rental payment cancelled' })
  } catch (error) {
    console.error('[API] Failed to delete rental payment:', error)
    return NextResponse.json(
      { error: 'Failed to delete rental payment' },
      { status: 500 }
    )
  }
}
