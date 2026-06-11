import { NextResponse } from 'next/server'
import { getAccountBalance, NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Fetch all active accounts
    const accounts = await db.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
      orderBy: { code: 'asc' },
    })

    // Group accounts by type and compute totals
    const accountsByType: Record<string, { code: string; name: string; nameAr: string | null; balance: number }[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      REVENUE: [],
      EXPENSE: [],
    }

    // Calculate balance for each account
    const balancePromises = accounts.map(async (account) => {
      const balance = await getAccountBalance(account.code)
      return { ...account, balance }
    })

    const accountsWithBalances = await Promise.all(balancePromises)

    // Group by type
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

    // Specific account balances
    const arBalance = await getAccountBalance('1210')   // Clients Receivable
    const apBalance = await getAccountBalance('3210')   // Suppliers Payable (موردون)
    const cashTreasury = await getAccountBalance('1110') // Cash - Treasury
    const cashBank = await getAccountBalance('1120')     // Bank Accounts
    const cashPetty = await getAccountBalance('1130')    // Petty Cash
    const cashBalance = cashTreasury + cashBank + cashPetty

    // VAT balances
    const outputVat = await getAccountBalance('3110')  // Output VAT (ضريبة مخرجات)
    const inputVat = await getAccountBalance('3120')    // Input VAT (ضريبة مدخلات)
    const vatDue = await getAccountBalance('3130')      // VAT Due (ضريبة مستحقة)
    const vatNet = outputVat - inputVat                // Net VAT position (positive = owed to tax authority)

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
