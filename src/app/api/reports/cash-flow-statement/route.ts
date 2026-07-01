import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getCashFlow } from '@/lib/report-engine'

// GET /api/reports/cash-flow-statement?dateFrom=...&dateTo=...
// قائمة التدفقات النقدية — المصدر: القيود اليومية المرحّلة على حسابات النقدية والبنوك فقط
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

    const data = await getCashFlow(range)
    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Cash flow statement error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء قائمة التدفقات النقدية' }, { status: 500 })
  }
}
