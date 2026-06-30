// ============================================================================
// IFRS 15 — اعتراف بإيراد الفترة (Post Journal Entry)
// ============================================================================
// POST /api/ifrs15/recognize
// Body: { projectId: string, date?: string }
//
// ينشئ قيد IFRS 15 للإيراد المعترف به للفترة:
//   مدين: CONTRACT_ASSET (1610)
//   دائن: UNBILLED_REVENUE (6130)
//
// القيد تراكمي: periodRevenue = revenueToDate - previouslyRecognizedRevenue
// فلا يوجد ازدواج حتى لو استُدعي عدة مرات.

import { NextResponse } from 'next/server'
import { requireRoleApi } from '@/lib/auth-helpers'
import { autoEntryIFRS15Revenue } from '@/lib/accounting/ifrs15'

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'JSON غير صالح' },
      { status: 400 }
    )
  }

  const { projectId, date } = body
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: 'projectId مطلوب' },
      { status: 400 }
    )
  }

  const asOfDate = date ? new Date(date) : new Date()
  if (isNaN(asOfDate.getTime())) {
    return NextResponse.json(
      { success: false, error: 'تاريخ غير صالح' },
      { status: 400 }
    )
  }

  try {
    const result = await autoEntryIFRS15Revenue(projectId, asOfDate)

    if (!result.journalEntryId) {
      return NextResponse.json({
        success: true,
        data: {
          journalEntryId: null,
          periodRevenue: 0,
          percentComplete: result.percentComplete,
          message: 'لا يوجد إيراد جديد للاعتراف به — الإيراد المكتسب مساوٍ للمعترف به سابقاً',
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        journalEntryId: result.journalEntryId,
        periodRevenue: result.periodRevenue,
        percentComplete: result.percentComplete,
        message: `تم الاعتراف بإيراد IFRS 15 بمبلغ ${result.periodRevenue.toFixed(2)} (POC ${(result.percentComplete * 100).toFixed(2)}%)`,
      },
    })
  } catch (err) {
    console.error('[IFRS15 recognize] error:', err)
    return NextResponse.json(
      { success: false, error: 'فشل الاعتراف بالإيراد', detail: String(err) },
      { status: 500 }
    )
  }
}
