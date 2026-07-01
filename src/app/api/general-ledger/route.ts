import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getGeneralLedger, getAccountBalance, getAccountByCode } from '@/lib/accounting/queries'
import { serializeDecimal } from '@/lib/decimal'

// GET /api/general-ledger?accountCode=...&dateFrom=...&dateTo=...
// دفتر الأستاذ العام — المصدر: القيود اليومية المرحّلة فقط (Single Source of Truth)
//
// BA-02 Task 1: تم توحيد جميع قراءات دفتر الأستاذ عبر queries.getGeneralLedger.
// هذا الـ endpoint الآن يحسب الرصيد الافتتاحي بشكل صحيح (كان يبدأ من 0 سابقاً).
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const accountCode = searchParams.get('accountCode')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!accountCode) {
      return NextResponse.json(
        { error: 'رمز الحساب مطلوب (accountCode)' },
        { status: 400 }
      )
    }

    // Get account details
    const account = await getAccountByCode(accountCode)
    if (!account) {
      return NextResponse.json(
        { error: `الحساب برمز ${accountCode} غير موجود` },
        { status: 404 }
      )
    }

    const from = dateFrom ? new Date(dateFrom) : undefined
    const to = dateTo ? new Date(dateTo) : undefined
    const range = (from || to) ? { from, to } : undefined

    const ledger = await getGeneralLedger(accountCode, range)
    // currentBalance (legacy field) = full account balance across all time
    const currentBalance = await getAccountBalance(accountCode)

    if (!ledger) {
      return NextResponse.json(
        { error: `تعذّر بناء دفتر الأستاج للحساب ${accountCode}` },
        { status: 500 }
      )
    }

    return NextResponse.json(serializeDecimal({
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        nameAr: account.nameAr,
        type: account.type,
      },
      // Preserve legacy field name "entries" for backward compatibility with frontend.
      entries: ledger.lines,
      // New structured fields (canonical)
      openingBalance: ledger.openingBalance,
      closingBalance: ledger.closingBalance,
      totalDebit: ledger.totalDebit,
      totalCredit: ledger.totalCredit,
      currentBalance,
      filters: {
        accountCode,
        dateFrom: from?.toISOString() || null,
        dateTo: to?.toISOString() || null,
      },
    }))
  } catch (error) {
    console.error('Error fetching general ledger:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل دفتر الأستاذ العام' },
      { status: 500 }
    )
  }
}
