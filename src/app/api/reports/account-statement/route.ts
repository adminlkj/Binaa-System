import { NextResponse } from 'next/server'
import { getGeneralLedger } from '@/lib/report-engine'

// GET /api/reports/account-statement?accountId=...&dateFrom=...&dateTo=...
// كشف حساب — نفس دفتر الأستاذ لكن مُسمّى مختلف للاستخدام العملائي
// المصدر: القيود اليومية المرحّلة فقط
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!accountId) {
      return NextResponse.json({ error: 'يرجى تحديد الحساب' }, { status: 400 })
    }

    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    const data = await getGeneralLedger(accountId, range)
    if (!data) {
      return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ ...data, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] Account statement error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء كشف الحساب' }, { status: 500 })
  }
}
