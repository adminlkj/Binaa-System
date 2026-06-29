import { NextResponse } from 'next/server'
import { getTrialBalance } from '@/lib/accounting/queries'
import { serializeDecimal } from '@/lib/decimal'

// GET /api/trial-balance?dateFrom=...&dateTo=...
// ميزان المراجعة — المصدر: القيود اليومية المرحّلة فقط (Single Source of Truth)
//
// BA-02 Task 1: تم توحيد جميع قراءات ميزان المراجعة عبر queries.getTrialBalance.
// هذا الـ endpoint يستخدم نفس الدالة التي يستخدمها /api/reports/trial-balance
// لضمان تطابق الأرقام 100%.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const from = dateFrom ? new Date(dateFrom) : undefined
    const to = dateTo ? new Date(dateTo) : undefined
    const range = (from || to) ? { from, to } : undefined

    const result = await getTrialBalance(range)

    // Group by account type for summary (preserves backward-compat response shape)
    const byType: Record<string, { totalDebit: number; totalCredit: number; count: number }> = {}
    for (const row of result.rows) {
      const type = row.type
      if (!byType[type]) {
        byType[type] = { totalDebit: 0, totalCredit: 0, count: 0 }
      }
      byType[type].totalDebit += row.netDebit
      byType[type].totalCredit += row.netCredit
      byType[type].count += 1
    }

    return NextResponse.json(serializeDecimal({
      data: result.rows,
      totals: {
        totalDebit: result.totals.totalNetDebit,
        totalCredit: result.totals.totalNetCredit,
        isBalanced: result.totals.isBalanced,
      },
      byType,
      filters: {
        dateFrom: from?.toISOString() || null,
        dateTo: to?.toISOString() || null,
      },
      source: 'posted-journal-entries',
    }))
  } catch (error) {
    console.error('Error fetching trial balance:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل ميزان المراجعة' },
      { status: 500 }
    )
  }
}
