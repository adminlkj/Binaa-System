import { db } from '@/lib/db'
import { autoEntryPurchaseInvoice, initializeChartOfAccounts, createJournalEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (status) where.status = status
    if (projectId) where.projectId = projectId

    const invoices = await db.purchaseInvoice.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching purchase invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير الشراء' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, purchaseOrderId, projectId, date, dueDate, notes, items, vatRate = 0.15 } = body

    if (!supplierId || !date || !dueDate || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Auto-generate invoice number
    const lastInvoice = await db.purchaseInvoice.findFirst({
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/PI-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `PI-${String(nextNum).padStart(4, '0')}`

    const invoice = await db.purchaseInvoice.create({
      data: {
        invoiceNo,
        supplierId,
        purchaseOrderId: purchaseOrderId || null,
        projectId: projectId || null,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        notes: notes || null,
        expenseCategory: body.expenseCategory || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unitPrice: number }) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    // Auto-create accounting journal entry and store journalEntryId
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntryPurchaseInvoice({
        invoiceNo: invoice.invoiceNo,
        supplierId: invoice.supplierId,
        subtotal: invoice.subtotal,
        vatRate: invoice.vatRate,
        vatAmount: invoice.vatAmount,
        totalAmount: invoice.totalAmount,
        date: invoice.date,
        projectId: invoice.projectId || undefined,
        expenseCategory: body.expenseCategory,
      })

      // Store the journalEntryId on the invoice
      await db.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for purchase invoice:', accountingError)
    }

    // Re-fetch to include journalEntryId
    const updatedInvoice = await db.purchaseInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updatedInvoice, { status: 201 })
  } catch (error) {
    console.error('Error creating purchase invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة الشراء' }, { status: 500 })
  }
}

// PUT: Update a purchase invoice (with reversal for approved/posted invoices)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف الفاتورة مطلوب' }, { status: 400 })
    }

    const existing = await db.purchaseInvoice.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // Cannot modify CANCELLED invoices
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
    }

    // If the invoice has been approved/posted and amounts are changing, create reversal + new entry
    if (existing.journalEntryId && (updateData.subtotal !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)) {
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
          entryNo: `JE-REV-PI-${Date.now()}`,
          date: new Date(),
          description: `Reversal for Purchase Invoice ${existing.invoiceNo}`,
          descriptionAr: `قيد عكسي لفاتورة مشتريات ${existing.invoiceNo}`,
          lines: resolvedReversalLines,
          sourceType: 'PURCHASE_INVOICE_REVERSAL',
          sourceId: existing.invoiceNo,
        })

        // Cancel the original entry
        await db.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: { status: 'CANCELLED' },
        })
      }

      // Create new entry with updated values
      const newSubtotal = updateData.subtotal ?? existing.subtotal
      const newVatAmount = updateData.vatAmount ?? existing.vatAmount
      const newTotalAmount = updateData.totalAmount ?? existing.totalAmount
      const newDate = updateData.date ? new Date(updateData.date) : existing.date

      await initializeChartOfAccounts()
      const newJournalEntry = await autoEntryPurchaseInvoice({
        invoiceNo: existing.invoiceNo,
        supplierId: existing.supplierId,
        subtotal: newSubtotal,
        vatRate: existing.vatRate,
        vatAmount: newVatAmount,
        totalAmount: newTotalAmount,
        date: newDate,
        projectId: existing.projectId || undefined,
        expenseCategory: existing.expenseCategory || undefined,
      })

      updateData.journalEntryId = newJournalEntry.id
    }

    // Update the invoice
    const updated = await db.purchaseInvoice.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.date && { date: new Date(updateData.date) }),
        ...(updateData.dueDate && { dueDate: new Date(updateData.dueDate) }),
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating purchase invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث فاتورة الشراء' }, { status: 500 })
  }
}
