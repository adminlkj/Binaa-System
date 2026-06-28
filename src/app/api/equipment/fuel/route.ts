import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost, type PrismaTransaction } from '@/lib/accounting/engine'

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
    // P3-MED-005: Round to 2 decimals to avoid floating-point precision issues
    const totalCost = Math.round((liters * costPerLiter) * 100) / 100

    // Atomic: fuel log + equipment cost + JE + journalEntryId link in one transaction.
    // R1 enforced — if the JE fails, the fuel log is rolled back too.
    // costCenterId is NOT projectId (distinct entities) — resolved separately or left null.
    const fuelLog = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.equipmentFuelLog.create({
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

      const equipment = await tx.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { name: true },
      })

      // Create EquipmentCost entry for the project if projectId is provided
      if (body.projectId && totalCost > 0) {
        await tx.equipmentCost.create({
          data: {
            projectId: body.projectId,
            description: `وقود ${equipment?.name || 'معدات'} - ${liters} لتر`,
            amount: totalCost,
            date: new Date(body.date),
          },
        })
      }

      // Auto accounting entry for fuel cost. R1 enforced — no try/catch swallowing.
      if (totalCost > 0) {
        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment?.name || 'Unknown',
          costType: 'FUEL',
          amount: totalCost,
          date: new Date(body.date),
          payFrom: 'CASH',
          costCenterId: undefined,
        }, tx)

        await tx.equipmentFuelLog.update({
          where: { id: created.id },
          data: { journalEntryId: entry.id },
        })
      }

      return await tx.equipmentFuelLog.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(fuelLog, { status: 201 })
  } catch (error) {
    console.error('Error creating fuel log:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء سجل الوقود'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
