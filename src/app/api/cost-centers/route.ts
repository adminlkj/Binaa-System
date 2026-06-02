import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const costCenters = await db.costCenter.findMany({
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(costCenters)
  } catch (error) {
    console.error('Error fetching cost centers:', error)
    return NextResponse.json({ error: 'فشل في تحميل مراكز التكلفة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastCC = await db.costCenter.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastCC?.code) {
      const match = lastCC.code.match(/CC-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const code = body.code || `CC-${String(nextNum).padStart(3, '0')}`

    const costCenter = await db.costCenter.create({
      data: {
        code,
        name: body.name,
        parentId: body.parentId || null,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(costCenter, { status: 201 })
  } catch (error) {
    console.error('Error creating cost center:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مركز التكلفة' }, { status: 500 })
  }
}
