import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (clientId) where.clientId = clientId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const invoices = await db.salesInvoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
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
    const { clientId, projectId, date, dueDate, notes, items, vatRate = 0.15 } = body

    if (!clientId || !date || !dueDate || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Auto-generate invoice number
    const lastInvoice = await db.salesInvoice.findFirst({
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/SI-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `SI-${String(nextNum).padStart(4, '0')}`

    const invoice = await db.salesInvoice.create({
      data: {
        invoiceNo,
        clientId,
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
        client: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة المبيعات' }, { status: 500 })
  }
}
