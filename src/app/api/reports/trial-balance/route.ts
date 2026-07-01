import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getTrialBalance } from '@/lib/report-engine'

// GET /api/reports/trial-balance?dateFrom=...&dateTo=...
// ميزان المراجعة — المصدر: القيود اليومية المرحّلة فقط
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

    const data = await getTrialBalance(range)
    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Trial balance error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء ميزان المراجعة' }, { status: 500 })
  }
}
