import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost, type PrismaTransaction } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const supplierId = searchParams.get('supplierId')

    const where: Record<string, unknown> = {}
    if (equipmentId) where.equipmentId = equipmentId
    if (supplierId) where.supplierId = supplierId

    const maintenance = await db.equipmentMaintenance.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        supplier: { select: { id: true, code: true, name: true, nameAr: true } },
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
    const cost = parseFloat(body.cost)

    // Atomic: maintenance record + equipment status + project cost + JE in one transaction.
    // R1 enforced — if the JE fails, the maintenance record is rolled back too.
    // NOTE: costCenterId must be a real CostCenter.id, NOT a projectId. The prior code
    // passed activeAllocation.projectId as costCenterId — wrong entity. We now resolve the
    // project's cost center by matching project.code → costCenter.code, or leave null.
    const maintenance = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.equipmentMaintenance.create({
        data: {
          equipmentId: body.equipmentId,
          date: new Date(body.date),
          description: body.description,
          cost,
          supplierId: body.supplierId || null,
          nextDate: body.nextDate ? new Date(body.nextDate) : null,
          status: 'IN_PROGRESS', // P3-HIGH-007: track maintenance lifecycle
        },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          supplier: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      // Update equipment status to MAINTENANCE
      await tx.equipment.update({
        where: { id: body.equipmentId },
        data: { status: 'MAINTENANCE' },
      })

      const equipment = await tx.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { name: true },
      })

      let costCenterId: string | undefined
      if (cost > 0) {
        const activeAllocation = await tx.resourceAllocation.findFirst({
          where: {
            resourceType: 'EQUIPMENT',
            resourceId: body.equipmentId,
            startDate: { lte: new Date() },
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
          select: { projectId: true },
        })

        if (activeAllocation) {
          // Resolve the project's cost center by code match (real CostCenter.id, not projectId)
          const project = await tx.project.findUnique({
            where: { id: activeAllocation.projectId },
            select: { code: true },
          })
          if (project) {
            const cc = await tx.costCenter.findFirst({ where: { code: project.code } })
            if (cc) costCenterId = cc.id
          }

          await tx.equipmentCost.create({
            data: {
              projectId: activeAllocation.projectId,
              description: `صيانة ${equipment?.name || 'معدات'} - ${body.description}`,
              amount: cost,
              date: new Date(body.date),
            },
          })
        }
      }

      // Auto accounting entry. R1 enforced — no try/catch swallowing.
      if (cost > 0) {
        const payFrom = body.supplierId ? 'AP' : 'CASH'
        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment?.name || 'Unknown',
          costType: 'MAINTENANCE',
          amount: cost,
          date: new Date(body.date),
          payFrom: payFrom as 'CASH' | 'AP',
          costCenterId,
        }, tx)

        await tx.equipmentMaintenance.update({
          where: { id: created.id },
          data: { journalEntryId: entry.id },
        })
      }

      return await tx.equipmentMaintenance.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          supplier: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(maintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment maintenance:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء سجل الصيانة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
