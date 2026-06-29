import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { autoEntryManualCost, type PrismaTransaction } from '@/lib/accounting/engine'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/cost-entries?projectId=xxx&costType=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const costType = searchParams.get('costType')
    const sourceType = searchParams.get('sourceType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)
    const offset = Number(searchParams.get('offset') || 0)

    const where: Prisma.CostEntryWhereInput = {}
    if (projectId) where.projectId = projectId
    if (costType) where.costType = costType
    if (sourceType) where.sourceType = sourceType
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(dateTo)
    }

    const [entries, total] = await Promise.all([
      db.costEntry.findMany({
        where,
        include: {
          wbsElement: { select: { code: true, name: true } },
          costCode: { select: { code: true, name: true } },
          activity: { select: { code: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.costEntry.count({ where }),
    ])

    // Normalize Decimal values
    const normalized = entries.map(e => ({
      ...e,
      quantity: Number(e.quantity),
      unitCost: Number(e.unitCost),
      amount: Number(e.amount),
    }))

    return NextResponse.json({ data: normalized, total, page: Math.floor(offset / limit) + 1, pageSize: limit })
  } catch (error: unknown) {
    console.error('Cost entries GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cost entries' },
      { status: 500 }
    )
  }
}

// POST /api/cost-entries (manual cost entry)
// Creates cost entry + journal entry + updates budget atomically (P2-CRIT-007 fix).
// R1 enforced — if the JE fails, the cost entry is rolled back too.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, wbsElementId, costCodeId, activityId, costType, sourceType, description, quantity, unitCost, amount, date, costCenterId, payFrom } = body

    if (!projectId || !costType || !description || !amount || !date) {
      return NextResponse.json({ error: 'projectId, costType, description, amount, date are required' }, { status: 400 })
    }

    // Validate project exists + fetch costCenterId (P2-HIGH-009 fix)
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true, costCenterId: true },
    })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    const periodYear = new Date(date).getFullYear()
    const periodMonth = new Date(date).getMonth() + 1

    // Use Decimal for financial precision (P2-CRIT-008 fix)
    const amt = new Prisma.Decimal(body.amount)
    const effectiveCostCenterId = costCenterId || project.costCenterId || undefined

    // Atomic: cost entry + JE + budget update in one transaction (P2-CRIT-007 fix)
    const entry = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.costEntry.create({
        data: {
          projectId,
          wbsElementId,
          costCodeId,
          activityId,
          costType,
          sourceType: sourceType || 'MANUAL',
          sourceDocument: description,
          description,
          quantity: Number(quantity || 0),
          unitCost: Number(unitCost || 0),
          amount: amt,
          date: new Date(date),
          periodYear,
          periodMonth,
          isCommitted: false,
          costCenterId: effectiveCostCenterId,
        },
        include: {
          wbsElement: { select: { code: true, name: true } },
          costCode: { select: { code: true, name: true } },
          activity: { select: { code: true, name: true } },
        },
      })

      // R1: every financial operation MUST create a posted JE.
      // Manual cost entries were previously invisible to the GL (P2-CRIT-007).
      const je = await autoEntryManualCost({
        description,
        amount: Number(created.amount),
        date: created.date,
        costType,
        payFrom: payFrom || 'CASH',
        costCenterId: effectiveCostCenterId,
      }, tx)

      // Store journalEntryId on the cost entry
      await tx.costEntry.update({
        where: { id: created.id },
        data: { journalEntryId: je.id },
      })

      // Update CostCodeBudget actualAmount if applicable (P2-CRIT-007: remove silent .catch)
      if (wbsElementId && costCodeId) {
        await tx.costCodeBudget.updateMany({
          where: { wbsElementId, costCodeId },
          data: { actualAmount: { increment: amt } },
        })
        // Note: updateMany returns 0 if no budget row exists — that's fine,
        // not an error. We do NOT swallow other errors silently anymore.
      }

      return tx.costEntry.findUnique({
        where: { id: created.id },
        include: {
          wbsElement: { select: { code: true, name: true } },
          costCode: { select: { code: true, name: true } },
          activity: { select: { code: true, name: true } },
        },
      })
    })

    return NextResponse.json({
      data: { ...entry, quantity: Number(entry!.quantity), unitCost: Number(entry!.unitCost), amount: Number(entry!.amount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Cost entries POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create cost entry' },
      { status: 500 }
    )
  }
}
