import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const orders = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
        _count: { select: { invoices: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(orders)
  } catch (error) {
    console.error('Error fetching purchase orders:', error)
    return NextResponse.json({ error: 'فشل في تحميل أوامر الشراء' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, projectId, date, deliveryDate, notes, items, vatRate = 0.15 } = body

    if (!supplierId || !date || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Auto-generate order number
    const lastOrder = await db.purchaseOrder.findFirst({
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    })

    let nextNum = 1
    if (lastOrder?.orderNo) {
      const match = lastOrder.orderNo.match(/PO-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const orderNo = `PO-${String(nextNum).padStart(4, '0')}`

    const order = await db.purchaseOrder.create({
      data: {
        orderNo,
        supplierId,
        projectId: projectId || null,
        date: new Date(date),
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        subtotal,
        vatRate,
        vatAmount,
        totalAmount,
        paidAmount: 0,
        status: 'DRAFT',
        notes: notes || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unit?: string; unitPrice: number }) => ({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit || null,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('Error creating purchase order:', error)
    return NextResponse.json({ error: 'فشل في إنشاء أمر الشراء' }, { status: 500 })
  }
}
