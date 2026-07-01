import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost, type PrismaTransaction } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const hours = parseFloat(body.hours || '0')

    // Atomic: operation record + equipment status + project cost + JE in one transaction.
    // R1 enforced — if the JE fails, the operation record is rolled back too.
    // costCenterId is NOT projectId — resolved via project.code → costCenter.code, or null.
    const operation = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.equipmentOperation.create({
        data: {
          equipmentId: body.equipmentId,
          operatorId: body.operatorId || null,
          projectId: body.projectId || null,
          date: new Date(body.date),
          hours,
          notes: body.notes || null,
        },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true, hourlyRate: true } },
          operator: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      const equipment = await tx.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { status: true, name: true, hourlyRate: true },
      })

      if (equipment && equipment.status === 'AVAILABLE') {
        await tx.equipment.update({
          where: { id: body.equipmentId },
          data: { status: 'IN_USE' },
        })
      }

      // Resolve cost center from project (real CostCenter.id, not projectId)
      let costCenterId: string | undefined
      if (body.projectId) {
        const project = await tx.project.findUnique({
          where: { id: body.projectId },
          select: { code: true },
        })
        if (project) {
          const cc = await tx.costCenter.findFirst({ where: { code: project.code } })
          if (cc) costCenterId = cc.id
        }
      }

      // Create EquipmentCost entry for project when projectId is provided
      if (body.projectId && equipment?.hourlyRate) {
        const costAmount = hours * Number(equipment.hourlyRate)
        if (costAmount > 0) {
          await tx.equipmentCost.create({
            data: {
              projectId: body.projectId,
              description: `تشغيل ${equipment.name} - ${hours} ساعة`,
              amount: costAmount,
              date: new Date(body.date),
            },
          })
        }
      }

      // Auto accounting entry. R1 enforced — no try/catch swallowing.
      if (equipment && Number(equipment.hourlyRate) > 0) {
        const costAmount = hours * Number(equipment.hourlyRate)
        if (costAmount > 0) {
          await autoEntryEquipmentCost({
            equipmentName: equipment.name,
            costType: 'OPERATION',
            amount: costAmount,
            date: new Date(body.date),
            payFrom: 'CASH',
            costCenterId,
          }, tx)
        }
      }

      return created
    })

    return NextResponse.json(operation, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment operation:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء سجل تشغيل المعدات'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
