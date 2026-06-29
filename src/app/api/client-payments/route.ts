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

    const where: Record<string, unknown> = {}
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
    console.error('[API] Failed to fetch client payments:', error)
    return NextResponse.json({ error: 'Failed to fetch client payments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { clientId, invoiceId, amount, date, receivedIn, receivingAccountId, receivingAccountCode, receivingAccountName, reference, notes } = body

    if (!clientId || !amount || !date) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    const payAmount = parseFloat(amount) || 0
    if (payAmount <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 })
    }

    // Validate client exists + not soft-deleted (P6-CRIT-009 mirror)
    const client = await db.client.findFirst({
      where: { id: clientId, deletedAt: null },
    })
    if (!client) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }

    // P6-CRIT-005 FIX: If invoiceId provided, validate invoice status + overpayment.
    // Previously the POST allowed paying DRAFT / PAID / CANCELLED invoices and
    // had no overpayment check — a direct API call could un-CANCEL an invoice,
    // double-pay a PAID invoice, or pay a DRAFT invoice (mirror of P5-CRIT-009
    // fix applied to supplier-payments).
    let linkedInvoice: { id: string; status: string; totalAmount: any; paidAmount: any; clientId: string } | null = null
    if (invoiceId) {
      const invoice = await db.salesInvoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, status: true, totalAmount: true, paidAmount: true, clientId: true },
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
      if (invoice.status === 'CANCELLED') {
        return NextResponse.json({ error: 'لا يمكن التحصيل لفاتورة ملغاة' }, { status: 400 })
      }
      if (invoice.status === 'DRAFT') {
        return NextResponse.json({ error: 'لا يمكن التحصيل لفاتورة مسودة — اعتمد الفاتورة أولاً (DRAFT → SENT)' }, { status: 400 })
      }
      if (invoice.status === 'PAID') {
        return NextResponse.json({ error: 'الفاتورة مدفوعة بالكامل' }, { status: 400 })
      }
      // Overpayment check
      const remaining = toNumber(invoice.totalAmount) - toNumber(invoice.paidAmount)
      if (payAmount > remaining + 0.01) {
        return NextResponse.json(
          { error: `المبلغ ${payAmount} يتجاوز المتبقي على الفاتورة (${remaining.toFixed(2)})` },
          { status: 400 }
        )
      }
      linkedInvoice = invoice
    }

    // Create the payment + accounting entry + update invoice in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the payment
      const payment = await tx.clientPayment.create({
        data: {
          clientId,
          invoiceId: invoiceId || null,
          amount: payAmount,
          date: new Date(date),
          receivedIn: receivedIn || 'TREASURY',
          receivingAccountId: receivingAccountId || null,
          receivingAccountCode: receivingAccountCode || null,
          receivingAccountName: receivingAccountName || null,
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          client: { select: { id: true, name: true, code: true } },
          invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
        },
      })

      // Create accounting entry (throws on failure → tx rolls back).
      await createClientPaymentJournalEntry(payment.id, tx)

      // Update sales invoice paidAmount and status (only if linked invoice passed validation)
      if (linkedInvoice) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: linkedInvoice.id },
        })
        if (invoice) {
          const newPaidAmount = toNumber(invoice.paidAmount) + payAmount
          let newStatus = invoice.status

          if (newPaidAmount >= toNumber(invoice.totalAmount) - 0.01) {
            newStatus = 'PAID'
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID'
          }

          await tx.salesInvoice.update({
            where: { id: linkedInvoice.id },
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
    console.error('[API] Failed to create client payment:', error)
    return NextResponse.json({ error: 'Failed to create client payment' }, { status: 500 })
  }
}
