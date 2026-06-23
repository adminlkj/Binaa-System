import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

interface AccountWithBalance {
  id: string
  code: string
  name: string
  nameAr: string | null
  type: string
  level: number
  balance: number
}

// Get all account balances up to a specific date
async function getAllAccountBalancesUpTo(dateTo: Date | undefined): Promise<AccountWithBalance[]> {
  const dateFilter: { date?: { lte?: Date } } = {}
  if (dateTo) {
    dateFilter.date = { lte: dateTo }
  }

  // Get all active accounts
  const accounts = await db.account.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      type: true,
      level: true,
    },
    orderBy: { code: 'asc' },
  })

  if (accounts.length === 0) return []

  const accountIds = accounts.map(a => a.id)

  // Aggregate journal lines for all accounts
  const lines = await db.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        ...dateFilter,
      },
    },
    select: {
      accountId: true,
      debit: true,
      credit: true,
    },
  })

  // Sum by account
  const balanceMap = new Map<string, { totalDebit: number; totalCredit: number }>()
  for (const line of lines) {
    const existing = balanceMap.get(line.accountId) || { totalDebit: 0, totalCredit: 0 }
    existing.totalDebit += toNumber(line.debit)
    existing.totalCredit += toNumber(line.credit)
    balanceMap.set(line.accountId, existing)
  }

  // Calculate balance per account based on normal balance
  return accounts.map(account => {
    const bal = balanceMap.get(account.id) || { totalDebit: 0, totalCredit: 0 }
    const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'
    const balance = normalBalance === 'DEBIT'
      ? bal.totalDebit - bal.totalCredit
      : bal.totalCredit - bal.totalDebit
    return {
      id: account.id,
      code: account.code,
      name: account.name,
      nameAr: account.nameAr,
      type: account.type,
      level: account.level,
      balance: r4(balance),
    }
  })
}

// Group accounts by code prefix and build hierarchy
function groupAccountsByPrefix(
  accounts: AccountWithBalance[],
  prefixes: string[]
): { code: string; name: string; nameAr: string | null; balance: number }[] {
  const result: { code: string; name: string; nameAr: string | null; balance: number }[] = []
  for (const prefix of prefixes) {
    const matched = accounts.filter(a => a.code.startsWith(prefix))
    for (const a of matched) {
      result.push({
        code: a.code,
        name: a.name,
        nameAr: a.nameAr,
        balance: a.balance,
      })
    }
  }
  return result
}

// GET /api/financial-statements/balance-sheet?dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateToStr = searchParams.get('dateTo')
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    const allAccounts = await getAllAccountBalancesUpTo(dateTo)

    // ---- Assets ----
    // Current Assets: codes starting with 1 (but not 12xx that are receivables in some conventions)
    // Actually per the chart of accounts:
    // 1xxx = Assets (1000-level parent accounts)
    // Current Assets: 1100-1399 (1xxx but typically split at 2000 for non-current)
    // Per the task: Current Assets (1xxx), Non-Current Assets (2xxx)
    const currentAssetAccounts = groupAccountsByPrefix(allAccounts, ['1'])
    const nonCurrentAssetAccounts = groupAccountsByPrefix(allAccounts, ['2'])

    const totalCurrentAssets = r4(currentAssetAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalNonCurrentAssets = r4(nonCurrentAssetAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalAssets = r4(totalCurrentAssets + totalNonCurrentAssets)

    // ---- Liabilities ----
    // Current Liabilities (3xxx), Non-Current Liabilities (4xxx)
    const currentLiabilityAccounts = groupAccountsByPrefix(allAccounts, ['3'])
    const nonCurrentLiabilityAccounts = groupAccountsByPrefix(allAccounts, ['4'])

    const totalCurrentLiabilities = r4(currentLiabilityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalNonCurrentLiabilities = r4(nonCurrentLiabilityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalLiabilities = r4(totalCurrentLiabilities + totalNonCurrentLiabilities)

    // ---- Equity ----
    // Equity (5xxx)
    const equityAccounts = groupAccountsByPrefix(allAccounts, ['5'])
    const totalEquityAccounts = r4(equityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))

    // ---- Current Year Earnings (Net Income) ----
    // Revenue (6xxx) - Expenses (7xxx + 8xxx)
    const revenueAccounts = allAccounts.filter(a => a.code.startsWith('6'))
    const expenseAccounts = allAccounts.filter(a => a.code.startsWith('7') || a.code.startsWith('8'))
    const totalRevenue = r4(revenueAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalExpenses = r4(expenseAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const currentYearEarnings = r4(totalRevenue - totalExpenses)

    const totalEquity = r4(totalEquityAccounts + currentYearEarnings)
    const totalLiabilitiesAndEquity = r4(totalLiabilities + totalEquity)
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01

    return NextResponse.json({
      assets: {
        current: currentAssetAccounts,
        nonCurrent: nonCurrentAssetAccounts,
        totalCurrentAssets,
        totalNonCurrentAssets,
        total: totalAssets,
        label: 'الأصول',
        labelEn: 'Assets',
        currentLabel: 'أصول متداولة',
        currentLabelEn: 'Current Assets',
        nonCurrentLabel: 'أصول غير متداولة',
        nonCurrentLabelEn: 'Non-Current Assets',
      },
      liabilities: {
        current: currentLiabilityAccounts,
        nonCurrent: nonCurrentLiabilityAccounts,
        totalCurrentLiabilities,
        totalNonCurrentLiabilities,
        total: totalLiabilities,
        label: 'الالتزامات',
        labelEn: 'Liabilities',
        currentLabel: 'التزامات متداولة',
        currentLabelEn: 'Current Liabilities',
        nonCurrentLabel: 'التزامات غير متداولة',
        nonCurrentLabelEn: 'Non-Current Liabilities',
      },
      equity: {
        accounts: equityAccounts,
        totalEquityAccounts,
        currentYearEarnings,
        total: totalEquity,
        label: 'حقوق الملكية',
        labelEn: 'Equity',
        currentYearEarningsLabel: 'أرباح العام الحالي',
        currentYearEarningsLabelEn: 'Current Year Earnings',
      },
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanced,
      dateRange: {
        to: dateTo?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error generating balance sheet:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء الميزانية العمومية' },
      { status: 500 }
    )
  }
}
