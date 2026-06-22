import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-retentions?subcontractorId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: any = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId

    const retentions = await db.subcontractorRetention.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    })

    const normalized = retentions.map(r => ({
      ...r,
      withheldAmount: Number(r.withheldAmount),
      releasedAmount: Number(r.releasedAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Subcontractor retentions GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor retentions', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-retentions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, projectId, subcontractorInvoiceId, withheldAmount, date, notes } = body

    if (!subcontractorId || !projectId || !withheldAmount || !date) {
      return NextResponse.json({ error: 'subcontractorId, projectId, withheldAmount, date are required' }, { status: 400 })
    }

    const year = new Date(date).getFullYear()
    const count = await db.subcontractorRetention.count()
    const retentionNo = `SRT-${year}-${String(count + 1).padStart(4, '0')}`

    const retention = await db.subcontractorRetention.create({
      data: {
        retentionNo,
        subcontractorId,
        projectId,
        subcontractorInvoiceId,
        date: new Date(date),
        withheldAmount: Number(withheldAmount),
        releasedAmount: 0,
        status: 'WITHHELD',
        notes,
      },
    })

    return NextResponse.json({
      data: { ...retention, withheldAmount: Number(retention.withheldAmount), releasedAmount: Number(retention.releasedAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor retentions POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor retention', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
