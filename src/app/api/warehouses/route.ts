import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const warehouses = await db.warehouse.findMany({
      include: {
        branch: { select: { id: true, code: true, name: true } },
        _count: { select: { inventoryItems: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(warehouses)
  } catch (error) {
    console.error('Error fetching warehouses:', error)
    return NextResponse.json({ error: 'فشل في تحميل المستودعات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastWH = await db.warehouse.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastWH?.code) {
      const match = lastWH.code.match(/WH-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const code = `WH-${String(nextNum).padStart(3, '0')}`

    const warehouse = await db.warehouse.create({
      data: {
        code,
        name: body.name,
        branchId: body.branchId,
        isActive: true,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(warehouse, { status: 201 })
  } catch (error) {
    console.error('Error creating warehouse:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المستودع' }, { status: 500 })
  }
}
