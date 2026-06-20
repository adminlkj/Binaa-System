import { db } from '@/lib/db'
import { createPurchaseInvoiceJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (status) where.status = status
    if (projectId) where.projectId = projectId
    if (search) {
      where.OR = [
        { invoiceNo: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      supplier: { select: { id: true, name: true, code: true } },
      purchaseOrder: { select: { id: true, orderNo: true } },
      project: { select: { id: true, name: true, code: true, projectType: true } },
      items: true,
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const invoices = await db.purchaseInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(invoices)
    }

    const [data, total] = await Promise.all([
      db.purchaseInvoice.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.purchaseInvoice.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch purchase invoices:', error)
    return NextResponse.json({ error: 'Failed to fetch purchase invoices', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
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

    // Create invoice + accounting entry in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Auto-generate invoice number (inside tx for consistency)
      const lastInvoice = await tx.purchaseInvoice.findFirst({
        orderBy: { invoiceNo: 'desc' },
        select: { invoiceNo: true },
      })

      let nextNum = 1
      if (lastInvoice?.invoiceNo) {
        const match = lastInvoice.invoiceNo.match(/PI-(\d+)/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const invoiceNo = `PI-${String(nextNum).padStart(4, '0')}`

      const invoice = await tx.purchaseInvoice.create({
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
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })

      // Auto-create accounting journal entry (throws on failure → tx rolls back).
      await createPurchaseInvoiceJournalEntry(invoice.id, tx)

      // Re-fetch to include journalEntryId
      return await tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          purchaseOrder: { select: { id: true, orderNo: true } },
          project: { select: { id: true, name: true, code: true, projectType: true } },
          items: true,
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create purchase invoice:', error)
    return NextResponse.json({ error: 'Failed to create purchase invoice', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
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
      await db.$transaction(async (tx: PrismaTransaction) => {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId! },
          include: { lines: true },
        })

        if (originalEntry) {
          // Get account codes for reversal lines
          const accountIds = originalEntry.lines.map(l => l.accountId)
          const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } })
          const accountMap = new Map(accounts.map(a => [a.id, a.code]))

          const resolvedReversalLines = originalEntry.lines.map(line => ({
            accountCode: accountMap.get(line.accountId) || '',
            debit: toNumber(line.credit),
            credit: toNumber(line.debit),
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
          }, tx)

          // Cancel the original entry
          await tx.journalEntry.update({
            where: { id: existing.journalEntryId! },
            data: { status: 'CANCELLED' },
          })
        }

        // Update the invoice with new values so createPurchaseInvoiceJournalEntry reads them
        const newSubtotal = updateData.subtotal !== undefined ? toNumber(updateData.subtotal) : toNumber(existing.subtotal)
        const newVatAmount = updateData.vatAmount !== undefined ? toNumber(updateData.vatAmount) : toNumber(existing.vatAmount)
        const newTotalAmount = updateData.totalAmount !== undefined ? toNumber(updateData.totalAmount) : toNumber(existing.totalAmount)

        await tx.purchaseInvoice.update({
          where: { id: existing.id },
          data: {
            subtotal: newSubtotal,
            vatAmount: newVatAmount,
            totalAmount: newTotalAmount,
          },
        })

        // Create new journal entry (throws on failure so the tx rolls back).
        await createPurchaseInvoiceJournalEntry(existing.id, tx)

        updateData.journalEntryId = undefined // Will be set by createPurchaseInvoiceJournalEntry
      })
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
        project: { select: { id: true, name: true, code: true, projectType: true } },
        items: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update purchase invoice:', error)
    return NextResponse.json({ error: 'Failed to update purchase invoice', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
