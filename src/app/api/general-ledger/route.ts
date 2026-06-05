import { NextResponse } from 'next/server'
import { getGeneralLedger, getAccountBalance, getAccountByCode } from '@/lib/accounting/engine'

export async function GET(request: Request) {
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

    const ledgerEntries = await getGeneralLedger(accountCode, from, to)
    const currentBalance = await getAccountBalance(accountCode)

    return NextResponse.json({
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        nameAr: account.nameAr,
        type: account.type,
      },
      entries: ledgerEntries,
      currentBalance,
      filters: {
        accountCode,
        dateFrom: from?.toISOString() || null,
        dateTo: to?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error fetching general ledger:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل دفتر الأستاذ العام' },
      { status: 500 }
    )
  }
}
