import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const purchaseRequestId = searchParams.get('purchaseRequestId')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (purchaseRequestId) where.purchaseRequestId = purchaseRequestId

    const include = {
      supplier: { select: { id: true, name: true, code: true } },
      project: { select: { id: true, name: true, code: true, projectType: true } },
      purchaseRequest: { select: { id: true, requestNo: true, status: true } },
      items: true,
      goodsReceipts: {
        select: { id: true, receiptNo: true, status: true, date: true },
      },
      _count: { select: { invoices: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const orders = await db.purchaseOrder.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(orders)
    }

    const [data, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.purchaseOrder.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch purchase orders:', error)
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { supplierId, projectId, purchaseRequestId, date, deliveryDate, notes, items, vatRate = 0.15 } = body

    if (!supplierId || !date || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate: if purchaseRequestId provided, it must be APPROVED
    if (purchaseRequestId) {
      const pr = await db.purchaseRequest.findUnique({
        where: { id: purchaseRequestId },
      })
      if (!pr) {
        return NextResponse.json({ error: 'طلب الشراء غير موجود' }, { status: 404 })
      }
      if (pr.status !== 'APPROVED') {
        return NextResponse.json(
          { error: 'لا يمكن إنشاء أمر شراء من طلب غير معتمد - يجب اعتماد طلب الشراء أولاً' },
          { status: 400 }
        )
      }
    }

    // Calculate totals from items
    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => {
      return sum + (item.quantity * item.unitPrice)
    }, 0)
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    // Create PO with items in a transaction
    const order = await db.$transaction(async (tx: PrismaTransaction) => {
      // Auto-generate order number PO-XXX (inside tx for consistency)
      const lastOrder = await tx.purchaseOrder.findFirst({
        orderBy: { orderNo: 'desc' },
        select: { orderNo: true },
      })

      let nextNum = 1
      if (lastOrder?.orderNo) {
        const match = lastOrder.orderNo.match(/PO-(\d+)/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const orderNo = `PO-${String(nextNum).padStart(4, '0')}`

      return await tx.purchaseOrder.create({
        data: {
          orderNo,
          supplierId,
          projectId: projectId || null,
          purchaseRequestId: purchaseRequestId || null,
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
          project: { select: { id: true, name: true, code: true, projectType: true } },
          purchaseRequest: { select: { id: true, requestNo: true, status: true } },
          items: true,
        },
      })
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create purchase order:', error)
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
  }
}
