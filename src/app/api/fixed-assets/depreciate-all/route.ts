import { runBulkDepreciation } from '@/lib/accounting/depreciation-engine'
import { NextResponse } from 'next/server'

// ============ POST: Run depreciation for ALL active assets ============
// يستخدم محرك الإهلاك المركزي — كل المنطق في depreciation-engine.ts
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const year = parseInt(body.year)
    const month = parseInt(body.month)
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds : undefined

    if (!year || !month) {
      return NextResponse.json({ error: 'السنة والشهر مطلوبان' }, { status: 400 })
    }

    const result = await runBulkDepreciation(year, month, assetIds)

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      skippedDetails: result.skippedDetails,
      totalAmount: result.totalAmount,
      journalEntryIds: result.journalEntryIds,
      results: result.results,
      message: `تم إهلاك ${result.processed} أصل بقيمة إجمالية ${result.totalAmount.toFixed(2)}` +
        (result.skipped > 0 ? ` — تم تخطي ${result.skipped} أصل` : ''),
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error running bulk depreciation:', error)
    return NextResponse.json(
      { error: 'فشل في تنفيذ الإهلاك المجمع' },
      { status: 500 }
    )
  }
}
