import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    const where: any = {}
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
      { error: 'Failed to fetch cost entries', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/cost-entries (manual cost entry)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, wbsElementId, costCodeId, activityId, costType, sourceType, description, quantity, unitCost, amount, date, costCenterId } = body

    if (!projectId || !costType || !description || !amount || !date) {
      return NextResponse.json({ error: 'projectId, costType, description, amount, date are required' }, { status: 400 })
    }

    const periodYear = new Date(date).getFullYear()
    const periodMonth = new Date(date).getMonth() + 1

    const entry = await db.costEntry.create({
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
        amount: Number(amount),
        date: new Date(date),
        periodYear,
        periodMonth,
        isCommitted: false,
        costCenterId,
      },
    })

    // Update CostCodeBudget actualAmount if applicable
    if (wbsElementId && costCodeId) {
      await db.costCodeBudget.updateMany({
        where: { wbsElementId, costCodeId },
        data: { actualAmount: { increment: Number(amount) } },
      }).catch(() => { /* budget may not exist */ })
    }

    return NextResponse.json({ data: entry }, { status: 201 })
  } catch (error: unknown) {
    console.error('Cost entries POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create cost entry', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
