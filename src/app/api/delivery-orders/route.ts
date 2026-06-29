import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const equipmentId = searchParams.get('equipmentId')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (clientId) where.clientId = clientId
    if (equipmentId) where.equipmentId = equipmentId

    const include = {
      equipment: {
        select: { id: true, code: true, name: true, nameAr: true },
      },
      rental: {
        select: { id: true, pricingType: true, status: true, hourlyRate: true },
      },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const orders = await db.equipmentDeliveryOrder.findMany({
        where: whereClause,
        include,
        orderBy: { deliveryDate: 'desc' },
      })

      // Enrich with client info
      const clientIds = [...new Set(orders.filter(o => o.clientId).map(o => o.clientId as string))]
      const projectIds = [...new Set(orders.map(o => o.projectId).filter(Boolean))] as string[]

      const clients = clientIds.length > 0 ? await db.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, code: true, name: true, nameAr: true },
      }) : []
      const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

      const projects = projectIds.length > 0 ? await db.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, code: true, name: true, nameAr: true },
      }) : []
      const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

      const enriched = orders.map(order => ({
        ...order,
        client: order.clientId ? (clientMap[order.clientId] || { id: order.clientId, code: '', name: 'غير معروف', nameAr: null }) : null,
        project: order.projectId ? (projectMap[order.projectId] || null) : null,
      }))

      return NextResponse.json(enriched)
    }

    // Paginated response
    const [data, total] = await Promise.all([
      db.equipmentDeliveryOrder.findMany({
        where: whereClause,
        include,
        orderBy: { deliveryDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.equipmentDeliveryOrder.count({ where: whereClause }),
    ])

    // Enrich with client info
    const clientIds = [...new Set(data.filter(o => o.clientId).map(o => o.clientId as string))]
    const projectIds = [...new Set(data.map(o => o.projectId).filter(Boolean))] as string[]

    const clients = clientIds.length > 0 ? await db.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, code: true, name: true, nameAr: true },
    }) : []
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

    const projects = projectIds.length > 0 ? await db.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, code: true, name: true, nameAr: true },
    }) : []
    const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))

    const enriched = data.map(order => ({
      ...order,
      client: order.clientId ? (clientMap[order.clientId] || { id: order.clientId, code: '', name: 'غير معروف', nameAr: null }) : null,
      project: order.projectId ? (projectMap[order.projectId] || null) : null,
    }))

    return NextResponse.json({ data: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch delivery orders:', error)
    return NextResponse.json({ error: 'Failed to fetch delivery orders' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { equipmentId, clientId, projectId, site, deliveryDate, returnDate, rentalId, notes } = body

    if (!equipmentId || !deliveryDate) {
      return NextResponse.json({ error: 'المعدة وتاريخ التوصيل مطلوبان' }, { status: 400 })
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
        clientId: clientId || null,
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
          select: { id: true, pricingType: true, status: true, hourlyRate: true },
        },
      },
    })

    // NOTE: Equipment status is NOT changed to IN_USE here.
    // Equipment status changes to IN_USE only when the order status becomes DELIVERED.
    // This allows PENDING orders to be cancelled without affecting equipment status.

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create delivery order:', error)
    return NextResponse.json({ error: 'Failed to create delivery order' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    const existing = await db.equipmentDeliveryOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'أمر التوصيل غير موجود' }, { status: 404 })
    }

    // Update delivery order and equipment status in transaction
    const order = await db.$transaction(async (tx: PrismaTransaction) => {
      const updated = await tx.equipmentDeliveryOrder.update({
        where: { id },
        data: { status },
        include: {
          equipment: {
            select: { id: true, code: true, name: true, nameAr: true },
          },
          rental: {
            select: { id: true, pricingType: true, status: true, hourlyRate: true },
          },
        },
      })

      // Handle equipment status changes based on delivery order status.
      //
      // P3-BUG (discovered via practical E2E test): The previous logic blindly set
      // equipment.status='IN_USE' when a delivery order became DELIVERED. This
      // clobbered the RENTED state set by an active EquipmentRental contract —
      // breaking the rental cycle's equipment-status invariant.
      //
      // Fix: when transitioning to DELIVERED, only flip equipment to IN_USE if it
      // is currently AVAILABLE. If it's already RENTED (active rental) or any other
      // non-AVAILABLE state, leave it alone — the rental contract owns the status.
      if (status === 'DELIVERED') {
        const currentEq = await tx.equipment.findUnique({
          where: { id: updated.equipmentId },
          select: { status: true },
        })
        if (currentEq?.status === 'AVAILABLE') {
          await tx.equipment.update({
            where: { id: updated.equipmentId },
            data: { status: 'IN_USE' },
          })
        }
      } else if (status === 'RETURNED') {
        // Only return to AVAILABLE if not currently RENTED.
        const currentEq = await tx.equipment.findUnique({
          where: { id: updated.equipmentId },
          select: { status: true },
        })
        if (currentEq?.status !== 'RENTED') {
          await tx.equipment.update({
            where: { id: updated.equipmentId },
            data: { status: 'AVAILABLE' },
          })
        }
      } else if (status === 'CANCELLED') {
        if (existing.status === 'DELIVERED') {
          // Was IN_USE, revert to AVAILABLE — but only if not RENTED.
          const currentEq = await tx.equipment.findUnique({
            where: { id: updated.equipmentId },
            select: { status: true },
          })
          if (currentEq?.status !== 'RENTED') {
            await tx.equipment.update({
              where: { id: updated.equipmentId },
              data: { status: 'AVAILABLE' },
            })
          }
        }
        // PENDING → CANCELLED: equipment was never changed, no revert needed
      }

      return updated
    })

    return NextResponse.json(order)
  } catch (error) {
    console.error('[API] Failed to update delivery order:', error)
    return NextResponse.json({ error: 'Failed to update delivery order' }, { status: 500 })
  }
}
