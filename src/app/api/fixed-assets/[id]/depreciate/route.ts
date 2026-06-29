import { runDepreciationForAsset } from '@/lib/accounting/depreciation-engine'
import { NextResponse } from 'next/server'

// ============ POST: Run depreciation for a single asset ============
// يستخدم محرك الإهلاك المركزي — كل المنطق في depreciation-engine.ts
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const year = parseInt(body.year)
    const month = parseInt(body.month)

    if (!year || !month) {
      return NextResponse.json({ error: 'السنة والشهر مطلوبان' }, { status: 400 })
    }

    const result = await runDepreciationForAsset(id, year, month)

    if (result.skipped) {
      return NextResponse.json(
        { skipped: true, ...result, message: result.skipReason },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: result.fullyDepreciated
        ? 'تم إهلاك الأصل بالكامل — القيمة الدفترية وصلت للقيمة المتبقية'
        : 'تم إنشاء قيد الإهلاك بنجاح',
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error running depreciation:', error)
    return NextResponse.json(
      { error: 'فشل في تنفيذ الإهلاك' },
      { status: 500 }
    )
  }
}
