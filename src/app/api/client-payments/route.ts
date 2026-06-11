import { db } from '@/lib/db'
import { autoEntryClientPayment, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(dateTo)
    }

    const payments = await db.clientPayment.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(payments)
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

    // Create the payment
    const payment = await db.clientPayment.create({
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
      })

      // Store the journalEntryId on the payment
      await db.clientPayment.update({
        where: { id: payment.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for client payment:', accountingError)
    }

    // Update sales invoice paidAmount and status
    if (invoiceId) {
      const invoice = await db.salesInvoice.findUnique({
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

        await db.salesInvoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        })
      }
    }

    // Re-fetch to include journalEntryId
    const updatedPayment = await db.clientPayment.findUnique({
      where: { id: payment.id },
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
    })

    return NextResponse.json(updatedPayment, { status: 201 })
  } catch (error) {
    console.error('Error creating client payment:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تحصيل العميل' }, { status: 500 })
  }
}
