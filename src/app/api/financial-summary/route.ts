import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// Normal balance mapping by account type
const NORMAL_BALANCE: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', EXPENSE: 'DEBIT',
}

export async function GET() {
  try {
    // ===== 1. Fetch all active accounts =====
    const accounts = await db.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
      orderBy: { code: 'asc' },
    })

    // ===== 2. Single aggregated query for all account balances =====
    // Instead of N+1 individual getAccountBalance() calls, we do ONE groupBy query
    const balanceAggregates = await db.journalLine.groupBy({
      by: ['accountId'],
      _sum: { debit: true, credit: true },
      where: {
        journalEntry: { status: 'POSTED' },
      },
    })

    // Build a lookup map: accountId -> { totalDebit, totalCredit }
    const balanceMap = new Map<string, { totalDebit: number; totalCredit: number }>()
    for (const agg of balanceAggregates) {
      balanceMap.set(agg.accountId, {
        totalDebit: toNumber(agg._sum.debit),
        totalCredit: toNumber(agg._sum.credit),
      })
    }

    // Helper: compute balance from the pre-fetched map
    const getBalanceFromMap = (accountId: string, accountType: string): number => {
      const agg = balanceMap.get(accountId)
      if (!agg) return 0
      const normalBalance = NORMAL_BALANCE[accountType] || 'DEBIT'
      return normalBalance === 'DEBIT'
        ? agg.totalDebit - agg.totalCredit
        : agg.totalCredit - agg.totalDebit
    }

    // Helper: get balance by account code
    const getBalanceByCode = (code: string): number => {
      const account = accounts.find(a => a.code === code)
      if (!account) return 0
      return getBalanceFromMap(account.id, account.type)
    }

    // ===== 3. Compute balances for all accounts (no N+1 queries) =====
    const accountsWithBalances = accounts.map(account => ({
      ...account,
      balance: getBalanceFromMap(account.id, account.type),
    }))

    // Group accounts by type
    const accountsByType: Record<string, { code: string; name: string; nameAr: string | null; balance: number }[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      REVENUE: [],
      EXPENSE: [],
    }

    for (const account of accountsWithBalances) {
      if (accountsByType[account.type]) {
        accountsByType[account.type].push({
          code: account.code,
          name: account.name,
          nameAr: account.nameAr,
          balance: account.balance,
        })
      }
    }

    // Sum totals by type
    const totalAssets = accountsByType.ASSET.reduce((sum, a) => sum + a.balance, 0)
    const totalLiabilities = accountsByType.LIABILITY.reduce((sum, a) => sum + a.balance, 0)
    const totalEquity = accountsByType.EQUITY.reduce((sum, a) => sum + a.balance, 0)
    const totalRevenue = accountsByType.REVENUE.reduce((sum, a) => sum + a.balance, 0)
    const totalExpenses = accountsByType.EXPENSE.reduce((sum, a) => sum + a.balance, 0)
    const netIncome = totalRevenue - totalExpenses

    // Specific account balances (from pre-fetched data, no additional queries)
    const arBalance = getBalanceByCode('1210')   // Clients Receivable
    const apBalance = getBalanceByCode('3210')   // Suppliers Payable (موردون)
    const cashTreasury = getBalanceByCode('1110') // Cash - Treasury
    const cashBank = getBalanceByCode('1120')     // Bank Accounts
    const cashPetty = getBalanceByCode('1130')    // Petty Cash
    const cashBalance = cashTreasury + cashBank + cashPetty

    // VAT balances (from pre-fetched data, no additional queries)
    const outputVat = getBalanceByCode('3110')  // Output VAT (ضريبة مخرجات)
    const inputVat = getBalanceByCode('3120')    // Input VAT (ضريبة مدخلات)
    const vatDue = getBalanceByCode('3130')      // VAT Due (ضريبة مستحقة)
    const vatNet = outputVat - inputVat          // Net VAT position (positive = owed to tax authority)

    // Key financial ratios
    const currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0
    const profitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0
    const returnOnAssets = totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0

    return NextResponse.json({
      // Major category totals
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,

      // Key balances
      arBalance,
      apBalance,
      cashBalance,
      cashBreakdown: {
        treasury: cashTreasury,
        bank: cashBank,
        pettyCash: cashPetty,
      },

      // VAT
      outputVat,
      inputVat,
      vatDue,
      vatNet,

      // Ratios
      ratios: {
        currentRatio: Math.round(currentRatio * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        returnOnAssets: Math.round(returnOnAssets * 100) / 100,
      },

      // Accounting equation check: Assets = Liabilities + Equity + Net Income
      accountingEquation: {
        assets: totalAssets,
        liabilitiesAndEquity: totalLiabilities + totalEquity + netIncome,
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01,
      },

      // Detailed breakdowns by type
      breakdown: accountsByType,
    })
  } catch (error) {
    console.error('Error fetching financial summary:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل الملخص المالي' },
      { status: 500 }
    )
  }
}
