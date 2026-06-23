import { db } from '@/lib/db'
import { autoEntryPurchaseInvoice, initializeChartOfAccounts, createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
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
      if (body.status === 'SENT' && existing.status === 'DRAFT') {
        const result = await db.$transaction(async (tx: PrismaTransaction) => {
          let journalEntryId = existing.journalEntryId

          if (!journalEntryId) {
            try {
              await initializeChartOfAccounts()
              const journalEntry = await autoEntryPurchaseInvoice({
                invoiceNo: existing.invoiceNo,
                supplierId: existing.supplierId,
                subtotal: existing.subtotal,
                vatRate: existing.vatRate,
                vatAmount: existing.vatAmount,
                totalAmount: existing.totalAmount,
                date: existing.date,
                projectId: existing.projectId || undefined,
                costCenterId: existing.projectId || undefined,
                expenseCategory: existing.expenseCategory || undefined,
              }, tx)
              journalEntryId = journalEntry.id
            } catch (accountingError) {
              console.error('Accounting entry failed for supplier invoice:', accountingError)
            }
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

    // Handle modification with reversal if journal entry exists
    if (existing.journalEntryId && (body.subtotal !== undefined || body.totalAmount !== undefined || body.vatAmount !== undefined)) {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId!, deletedAt: null },
          include: { lines: { where: { deletedAt: null } } },
        })

        if (originalEntry) {
          // Get account codes for reversal lines
          const accountIds = originalEntry.lines.map(l => l.accountId)
          const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } })
          const accountMap = new Map(accounts.map(a => [a.id, a.code]))

          const resolvedReversalLines = originalEntry.lines.map(line => ({
            accountCode: accountMap.get(line.accountId) || '',
            debit: line.credit,
            credit: line.debit,
            costCenterId: line.costCenterId || undefined,
            description: `Reversal: ${line.description || ''}`,
          }))

          await createJournalEntry({
            entryNo: `JE-REV-SI-${Date.now()}`,
            date: new Date(),
            description: `Reversal for Supplier Invoice ${existing.invoiceNo}`,
            descriptionAr: `قيد عكسي لفاتورة مورد ${existing.invoiceNo}`,
            lines: resolvedReversalLines,
            sourceType: 'SUPPLIER_INVOICE_REVERSAL',
            sourceId: existing.invoiceNo,
          }, tx)

          // Cancel the original entry
          await tx.journalEntry.update({
            where: { id: existing.journalEntryId! },
            data: { status: 'CANCELLED' },
          })
        }

        // Create new entry with updated values
        const newSubtotal = body.subtotal ?? existing.subtotal
        const newVatAmount = body.vatAmount ?? existing.vatAmount
        const newTotalAmount = body.totalAmount ?? existing.totalAmount

        await initializeChartOfAccounts()
        const newJournalEntry = await autoEntryPurchaseInvoice({
          invoiceNo: existing.invoiceNo,
          supplierId: existing.supplierId,
          subtotal: newSubtotal,
          vatRate: existing.vatRate,
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          date: existing.date,
          projectId: existing.projectId || undefined,
          costCenterId: existing.projectId || undefined,
          expenseCategory: existing.expenseCategory || undefined,
        }, tx)

        body.journalEntryId = newJournalEntry.id

        // General update for DRAFT invoices
        const updateData: Record<string, unknown> = {}
        if (body.supplierInvoiceNo !== undefined) updateData.supplierInvoiceNo = body.supplierInvoiceNo
        if (body.supplierInvoiceDate !== undefined) updateData.supplierInvoiceDate = body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : null
        if (body.attachmentPath !== undefined) updateData.attachmentPath = body.attachmentPath
        if (body.notes !== undefined) updateData.notes = body.notes
        if (body.journalEntryId !== undefined) updateData.journalEntryId = body.journalEntryId
        if (body.date !== undefined) updateData.date = new Date(body.date)
        if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate)

        return await tx.purchaseInvoice.update({
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

    // Delete items first then the invoice (in transaction)
    await db.$transaction(async (tx: PrismaTransaction) => {
      await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
      await tx.purchaseInvoice.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف فاتورة المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في حذف فاتورة المورد' }, { status: 500 })
  }
}
