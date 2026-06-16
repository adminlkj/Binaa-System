import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'

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

    // ===== 3. Resolve account codes by role (dynamic lookup) =====
    // Instead of hardcoded codes, resolve dynamically from account roles
    const [
      arAccounts, apAccounts,
      cashAccounts, bankAccounts, pettyCashAccounts,
      outputVatAccounts, inputVatAccounts, vatDueAccounts,
    ] = await Promise.all([
      getAccountsByRoles([AccountRole.CUSTOMER_AR]),
      getAccountsByRoles([AccountRole.SUPPLIER_AP]),
      getAccountsByRoles([AccountRole.CASH]),
      getAccountsByRoles([AccountRole.BANK]),
      getAccountsByRoles([AccountRole.CASH]),  // Petty cash is also CASH role
      getAccountsByRoles([AccountRole.VAT_OUTPUT]),
      getAccountsByRoles([AccountRole.VAT_INPUT]),
      getAccountsByRoles([AccountRole.VAT_DUE]),
    ])

    // Build code arrays from role-resolved accounts, with fallback defaults
    const arCodes = arAccounts.length > 0 ? arAccounts.map(a => a.code) : ['1210']
    const apCodes = apAccounts.length > 0 ? apAccounts.map(a => a.code) : ['3210']
    const cashCodes = cashAccounts.length > 0 ? cashAccounts.map(a => a.code) : ['1110']
    const bankCodes = bankAccounts.length > 0 ? bankAccounts.map(a => a.code) : ['1120']
    const pettyCashCodes = pettyCashAccounts.length > 0 ? pettyCashAccounts.map(a => a.code) : ['1130']
    const outputVatCodes = outputVatAccounts.length > 0 ? outputVatAccounts.map(a => a.code) : ['3110']
    const inputVatCodes = inputVatAccounts.length > 0 ? inputVatAccounts.map(a => a.code) : ['3120']
    const vatDueCodes = vatDueAccounts.length > 0 ? vatDueAccounts.map(a => a.code) : ['3130']

    // Helper: get balance by account codes (using pre-fetched data)
    const getBalanceByCodes = (codes: string[]): number => {
      let total = 0
      for (const code of codes) {
        const account = accounts.find(a => a.code === code)
        if (account) total += getBalanceFromMap(account.id, account.type)
      }
      return total
    }

    // ===== 4. Compute balances for all accounts (no N+1 queries) =====
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

    // Specific account balances (from role-resolved codes, using pre-fetched data)
    const arBalance = getBalanceByCodes(arCodes)
    const apBalance = getBalanceByCodes(apCodes)
    const cashTreasury = getBalanceByCodes(cashCodes)
    const cashBank = getBalanceByCodes(bankCodes)
    const cashPetty = getBalanceByCodes(pettyCashCodes)
    const cashBalance = cashTreasury + cashBank + cashPetty

    // VAT balances (from role-resolved codes, using pre-fetched data)
    const outputVat = getBalanceByCodes(outputVatCodes)
    const inputVat = getBalanceByCodes(inputVatCodes)
    const vatDue = getBalanceByCodes(vatDueCodes)
    const vatNet = outputVat - inputVat  // Net VAT position (positive = owed to tax authority)

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
