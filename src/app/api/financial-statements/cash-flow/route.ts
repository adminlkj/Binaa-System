import { db } from '@/lib/db'
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

  const result = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        ...dateFilter,
      },
    },
  })

  const totalDebit = result._sum.debit || 0
  const totalCredit = result._sum.credit || 0

  // Determine the normal balance from the first account type
  // For a mix of account types, we need to handle each separately
  // But since we group by similar type prefixes, this is generally okay
  // Let's calculate per account type instead
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
    const d = lines._sum.debit || 0
    const c = lines._sum.credit || 0
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

  const upToEnd = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    _count: true,
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        ...toDateFilter,
      },
    },
  })

  // Get balance up to dateFrom (exclusive)
  const fromDateFilter: { date?: { lt?: Date } } = {}
  if (dateFrom) fromDateFilter.date = { lt: dateFrom }

  const upToStart = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        ...fromDateFilter,
      },
    },
  })

  // Calculate net balance for each account type
  // Since we have a mix of types, compute per account
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
    const endD = endLines._sum.debit || 0
    const endC = endLines._sum.credit || 0
    balanceEnd += normalBalance === 'DEBIT' ? endD - endC : endC - endD

    const startLines = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        journalEntry: { status: 'POSTED', ...fromDateFilter },
      },
    })
    const startD = startLines._sum.debit || 0
    const startC = startLines._sum.credit || 0
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
    // Cash accounts: 1110 (Treasury), 1120 (Banks), 1130 (Petty Cash), 1140 (Cheques)
    const cashPrefixes = ['1110', '1120', '1130', '1140']

    // Beginning cash balance (before dateFrom)
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
      beginningCash += (begLines._sum.debit || 0) - (begLines._sum.credit || 0) // Assets: debit normal

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
      endingCash += (endLines._sum.debit || 0) - (endLines._sum.credit || 0)
    }

    beginningCash = r4(beginningCash)
    endingCash = r4(endingCash)
    const netCashChange = r4(endingCash - beginningCash)

    // ---- Operating Activities ----
    // Net Income (Revenue - Expenses for the period)
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
      totalRevenue += ((agg._sum.credit || 0) - (agg._sum.debit || 0)) // Revenue: credit normal
    }

    for (const acc of expenseAccounts) {
      const agg = await db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          accountId: acc.id,
          journalEntry: { status: 'POSTED', ...periodDateFilter },
        },
      })
      totalExpenses += ((agg._sum.debit || 0) - (agg._sum.credit || 0)) // Expense: debit normal
    }

    const netIncome = r4(totalRevenue - totalExpenses)

    // Non-cash items: Depreciation (8300)
    const depreciationChange = await getBalanceChange(['8300'], dateFrom, dateTo)

    // Changes in working capital
    // Receivables change (1200-1290): Asset, increase = negative cash flow
    const receivablesChange = await getBalanceChange(['12'], dateFrom, dateTo)
    // Inventory change (1300-1390): Asset
    const inventoryChange = await getBalanceChange(['13'], dateFrom, dateTo)
    // Prepayments change (1400-1490): Asset
    const prepaymentsChange = await getBalanceChange(['14'], dateFrom, dateTo)
    // Payables change (3100-3190, 3200-3290): Liability, increase = positive cash flow
    const payablesChange = await getBalanceChange(['3'], dateFrom, dateTo)
    // Accruals/other current liabilities
    const accrualsChange = await getBalanceChange(['31', '32', '33', '34', '35', '36', '37', '38', '39'], dateFrom, dateTo)

    // For operating activities:
    // Receivables increase → cash outflow (negative adjustment)
    // Inventory increase → cash outflow (negative adjustment)
    // Payables increase → cash inflow (positive adjustment)
    const operatingAdjustments = r4(
      -receivablesChange +    // Asset increase = cash decrease
      -inventoryChange +      // Asset increase = cash decrease
      -prepaymentsChange +    // Asset increase = cash decrease
      accrualsChange          // Liability increase = cash increase
    )

    const netCashFromOperating = r4(netIncome + depreciationChange + operatingAdjustments)

    // ---- Investing Activities ----
    // Changes in non-current assets (2xxx) excluding accumulated depreciation
    // Fixed assets purchase/sale
    const fixedAssetsChange = await getBalanceChange(['2'], dateFrom, dateTo)
    // For investing: Asset increase = cash outflow (negative)
    const netCashFromInvesting = r4(-fixedAssetsChange)

    // ---- Financing Activities ----
    // Changes in long-term liabilities (4xxx) and equity (5xxx)
    const longTermLiabilitiesChange = await getBalanceChange(['4'], dateFrom, dateTo)
    const equityChange = await getBalanceChange(['5'], dateFrom, dateTo)
    // Liability increase = cash inflow, Equity increase = cash inflow
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
