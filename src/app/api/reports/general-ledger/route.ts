import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGeneralLedger } from '@/lib/report-engine'

// GET /api/reports/general-ledger?accountId=...&dateFrom=...&dateTo=...
// دفتر الأستاذ العام — المصدر: القيود اليومية المرحّلة فقط
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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

    // Provide the list of accounts for the dropdown (active posting accounts)
    const accounts = await db.account.findMany({
      where: { isActive: true, allowPosting: true },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
      orderBy: { code: 'asc' },
    })

    return NextResponse.json({ ...data, accounts, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('[API] General ledger error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء دفتر الأستاذ' }, { status: 500 })
  }
}
