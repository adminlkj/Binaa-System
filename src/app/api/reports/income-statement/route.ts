import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getIncomeStatement } from '@/lib/report-engine'

// GET /api/reports/income-statement?dateFrom=...&dateTo=...
// قائمة الدخل — المصدر: القيود اليومية المرحّلة فقط
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

    const data = await getIncomeStatement(range)
    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Income statement error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء قائمة الدخل' }, { status: 500 })
  }
}
