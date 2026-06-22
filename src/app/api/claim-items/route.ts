import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/claim-items?claimId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const claimId = searchParams.get('claimId')

    const where: any = {}
    if (claimId) where.claimId = claimId

    const items = await db.claimItem.findMany({
      where,
      include: {
        boqItem: { select: { id: true, description: true, unit: true, unitPrice: true } },
        wbsElement: { select: { id: true, code: true, name: true } },
        measurement: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const normalized = items.map(i => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      totalAmount: Number(i.totalAmount),
      previousQuantity: Number(i.previousQuantity),
      currentQuantity: Number(i.currentQuantity),
      cumulativeQuantity: Number(i.cumulativeQuantity),
      retentionAmount: Number(i.retentionAmount || 0),
      advanceDeduction: Number(i.advanceDeduction || 0),
      penaltyAmount: Number(i.penaltyAmount || 0),
      otherDeductions: Number(i.otherDeductions || 0),
      netAmount: Number(i.netAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Claim items GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch claim items', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/claim-items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { claimId, boqItemId, wbsElementId, description, unit, previousQuantity, currentQuantity, cumulativeQuantity, unitPrice, retentionPercent, advanceDeduction, penaltyAmount, otherDeductions } = body

    if (!claimId || !description) {
      return NextResponse.json({ error: 'claimId, description are required' }, { status: 400 })
    }

    const totalAmount = Number(unitPrice || 0) * Number(currentQuantity || 0)
    const retentionAmount = totalAmount * Number(retentionPercent || 0) / 100
    const netAmount = totalAmount - retentionAmount - Number(advanceDeduction || 0) - Number(penaltyAmount || 0) - Number(otherDeductions || 0)

    const item = await db.claimItem.create({
      data: {
        claimId,
        boqItemId,
        wbsElementId,
        description,
        unit,
        previousQuantity: Number(previousQuantity || 0),
        currentQuantity: Number(currentQuantity || 0),
        cumulativeQuantity: Number(cumulativeQuantity || 0),
        unitPrice: Number(unitPrice || 0),
        totalAmount,
        retentionPercent: Number(retentionPercent || 0),
        retentionAmount,
        advanceDeduction: Number(advanceDeduction || 0),
        penaltyAmount: Number(penaltyAmount || 0),
        otherDeductions: Number(otherDeductions || 0),
        netAmount,
      },
    })

    return NextResponse.json({
      data: { ...item, unitPrice: Number(item.unitPrice), totalAmount: Number(item.totalAmount), netAmount: Number(item.netAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Claim items POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create claim item', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
