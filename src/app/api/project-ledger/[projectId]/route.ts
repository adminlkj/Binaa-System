import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/project-ledger/[projectId]?ledgerType=COST&dateFrom=xxx&dateTo=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { searchParams } = new URL(request.url)
    const ledgerType = searchParams.get('ledgerType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)
    const offset = Number(searchParams.get('offset') || 0)

    const where: any = { projectId }
    if (ledgerType) where.ledgerType = ledgerType
    if (dateFrom || dateTo) {
      where.entryDate = {}
      if (dateFrom) where.entryDate.gte = new Date(dateFrom)
      if (dateTo) where.entryDate.lte = new Date(dateTo)
    }

    const [entries, total] = await Promise.all([
      db.projectLedger.findMany({
        where,
        include: {
          wbsElement: { select: { code: true, name: true } },
          costCode: { select: { code: true, name: true } },
        },
        orderBy: { entryDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.projectLedger.count({ where }),
    ])

    // Aggregate balances by ledgerType
    const balances = await db.projectLedger.groupBy({
      by: ['ledgerType'],
      where: { projectId },
      _sum: { debit: true, credit: true },
    })

    const normalized = entries.map(e => ({
      ...e,
      debit: Number(e.debit),
      credit: Number(e.credit),
      runningBalance: Number(e.runningBalance),
    }))

    const balancesNormalized = balances.map(b => ({
      ledgerType: b.ledgerType,
      debit: Number(b._sum.debit || 0),
      credit: Number(b._sum.credit || 0),
      balance: Number(b._sum.debit || 0) - Number(b._sum.credit || 0),
    }))

    return NextResponse.json({
      data: normalized,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      balances: balancesNormalized,
    })
  } catch (error: unknown) {
    console.error('Project ledger GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project ledger' },
      { status: 500 }
    )
  }
}
