import { NextResponse } from 'next/server'
import { getAccountBalancesByType, getCashFlow, getIncomeStatement } from '@/lib/accounting/queries'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import type { AccountBalance } from '@/lib/accounting/queries'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Compute the signed balance change of a group of accounts between two points
 * in time, using the unified query layer (Single Source of Truth).
 *
 *   change = Σ balance(as of dateTo) − Σ balance(as of dateFrom exclusive)
 *
 * Each account's balance = signForType(type) * (debit − credit).
 */
async function getBalanceChangeForAccounts(
  accounts: AccountBalance[],
  dateFrom: Date | undefined,
  dateTo: Date | undefined
): Promise<number> {
  if (accounts.length === 0) return 0
  const accountIds = accounts.map(a => a.accountId)

  // End-of-period balance (dateTo inclusive)
  const endRange = dateTo ? { to: dateTo } : undefined
  const endAgg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      deletedAt: null,
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        ...(endRange?.to && { date: { lte: endRange.to } }),
      },
    },
  })
  // Beginning-of-period balance (before dateFrom)
  const beginAgg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      deletedAt: null,
      accountId: { in: accountIds },
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        ...(dateFrom && { date: { lt: dateFrom } }),
      },
    },
  })

  // Compute signed balances respecting each account's normal balance side.
  // Since accounts within a prefix group share the same type (e.g., all 1xxx are ASSET,
  // all 3xxx are LIABILITY), we use a single sign for the whole aggregate.
  // ASSET/EXPENSE → debit-positive (+1); LIABILITY/EQUITY/REVENUE → credit-positive (-1).
  const sign = accounts[0].type === 'ASSET' || accounts[0].type === 'EXPENSE' ? 1 : -1
  const endBalance = sign * (toNumber(endAgg._sum.debit) - toNumber(endAgg._sum.credit))
  const beginBalance = sign * (toNumber(beginAgg._sum.debit) - toNumber(beginAgg._sum.credit))

  return r4(endBalance - beginBalance)
}

// GET /api/financial-statements/cash-flow?dateFrom=...&dateTo=...
//
// BA-02 Task 1: تم توحيد مصدر الأرصلة عبر queries.getAccountBalancesByType.
// هذا الـ endpoint الآن يستخدم نفس مصدر البيانات الذي يستخدمه
// /api/reports/cash-flow-statement و /api/trial-balance — لا ازدواجية.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined
    const range = (dateFrom || dateTo) ? { from: dateFrom, to: dateTo } : undefined

    // ---- Cash & Bank balances (beginning / ending) — Single Source of Truth ----
    // Use the unified cash flow report which already computes opening/closing
    // balances, inflows/outflows per account, and monthly breakdown.
    const cashFlow = await getCashFlow(range)
    const beginningCash = r4(cashFlow.openingBalance)
    const endingCash = r4(cashFlow.closingBalance)
    const netCashChange = r4(cashFlow.netCashFlow)

    // ---- Operating Activities (indirect method) ----
    // Net Income from unified income statement
    const incomeStatement = await getIncomeStatement(range)
    const netIncome = r4(incomeStatement.netIncome)

    // Non-cash items: Depreciation (role-based)
    const depreciationAccounts = await getAccountsByRoles([AccountRole.DEPRECIATION_EXPENSE, AccountRole.RENTAL_DEPRECIATION])
    let depreciationChange = 0
    if (depreciationAccounts.length > 0) {
      const depBalances = await getAccountBalancesByType(['EXPENSE'], range)
      const depIds = new Set(depreciationAccounts.map(a => a.id))
      depreciationChange = r4(
        depBalances.filter(a => depIds.has(a.accountId)).reduce((s, a) => s + a.balance, 0)
      )
    }

    // Changes in working capital — use unified balance layer
    const [allAssets, allLiabilities] = await Promise.all([
      getAccountBalancesByType(['ASSET'], range),
      getAccountBalancesByType(['LIABILITY'], range),
    ])

    const receivablesAccounts = allAssets.filter(a => a.code.startsWith('12'))
    const inventoryAccounts = allAssets.filter(a => a.code.startsWith('13'))
    const prepaymentsAccounts = allAssets.filter(a => a.code.startsWith('14'))

    const receivablesChange = await getBalanceChangeForAccounts(receivablesAccounts, dateFrom, dateTo)
    const inventoryChange = await getBalanceChangeForAccounts(inventoryAccounts, dateFrom, dateTo)
    const prepaymentsChange = await getBalanceChangeForAccounts(prepaymentsAccounts, dateFrom, dateTo)

    // Accruals (current liabilities 31xx-39xx)
    const accrualsAccounts = allLiabilities.filter(a =>
      a.code.startsWith('31') || a.code.startsWith('32') || a.code.startsWith('33') ||
      a.code.startsWith('34') || a.code.startsWith('35') || a.code.startsWith('36') ||
      a.code.startsWith('37') || a.code.startsWith('38') || a.code.startsWith('39')
    )
    const accrualsChange = await getBalanceChangeForAccounts(accrualsAccounts, dateFrom, dateTo)

    const operatingAdjustments = r4(
      -receivablesChange +
      -inventoryChange +
      -prepaymentsChange +
      accrualsChange
    )

    const netCashFromOperating = r4(netIncome + depreciationChange + operatingAdjustments)

    // ---- Investing Activities ----
    // Non-current assets (2xxx) balance change
    const nonCurrentAssetAccounts = allAssets.filter(a => a.code.startsWith('2'))
    const fixedAssetsChange = await getBalanceChangeForAccounts(nonCurrentAssetAccounts, dateFrom, dateTo)
    const netCashFromInvesting = r4(-fixedAssetsChange)

    // ---- Financing Activities ----
    // Non-current liabilities (4xxx) + Equity (5xxx) balance changes
    const nonCurrentLiabilityAccounts = allLiabilities.filter(a => a.code.startsWith('4'))
    const equityAccounts = await getAccountBalancesByType(['EQUITY'], range)
    const longTermLiabilitiesChange = await getBalanceChangeForAccounts(nonCurrentLiabilityAccounts, dateFrom, dateTo)
    const equityChange = await getBalanceChangeForAccounts(equityAccounts, dateFrom, dateTo)
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
      // Canonical cross-check from unified cash flow report
      canonicalInflows: r4(cashFlow.inflows),
      canonicalOutflows: r4(cashFlow.outflows),
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
      source: 'posted-journal-entries',
    })
  } catch (error) {
    console.error('Error generating cash flow statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء قائمة التدفقات النقدية' },
      { status: 500 }
    )
  }
}
