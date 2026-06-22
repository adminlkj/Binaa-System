import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-advances?subcontractorId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: any = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId

    const advances = await db.subcontractorAdvance.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    })

    const normalized = advances.map(a => ({
      ...a,
      amount: Number(a.amount),
      recoveredAmount: Number(a.recoveredAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Subcontractor advances GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor advances', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-advances
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, projectId, contractId, amount, deductionPercent, recoveryMethod, date, notes } = body

    if (!subcontractorId || !projectId || !amount || !date) {
      return NextResponse.json({ error: 'subcontractorId, projectId, amount, date are required' }, { status: 400 })
    }

    const year = new Date(date).getFullYear()
    const count = await db.subcontractorAdvance.count()
    const advanceNo = `SCA-${year}-${String(count + 1).padStart(4, '0')}`

    const advance = await db.subcontractorAdvance.create({
      data: {
        advanceNo,
        subcontractorId,
        projectId,
        contractId,
        date: new Date(date),
        amount: Number(amount),
        deductionPercent: Number(deductionPercent || 0),
        recoveryMethod: recoveryMethod || 'PER_CERTIFICATE',
        status: 'PENDING',
        recoveredAmount: 0,
        notes,
      },
    })

    return NextResponse.json({
      data: { ...advance, amount: Number(advance.amount), recoveredAmount: Number(advance.recoveredAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor advances POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor advance', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
