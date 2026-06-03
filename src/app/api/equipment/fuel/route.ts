import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')

    const fuelLogs = await db.equipmentFuelLog.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(fuelLogs)
  } catch (error) {
    console.error('Error fetching fuel logs:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الوقود' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const liters = parseFloat(body.liters)
    const costPerLiter = parseFloat(body.costPerLiter)
    const totalCost = liters * costPerLiter

    const fuelLog = await db.equipmentFuelLog.create({
      data: {
        equipmentId: body.equipmentId,
        date: new Date(body.date),
        liters,
        costPerLiter,
        totalCost,
        projectId: body.projectId || null,
      },
      include: {
        equipment: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(fuelLog, { status: 201 })
  } catch (error) {
    console.error('Error creating fuel log:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الوقود' }, { status: 500 })
  }
}
