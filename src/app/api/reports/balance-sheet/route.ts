import { NextResponse } from 'next/server'
import { getBalanceSheet } from '@/lib/report-engine'

// GET /api/reports/balance-sheet?asOf=...
// الميزانية العمومية — المصدر: القيود اليومية المرحّلة فقط
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const asOf = searchParams.get('asOf')
    const asOfDate = asOf ? new Date(asOf) : undefined

    const data = await getBalanceSheet(asOfDate)
    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Balance sheet error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الميزانية العمومية' }, { status: 500 })
  }
}
