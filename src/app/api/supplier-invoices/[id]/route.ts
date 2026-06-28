import { db } from '@/lib/db'
import { createPurchaseInvoiceJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { reverseEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// Valid status transitions for Supplier Invoices
const VALID_SI_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_PAID', 'CANCELLED'], // Point of no return - cannot go back to DRAFT
  PARTIALLY_PAID: ['PAID', 'CANCELLED'],
  PAID: [], // Terminal state
  CANCELLED: [], // Terminal state
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invoice = await db.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        goodsReceipt: {
          select: { id: true, receiptNo: true, status: true },
        },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'فاتورة المورد غير موجودة' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في تحميل فاتورة المورد' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.purchaseInvoice.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'فاتورة المورد غير موجودة' }, { status: 404 })
    }

    // Handle status change
    if (body.status && body.status !== existing.status) {
      const allowedTransitions = VALID_SI_TRANSITIONS[existing.status] || []

      if (!allowedTransitions.includes(body.status)) {
        if (existing.status === 'SENT' && body.status === 'DRAFT') {
          return NextResponse.json(
            { error: 'لا يمكن الرجوع من حالة مرسلة إلى مسودة - لا يمكن التراجع بعد الإرسال' },
            { status: 400 }
          )
        }
        if (existing.status === 'PAID') {
          return NextResponse.json(
            { error: 'لا يمكن تغيير حالة فاتورة مدفوعة بالكامل' },
            { status: 400 }
          )
        }
        if (existing.status === 'CANCELLED') {
          return NextResponse.json(
            { error: 'لا يمكن تعديل فاتورة ملغاة' },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: `لا يمكن التحويل من ${existing.status} إلى ${body.status}` },
          { status: 400 }
        )
      }

      // CRITICAL: When status changes from DRAFT to SENT, auto-create accounting journal entry
      // P5-CRIT-006 FIX: use unified createPurchaseInvoiceJournalEntry (auto-journal.ts)
      // which is expenseCategory-aware + propagates costCenterId + uses requireAccountByRole
      // (no hardcoded fallback codes). Previously this used autoEntryPurchaseInvoice (engine.ts)
      // which had divergent account-selection logic + hardcoded fallbacks.
      if (body.status === 'SENT' && existing.status === 'DRAFT') {
        const result = await db.$transaction(async (tx: PrismaTransaction) => {
          let journalEntryId = existing.journalEntryId

          if (!journalEntryId) {
            // R1 enforced: if the JE fails, the entire transaction rolls back —
            // no invoice can transition to SENT without a posted journal entry.
            // createPurchaseInvoiceJournalEntry reads the invoice from DB (including
            // expenseCategory + project.costCenter) and sets journalEntryId.
            await createPurchaseInvoiceJournalEntry(existing.id, tx)
            const updated = await tx.purchaseInvoice.findUnique({ where: { id: existing.id }, select: { journalEntryId: true } })
            journalEntryId = updated?.journalEntryId || null
          }

          return await tx.purchaseInvoice.update({
            where: { id },
            data: {
              status: 'SENT',
              journalEntryId,
            },
            include: {
              supplier: { select: { id: true, name: true, code: true } },
              purchaseOrder: { select: { id: true, orderNo: true, status: true } },
              goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
              project: { select: { id: true, name: true, code: true } },
              items: true,
            },
          })
        })

        return NextResponse.json(result)
      }

      // P5-CRIT-003 FIX: When status changes to CANCELLED, reverse the linked JE.
      if (body.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
        const result = await db.$transaction(async (tx: PrismaTransaction) => {
          if (existing.journalEntryId) {
            await reverseEntry(existing.journalEntryId, tx)
          }
          return await tx.purchaseInvoice.update({
            where: { id },
            data: { status: 'CANCELLED' },
            include: {
              supplier: { select: { id: true, name: true, code: true } },
              purchaseOrder: { select: { id: true, orderNo: true, status: true } },
              goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
              project: { select: { id: true, name: true, code: true } },
              items: true,
            },
          })
        })
        return NextResponse.json(result)
      }

      // Other status changes (PARTIALLY_PAID, PAID, CANCELLED)
      const updated = await db.purchaseInvoice.update({
        where: { id },
        data: { status: body.status },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          purchaseOrder: { select: { id: true, orderNo: true, status: true } },
          goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
          project: { select: { id: true, name: true, code: true } },
          items: true,
        },
      })

      return NextResponse.json(updated)
    }

    // Cannot modify cancelled invoices
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
    }

    // Cannot modify after SENT (except status changes handled above)
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل فاتورة بعد الإرسال - يمكن فقط تغيير الحالة' },
        { status: 400 }
      )
    }

    // Handle modification with reversal if journal entry exists.
    // P5-CRIT-006 FIX: use unified createPurchaseInvoiceJournalEntry so POST and PUT
    // produce the SAME account mapping (no more divergence between 7220 vs 7210).
    if (existing.journalEntryId && (body.subtotal !== undefined || body.totalAmount !== undefined || body.vatAmount !== undefined || body.items !== undefined)) {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId!, deletedAt: null },
          include: { lines: { where: { deletedAt: null } } },
        })

        if (originalEntry) {
          // Use unified reverseEntry() — creates proper reversal, keeps original POSTED.
          await reverseEntry(existing.journalEntryId!, tx)
        }

        // Update invoice with new values FIRST so createPurchaseInvoiceJournalEntry reads them.
        const updateDataFirst: Record<string, unknown> = {}
        if (body.subtotal !== undefined) updateDataFirst.subtotal = body.subtotal
        if (body.vatAmount !== undefined) updateDataFirst.vatAmount = body.vatAmount
        if (body.totalAmount !== undefined) updateDataFirst.totalAmount = body.totalAmount
        if (body.supplierInvoiceNo !== undefined) updateDataFirst.supplierInvoiceNo = body.supplierInvoiceNo
        if (body.supplierInvoiceDate !== undefined) updateDataFirst.supplierInvoiceDate = body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : null
        if (body.attachmentPath !== undefined) updateDataFirst.attachmentPath = body.attachmentPath
        if (body.notes !== undefined) updateDataFirst.notes = body.notes
        if (body.date !== undefined) updateDataFirst.date = new Date(body.date)
        if (body.dueDate !== undefined) updateDataFirst.dueDate = new Date(body.dueDate)
        if (body.expenseCategory !== undefined) updateDataFirst.expenseCategory = body.expenseCategory || null

        if (Object.keys(updateDataFirst).length > 0) {
          await tx.purchaseInvoice.update({ where: { id }, data: updateDataFirst })
        }

        // Update items if provided
        if (body.items !== undefined && Array.isArray(body.items)) {
          await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
          await tx.purchaseInvoiceItem.createMany({
            data: body.items.map((item: { description: string; quantity: number; unitPrice: number }) => ({
              invoiceId: id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          })
        }

        // Clear the old journalEntryId so createPurchaseInvoiceJournalEntry creates a fresh one
        await tx.purchaseInvoice.update({ where: { id }, data: { journalEntryId: null } })

        // Create new JE with updated values (reads invoice + expenseCategory + project.costCenter from DB)
        await createPurchaseInvoiceJournalEntry(existing.id, tx)

        return await tx.purchaseInvoice.findUnique({
          where: { id },
          include: {
            supplier: { select: { id: true, name: true, code: true } },
            purchaseOrder: { select: { id: true, orderNo: true, status: true } },
            goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
            project: { select: { id: true, name: true, code: true } },
            items: true,
          },
        })
      })

      return NextResponse.json(result)
    }

    // General update for DRAFT invoices
    const updateData: Record<string, unknown> = {}
    if (body.supplierInvoiceNo !== undefined) updateData.supplierInvoiceNo = body.supplierInvoiceNo
    if (body.supplierInvoiceDate !== undefined) updateData.supplierInvoiceDate = body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : null
    if (body.attachmentPath !== undefined) updateData.attachmentPath = body.attachmentPath
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.journalEntryId !== undefined) updateData.journalEntryId = body.journalEntryId
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate)

    const updated = await db.purchaseInvoice.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true, status: true } },
        goodsReceipt: { select: { id: true, receiptNo: true, status: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث فاتورة المورد' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.purchaseInvoice.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'فاتورة المورد غير موجودة' }, { status: 404 })
    }

    // Cannot delete after approval
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف فاتورة مورد بعد الاعتماد - يمكن فقط حذف المسودات' },
        { status: 400 }
      )
    }

    // P5-CRIT-002 FIX: reverse the linked JE (if any) BEFORE hard-deleting.
    // Previously the DELETE hard-deleted the invoice but left the JE POSTED in the GL,
    // creating orphaned JEs with sourceId pointing to deleted records.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
      await tx.purchaseInvoice.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف فاتورة المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في حذف فاتورة المورد' }, { status: 500 })
  }
}
