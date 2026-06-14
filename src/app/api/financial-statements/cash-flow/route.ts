import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Get account balances up to a specific date, filtered by code prefixes
async function getBalancesByPrefixes(
  prefixes: string[],
  dateFrom: Date | undefined,
  dateTo: Date | undefined
): Promise<number> {
  const accounts = await db.account.findMany({
    where: {
      isActive: true,
      OR: prefixes.map(p => ({ code: { startsWith: p } })),
    },
    select: { id: true, code: true, type: true },
  })

  if (accounts.length === 0) return 0

  const accountIds = accounts.map(a => a.id)

  const dateFilter: { date?: { gte?: Date; lte?: Date } } = {}
  if (dateFrom || dateTo) {
    dateFilter.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    }
  }

  // Calculate per account type for correct normal balance
  let balance = 0
  for (const account of accounts) {
    const lines = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        journalEntry: {
          status: 'POSTED',
          ...dateFilter,
        },
      },
    })
    const d = toNumber(lines._sum.debit)
    const c = toNumber(lines._sum.credit)
    const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'
    balance += normalBalance === 'DEBIT' ? d - c : c - d
  }

  return r4(balance)
}

// More efficient: get balance changes between two periods for specific account prefixes
async function getBalanceChange(
  prefixes: string[],
  dateFrom: Date | undefined,
  dateTo: Date | undefined
): Promise<number> {
  const accounts = await db.account.findMany({
    where: {
      isActive: true,
      OR: prefixes.map(p => ({ code: { startsWith: p } })),
    },
    select: { id: true, type: true },
  })

  if (accounts.length === 0) return 0

  const accountIds = accounts.map(a => a.id)

  // Get balance up to dateTo
  const toDateFilter: { date?: { lte?: Date } } = {}
  if (dateTo) toDateFilter.date = { lte: dateTo }

  // Get balance up to dateFrom (exclusive)
  const fromDateFilter: { date?: { lt?: Date } } = {}
  if (dateFrom) fromDateFilter.date = { lt: dateFrom }

  // Calculate net balance for each account type
  let balanceEnd = 0
  let balanceStart = 0

  for (const account of accounts) {
    const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'

    const endLines = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        journalEntry: { status: 'POSTED', ...toDateFilter },
      },
    })
    const endD = toNumber(endLines._sum.debit)
    const endC = toNumber(endLines._sum.credit)
    balanceEnd += normalBalance === 'DEBIT' ? endD - endC : endC - endD

    const startLines = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        journalEntry: { status: 'POSTED', ...fromDateFilter },
      },
    })
    const startD = toNumber(startLines._sum.debit)
    const startC = toNumber(startLines._sum.credit)
    balanceStart += normalBalance === 'DEBIT' ? startD - startC : startC - startD
  }

  return r4(balanceEnd - balanceStart)
}

// GET /api/financial-statements/cash-flow?dateFrom=...&dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    // ---- Cash/Bank account balances ----
    const cashPrefixes = ['1110', '1120', '1130', '1140']

    const beginDateFilter: { date?: { lt?: Date } } = {}
    if (dateFrom) beginDateFilter.date = { lt: dateFrom }

    const cashAccounts = await db.account.findMany({
      where: {
        isActive: true,
        OR: cashPrefixes.map(p => ({ code: { startsWith: p } })),
      },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
    })

    let beginningCash = 0
    let endingCash = 0

    const endDateFilter: { date?: { lte?: Date } } = {}
    if (dateTo) endDateFilter.date = { lte: dateTo }

    for (const account of cashAccounts) {
      // Beginning balance
      const begLines = await db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
            ...beginDateFilter,
          },
        },
      })
      beginningCash += toNumber(begLines._sum.debit) - toNumber(begLines._sum.credit) // Assets: debit normal

      // Ending balance
      const endLines = await db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: account.id,
          journalEntry: {
            status: 'POSTED',
            ...endDateFilter,
          },
        },
      })
      endingCash += toNumber(endLines._sum.debit) - toNumber(endLines._sum.credit)
    }

    beginningCash = r4(beginningCash)
    endingCash = r4(endingCash)
    const netCashChange = r4(endingCash - beginningCash)

    // ---- Operating Activities ----
    const revenueAccounts = await db.account.findMany({
      where: { isActive: true, code: { startsWith: '6' } },
      select: { id: true, type: true },
    })
    const expenseAccounts = await db.account.findMany({
      where: { isActive: true, OR: [{ code: { startsWith: '7' } }, { code: { startsWith: '8' } }] },
      select: { id: true, type: true },
    })

    const periodDateFilter: { date?: { gte?: Date; lte?: Date } } = {}
    if (dateFrom || dateTo) {
      periodDateFilter.date = {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      }
    }

    let totalRevenue = 0
    let totalExpenses = 0

    for (const acc of revenueAccounts) {
      const agg = await db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: acc.id,
          journalEntry: { status: 'POSTED', ...periodDateFilter },
        },
      })
      totalRevenue += toNumber(agg._sum.credit) - toNumber(agg._sum.debit) // Revenue: credit normal
    }

    for (const acc of expenseAccounts) {
      const agg = await db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: acc.id,
          journalEntry: { status: 'POSTED', ...periodDateFilter },
        },
      })
      totalExpenses += toNumber(agg._sum.debit) - toNumber(agg._sum.credit) // Expense: debit normal
    }

    const netIncome = r4(totalRevenue - totalExpenses)

    // Non-cash items: Depreciation (8300)
    const depreciationChange = await getBalanceChange(['8300'], dateFrom, dateTo)

    // Changes in working capital
    const receivablesChange = await getBalanceChange(['12'], dateFrom, dateTo)
    const inventoryChange = await getBalanceChange(['13'], dateFrom, dateTo)
    const prepaymentsChange = await getBalanceChange(['14'], dateFrom, dateTo)
    const accrualsChange = await getBalanceChange(['31', '32', '33', '34', '35', '36', '37', '38', '39'], dateFrom, dateTo)

    const operatingAdjustments = r4(
      -receivablesChange +
      -inventoryChange +
      -prepaymentsChange +
      accrualsChange
    )

    const netCashFromOperating = r4(netIncome + depreciationChange + operatingAdjustments)

    // ---- Investing Activities ----
    const fixedAssetsChange = await getBalanceChange(['2'], dateFrom, dateTo)
    const netCashFromInvesting = r4(-fixedAssetsChange)

    // ---- Financing Activities ----
    const longTermLiabilitiesChange = await getBalanceChange(['4'], dateFrom, dateTo)
    const equityChange = await getBalanceChange(['5'], dateFrom, dateTo)
    const netCashFromFinancing = r4(longTermLiabilitiesChange + equityChange)

    // Verification
    const calculatedNetChange = r4(netCashFromOperating + netCashFromInvesting + netCashFromFinancing)

    return NextResponse.json({
      operating: {
        netIncome,
        depreciation: depreciationChange,
        workingCapitalChanges: {
          receivables: receivablesChange,
          inventory: inventoryChange,
          prepayments: prepaymentsChange,
          payables: accrualsChange,
          adjustments: operatingAdjustments,
        },
        total: netCashFromOperating,
        label: 'الأنشطة التشغيلية',
        labelEn: 'Operating Activities',
      },
      investing: {
        fixedAssets: fixedAssetsChange,
        total: netCashFromInvesting,
        label: 'الأنشطة الاستثمارية',
        labelEn: 'Investing Activities',
      },
      financing: {
        longTermLiabilities: longTermLiabilitiesChange,
        equity: equityChange,
        total: netCashFromFinancing,
        label: 'الأنشطة التمويلية',
        labelEn: 'Financing Activities',
      },
      netCashChange,
      calculatedNetChange,
      beginningCash,
      endingCash,
      isReconciled: Math.abs(netCashChange - calculatedNetChange) < 0.01,
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error generating cash flow statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء قائمة التدفقات النقدية' },
      { status: 500 }
    )
  }
}
