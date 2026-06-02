import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')

    const maintenance = await db.equipmentMaintenance.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(maintenance)
  } catch (error) {
    console.error('Error fetching equipment maintenance:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الصيانة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const maintenance = await db.equipmentMaintenance.create({
      data: {
        equipmentId: body.equipmentId,
        date: new Date(body.date),
        description: body.description,
        cost: parseFloat(body.cost),
        nextDate: body.nextDate ? new Date(body.nextDate) : null,
      },
      include: {
        equipment: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(maintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment maintenance:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الصيانة' }, { status: 500 })
  }
}
