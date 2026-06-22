import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/activities?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const activities = await db.activity.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      include: {
        wbsElement: { select: { code: true, name: true } },
        _count: { select: { costEntries: true } },
      },
    })

    const normalized = activities.map(a => ({
      ...a,
      plannedQuantity: Number(a.plannedQuantity),
      actualQuantity: Number(a.actualQuantity),
      progress: Number(a.progress),
      weight: Number(a.weight),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Activities GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activities', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
