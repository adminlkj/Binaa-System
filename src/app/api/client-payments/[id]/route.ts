import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { reverseEntry } from '@/lib/accounting/engine'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { createClientPaymentJournalEntry } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

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
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching client payment:', error)
    return NextResponse.json({ error: 'فشل في تحميل تحصيل العميل' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.clientPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    // If payment is posted (has a journal entry), use reverse+recreate
    if (existing.journalEntryId) {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // 1. Reverse the original journal entry
        await reverseEntry(existing.journalEntryId!, tx)

        // 2. Unlink the old journal entry from the payment
        await tx.clientPayment.update({
          where: { id: existing.id },
          data: { journalEntryId: null },
        })

        // 3. Reverse the invoice paidAmount update if linked
        if (existing.invoiceId) {
          const invoice = await tx.salesInvoice.findUnique({
            where: { id: existing.invoiceId },
          })
          if (invoice) {
            const reversedPaidAmount = toNumber(invoice.paidAmount) - toNumber(existing.amount)
            let newStatus = invoice.status

            if (reversedPaidAmount <= 0) {
              newStatus = 'SENT'
            } else if (reversedPaidAmount < toNumber(invoice.totalAmount)) {
              newStatus = 'PARTIALLY_PAID'
            }

            await tx.salesInvoice.update({
              where: { id: existing.invoiceId },
              data: {
                paidAmount: Math.max(0, reversedPaidAmount),
                status: newStatus,
              },
            })
          }
        }

        // 4. Build updated data for the payment
        const updateData: Record<string, unknown> = {}
        if (body.amount !== undefined) updateData.amount = body.amount
        if (body.date !== undefined) updateData.date = new Date(body.date)
        if (body.receivedIn !== undefined) updateData.receivedIn = body.receivedIn
        if (body.receivingAccountId !== undefined) updateData.receivingAccountId = body.receivingAccountId || null
        if (body.receivingAccountCode !== undefined) updateData.receivingAccountCode = body.receivingAccountCode || null
        if (body.receivingAccountName !== undefined) updateData.receivingAccountName = body.receivingAccountName || null
        if (body.reference !== undefined) updateData.reference = body.reference
        if (body.notes !== undefined) updateData.notes = body.notes
        if (body.invoiceId !== undefined) updateData.invoiceId = body.invoiceId || null

        // 5. Update the payment with new data
        const updated = await tx.clientPayment.update({
          where: { id: existing.id },
          data: updateData,
          include: {
            client: { select: { id: true, name: true, code: true } },
            invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
          },
        })

        // 6. Create a new journal entry for the updated payment (throws on failure → tx rolls back).
        await createClientPaymentJournalEntry(updated.id, tx)

        // 7. Apply the new invoice paidAmount update if linked
        const newInvoiceId = body.invoiceId !== undefined ? (body.invoiceId || null) : existing.invoiceId
        const newAmount = body.amount !== undefined ? body.amount : toNumber(existing.amount)

        if (newInvoiceId) {
          const invoice = await tx.salesInvoice.findUnique({
            where: { id: newInvoiceId },
          })
          if (invoice) {
            const newPaidAmount = toNumber(invoice.paidAmount) + Number(newAmount)
            let newStatus = invoice.status

            if (newPaidAmount >= toNumber(invoice.totalAmount)) {
              newStatus = 'PAID'
            } else if (newPaidAmount > 0) {
              newStatus = 'PARTIALLY_PAID'
            }

            await tx.salesInvoice.update({
              where: { id: newInvoiceId },
              data: {
                paidAmount: newPaidAmount,
                status: newStatus,
              },
            })
          }
        }

        // 8. Re-fetch to include journalEntryId
        return await tx.clientPayment.findUnique({
          where: { id: existing.id },
          include: {
            client: { select: { id: true, name: true, code: true } },
            invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
          },
        })
      })

      return NextResponse.json(result)
    }

    // Not posted — simple update (no accounting implications)
    const updateData: Record<string, unknown> = {}
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.receivedIn !== undefined) updateData.receivedIn = body.receivedIn
    if (body.receivingAccountId !== undefined) updateData.receivingAccountId = body.receivingAccountId || null
    if (body.receivingAccountCode !== undefined) updateData.receivingAccountCode = body.receivingAccountCode || null
    if (body.receivingAccountName !== undefined) updateData.receivingAccountName = body.receivingAccountName || null
    if (body.reference !== undefined) updateData.reference = body.reference
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.invoiceId !== undefined) updateData.invoiceId = body.invoiceId || null

    const updated = await db.clientPayment.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating client payment:', error)
    const message = error instanceof Error ? error.message : 'فشل في تحديث تحصيل العميل'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.clientPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    // L3A-CRIT-001 FIX: previously DELETE always returned 400 because POST always creates
    // a JE (so journalEntryId was always set). Now we reverse the JE and delete the payment,
    // mirroring the supplier-payments DELETE behavior. This keeps the GL consistent while
    // allowing users to correct mistaken payments.
    await db.$transaction(async (tx: PrismaTransaction) => {
      // Reverse the linked journal entry (if any) to keep GL balanced.
      if (existing.journalEntryId) {
        try {
          await reverseEntry(existing.journalEntryId, tx)
        } catch (e) {
          console.error('Failed to reverse client payment JE on delete:', e)
          throw new Error('فشل في عكس القيد المحاسبي المرتبط بالتحصيل')
        }
      }

      // If linked to an invoice, reverse the paidAmount update
      if (existing.invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: existing.invoiceId },
        })
        if (invoice) {
          const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - Number(existing.amount))
          let newStatus = invoice.status

          if (newPaidAmount <= 0) {
            // Revert to SENT status (not DRAFT) since invoice was already issued
            newStatus = 'SENT'
          } else if (newPaidAmount < Number(invoice.totalAmount)) {
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

      // Detach the JE before deleting (so soft-delete of JE doesn't cascade).
      await tx.clientPayment.update({
        where: { id },
        data: { journalEntryId: null },
      })
      await tx.clientPayment.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف تحصيل العميل بنجاح' })
  } catch (error) {
    console.error('Error deleting client payment:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'فشل في حذف تحصيل العميل' }, { status: 500 })
  }
}
