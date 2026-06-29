import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: Depreciation report ============
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    const assets = await db.fixedAsset.findMany({
      include: {
        depreciations: {
          where: year ? { year: parseInt(year) } : undefined,
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
      orderBy: { assetCode: 'asc' },
    })

    const categorySummary: Record<string, { count: number; cost: number; accumDep: number; nbv: number }> = {}
    const monthlyTrend: Record<string, number> = {}

    const assetReports = assets.map(a => {
      const acquisitionCost = toNumber(a.acquisitionCost)
      const residualValue = toNumber(a.residualValue)
      const accumulatedDepreciation = toNumber(a.accumulatedDepreciation)
      const netBookValue = toNumber(a.netBookValue)
      const monthlyDepreciation = a.usefulLifeMonths > 0
        ? (acquisitionCost - residualValue) / a.usefulLifeMonths
        : 0
      const depreciatedMonths = monthlyDepreciation > 0
        ? Math.floor(accumulatedDepreciation / monthlyDepreciation)
        : 0
      const remainingMonths = Math.max(0, a.usefulLifeMonths - depreciatedMonths)

      // Category summary
      if (!categorySummary[a.category]) {
        categorySummary[a.category] = { count: 0, cost: 0, accumDep: 0, nbv: 0 }
      }
      categorySummary[a.category].count++
      categorySummary[a.category].cost += acquisitionCost
      categorySummary[a.category].accumDep += accumulatedDepreciation
      categorySummary[a.category].nbv += netBookValue

      // Monthly trend
      for (const dep of a.depreciations) {
        const key = `${dep.year}-${String(dep.month).padStart(2, '0')}`
        monthlyTrend[key] = (monthlyTrend[key] || 0) + toNumber(dep.depreciationAmount)
      }

      return {
        id: a.id,
        assetCode: a.assetCode,
        name: a.name,
        nameAr: a.nameAr,
        category: a.category,
        acquisitionDate: a.acquisitionDate,
        acquisitionCost,
        residualValue,
        usefulLifeMonths: a.usefulLifeMonths,
        accumulatedDepreciation,
        netBookValue,
        monthlyDepreciation,
        depreciatedMonths,
        remainingMonths,
        status: a.status,
        depreciationCount: a.depreciations.length,
      }
    })

    const summary = {
      totalAssets: assetReports.length,
      totalCost: assetReports.reduce((s, a) => s + a.acquisitionCost, 0),
      totalAccumDep: assetReports.reduce((s, a) => s + a.accumulatedDepreciation, 0),
      totalNBV: assetReports.reduce((s, a) => s + a.netBookValue, 0),
      totalMonthlyDep: assetReports.reduce((s, a) => s + a.monthlyDepreciation, 0),
      activeCount: assetReports.filter(a => a.status === 'ACTIVE').length,
      fullyDepreciatedCount: assetReports.filter(a => a.status === 'FULLY_DEPRECIATED').length,
    }

    return NextResponse.json({
      assets: assetReports,
      summary,
      categorySummary: Object.entries(categorySummary).map(([cat, data]) => ({
        category: cat,
        ...data,
      })),
      monthlyTrend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, amount]) => ({ period, amount })),
    })
  } catch (error) {
    console.error('Error generating report:', error)
    return NextResponse.json({ error: 'فشل في توليد التقرير' }, { status: 500 })
  }
}
