import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (equipmentId) where.equipmentId = equipmentId
    if (projectId) where.projectId = projectId

    const fuelLogs = await db.equipmentFuelLog.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
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
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Create EquipmentCost entry for the project if projectId is provided
    if (body.projectId && totalCost > 0) {
      const equipment = await db.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { name: true },
      })

      await db.equipmentCost.create({
        data: {
          projectId: body.projectId,
          description: `وقود ${equipment?.name || 'معدات'} - ${liters} لتر`,
          amount: totalCost,
          date: new Date(body.date),
        },
      })
    }

    // Auto accounting entry for fuel cost with costCenterId
    if (totalCost > 0) {
      try {
        const equipment = await db.equipment.findUnique({
          where: { id: body.equipmentId },
          select: { name: true },
        })

        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment?.name || 'Unknown',
          costType: 'FUEL',
          amount: totalCost,
          date: new Date(body.date),
          payFrom: 'CASH',
          costCenterId: body.projectId || undefined, // Add costCenterId
        })

        // Link journal entry to fuel log
        await db.equipmentFuelLog.update({
          where: { id: fuelLog.id },
          data: { journalEntryId: entry.id },
        })
      } catch (entryError) {
        console.error('Error creating fuel accounting entry:', entryError)
        // Don't block fuel log creation
      }
    }

    // Refetch to include journalEntryId
    const updatedFuelLog = await db.equipmentFuelLog.findUnique({
      where: { id: fuelLog.id },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json(updatedFuelLog, { status: 201 })
  } catch (error) {
    console.error('Error creating fuel log:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الوقود' }, { status: 500 })
  }
}
