import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'income-statement'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    switch (type) {
      case 'income-statement':
        return await getIncomeStatement(dateFrom, dateTo)
      case 'balance-sheet':
        return await getBalanceSheet(dateTo)
      case 'cash-flow':
        return await getCashFlow(dateFrom, dateTo)
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error generating financial report:', error)
    return NextResponse.json({ error: 'Failed to generate financial report' }, { status: 500 })
  }
}

// ============ INCOME STATEMENT ============

async function getIncomeStatement(dateFrom: string | null, dateTo: string | null) {
  // Build date filter for journal entries
  const dateFilter: Record<string, Date> = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo) dateFilter.lte = new Date(dateTo)

  const entryWhere: Record<string, unknown> = { status: 'POSTED', deletedAt: null }
  if (dateFrom || dateTo) entryWhere.date = dateFilter

  // Get all posted journal lines within date range
  const lines = await db.journalLine.findMany({
    where: {
      deletedAt: null,
      journalEntry: entryWhere,
    },
    include: {
      account: { select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true } },
    },
  })

  // Revenue: accounts where type='REVENUE'
  const revenueLines = lines.filter((l) => l.account.type === 'REVENUE')
  const revenues: Record<string, number> = {}
  let totalRevenue = 0

  for (const line of revenueLines) {
    // Revenue: credit normal balance, so credits - debits
    const amount = toNumber(line.credit) - toNumber(line.debit)
    if (amount === 0) continue

    // Sub-categorize by account name
    const subCategory = line.account.name
    if (!revenues[subCategory]) revenues[subCategory] = 0
    revenues[subCategory] += amount
    totalRevenue += amount
  }

  // Resolve account roles for cost categorization
  const [projectCostAccounts, rentalDepAccounts] = await Promise.all([
    getAccountsByRoles([AccountRole.PROJECT_COST, AccountRole.SUBCONTRACTOR_COST]),
    getAccountsByRoles([AccountRole.RENTAL_DEPRECIATION, AccountRole.FUEL_EXPENSE, AccountRole.MAINTENANCE_EXPENSE, AccountRole.DRIVER_EXPENSE, AccountRole.TRANSPORT_EXPENSE]),
  ])

  const projectCostCodes = new Set(projectCostAccounts.map(a => a.code))
  const rentalCostCodes = new Set(rentalDepAccounts.map(a => a.code))

  // Project Costs: accounts with project cost roles or starting with '71'
  const projectCostLines = lines.filter((l) =>
    projectCostCodes.has(l.account.code) || l.account.code.startsWith('71')
  )
  const projectCosts: Record<string, number> = {}
  let totalProjectCosts = 0

  for (const line of projectCostLines) {
    // Expense: debit normal balance, so debits - credits
    const amount = toNumber(line.debit) - toNumber(line.credit)
    if (amount === 0) continue

    const subCategory = line.account.name
    if (!projectCosts[subCategory]) projectCosts[subCategory] = 0
    projectCosts[subCategory] += amount
    totalProjectCosts += amount
  }

  // Rental Costs: accounts with rental cost roles or starting with '72'
  const rentalCostLines = lines.filter((l) =>
    rentalCostCodes.has(l.account.code) || l.account.code.startsWith('72')
  )
  const rentalCosts: Record<string, number> = {}
  let totalRentalCosts = 0

  for (const line of rentalCostLines) {
    const amount = toNumber(line.debit) - toNumber(line.credit)
    if (amount === 0) continue

    const subCategory = line.account.name
    if (!rentalCosts[subCategory]) rentalCosts[subCategory] = 0
    rentalCosts[subCategory] += amount
    totalRentalCosts += amount
  }

  const grossProfit = totalRevenue - (totalProjectCosts + totalRentalCosts)

  // Operating Expenses: accounts starting with '8' or with admin/expense roles
  const adminExpenseRoles = [
    AccountRole.PAYROLL_EXPENSE, AccountRole.GOSI_EXPENSE,
    AccountRole.ADMIN_EXPENSE, AccountRole.DEPRECIATION_EXPENSE,
    AccountRole.ZAKAT_EXPENSE,
  ]
  const adminExpenseAccounts = await getAccountsByRoles(adminExpenseRoles)
  const adminExpenseCodes = new Set(adminExpenseAccounts.map(a => a.code))

  const opexLines = lines.filter((l) =>
    adminExpenseCodes.has(l.account.code) || l.account.code.startsWith('8')
  )
  const operatingExpenses: Record<string, number> = {}
  let totalOperatingExpenses = 0

  for (const line of opexLines) {
    const amount = toNumber(line.debit) - toNumber(line.credit)
    if (amount === 0) continue

    const code = line.account.code
    const role = line.account.accountRole
    let category: string

    if (role === 'PAYROLL_EXPENSE' || code.startsWith('811') || code.startsWith('812') || code.startsWith('813')) {
      category = 'Salaries'
    } else if (role === 'GOSI_EXPENSE' || code.startsWith('821')) {
      category = 'GOSI'
    } else if (role === 'DEPRECIATION_EXPENSE' || code.startsWith('831') || code.startsWith('832') || code.startsWith('833') || code.startsWith('834')) {
      category = 'Depreciation'
    } else if (role === 'ZAKAT_EXPENSE' || code.startsWith('85') || code.startsWith('86')) {
      category = 'Other Admin'
    } else {
      category = line.account.name
    }

    if (!operatingExpenses[category]) operatingExpenses[category] = 0
    operatingExpenses[category] += amount
    totalOperatingExpenses += amount
  }

  const netProfit = grossProfit - totalOperatingExpenses

  return NextResponse.json(serializeDecimal({
    revenues,
    projectCosts,
    rentalCosts,
    operatingExpenses,
    totalRevenue,
    totalProjectCosts,
    totalRentalCosts,
    grossProfit,
    totalOperatingExpenses,
    netProfit,
  }))
}

// ============ BALANCE SHEET ============

async function getBalanceSheet(dateTo: string | null) {
  const entryWhere: Record<string, unknown> = { status: 'POSTED', deletedAt: null }
  if (dateTo) entryWhere.date = { lte: new Date(dateTo) }

  const lines = await db.journalLine.findMany({
    where: {
      deletedAt: null,
      journalEntry: entryWhere,
    },
    include: {
      account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
    },
  })

  // Calculate account balances
  const accountBalances: Record<string, { name: string; code: string; type: string; balance: number }> = {}

  for (const line of lines) {
    const accId = line.account.id
    if (!accountBalances[accId]) {
      accountBalances[accId] = {
        name: line.account.name,
        code: line.account.code,
        type: line.account.type,
        balance: 0,
      }
    }

    // Normal balance: ASSET/EXPENSE = DEBIT, LIABILITY/EQUITY/REVENUE = CREDIT
    const isDebitNormal = line.account.type === 'ASSET' || line.account.type === 'EXPENSE'
    const debit = toNumber(line.debit)
    const credit = toNumber(line.credit)
    if (isDebitNormal) {
      accountBalances[accId].balance += debit - credit
    } else {
      accountBalances[accId].balance += credit - debit
    }
  }

  // Group accounts
  const currentAssets: Record<string, number> = {}
  let totalCurrentAssets = 0
  const nonCurrentAssets: Record<string, number> = {}
  let totalNonCurrentAssets = 0
  const currentLiabilities: Record<string, number> = {}
  let totalCurrentLiabilities = 0
  const nonCurrentLiabilities: Record<string, number> = {}
  let totalNonCurrentLiabilities = 0
  const equity: Record<string, number> = {}
  let totalEquity = 0

  for (const acc of Object.values(accountBalances)) {
    if (acc.balance === 0) continue
    const code = acc.code

    // Current Assets: 1xxx excluding 2xxx
    if (code.startsWith('1')) {
      currentAssets[acc.name] = (currentAssets[acc.name] || 0) + acc.balance
      totalCurrentAssets += acc.balance
    }
    // Non-Current Assets: 2xxx
    else if (code.startsWith('2')) {
      nonCurrentAssets[acc.name] = (nonCurrentAssets[acc.name] || 0) + acc.balance
      totalNonCurrentAssets += acc.balance
    }
    // Current Liabilities: 3xxx excluding 37xx
    else if (code.startsWith('3') && !code.startsWith('37')) {
      currentLiabilities[acc.name] = (currentLiabilities[acc.name] || 0) + acc.balance
      totalCurrentLiabilities += acc.balance
    }
    // Non-Current Liabilities: 37xx + 4xxx
    else if (code.startsWith('37') || code.startsWith('4')) {
      nonCurrentLiabilities[acc.name] = (nonCurrentLiabilities[acc.name] || 0) + acc.balance
      totalNonCurrentLiabilities += acc.balance
    }
    // Equity: 5xxx
    else if (code.startsWith('5')) {
      equity[acc.name] = (equity[acc.name] || 0) + acc.balance
      totalEquity += acc.balance
    }
  }

  // Calculate current year profit for equity
  const revenueAccounts = Object.values(accountBalances).filter((a) => a.type === 'REVENUE')
  const expenseAccounts = Object.values(accountBalances).filter((a) => a.type === 'EXPENSE')
  const totalRev = revenueAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const totalExp = expenseAccounts.reduce((s, a) => s + Number(a.balance || 0), 0)
  const currentYearProfit = totalRev - totalExp

  // Add current year profit to equity
  if (currentYearProfit !== 0) {
    equity['Current Year Profit'] = currentYearProfit
    totalEquity += currentYearProfit
  }

  const totalAssets = totalCurrentAssets + totalNonCurrentAssets
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities

  return NextResponse.json(serializeDecimal({
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    equity,
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalEquity,
    totalAssets,
    totalLiabilities,
    verification: {
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      difference: totalAssets - (totalLiabilities + totalEquity),
    },
    currentYearProfit,
  }))
}

// ============ CASH FLOW (INDIRECT METHOD) ============

async function getCashFlow(dateFrom: string | null, dateTo: string | null) {
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required for cash flow' }, { status: 400 })
  }

  const fromDate = new Date(dateFrom)
  const toDate = new Date(dateTo)

  // Resolve account roles for depreciation and cash
  const [depreciationAccounts, cashAccounts] = await Promise.all([
    getAccountsByRoles([AccountRole.DEPRECIATION_EXPENSE, AccountRole.RENTAL_DEPRECIATION]),
    getAccountsByRoles([AccountRole.CASH, AccountRole.BANK]),
  ])

  const depreciationCodes = depreciationAccounts.length > 0
    ? depreciationAccounts.map(a => a.code)
    : ['8310', '8320', '8330', '8340', '7250']

  const cashCodes = cashAccounts.length > 0
    ? cashAccounts.map(a => a.code)
    : ['1110', '1120', '1130']

  // Net Profit for the period
  const periodLines = await db.journalLine.findMany({
    where: {
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        date: { gte: fromDate, lte: toDate },
      },
    },
    include: {
      account: { select: { id: true, code: true, name: true, type: true, accountRole: true } },
    },
  })

  const revenueLines = periodLines.filter((l) => l.account.type === 'REVENUE')
  const expenseLines = periodLines.filter((l) => l.account.type === 'EXPENSE')
  const totalPeriodRevenue = revenueLines.reduce((s, l) => s + toNumber(l.credit) - toNumber(l.debit), 0)
  const totalPeriodExpense = expenseLines.reduce((s, l) => s + toNumber(l.debit) - toNumber(l.credit), 0)
  const netProfit = totalPeriodRevenue - totalPeriodExpense

  // Add back non-cash items: Depreciation (role-based codes)
  const depreciationLines = periodLines.filter((l) =>
    depreciationCodes.some((c) => l.account.code.startsWith(c)) ||
    l.account.accountRole === 'DEPRECIATION_EXPENSE' ||
    l.account.accountRole === 'RENTAL_DEPRECIATION'
  )
  const depreciation = depreciationLines.reduce((s, l) => s + toNumber(l.debit) - toNumber(l.credit), 0)

  // Provisions change (37xx)
  const provisionLines = periodLines.filter((l) => l.account.code.startsWith('37'))
  const provisionsChange = provisionLines.reduce((s, l) => s + toNumber(l.credit) - toNumber(l.debit), 0)

  // Working capital changes - compare balances at start vs end of period
  const beforePeriodLines = await db.journalLine.findMany({
    where: {
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        date: { lt: fromDate },
      },
    },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  })

  // Calculate receivables at start and end
  const calcBalanceForCodePrefix = (
    allLines: typeof beforePeriodLines,
    prefix: string,
    isDebitNormal: boolean
  ) => {
    const filtered = allLines.filter((l) => l.account.code.startsWith(prefix))
    return filtered.reduce((s, l) => {
      return s + (isDebitNormal ? toNumber(l.debit) - toNumber(l.credit) : toNumber(l.credit) - toNumber(l.debit))
    }, 0)
  }

  const receivablesAtStart = calcBalanceForCodePrefix(beforePeriodLines, '12', true)
  const receivablesAtEnd = calcBalanceForCodePrefix(periodLines, '12', true) + receivablesAtStart
  const changeInReceivables = receivablesAtEnd - receivablesAtStart

  const payablesAtStart = calcBalanceForCodePrefix(beforePeriodLines, '32', false)
  const payablesAtEnd = calcBalanceForCodePrefix(periodLines, '32', false) + payablesAtStart
  const changeInPayables = payablesAtEnd - payablesAtStart

  const inventoryAtStart = calcBalanceForCodePrefix(beforePeriodLines, '13', true)
  const inventoryAtEnd = calcBalanceForCodePrefix(periodLines, '13', true) + inventoryAtStart
  const changeInInventory = inventoryAtEnd - inventoryAtStart

  const operatingCashFlow =
    netProfit +
    depreciation +
    provisionsChange -
    changeInReceivables +
    changeInPayables -
    changeInInventory

  // Investing activities: Asset purchases (2xxx debit increases), Asset sales
  const investingLines = periodLines.filter((l) => l.account.code.startsWith('2'))
  const assetPurchases = investingLines.filter((l) => toNumber(l.debit) > 0 && l.account.code.startsWith('21')).reduce((s, l) => s + toNumber(l.debit), 0)
  const assetSales = investingLines.filter((l) => toNumber(l.credit) > 0 && l.account.code.startsWith('21')).reduce((s, l) => s + toNumber(l.credit), 0)
  const investingCashFlow = -assetPurchases + assetSales

  // Financing: Capital changes (5xxx), Loan changes (39xx, 41xx)
  const capitalLines = periodLines.filter((l) => l.account.code.startsWith('5'))
  const capitalChange = capitalLines.reduce((s, l) => s + toNumber(l.credit) - toNumber(l.debit), 0)
  const loanLines = periodLines.filter((l) => l.account.code.startsWith('39') || l.account.code.startsWith('41'))
  const loanChange = loanLines.reduce((s, l) => s + toNumber(l.credit) - toNumber(l.debit), 0)
  const financingCashFlow = capitalChange + loanChange

  const netChange = operatingCashFlow + investingCashFlow + financingCashFlow

  // Opening and closing cash balances (role-based cash codes)
  const openingCash = beforePeriodLines
    .filter((l) => cashCodes.some((c) => l.account.code.startsWith(c)))
    .reduce((s, l) => s + toNumber(l.debit) - toNumber(l.credit), 0)
  const closingCash = openingCash + netChange

  return NextResponse.json(serializeDecimal({
    netProfit,
    adjustments: {
      depreciation,
      provisionsChange,
      changeInReceivables,
      changeInPayables,
      changeInInventory,
    },
    operatingCashFlow,
    investingActivities: {
      assetPurchases: -assetPurchases,
      assetSales,
    },
    investingCashFlow,
    financingActivities: {
      capitalChange,
      loanChange,
    },
    financingCashFlow,
    netChange,
    openingCash,
    closingCash,
  }))
}
