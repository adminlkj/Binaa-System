import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Helper: get account balances within a date range by code prefix
async function getAccountBalancesByPrefix(
  prefix: string,
  dateFrom: Date | undefined,
  dateTo: Date | undefined
): Promise<{ code: string; name: string; nameAr: string | null; balance: number }[]> {
  const dateFilter: { date?: { gte?: Date; lte?: Date } } = {}
  if (dateFrom || dateTo) {
    dateFilter.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    }
  }

  // Get all accounts with the given prefix
  const accounts = await db.account.findMany({
    where: {
      code: { startsWith: prefix },
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      type: true,
    },
    orderBy: { code: 'asc' },
  })

  if (accounts.length === 0) return []

  const accountIds = accounts.map(a => a.id)

  // Aggregate journal lines for these accounts
  const lines = await db.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
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

  // Calculate balance per account
  return accounts.map(account => {
    const bal = balanceMap.get(account.id) || { totalDebit: 0, totalCredit: 0 }
    const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'
    const balance = normalBalance === 'DEBIT'
      ? bal.totalDebit - bal.totalCredit
      : bal.totalCredit - bal.totalDebit
    return {
      code: account.code,
      name: account.name,
      nameAr: account.nameAr,
      balance: r4(balance),
    }
  })
}

// Helper: sum balances from an array of account details
function sumBalances(accounts: { balance: number }[]): number {
  return r4(accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0))
}

// GET /api/financial-statements/income?dateFrom=...&dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    // ---- Revenue Section ----
    // Use 2-digit prefixes to match all child accounts (6100-series → '61', etc.)
    const constructionRevenue = await getAccountBalancesByPrefix('61', dateFrom, dateTo)
    const rentalRevenue = await getAccountBalancesByPrefix('62', dateFrom, dateTo)
    const otherRevenue = await getAccountBalancesByPrefix('63', dateFrom, dateTo)

    const totalConstructionRevenue = sumBalances(constructionRevenue)
    const totalRentalRevenue = sumBalances(rentalRevenue)
    const totalOtherRevenue = sumBalances(otherRevenue)
    const totalRevenue = r4(totalConstructionRevenue + totalRentalRevenue + totalOtherRevenue)

    // ---- Direct Costs Section ----
    const contractCosts = await getAccountBalancesByPrefix('71', dateFrom, dateTo)
    const equipmentCosts = await getAccountBalancesByPrefix('72', dateFrom, dateTo)
    const projectExpenses = await getAccountBalancesByPrefix('75', dateFrom, dateTo)

    const totalContractCosts = sumBalances(contractCosts)
    const totalEquipmentCosts = sumBalances(equipmentCosts)
    const totalProjectExpenses = sumBalances(projectExpenses)
    const totalDirectCosts = r4(totalContractCosts + totalEquipmentCosts + totalProjectExpenses)

    // ---- Gross Profit ----
    const grossProfit = r4(totalRevenue - totalDirectCosts)

    // ---- Indirect Costs Section ----
    const administrativeCosts = await getAccountBalancesByPrefix('81', dateFrom, dateTo)
    const hrCosts = await getAccountBalancesByPrefix('82', dateFrom, dateTo)
    const depreciationCosts = await getAccountBalancesByPrefix('83', dateFrom, dateTo)
    const financialCosts = await getAccountBalancesByPrefix('84', dateFrom, dateTo)
    const taxCosts = await getAccountBalancesByPrefix('85', dateFrom, dateTo)
    const otherCosts = await getAccountBalancesByPrefix('86', dateFrom, dateTo)

    const totalAdministrativeCosts = sumBalances(administrativeCosts)
    const totalHrCosts = sumBalances(hrCosts)
    const totalDepreciationCosts = sumBalances(depreciationCosts)
    const totalFinancialCosts = sumBalances(financialCosts)
    const totalTaxCosts = sumBalances(taxCosts)
    const totalOtherCosts = sumBalances(otherCosts)
    const totalIndirectCosts = r4(
      totalAdministrativeCosts + totalHrCosts + totalDepreciationCosts +
      totalFinancialCosts + totalTaxCosts + totalOtherCosts
    )

    // ---- Net Profit ----
    const netProfit = r4(grossProfit - totalIndirectCosts)

    return NextResponse.json({
      revenue: {
        construction: {
          accounts: constructionRevenue,
          total: totalConstructionRevenue,
          label: 'إيرادات المشاريع الإنشائية',
          labelEn: 'Construction Revenue',
        },
        rental: {
          accounts: rentalRevenue,
          total: totalRentalRevenue,
          label: 'إيرادات التأجير',
          labelEn: 'Rental Revenue',
        },
        other: {
          accounts: otherRevenue,
          total: totalOtherRevenue,
          label: 'إيرادات أخرى',
          labelEn: 'Other Revenue',
        },
        total: totalRevenue,
        label: 'إجمالي الإيرادات',
        labelEn: 'Total Revenue',
      },
      directCosts: {
        contract: {
          accounts: contractCosts,
          total: totalContractCosts,
          label: 'تكاليف العقود',
          labelEn: 'Contract Costs',
        },
        equipment: {
          accounts: equipmentCosts,
          total: totalEquipmentCosts,
          label: 'تكاليف المعدات',
          labelEn: 'Equipment Costs',
        },
        other: {
          accounts: projectExpenses,
          total: totalProjectExpenses,
          label: 'مصروفات المشاريع',
          labelEn: 'Project Expenses',
        },
        total: totalDirectCosts,
        label: 'إجمالي التكاليف المباشرة',
        labelEn: 'Total Direct Costs',
      },
      grossProfit,
      grossProfitLabel: 'مجبح الربح',
      grossProfitLabelEn: 'Gross Profit',
      indirectCosts: {
        admin: {
          accounts: administrativeCosts,
          total: totalAdministrativeCosts,
          label: 'مصروفات إدارية',
          labelEn: 'Administrative Expenses',
        },
        hr: {
          accounts: hrCosts,
          total: totalHrCosts,
          label: 'مصروفات الموارد البشرية',
          labelEn: 'HR Expenses',
        },
        depreciation: {
          accounts: depreciationCosts,
          total: totalDepreciationCosts,
          label: 'الإهلاك',
          labelEn: 'Depreciation',
        },
        financial: {
          accounts: financialCosts,
          total: totalFinancialCosts,
          label: 'مصروفات مالية',
          labelEn: 'Financial Expenses',
        },
        tax: {
          accounts: taxCosts,
          total: totalTaxCosts,
          label: 'مصروفات ضريبية',
          labelEn: 'Tax Expenses',
        },
        other: {
          accounts: otherCosts,
          total: totalOtherCosts,
          label: 'مصروفات أخرى',
          labelEn: 'Other Expenses',
        },
        total: totalIndirectCosts,
        label: 'إجمالي التكاليف غير المباشرة',
        labelEn: 'Total Indirect Costs',
      },
      netProfit,
      netProfitLabel: 'صافي الربح',
      netProfitLabelEn: 'Net Profit',
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error generating income statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء قائمة الدخل' },
      { status: 500 }
    )
  }
}
