import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/cost-codes?category=xxx&isActive=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const isActive = searchParams.get('isActive')

    const where: any = {}
    if (category) where.category = category
    if (isActive !== null) where.isActive = isActive === 'true'

    const costCodes = await db.costCode.findMany({
      where,
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
      include: { _count: { select: { costEntries: true, costCodeBudgets: true } } },
    })

    return NextResponse.json({ data: costCodes, total: costCodes.length })
  } catch (error: unknown) {
    console.error('Cost codes GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cost codes' },
      { status: 500 }
    )
  }
}

// POST /api/cost-codes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, name, category, parentId, unit } = body

    if (!code || !name || !category) {
      return NextResponse.json({ error: 'code, name, category are required' }, { status: 400 })
    }

    let level = 1
    if (parentId) {
      const parent = await db.costCode.findUnique({ where: { id: parentId } })
      if (parent) level = parent.level + 1
    }

    const costCode = await db.costCode.create({
      data: {
        code,
        name,
        category,
        parentId,
        level,
        unit: unit || null,
      },
    })

    return NextResponse.json({ data: costCode }, { status: 201 })
  } catch (error: unknown) {
    console.error('Cost codes POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create cost code' },
      { status: 500 }
    )
  }
}
