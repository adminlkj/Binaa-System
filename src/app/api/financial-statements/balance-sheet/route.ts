import { NextResponse } from 'next/server'
import { getAccountBalancesByType, getBalanceSheet } from '@/lib/accounting/queries'
import type { AccountBalance } from '@/lib/accounting/queries'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Group accounts by code prefix — preserves the legacy hierarchy response shape.
function groupAccountsByPrefix(
  accounts: AccountBalance[],
  prefixes: string[]
): { code: string; name: string; nameAr: string | null; balance: number }[] {
  const result: { code: string; name: string; nameAr: string | null; balance: number }[] = []
  for (const prefix of prefixes) {
    for (const a of accounts) {
      if (a.code.startsWith(prefix)) {
        result.push({
          code: a.code,
          name: a.name,
          nameAr: a.nameAr,
          balance: r4(a.balance),
        })
      }
    }
  }
  return result
}

// GET /api/financial-statements/balance-sheet?dateTo=...
//
// BA-02 Task 1: تم توحيد مصدر الأرصدة عبر queries.getAccountBalancesByType.
// هذا الـ endpoint الآن يستخدم نفس مصدر البيانات الذي يستخدمه
// /api/reports/balance-sheet و /api/trial-balance — لا ازدواجية.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateToStr = searchParams.get('dateTo')
    const dateTo = dateToStr ? new Date(dateToStr) : undefined
    const range = dateTo ? { to: dateTo } : undefined

    // Single source of truth: get all account balances from posted JEs
    const [allAssets, allLiabilities, allEquity, balanceSheet] = await Promise.all([
      getAccountBalancesByType(['ASSET'], range),
      getAccountBalancesByType(['LIABILITY'], range),
      getAccountBalancesByType(['EQUITY'], range),
      getBalanceSheet(dateTo),
    ])

    // ---- Assets ----
    // Current Assets (1xxx), Non-Current Assets (2xxx)
    const currentAssetAccounts = groupAccountsByPrefix(allAssets, ['1'])
    const nonCurrentAssetAccounts = groupAccountsByPrefix(allAssets, ['2'])

    const totalCurrentAssets = r4(currentAssetAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalNonCurrentAssets = r4(nonCurrentAssetAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalAssets = r4(totalCurrentAssets + totalNonCurrentAssets)

    // ---- Liabilities ----
    // Current Liabilities (3xxx), Non-Current Liabilities (4xxx)
    const currentLiabilityAccounts = groupAccountsByPrefix(allLiabilities, ['3'])
    const nonCurrentLiabilityAccounts = groupAccountsByPrefix(allLiabilities, ['4'])

    const totalCurrentLiabilities = r4(currentLiabilityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalNonCurrentLiabilities = r4(nonCurrentLiabilityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const totalLiabilities = r4(totalCurrentLiabilities + totalNonCurrentLiabilities)

    // ---- Equity ----
    // Equity (5xxx) + Current Year Earnings (unclosed P&L)
    const equityAccounts = groupAccountsByPrefix(allEquity, ['5'])
    const totalEquityAccounts = r4(equityAccounts.reduce((s, a) => s + Number(a.balance || 0), 0))
    const currentYearEarnings = r4(balanceSheet.currentYearEarnings)

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
      source: 'posted-journal-entries',
    })
  } catch (error) {
    console.error('Error generating balance sheet:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء الميزانية العمومية' },
      { status: 500 }
    )
  }
}
