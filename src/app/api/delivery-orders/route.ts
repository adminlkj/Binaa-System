import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const equipmentId = searchParams.get('equipmentId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (clientId) where.clientId = clientId
    if (equipmentId) where.equipmentId = equipmentId

    const orders = await db.equipmentDeliveryOrder.findMany({
      where,
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rateType: true, rate: true, status: true },
        },
      },
      orderBy: { deliveryDate: 'desc' },
    })

    // Enrich with client info
    const clientIds = [...new Set(orders.map(o => o.clientId))]
    const projectIds = [...new Set(orders.map(o => o.projectId).filter(Boolean))] as string[]

    const clients = await db.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, code: true, name: true, nameAr: true },
    })
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

    const projects = projectIds.length > 0 ? await db.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, code: true, name: true, nameAr: true },
    }) : []
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

    const enriched = orders.map(order => ({
      ...order,
      client: clientMap[order.clientId] || { id: order.clientId, code: '', name: 'غير معروف', nameAr: null },
      project: order.projectId ? (projectMap[order.projectId] || null) : null,
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching delivery orders:', error)
    return NextResponse.json({ error: 'فشل في تحميل أوامر التوصيل' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { equipmentId, clientId, projectId, site, deliveryDate, returnDate, rentalId, notes } = body

    if (!equipmentId || !clientId || !deliveryDate) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Auto-generate order number: DO-YYYY-NNNN
    const year = new Date().getFullYear()
    const likePattern = `DO-${year}-`
    const lastOrder = await db.equipmentDeliveryOrder.findFirst({
      where: { orderNo: { startsWith: likePattern } },
      orderBy: { orderNo: 'desc' },
      select: { orderNo: true },
    })

    let seq = 1
    if (lastOrder) {
      const parts = lastOrder.orderNo.split('-')
      const parsedSeq = parseInt(parts[2])
      if (!isNaN(parsedSeq)) seq = parsedSeq + 1
    }
    const orderNo = `DO-${year}-${String(seq).padStart(4, '0')}`

    const order = await db.equipmentDeliveryOrder.create({
      data: {
        orderNo,
        equipmentId,
        clientId,
        projectId: projectId || null,
        rentalId: rentalId || null,
        site: site || null,
        deliveryDate: new Date(deliveryDate),
        returnDate: returnDate ? new Date(returnDate) : null,
        status: 'PENDING',
        notes: notes || null,
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rateType: true, rate: true, status: true },
        },
      },
    })

    // Update equipment status to IN_USE
    await db.equipment.update({
      where: { id: equipmentId },
      data: { status: 'IN_USE' },
    })

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('Error creating delivery order:', error)
    return NextResponse.json({ error: 'فشل في إنشاء أمر التوصيل' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    const order = await db.equipmentDeliveryOrder.update({
      where: { id },
      data: { status },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, rateType: true, rate: true, status: true },
        },
      },
    })

    // If returned, set equipment back to AVAILABLE
    if (status === 'RETURNED') {
      await db.equipment.update({
        where: { id: order.equipmentId },
        data: { status: 'AVAILABLE' },
      })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Error updating delivery order:', error)
    return NextResponse.json({ error: 'فشل في تحديث أمر التوصيل' }, { status: 500 })
  }
}
