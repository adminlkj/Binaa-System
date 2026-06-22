import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/wbs?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const elements = await db.wBSElement.findMany({
      where: { projectId, isActive: true },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
      include: {
        _count: { select: { costEntries: true, children: true } },
      },
    })

    // Build tree
    const map = new Map<string, any>()
    const roots: any[] = []
    elements.forEach(e => {
      map.set(e.id, { ...e, children: [] })
    })
    elements.forEach(e => {
      const node = map.get(e.id)
      if (e.parentId && map.has(e.parentId)) {
        map.get(e.parentId).children.push(node)
      } else {
        roots.push(node)
      }
    })

    return NextResponse.json({ data: roots, total: elements.length })
  } catch (error: unknown) {
    console.error('WBS GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch WBS', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/wbs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, code, name, parentId, elementType, weight, startDate, endDate } = body

    if (!projectId || !code || !name) {
      return NextResponse.json({ error: 'projectId, code, name are required' }, { status: 400 })
    }

    // Calculate level
    let level = 1
    if (parentId) {
      const parent = await db.wBSElement.findUnique({ where: { id: parentId } })
      if (parent) level = parent.level + 1
    }

    const wbs = await db.wBSElement.create({
      data: {
        projectId,
        code,
        name,
        parentId,
        elementType: elementType || 'WORK_PACKAGE',
        weight: weight ? Number(weight) : 0,
        level,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    })

    return NextResponse.json({ data: wbs }, { status: 201 })
  } catch (error: unknown) {
    console.error('WBS POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create WBS element', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
