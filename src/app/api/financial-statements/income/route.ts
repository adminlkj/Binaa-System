import { NextResponse } from 'next/server'
import { getAccountBalancesByType, getIncomeStatement } from '@/lib/accounting/queries'
import type { AccountBalance } from '@/lib/accounting/queries'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// Filter an AccountBalance list by code prefix — preserves the legacy
// "group by 2-digit prefix" response shape.
function filterByPrefix(
  accounts: AccountBalance[],
  prefix: string
): { code: string; name: string; nameAr: string | null; balance: number }[] {
  return accounts
    .filter(a => a.code.startsWith(prefix))
    .map(a => ({
      code: a.code,
      name: a.name,
      nameAr: a.nameAr,
      balance: r4(a.balance),
    }))
}

function sumBalances(accounts: { balance: number }[]): number {
  return r4(accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0))
}

// GET /api/financial-statements/income?dateFrom=...&dateTo=...
//
// BA-02 Task 1: تم توحيد مصدر الأرصدة عبر queries.getAccountBalancesByType.
// هذا الـ endpoint الآن يستخدم نفس مصدر البيانات الذي يستخدمه
// /api/reports/income-statement و /api/trial-balance — لا ازدواجية.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined
    const range = (dateFrom || dateTo) ? { from: dateFrom, to: dateTo } : undefined

    // Single source of truth: fetch all revenue and expense balances ONCE
    const [revenueAccounts, expenseAccounts, incomeStatement] = await Promise.all([
      getAccountBalancesByType(['REVENUE'], range),
      getAccountBalancesByType(['EXPENSE'], range),
      getIncomeStatement(range),
    ])

    // ---- Revenue Section (2-digit prefix grouping on top of unified balances) ----
    const constructionRevenue = filterByPrefix(revenueAccounts, '61')
    const rentalRevenue = filterByPrefix(revenueAccounts, '62')
    const otherRevenue = filterByPrefix(revenueAccounts, '63')

    const totalConstructionRevenue = sumBalances(constructionRevenue)
    const totalRentalRevenue = sumBalances(rentalRevenue)
    const totalOtherRevenue = sumBalances(otherRevenue)
    const totalRevenue = r4(totalConstructionRevenue + totalRentalRevenue + totalOtherRevenue)

    // ---- Direct Costs Section ----
    const contractCosts = filterByPrefix(expenseAccounts, '71')
    const equipmentCosts = filterByPrefix(expenseAccounts, '72')
    const projectExpenses = filterByPrefix(expenseAccounts, '75')

    const totalContractCosts = sumBalances(contractCosts)
    const totalEquipmentCosts = sumBalances(equipmentCosts)
    const totalProjectExpenses = sumBalances(projectExpenses)
    const totalDirectCosts = r4(totalContractCosts + totalEquipmentCosts + totalProjectExpenses)

    // ---- Gross Profit ----
    const grossProfit = r4(totalRevenue - totalDirectCosts)

    // ---- Indirect Costs Section ----
    const administrativeCosts = filterByPrefix(expenseAccounts, '81')
    const hrCosts = filterByPrefix(expenseAccounts, '82')
    const depreciationCosts = filterByPrefix(expenseAccounts, '83')
    const financialCosts = filterByPrefix(expenseAccounts, '84')
    const taxCosts = filterByPrefix(expenseAccounts, '85')
    const otherCosts = filterByPrefix(expenseAccounts, '86')

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

    // ---- Net Profit (cross-check against unified income statement) ----
    const netProfit = r4(grossProfit - totalIndirectCosts)
    // Sanity check: netProfit should match incomeStatement.netIncome
    // (if it doesn't, there's a discrepancy in prefix grouping vs. canonical totals)
    const canonicalNetIncome = r4(incomeStatement.netIncome)
    const netProfitDiff = Math.abs(netProfit - canonicalNetIncome)
    if (netProfitDiff > 0.01) {
      console.warn(
        `[financial-statements/income] WARNING: netProfit (${netProfit}) ≠ canonical netIncome (${canonicalNetIncome}), diff=${netProfitDiff}. ` +
        `This indicates the 2-digit prefix grouping excludes some accounts. ` +
        `Prefer /api/reports/income-statement for canonical totals.`
      )
    }

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
      // Canonical cross-check totals (BA-02 Task 2: numerical consistency)
      canonicalNetIncome,
      canonicalGrossProfit: r4(incomeStatement.grossProfit),
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
      source: 'posted-journal-entries',
    })
  } catch (error) {
    console.error('Error generating income statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء قائمة الدخل' },
      { status: 500 }
    )
  }
}
