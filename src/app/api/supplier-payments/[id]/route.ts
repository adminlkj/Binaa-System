import { db } from '@/lib/db'
import { reverseEntry } from '@/lib/accounting/engine'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { createSupplierPaymentJournalEntry } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const payment = await db.supplierPayment.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching supplier payment:', error)
    return NextResponse.json({ error: 'فشل في تحميل دفعة المورد' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.supplierPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    // If payment is posted (has a journal entry), use reverse+recreate
    if (existing.journalEntryId) {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // 1. Reverse the original journal entry
        await reverseEntry(existing.journalEntryId!, tx)

        // 2. Unlink the old journal entry from the payment
        await tx.supplierPayment.update({
          where: { id: existing.id },
          data: { journalEntryId: null },
        })

        // 3. Reverse the invoice paidAmount update if linked
        if (existing.invoiceId) {
          const invoice = await tx.purchaseInvoice.findUnique({
            where: { id: existing.invoiceId },
          })
          if (invoice) {
            const reversedPaidAmount = toNumber(invoice.paidAmount) - toNumber(existing.amount)
            let newStatus = invoice.status

            if (reversedPaidAmount <= 0) {
              newStatus = 'DRAFT'
            } else if (reversedPaidAmount < toNumber(invoice.totalAmount)) {
              newStatus = 'PARTIALLY_PAID'
            }

            await tx.purchaseInvoice.update({
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
        if (body.amount !== undefined) updateData.amount = parseFloat(body.amount) || 0
        if (body.date !== undefined) updateData.date = new Date(body.date)
        if (body.paidFrom !== undefined) updateData.paidFrom = body.paidFrom
        if (body.payingAccountId !== undefined) updateData.payingAccountId = body.payingAccountId || null
        if (body.payingAccountCode !== undefined) updateData.payingAccountCode = body.payingAccountCode || null
        if (body.payingAccountName !== undefined) updateData.payingAccountName = body.payingAccountName || null
        if (body.bankAccount !== undefined) updateData.bankAccount = body.bankAccount
        if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod
        if (body.reference !== undefined) updateData.reference = body.reference
        if (body.notes !== undefined) updateData.notes = body.notes

        // 5. Update the payment with new data
        const updated = await tx.supplierPayment.update({
          where: { id: existing.id },
          data: updateData,
          include: {
            supplier: { select: { id: true, name: true, code: true } },
          },
        })

        // 6. Create a new journal entry for the updated payment (throws on failure → tx rolls back).
        await createSupplierPaymentJournalEntry(updated.id, tx)

        // 7. Apply the new invoice paidAmount update if linked
        const newInvoiceId = existing.invoiceId // supplier payments don't change invoiceId on edit
        const newAmount = body.amount !== undefined ? (parseFloat(body.amount) || 0) : toNumber(existing.amount)

        if (newInvoiceId) {
          const invoice = await tx.purchaseInvoice.findUnique({
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

            await tx.purchaseInvoice.update({
              where: { id: newInvoiceId },
              data: {
                paidAmount: newPaidAmount,
                status: newStatus,
              },
            })
          }
        }

        // 8. Re-fetch to include journalEntryId
        return await tx.supplierPayment.findUnique({
          where: { id: existing.id },
          include: {
            supplier: { select: { id: true, name: true, code: true } },
          },
        })
      })

      return NextResponse.json(result)
    }

    // Not posted — simple update (no accounting implications)
    const updateData: Record<string, unknown> = {}
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount) || 0
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.paidFrom !== undefined) updateData.paidFrom = body.paidFrom
    if (body.payingAccountId !== undefined) updateData.payingAccountId = body.payingAccountId || null
    if (body.payingAccountCode !== undefined) updateData.payingAccountCode = body.payingAccountCode || null
    if (body.payingAccountName !== undefined) updateData.payingAccountName = body.payingAccountName || null
    if (body.bankAccount !== undefined) updateData.bankAccount = body.bankAccount
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod
    if (body.reference !== undefined) updateData.reference = body.reference
    if (body.notes !== undefined) updateData.notes = body.notes

    const updated = await db.supplierPayment.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating supplier payment:', error)
    const message = error instanceof Error ? error.message : 'فشل في تحديث دفعة المورد'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.supplierPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    // Cannot delete payments with journal entries
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن حذف دفعة مورد مرحلة محاسبياً' },
        { status: 400 }
      )
    }

    // If linked to an invoice, reverse the paidAmount update
    if (existing.invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: existing.invoiceId },
      })
      if (invoice) {
        const newPaidAmount = Math.max(0, invoice.paidAmount - existing.amount)
        let newStatus = invoice.status

        if (newPaidAmount <= 0) {
          newStatus = 'DRAFT'
        } else if (newPaidAmount < invoice.totalAmount) {
          newStatus = 'PARTIALLY_PAID'
        }

        await db.purchaseInvoice.update({
          where: { id: existing.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        })
      }
    }

    await db.supplierPayment.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف دفعة المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier payment:', error)
    return NextResponse.json({ error: 'فشل في حذف دفعة المورد' }, { status: 500 })
  }
}
