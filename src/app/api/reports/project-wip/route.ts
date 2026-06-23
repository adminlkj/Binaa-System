import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { getProjectBalances, buildProjectCostCenterMap } from '@/lib/report-engine'

// GET /api/reports/project-wip?dateFrom=...&dateTo=...
// تقرير الأعمال تحت التنفيذ (WIP) — المصدر: القيود اليومية المرحّلة فقط
// يحسب لكل مشروع: التكاليف المتراكمة (WIP مدين) والإيراد المعترف به (عقد/غير مفوتر)
// وصافي WIP = التكاليف - الإيراد المعترف به
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    const projects = await db.project.findMany({
      where: { status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
      include: {
        client: { select: { name: true, nameAr: true } },
        contracts: { select: { totalValue: true, status: true } },
      },
      orderBy: { code: 'asc' },
    })

    const projectIds = projects.map(p => p.id)
    const balances = await getProjectBalances(projectIds, range)
    const ccMap = await buildProjectCostCenterMap(projectIds)

    // Also fetch WIP account balance per cost center (account role PROJECT_WIP)
    const wipAccounts = await db.account.findMany({
      where: { accountRole: 'PROJECT_WIP', isActive: true },
      select: { id: true },
    })
    const contractAssetAccounts = await db.account.findMany({
      where: { accountRole: { in: ['CONTRACT_ASSET', 'UNBILLED_REVENUE'] }, isActive: true },
      select: { id: true },
    })
    const contractLiabilityAccounts = await db.account.findMany({
      where: { accountRole: 'CONTRACT_LIABILITY', isActive: true },
      select: { id: true },
    })

    const ccIds = [...ccMap.values()]
    const allWipRelatedIds = [
      ...wipAccounts.map(a => a.id),
      ...contractAssetAccounts.map(a => a.id),
      ...contractLiabilityAccounts.map(a => a.id),
    ]

    let wipLines: { costCenterId: string | null; accountId: string; debit: number; credit: number }[] = []
    if (ccIds.length > 0 && allWipRelatedIds.length > 0) {
      const lines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          accountId: { in: allWipRelatedIds },
          costCenterId: { in: ccIds },
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            ...(range && (range.from || range.to) && {
              date: {
                ...(range.from && { gte: range.from }),
                ...(range.to && { lte: range.to }),
              },
            }),
          },
        },
        select: { costCenterId: true, accountId: true, debit: true, credit: true },
      })
      wipLines = lines.map(l => ({
        costCenterId: l.costCenterId,
        accountId: l.accountId,
        debit: toNumber(l.debit),
        credit: toNumber(l.credit),
      }))
    }

    const wipAccountIds = new Set(wipAccounts.map(a => a.id))
    const contractAssetIds = new Set(contractAssetAccounts.map(a => a.id))
    const contractLiabilityIds = new Set(contractLiabilityAccounts.map(a => a.id))
    const ccToProject = new Map<string, string>()
    for (const [pid, ccid] of ccMap) ccToProject.set(ccid, pid)

    // Per-project WIP aggregation
    const rows = projects.map(p => {
      const ccId = ccMap.get(p.id) || null
      const bal = balances.get(p.id) || { revenue: 0, costs: 0, costCenterId: null }
      const contractValue = p.contracts
        .filter(c => c.status === 'ACTIVE' || c.status === 'DRAFT')
        .reduce((s, c) => s + toNumber(c.totalValue), 0) || toNumber(p.contractValue)

      // WIP-related balances for this project's cost center
      let wipDebit = 0, wipCredit = 0
      let contractAssetBalance = 0
      let contractLiabilityBalance = 0
      for (const l of wipLines) {
        if (l.costCenterId !== ccId) continue
        if (wipAccountIds.has(l.accountId)) {
          wipDebit += l.debit
          wipCredit += l.credit
        } else if (contractAssetIds.has(l.accountId)) {
          contractAssetBalance += l.debit - l.credit
        } else if (contractLiabilityIds.has(l.accountId)) {
          contractLiabilityBalance += l.credit - l.debit
        }
      }

      const wipBalance = wipDebit - wipCredit
      const recognizedRevenue = bal.revenue
      const incurredCosts = bal.costs
      // Net WIP = incurred costs - recognized revenue (if positive, asset; if negative, liability)
      const netWip = incurredCosts - recognizedRevenue
      // Profit to date = recognized revenue - incurred costs
      const profitToDate = recognizedRevenue - incurredCosts
      // Completion % = incurred costs / total estimated cost (use contract value as proxy if no estimate)
      const estimatedTotalCost = toNumber(p.estimatedTotalCost) || contractValue
      const completionPercent = estimatedTotalCost > 0 ? (incurredCosts / estimatedTotalCost) * 100 : 0

      return {
        projectId: p.id,
        code: p.code,
        name: p.name,
        nameAr: p.nameAr,
        client: p.client.nameAr || p.client.name,
        status: p.status,
        contractValue,
        estimatedTotalCost,
        incurredCosts,
        recognizedRevenue,
        wipBalance,
        contractAssetBalance,
        contractLiabilityBalance,
        netWip,
        profitToDate,
        completionPercent: Math.round(completionPercent * 100) / 100,
        costCenterId: ccId,
      }
    })

    const totals = {
      contractValue: rows.reduce((s, r) => s + r.contractValue, 0),
      estimatedTotalCost: rows.reduce((s, r) => s + r.estimatedTotalCost, 0),
      incurredCosts: rows.reduce((s, r) => s + r.incurredCosts, 0),
      recognizedRevenue: rows.reduce((s, r) => s + r.recognizedRevenue, 0),
      wipBalance: rows.reduce((s, r) => s + r.wipBalance, 0),
      netWip: rows.reduce((s, r) => s + r.netWip, 0),
      profitToDate: rows.reduce((s, r) => s + r.profitToDate, 0),
    }

    return NextResponse.json({ rows, totals, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Project WIP report error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير الأعمال تحت التنفيذ' }, { status: 500 })
  }
}
