import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculatePOC } from '@/lib/accounting/ifrs15'

export const dynamic = 'force-dynamic'

// GET /api/project-controls/[projectId]/evm?asOfDate=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { searchParams } = new URL(request.url)
    const asOfDateParam = searchParams.get('asOfDate')
    const asOfDate = asOfDateParam ? new Date(asOfDateParam) : new Date()

    const poc = await calculatePOC(projectId, asOfDate)

    // Try to get CostCodeBudget BAC
    let bac = 0
    try {
      const budgetTotals = await db.costCodeBudget.aggregate({
        where: { projectId },
        _sum: { budgetAmount: true },
      })
      bac = Number(budgetTotals._sum.budgetAmount || 0)
    } catch { /* CostCodeBudget may be empty */ }

    // AC = actual costs to date
    const ac = poc.totalActualCost

    // EV = revenue to date (POC-based)
    const ev = poc.revenueToDate

    // PV = planned value (time-proportional)
    const project = await db.project.findUnique({ where: { id: projectId } })
    let pv = 0
    if (project?.startDate) {
      const start = new Date(project.startDate)
      const totalDuration = project.endDate
        ? (new Date(project.endDate).getTime() - start.getTime())
        : (365 * 24 * 60 * 60 * 1000)
      const elapsed = asOfDate.getTime() - start.getTime()
      const timeProgress = Math.max(0, Math.min(1, elapsed / totalDuration))
      pv = (bac || poc.contractValue) * timeProgress
    }

    const cpi = ac > 0 ? ev / ac : 0
    const spi = pv > 0 ? ev / pv : 0
    const cv = ev - ac
    const sv = ev - pv
    const etc = cpi > 0 ? (bac - ev) / cpi : (bac - ev)
    const eac = ac + etc
    const vac = bac - eac
    const percentComplete = bac > 0 ? ev / bac : poc.percentComplete
    const percentSpent = bac > 0 ? ac / bac : 0

    return NextResponse.json({
      PV: pv,
      EV: ev,
      AC: ac,
      BAC: bac,
      ETC: etc,
      EAC: eac,
      VAC: vac,
      CPI: cpi,
      SPI: spi,
      CV: cv,
      SV: sv,
      percentComplete,
      percentSpent,
      contractValue: poc.contractValue,
      totalEstimatedCost: poc.totalEstimatedCost,
      asOfDate: asOfDate.toISOString(),
    })
  } catch (error: unknown) {
    console.error('EVM GET error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate EVM' },
      { status: 500 }
    )
  }
}
