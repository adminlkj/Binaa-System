import { db } from '@/lib/db'
import { autoEntrySalesInvoice, autoEntryRentalInvoice, initializeChartOfAccounts, createJournalEntry } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const invoiceType = searchParams.get('invoiceType')

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (invoiceType) where.invoiceType = invoiceType

    const invoices = await db.salesInvoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching sales invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير المبيعات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      clientId, projectId, contractId, date, dueDate, notes, items,
      vatRate = 0.15, discountRate = 0, discountAmount = 0,
      invoiceType = 'TAX_INVOICE', paymentTerms,
      referenceNo, contractNo, contractType, contractPeriodStart, contractPeriodEnd,
      deliveryMonth, includeDelivery = false, deliveryAmount = 0, includeVat = true,
    } = body

    if (!clientId || !date || !dueDate || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    
    const finalDiscountAmount = discountAmount || (subtotal * discountRate)
    const netAmount = subtotal - finalDiscountAmount
    const deliveryTotal = includeDelivery ? deliveryAmount : 0
    const vatAmount = includeVat ? (netAmount + deliveryTotal) * vatRate : 0
    const totalAmount = netAmount + deliveryTotal + vatAmount

    // Auto-generate invoice number: TYPE-YEAR-SEQ format
    const typePrefixMap: Record<string, string> = {
      TAX_INVOICE: 'SRV',
      PROGRESS_CLAIM: 'PCL',
      RENTAL: 'RNT',
      SERVICE: 'SVC',
    }
    const prefix = typePrefixMap[invoiceType] || 'INV'
    const year = new Date().getFullYear()
    const yearStr = String(year)
    const likePattern = `${prefix}-${yearStr}-`

    const lastInvoice = await db.salesInvoice.findFirst({
      where: { invoiceNo: { startsWith: likePattern } },
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let seq = 1
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split('-')
      const parsedSeq = parseInt(parts[2])
      if (!isNaN(parsedSeq)) {
        seq = parsedSeq + 1
      }
    }
    const invoiceNo = `${prefix}-${yearStr}-${String(seq).padStart(4, '0')}`

    const invoice = await db.salesInvoice.create({
      data: {
        invoiceNo,
        clientId,
        projectId: projectId || null,
        contractId: contractId || null,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal,
        discountRate,
        discountAmount: finalDiscountAmount,
        netAmount,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        invoiceType,
        notes: notes || null,
        paymentTerms: paymentTerms || null,
        referenceNo: referenceNo || null,
        contractNo: contractNo || null,
        contractType: contractType || null,
        contractPeriodStart: contractPeriodStart ? new Date(contractPeriodStart) : null,
        contractPeriodEnd: contractPeriodEnd ? new Date(contractPeriodEnd) : null,
        deliveryMonth: deliveryMonth || null,
        includeDelivery,
        deliveryAmount: includeDelivery ? deliveryAmount : 0,
        includeVat,
        items: {
          create: items.map((item: { description: string; descriptionEn?: string; quantity: number; unit?: string; unitPrice: number; itemType?: string }) => ({
            description: item.description,
            descriptionEn: item.descriptionEn || null,
            quantity: item.quantity,
            unit: item.unit || null,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            itemType: item.itemType || 'PRODUCT',
          })),
        },
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
    })

    // Auto-create accounting journal entry and store journalEntryId
    try {
      await initializeChartOfAccounts()
      
      let journalEntry
      if (invoiceType === 'RENTAL') {
        journalEntry = await autoEntryRentalInvoice({
          invoiceNo: invoice.invoiceNo,
          subtotal: invoice.subtotal,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          date: invoice.date,
          costCenterId: invoice.projectId || undefined,
        })
      } else {
        journalEntry = await autoEntrySalesInvoice({
          invoiceNo: invoice.invoiceNo,
          clientId: invoice.clientId,
          subtotal: invoice.subtotal,
          vatRate: invoice.vatRate,
          vatAmount: invoice.vatAmount,
          totalAmount: invoice.totalAmount,
          invoiceType: invoice.invoiceType,
          date: invoice.date,
          projectId: invoice.projectId || undefined,
        })
      }

      // Store the journalEntryId on the invoice
      await db.salesInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for sales invoice:', accountingError)
      // Don't fail the invoice creation, just log the error
    }

    // Re-fetch to include journalEntryId
    const updatedInvoice = await db.salesInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
    })

    return NextResponse.json(updatedInvoice, { status: 201 })
  } catch (error) {
    console.error('Error creating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة المبيعات' }, { status: 500 })
  }
}

// PUT: Update a sales invoice (with reversal for approved/posted invoices)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف الفاتورة مطلوب' }, { status: 400 })
    }

    const existing = await db.salesInvoice.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // Cannot modify CANCELLED invoices
    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
    }

    // If the invoice has been approved/posted (has a journal entry), create a reversal + new entry
    if (existing.journalEntryId && (updateData.subtotal !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)) {
      // Create reversal entry for the original
      const originalEntry = await db.journalEntry.findUnique({
        where: { id: existing.journalEntryId },
        include: { lines: true },
      })

      if (originalEntry) {
        // Create reversal entry (swap debit/credit)
        const reversalLines = originalEntry.lines.map(line => ({
          accountCode: '', // Will be resolved from accountId
          debit: line.credit,
          credit: line.debit,
          costCenterId: line.costCenterId || undefined,
          description: `Reversal: ${line.description || ''}`,
        }))

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
          description: `Reversal for Sales Invoice ${existing.invoiceNo}`,
          descriptionAr: `قيد عكسي لفاتورة مبيعات ${existing.invoiceNo}`,
          lines: resolvedReversalLines,
          sourceType: 'SALES_INVOICE_REVERSAL',
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
      const newInvoiceType = updateData.invoiceType ?? existing.invoiceType
      const newDate = updateData.date ? new Date(updateData.date) : existing.date

      await initializeChartOfAccounts()
      
      let newJournalEntry
      if (newInvoiceType === 'RENTAL') {
        newJournalEntry = await autoEntryRentalInvoice({
          invoiceNo: existing.invoiceNo,
          subtotal: newSubtotal,
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          date: newDate,
          costCenterId: existing.projectId || undefined,
        })
      } else {
        newJournalEntry = await autoEntrySalesInvoice({
          invoiceNo: existing.invoiceNo,
          clientId: existing.clientId,
          subtotal: newSubtotal,
          vatRate: existing.vatRate,
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          invoiceType: newInvoiceType,
          date: newDate,
          projectId: existing.projectId || undefined,
        })
      }

      updateData.journalEntryId = newJournalEntry.id
    }

    // Update the invoice
    const updated = await db.salesInvoice.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.date && { date: new Date(updateData.date) }),
        ...(updateData.dueDate && { dueDate: new Date(updateData.dueDate) }),
      },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث فاتورة المبيعات' }, { status: 500 })
  }
}
