// ============================================================================
// ملخص مالي من الأستاذ العام - GL-Driven Financial Summary API
// القاعدة رقم 9: المحاسبة هي المحرك الأساسي للنظام
// القاعدة رقم 10: القيد هو المصدر الوحيد للحقيقة المالية
// ============================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function toNum(value: { valueOf(): string | number } | null | undefined): number {
  return Number(value ?? 0)
}

async function getAccountBalance(accountCode: string): Promise<number> {
  const account = await db.account.findUnique({ where: { code: accountCode } })
  if (!account) return 0

  const result = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: account.id,
      journalEntry: { status: 'POSTED' },
    },
  })

  const totalDebit = toNum(result._sum.debit)
  const totalCredit = toNum(result._sum.credit)
  const normalBalanceMap: Record<string, 'DEBIT' | 'CREDIT'> = {
    ASSET: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', EXPENSE: 'DEBIT',
  }
  const normalBalance = normalBalanceMap[account.type] || 'DEBIT'

  return normalBalance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const dateFrom = startDate ? new Date(startDate) : undefined
    const dateTo = endDate ? new Date(endDate) : undefined

    const allBalances = await Promise.all([
      getAccountBalance('1110'), getAccountBalance('1120'), getAccountBalance('1130'),
      getAccountBalance('1210'), getAccountBalance('3210'),
      getAccountBalance('6110'), getAccountBalance('6210'), getAccountBalance('6220'), getAccountBalance('6340'),
      getAccountBalance('7110'), getAccountBalance('7130'),
      getAccountBalance('7210'), getAccountBalance('7220'), getAccountBalance('7230'), getAccountBalance('7240'), getAccountBalance('7250'),
      getAccountBalance('8110'), getAccountBalance('8120'), getAccountBalance('8130'), getAccountBalance('8140'), getAccountBalance('8310'), getAccountBalance('8510'), getAccountBalance('8630'),
      getAccountBalance('1220'), getAccountBalance('3410'), getAccountBalance('3830'), getAccountBalance('3310'), getAccountBalance('3810'), getAccountBalance('3710'),
    ])

    const cashBalance = allBalances[0] + allBalances[1] + allBalances[2]
    const receivables = allBalances[3]
    const payables = allBalances[4]
    const construction = allBalances[5]
    const rental = allBalances[6]
    const delivery = allBalances[7]
    const other = allBalances[8]
    const projectCosts = allBalances[9] + allBalances[10]
    const rentalCosts = allBalances[11] + allBalances[12] + allBalances[13] + allBalances[14] + allBalances[15]
    const adminExpenses = allBalances[16] + allBalances[17] + allBalances[18] + allBalances[19] + allBalances[20] + allBalances[21] + allBalances[22]
    const totalRevenue = construction + rental + delivery + other
    const totalExpenses = projectCosts + rentalCosts + adminExpenses

    return NextResponse.json({
      cashBalance,
      revenue: { total: totalRevenue, construction, rental, delivery, other },
      expenses: { total: totalExpenses, projectCosts, rentalCosts, adminExpenses },
      netProfit: totalRevenue - totalExpenses,
      receivables,
      payables,
      retentionReceivable: allBalances[23],
      customerAdvances: allBalances[24],
      gosiPayable: allBalances[25],
      salariesPayable: allBalances[26],
      zakatPayable: allBalances[27],
      eosProvision: allBalances[28],
      source: 'GENERAL_LEDGER',
      dateRange: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
      generatedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('Error getting GL financial summary:', error)
    return NextResponse.json({ error: 'فشل في تحميل الملخص المالي' }, { status: 500 })
  }
}
