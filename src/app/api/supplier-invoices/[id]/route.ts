import { db } from '@/lib/db'
import { autoEntryPurchaseInvoice, initializeChartOfAccounts, createJournalEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

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

    // Cannot modify cancelled invoices
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
    }

    // Handle APPROVE action
    if (body.status === 'SENT' && existing.status === 'DRAFT') {
      // On APPROVE: create accounting entry using autoEntryPurchaseInvoice
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
            expenseCategory: existing.expenseCategory || undefined,
          })
          journalEntryId = journalEntry.id
        } catch (accountingError) {
          console.error('Accounting entry failed for supplier invoice:', accountingError)
        }
      }

      const updated = await db.purchaseInvoice.update({
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

      return NextResponse.json(updated)
    }

    // Handle modification after approval (reversal + new entry)
    if (existing.journalEntryId && (body.subtotal !== undefined || body.totalAmount !== undefined || body.vatAmount !== undefined)) {
      const originalEntry = await db.journalEntry.findUnique({
        where: { id: existing.journalEntryId },
        include: { lines: true },
      })

      if (originalEntry) {
        // Get account codes for reversal lines
        const accountIds = originalEntry.lines.map(l => l.accountId)
        const accounts = await db.account.findMany({ where: { id: { in: accountIds } } })
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
        })

        // Cancel the original entry
        await db.journalEntry.update({
          where: { id: existing.journalEntryId },
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
        expenseCategory: existing.expenseCategory || undefined,
      })

      body.journalEntryId = newJournalEntry.id
    }

    // General update
    const updateData: Record<string, unknown> = {}
    if (body.supplierInvoiceNo !== undefined) updateData.supplierInvoiceNo = body.supplierInvoiceNo
    if (body.supplierInvoiceDate !== undefined) updateData.supplierInvoiceDate = body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : null
    if (body.attachmentPath !== undefined) updateData.attachmentPath = body.attachmentPath
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.status !== undefined) updateData.status = body.status
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
        { error: 'لا يمكن حذف فاتورة مورد بعد الاعتماد' },
        { status: 400 }
      )
    }

    // Delete items first then the invoice
    await db.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
    await db.purchaseInvoice.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف فاتورة المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier invoice:', error)
    return NextResponse.json({ error: 'فشل في حذف فاتورة المورد' }, { status: 500 })
  }
}
