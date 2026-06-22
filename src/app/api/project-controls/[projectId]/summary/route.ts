import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/project-controls/[projectId]/summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    // Planned (BAC) from CostCodeBudget
    let planned = 0
    try {
      const budgetAgg = await db.costCodeBudget.aggregate({
        where: { projectId },
        _sum: { budgetAmount: true },
      })
      planned = Number(budgetAgg._sum.budgetAmount || 0)
    } catch { /* ignore */ }

    // Committed from Commitment
    let committed = 0
    try {
      const commitAgg = await db.commitment.aggregate({
        where: { projectId, status: { not: 'CANCELLED' } },
        _sum: { committedAmount: true },
      })
      committed = Number(commitAgg._sum.committedAmount || 0)
    } catch { /* ignore */ }

    // Actual from CostEntry (non-committed)
    let actual = 0
    try {
      const actualAgg = await db.costEntry.aggregate({
        where: { projectId, isCommitted: false },
        _sum: { amount: true },
      })
      actual = Number(actualAgg._sum.amount || 0)
    } catch { /* ignore */ }

    // Fallback: legacy sources
    if (actual === 0) {
      const [expAgg, laborAgg, subAgg, equipAgg] = await Promise.all([
        db.expense.aggregate({ where: { projectId }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
        db.laborCost.aggregate({ where: { projectId }, _sum: { totalAmount: true } }).catch(() => ({ _sum: { totalAmount: 0 } })),
        db.subcontractorInvoice.aggregate({ where: { projectId }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
        db.equipmentCost.aggregate({ where: { projectId }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
      ])
      actual =
        Number(expAgg._sum.amount || 0) +
        Number(laborAgg._sum.totalAmount || 0) +
        Number(subAgg._sum.amount || 0) +
        Number(equipAgg._sum.amount || 0)
    }

    // Earned from certified Measurements (if exist) or fallback to actual
    let earned = 0
    try {
      const earnedAgg = await db.measurement.aggregate({
        where: { projectId, status: 'CERTIFIED' },
        _sum: { certifiedAmount: true },
      })
      earned = Number(earnedAgg._sum.certifiedAmount || 0)
    } catch { /* ignore */ }
    if (earned === 0) earned = actual // fallback

    const remainingBudget = planned - actual
    const costVariance = planned - actual
    const isOverBudget = planned > 0 && actual > planned
    const isLossMaking = earned > 0 && actual > earned

    // Get project for contract value
    const project = await db.project.findUnique({ where: { id: projectId } })
    const contractValue = Number(project?.contractValue || 0)

    return NextResponse.json({
      planned,
      committed,
      actual,
      earned,
      bac: planned,
      contractValue,
      remainingBudget,
      costVariance,
      scheduleVariance: earned - planned,
      isOverBudget,
      isLossMaking,
      percentComplete: planned > 0 ? (earned / planned) * 100 : 0,
      percentSpent: planned > 0 ? (actual / planned) * 100 : 0,
    })
  } catch (error: unknown) {
    console.error('Project summary GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project summary', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
