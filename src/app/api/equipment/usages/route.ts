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

    const usages = await db.equipmentUsage.findMany({
      where: {
        ...(equipmentId ? { equipmentId } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(usages)
  } catch (error) {
    console.error('Error fetching equipment usages:', error)
    return NextResponse.json({ error: 'فشل في تحميل استخدامات المعدات' }, { status: 500 })
  }
}

// POST: Create usage + EquipmentCost + JE atomically.
// P3-CRIT-005: Previously created NO journal entry — GL was blind to usage costs.
export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const hours = parseFloat(body.hours) || 0
    const cost = parseFloat(body.cost) || 0

    if (!body.equipmentId || !body.projectId) {
      return NextResponse.json({ error: 'المعدة والمشروع مطلوبان' }, { status: 400 })
    }

    const usage = await db.$transaction(async (tx: PrismaTransaction) => {
      const equipment = await tx.equipment.findUnique({
        where: { id: body.equipmentId },
        select: { id: true, name: true, code: true, hourlyRate: true },
      })

      if (!equipment) {
        throw new Error('المعدة غير موجودة')
      }

      const created = await tx.equipmentUsage.create({
        data: {
          equipmentId: body.equipmentId,
          projectId: body.projectId,
          date: new Date(body.date),
          hours,
          description: body.description || null,
          cost,
        },
        include: {
          equipment: { select: { id: true, code: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      })

      // Resolve cost center from project code → costCenter.code
      let costCenterId: string | undefined
      const project = await tx.project.findUnique({
        where: { id: body.projectId },
        select: { code: true },
      })
      if (project) {
        const cc = await tx.costCenter.findFirst({ where: { code: project.code } })
        if (cc) costCenterId = cc.id
      }

      // Create EquipmentCost entry with JE linkage (P3-HIGH-005)
      if (cost > 0) {
        const eqCost = await tx.equipmentCost.create({
          data: {
            projectId: body.projectId,
            description: `استخدام ${equipment.name} - ${hours} ساعة`,
            amount: cost,
            date: new Date(body.date),
            costType: 'OPERATION',
            equipmentId: body.equipmentId,
          },
        })

        // P3-CRIT-005: Post JE for the usage cost
        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment.name,
          costType: 'OPERATION',
          amount: cost,
          date: new Date(body.date),
          payFrom: 'CASH',
          costCenterId,
        }, tx)

        await tx.equipmentCost.update({
          where: { id: eqCost.id },
          data: { journalEntryId: entry.id },
        })
      }

      return created
    })

    return NextResponse.json(usage, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment usage:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء سجل الاستخدام'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
