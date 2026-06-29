import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/measurements?projectId=xxx&status=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const claimItemId = searchParams.get('claimItemId')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (claimItemId) where.claimItemId = claimItemId

    const measurements = await db.measurement.findMany({
      where,
      include: {
        boqItem: { select: { id: true, description: true, unit: true } },
        claimItem: { select: { id: true, description: true } },
        wbsElement: { select: { id: true, code: true, name: true } },
      },
      orderBy: { measurementDate: 'desc' },
    })

    const normalized = measurements.map(m => ({
      ...m,
      contractQuantity: Number(m.contractQuantity),
      previousQuantity: Number(m.previousQuantity),
      currentQuantity: Number(m.currentQuantity),
      cumulativeQuantity: Number(m.cumulativeQuantity),
      rejectedQuantity: Number(m.rejectedQuantity),
      unitRate: Number(m.unitRate),
      previousAmount: Number(m.previousAmount),
      currentAmount: Number(m.currentAmount),
      cumulativeAmount: Number(m.cumulativeAmount),
      certifiedQuantity: Number(m.certifiedQuantity),
      certifiedAmount: Number(m.certifiedAmount),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Measurements GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch measurements' },
      { status: 500 }
    )
  }
}

// POST /api/measurements
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, wbsElementId, boqItemId, claimItemId, description, measurementDate, measuredBy, contractQuantity, previousQuantity, currentQuantity, cumulativeQuantity, unit, unitRate, notes } = body

    if (!projectId || !description || !measurementDate) {
      return NextResponse.json({ error: 'projectId, description, measurementDate are required' }, { status: 400 })
    }

    const year = new Date(measurementDate).getFullYear()
    const count = await db.measurement.count()
    const code = `MS-${year}-${String(count + 1).padStart(4, '0')}`

    const prevQty = Number(previousQuantity || 0)
    const currQty = Number(currentQuantity || 0)
    const cumQty = Number(cumulativeQuantity || prevQty + currQty)
    const currAmt = currQty * Number(unitRate || 0)
    const cumAmt = cumQty * Number(unitRate || 0)

    const measurement = await db.measurement.create({
      data: {
        code,
        projectId,
        wbsElementId,
        boqItemId,
        claimItemId,
        description,
        measurementDate: new Date(measurementDate),
        measuredBy,
        contractQuantity: Number(contractQuantity || 0),
        previousQuantity: prevQty,
        currentQuantity: currQty,
        cumulativeQuantity: cumQty,
        unit,
        unitRate: Number(unitRate || 0),
        previousAmount: prevQty * Number(unitRate || 0),
        currentAmount: currAmt,
        cumulativeAmount: cumAmt,
        status: 'DRAFT',
        notes,
      },
    })

    return NextResponse.json({
      data: { ...measurement, unitRate: Number(measurement.unitRate), currentAmount: Number(measurement.currentAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Measurements POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create measurement' },
      { status: 500 }
    )
  }
}
