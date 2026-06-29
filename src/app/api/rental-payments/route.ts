import { db } from '@/lib/db'
import { createClientPaymentJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = { paymentType: 'RENTAL' }
    if (clientId) where.clientId = clientId
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      where.date = dateFilter
    }
    if (search) {
      where.OR = [
        { reference: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      client: { select: { id: true, name: true, code: true } },
      invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const payments = await db.clientPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(payments)
    }

    const [data, total] = await Promise.all([
      db.clientPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.clientPayment.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch rental payments:', error)
    return NextResponse.json({ error: 'Failed to fetch rental payments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { clientId, invoiceId, amount, date, receivedIn, reference, notes } = body

    if (!clientId || !amount || !date) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate client exists
    const client = await db.client.findUnique({
      where: { id: clientId },
    })
    if (!client) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    // If invoiceId provided, validate it is a RENTAL invoice and belongs to the client
    if (invoiceId) {
      const invoice = await db.salesInvoice.findUnique({
        where: { id: invoiceId },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'فاتورة الإيجار غير موجودة' }, { status: 404 })
      }
      if (invoice.invoiceType !== 'RENTAL') {
        return NextResponse.json(
          { error: 'الفاتورة المحددة ليست فاتورة إيجار' },
          { status: 400 }
        )
      }
      if (invoice.clientId !== clientId) {
        return NextResponse.json(
          { error: 'فاتورة الإيجار لا تنتمي لهذا العميل' },
          { status: 400 }
        )
      }
    }

    // Create the payment + accounting entry + update invoice in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the rental payment (stored as ClientPayment with paymentType = 'RENTAL')
      const payment = await tx.clientPayment.create({
        data: {
          clientId,
          invoiceId: invoiceId || null,
          amount,
          date: new Date(date),
          receivedIn: receivedIn || 'TREASURY',
          paymentType: 'RENTAL',
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          client: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
        },
      })

      // Create accounting journal entry: Debit Bank, Credit Client Receivable (throws on failure → tx rolls back).
      await createClientPaymentJournalEntry(payment.id, tx)

      // Update sales invoice paidAmount and status
      if (invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: invoiceId },
        })
        if (invoice) {
          const newPaidAmount = toNumber(invoice.paidAmount) + amount
          let newStatus = invoice.status

          if (newPaidAmount >= toNumber(invoice.totalAmount)) {
            newStatus = 'PAID'
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID'
          }

          await tx.salesInvoice.update({
            where: { id: invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          })
        }
      }

      // Re-fetch to include journalEntryId
      return await tx.clientPayment.findUnique({
        where: { id: payment.id },
        include: {
          client: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create rental payment:', error)
    return NextResponse.json({ error: 'Failed to create rental payment' }, { status: 500 })
  }
}
