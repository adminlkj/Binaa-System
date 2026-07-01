import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getCostCenterReport } from '@/lib/report-engine'

// GET /api/reports/cost-center-report?dateFrom=...&dateTo=...
// تقرير مراكز التكلفة — المصدر: القيود اليومية المرحّلة فقط
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    const costCenters = await getCostCenterReport(range)
    const totals = {
      totalRevenue: costCenters.reduce((s, c) => s + c.revenue, 0),
      totalCosts: costCenters.reduce((s, c) => s + c.costs, 0),
      totalNet: costCenters.reduce((s, c) => s + c.net, 0),
    }
    return NextResponse.json({ costCenters, totals, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Cost center report error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير مراكز التكلفة' }, { status: 500 })
  }
}
