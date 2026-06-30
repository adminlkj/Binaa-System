// ============================================================================
// IFRS 15 — معاينة حساب نسبة الإنجاز (Preview) بدون قيد
// ============================================================================
// GET /api/ifrs15/preview?projectId=xxx&date=2025-01-31
// يرجع نتيجة calculatePOC + calculatePeriodRevenue دون إنشاء أي قيد

import { NextResponse, type NextRequest } from 'next/server'
import { requireAuthApi } from '@/lib/auth-helpers'
import { calculatePOC, calculatePeriodRevenue } from '@/lib/accounting/ifrs15'

export async function GET(request: NextRequest) {
  const { response } = await requireAuthApi()
  if (response) return response

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const dateStr = searchParams.get('date')

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: 'projectId مطلوب' },
      { status: 400 }
    )
  }

  const asOfDate = dateStr ? new Date(dateStr) : new Date()
  if (isNaN(asOfDate.getTime())) {
    return NextResponse.json(
      { success: false, error: 'تاريخ غير صالح' },
      { status: 400 }
    )
  }

  try {
    const [poc, period] = await Promise.all([
      calculatePOC(projectId, asOfDate),
      calculatePeriodRevenue(projectId, asOfDate),
    ])

    return NextResponse.json({
      success: true,
      data: {
        asOfDate: asOfDate.toISOString(),
        contractValue: poc.contractValue,
        totalEstimatedCost: poc.totalEstimatedCost,
        totalActualCost: poc.totalActualCost,
        estimatedCostToComplete: poc.estimatedCostToComplete,
        percentComplete: poc.percentComplete,
        // الإيراد المكتسب (Earned Revenue) — هذا هو الإيراد الصحيح وفق IFRS 15
        revenueToDate: poc.revenueToDate,
        grossProfitToDate: poc.grossProfitToDate,
        grossProfitPercent: poc.grossProfitPercent,
        // الإيراد المعترف به سابقاً (من قيود IFRS 15 السابقة)
        previouslyRecognizedRevenue: period.previouslyRecognizedRevenue,
        // إيراد الفترة = الإيراد المكتسب - المعترف به سابقاً
        periodRevenue: period.periodRevenue,
        periodCost: period.periodCost,
        periodGrossProfit: period.periodGrossProfit,
      },
    })
  } catch (err) {
    console.error('[IFRS15 preview] error:', err)
    return NextResponse.json(
      { success: false, error: 'فشل حساب نسبة الإنجاز', detail: String(err) },
      { status: 500 }
    )
  }
}
