import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { createPurchaseInvoiceJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { reverseEntry } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { getDefaultVatRate } from '@/lib/settings'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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
    return NextResponse.json({ error: 'Failed to fetch purchase invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { supplierId, purchaseOrderId, projectId, date, dueDate, notes, items, vatRate: vatRateRaw } = body

    // AUDIT-2 S1 FIX: honor configured company default VAT rate instead of hardcoding 0.15.
    // A zero rate (tax-exempt) is preserved via `!= null` check; falls back to system default.
    const vatRate = vatRateRaw != null ? Number(vatRateRaw) : await getDefaultVatRate()

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

      // P5-CRIT-001 FIX: DRAFT invoices must NOT have a journal entry.
      // The JE is created only when the invoice is approved (status → SENT/APPROVED)
      // via the supplier-invoices/[id] PUT route. Previously the POST created a JE
      // immediately, which meant DRAFT invoices appeared in the GL (R1 violation).
      // Re-fetch to include journalEntryId (will be null for DRAFT)
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
    return NextResponse.json({ error: 'Failed to create purchase invoice' }, { status: 500 })
  }
}

// PUT: Update a purchase invoice (with reversal for approved/posted invoices)
export async function PUT(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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

    // Atomic update: if the invoice has been approved/posted and amounts are changing,
    // reverse the old JE + update amounts + create new JE + apply all other field updates
    // in a SINGLE transaction. The prior code did the field update OUTSIDE the tx, which
    // could leave the invoice partially updated if that outer write failed after the tx
    // committed (CRITICAL #16).
    const amountsChanging = existing.journalEntryId && (updateData.subtotal !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)

    const updated = await db.$transaction(async (tx: PrismaTransaction) => {
      if (amountsChanging) {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId!, deletedAt: null },
          include: { lines: { where: { deletedAt: null } } },
        })

        if (originalEntry) {
          // Use unified reverseEntry() — creates proper reversal, keeps original POSTED.
          await reverseEntry(existing.journalEntryId!, tx)
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

        // Create new journal entry (throws on failure → tx rolls back).
        await createPurchaseInvoiceJournalEntry(existing.id, tx)

        // createPurchaseInvoiceJournalEntry sets journalEntryId via its own update;
        // don't overwrite it in the final update below.
        updateData.journalEntryId = undefined
        updateData.subtotal = undefined
        updateData.vatAmount = undefined
        updateData.totalAmount = undefined
      }

      // Apply all remaining (non-amount) field updates inside the same transaction
      return await tx.purchaseInvoice.update({
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
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update purchase invoice:', error)
    return NextResponse.json({ error: 'Failed to update purchase invoice' }, { status: 500 })
  }
}
