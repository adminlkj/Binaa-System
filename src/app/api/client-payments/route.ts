import { db } from '@/lib/db'
import { autoEntryClientPayment, initializeChartOfAccounts, type PrismaTransaction } from '@/lib/accounting/engine'
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

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(dateTo)
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
    console.error('Error fetching client payments:', error)
    return NextResponse.json({ error: 'فشل في تحميل تحصيلات العملاء' }, { status: 500 })
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

    // If invoiceId provided, validate and check amount
    if (invoiceId) {
      const invoice = await db.salesInvoice.findUnique({
        where: { id: invoiceId },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'فاتورة البيع غير موجودة' }, { status: 404 })
      }
      if (invoice.clientId !== clientId) {
        return NextResponse.json(
          { error: 'فاتورة البيع لا تنتمي لهذا العميل' },
          { status: 400 }
        )
      }
    }

    // Create the payment + accounting entry + update invoice in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the payment
      const payment = await tx.clientPayment.create({
        data: {
          clientId,
          invoiceId: invoiceId || null,
          amount,
          date: new Date(date),
          receivedIn: receivedIn || 'TREASURY',
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          client: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
        },
      })

      // Create accounting entry using autoEntryClientPayment
      try {
        await initializeChartOfAccounts()
        const journalEntry = await autoEntryClientPayment({
          clientName: client.name,
          amount,
          date: new Date(date),
          receivedIn: receivedIn === 'BANK' ? 'BANK' : 'TREASURY',
          reference: reference || undefined,
        }, tx)

        // Store the journalEntryId on the payment
        await tx.clientPayment.update({
          where: { id: payment.id },
          data: { journalEntryId: journalEntry.id },
        })
      } catch (accountingError) {
        console.error('Accounting entry failed for client payment:', accountingError)
      }

      // Update sales invoice paidAmount and status
      if (invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: invoiceId },
        })
        if (invoice) {
          const newPaidAmount = invoice.paidAmount + amount
          let newStatus = invoice.status

          if (newPaidAmount >= invoice.totalAmount) {
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
    console.error('Error creating client payment:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تحصيل العميل' }, { status: 500 })
  }
}
