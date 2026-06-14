import { db } from '@/lib/db'
import { createSupplierPaymentJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const invoiceId = searchParams.get('invoiceId')
    const paidFrom = searchParams.get('paidFrom')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (invoiceId) where.invoiceId = invoiceId
    if (paidFrom) where.paidFrom = paidFrom
    if (search) {
      where.OR = [
        { reference: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      supplier: { select: { id: true, name: true, code: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const payments = await db.supplierPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(payments)
    }

    const [data, total] = await Promise.all([
      db.supplierPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.supplierPayment.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch supplier payments:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier payments', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, invoiceId, amount, date, paidFrom, bankAccount, paymentMethod, reference, notes } = body

    if (!supplierId || !amount || !date) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate supplier exists
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }

    // If invoiceId provided, validate and check amount
    if (invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: invoiceId },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'فاتورة الشراء غير موجودة' }, { status: 404 })
      }
      if (invoice.supplierId !== supplierId) {
        return NextResponse.json(
          { error: 'فاتورة الشراء لا تنتمي لهذا المورد' },
          { status: 400 }
        )
      }
    }

    // Create the payment + accounting entry + update invoice in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the payment
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId,
          invoiceId: invoiceId || null,
          amount: parseFloat(amount) || 0,
          date: new Date(date),
          paidFrom: paidFrom || 'TREASURY',
          bankAccount: bankAccount || null,
          paymentMethod: paymentMethod || null,
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
      })

      // Create accounting entry using auto-journal
      try {
        await createSupplierPaymentJournalEntry(payment.id, tx)
      } catch (accountingError) {
        console.error('[API] Accounting entry failed for supplier payment:', accountingError)
      }

      // Update purchase invoice paidAmount and status
      if (invoiceId) {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: invoiceId },
        })
        if (invoice) {
          const newPaidAmount = toNumber(invoice.paidAmount) + (parseFloat(amount) || 0)
          let newStatus = invoice.status

          if (newPaidAmount >= toNumber(invoice.totalAmount)) {
            newStatus = 'PAID'
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID'
          }

          await tx.purchaseInvoice.update({
            where: { id: invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          })
        }
      }

      // Re-fetch to include journalEntryId
      return await tx.supplierPayment.findUnique({
        where: { id: payment.id },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create supplier payment:', error)
    return NextResponse.json({ error: 'Failed to create supplier payment', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
