import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const projectId = searchParams.get('projectId')
    const operatorId = searchParams.get('operatorId')

    const where: Record<string, unknown> = {}
    if (equipmentId) where.equipmentId = equipmentId
    if (projectId) where.projectId = projectId
    if (operatorId) where.operatorId = operatorId

    const operations = await db.equipmentOperation.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        operator: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(operations)
  } catch (error) {
    console.error('Error fetching equipment operations:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات تشغيل المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const operation = await db.equipmentOperation.create({
      data: {
        equipmentId: body.equipmentId,
        operatorId: body.operatorId || null,
        projectId: body.projectId || null,
        date: new Date(body.date),
        hours: body.hours ? parseFloat(body.hours) : 0,
        notes: body.notes || null,
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        operator: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Update equipment status to IN_USE if it was AVAILABLE
    const equipment = await db.equipment.findUnique({
      where: { id: body.equipmentId },
      select: { status: true, name: true, hourlyRate: true },
    })

    if (equipment && equipment.status === 'AVAILABLE') {
      await db.equipment.update({
        where: { id: body.equipmentId },
        data: { status: 'IN_USE' },
      })
    }

    // Create accounting entry for equipment operation cost
    if (equipment && equipment.hourlyRate > 0) {
      const costAmount = parseFloat(body.hours || '0') * equipment.hourlyRate
      if (costAmount > 0) {
        try {
          await autoEntryEquipmentCost({
            equipmentName: equipment.name,
            costType: 'OPERATION',
            amount: costAmount,
            date: new Date(body.date),
            payFrom: 'CASH',
          })
        } catch (entryError) {
          console.error('Error creating equipment operation accounting entry:', entryError)
          // Don't block operation creation
        }
      }
    }

    return NextResponse.json(operation, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment operation:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل تشغيل المعدات' }, { status: 500 })
  }
}
