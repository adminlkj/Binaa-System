// ============================================================================
// نظام بِنَاء ERP - طبقة الاستعلامات الموحّدة (Single Source of Truth)
// Binaa ERP - Unified Accounting Query Layer
// ============================================================================
//
// هذا الملف هو المصدر الوحيد لجميع قراءات التقارير المالية في النظام.
// أي تقرير مالي (ميزان مراجعة، أستاذ عام، ميزانية، قائمة دخل، تدفقات نقدية،
// تسوية ضريبية، تقارير المشاريع/مراكز التكلفة) MUST يقرأ من هنا.
//
// المصدر الحقيقي الوحيد للبيانات:
//   JournalLine WHERE journalEntry.status = 'POSTED' AND journalEntry.deletedAt IS NULL
//                       AND JournalLine.deletedAt IS NULL
//
// يضمن ذلك:
//   1. Single source of truth — لا ازدواجية بين الجداول التشغيلية ودفتر الأستاذ
//   2. ميزان المراجعة يطابق القوائم المالية دائماً
//   3. القيود العكسية تُلغى تلقائياً (net out)
//   4. الحفاظ على سلسلة التدقيق (audit trail)
//
// هندسة البيانات:
//   JournalEntry (POSTED) → JournalLine → aggregate by account
//                                              ↓
//                          ┌──────────────────┴──────────────────┐
//                          ↓                                      ↓
//                   Trial Balance                          Account Balances
//                          ↓                                      ↓
//                   General Ledger                          Statements
//                                                                 ↓
//                                                       Balance Sheet
//                                                       Income Statement
//                                                       Cash Flow
//
// أي تكرار لمنطق التجميع خارج هذا الملف = انتهاك لمبدأ Single Source of Truth.
// ============================================================================

import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { Prisma } from '@prisma/client'
import {
  signForType,
  type DateRange,
  type PrismaTransaction,
} from './constants'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the canonical where-clause for posted journal lines.
 * This is the ONLY place that defines "what counts as a posted line".
 */
function postedLinesWhere(extra: Prisma.JournalLineWhereInput = {}): Prisma.JournalLineWhereInput {
  return {
    deletedAt: null,
    journalEntry: {
      status: 'POSTED',
      deletedAt: null,
    },
    ...extra,
  }
}

/**
 * Apply a DateRange filter to the journalEntry side of a JournalLine where-clause.
 * Returns {} if no range is provided (meaning "all time").
 */
function dateRangeFilter(range?: DateRange): Prisma.JournalLineWhereInput {
  if (!range || (!range.from && !range.to)) return {}
  return {
    journalEntry: {
      status: 'POSTED',
      deletedAt: null,
      date: {
        ...(range.from && { gte: range.from }),
        ...(range.to && { lte: range.to }),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Account lookup (canonical — replaces engine.ts getAccountByCode)
// ---------------------------------------------------------------------------

/**
 * Lookup an account by its unique code. Returns null if not found.
 */
export async function getAccountByCode(code: string, tx?: PrismaTransaction) {
  const client = tx ?? db
  return client.account.findUnique({ where: { code } })
}

// ---------------------------------------------------------------------------
// Account-level balances
// ---------------------------------------------------------------------------

export interface AccountBalance {
  accountId: string
  code: string
  name: string
  nameAr: string | null
  type: string
  accountRole: string | null
  activityType: string | null
  totalDebit: number
  totalCredit: number
  /** Signed balance respecting normal balance: ASSET/EXPENSE = debit-credit, others = credit-debit */
  balance: number
}

/**
 * Get balances for all accounts of given types, sourced from posted JEs.
 * Returns signed balances (respecting normal balance).
 */
export async function getAccountBalancesByType(
  types: string[],
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<AccountBalance[]> {
  const client = tx ?? db
  const accounts = await client.account.findMany({
    where: { type: { in: types }, isActive: true },
    select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true, activityType: true },
    orderBy: { code: 'asc' },
  })
  if (accounts.length === 0) return []

  const accountIds = accounts.map(a => a.id)

  const aggregated = await client.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: postedLinesWhere({
      accountId: { in: accountIds },
      ...dateRangeFilter(range),
    }),
  })

  const sumMap = new Map<string, { debit: number; credit: number }>()
  for (const a of aggregated) {
    sumMap.set(a.accountId, {
      debit: toNumber(a._sum.debit),
      credit: toNumber(a._sum.credit),
    })
  }

  return accounts.map(a => {
    const sums = sumMap.get(a.id) || { debit: 0, credit: 0 }
    const sign = signForType(a.type)
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      nameAr: a.nameAr,
      type: a.type,
      accountRole: a.accountRole,
      activityType: a.activityType,
      totalDebit: sums.debit,
      totalCredit: sums.credit,
      balance: sign * (sums.debit - sums.credit),
    }
  })
}

/**
 * Get a single total balance for all accounts matching a role list.
 */
export async function getBalanceByRole(
  roles: string[],
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<number> {
  if (roles.length === 0) return 0
  const client = tx ?? db
  const accounts = await client.account.findMany({
    where: { accountRole: { in: roles }, isActive: true },
    select: { id: true, type: true },
  })
  if (accounts.length === 0) return 0
  const accountIds = accounts.map(a => a.id)

  const agg = await client.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: postedLinesWhere({
      accountId: { in: accountIds },
      ...dateRangeFilter(range),
    }),
  })

  const totalDebit = toNumber(agg._sum.debit)
  const totalCredit = toNumber(agg._sum.credit)
  // Use the type of the first account as representative (roles map to a single type normally)
  const type = accounts[0]?.type || 'EXPENSE'
  return signForType(type) * (totalDebit - totalCredit)
}

/**
 * Get a single total balance for all accounts of a type.
 */
export async function getBalanceByType(
  type: string,
  range?: DateRange,
  extra: { activityType?: string } = {},
  tx?: PrismaTransaction
): Promise<number> {
  const client = tx ?? db
  const where: Prisma.AccountWhereInput = { type, isActive: true }
  if (extra.activityType) {
    where.activityType = { in: [extra.activityType, 'BOTH'] }
  }
  const accounts = await client.account.findMany({
    where,
    select: { id: true },
  })
  if (accounts.length === 0) return 0
  const accountIds = accounts.map(a => a.id)

  const agg = await client.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: postedLinesWhere({
      accountId: { in: accountIds },
      ...dateRangeFilter(range),
    }),
  })

  const totalDebit = toNumber(agg._sum.debit)
  const totalCredit = toNumber(agg._sum.credit)
  return signForType(type) * (totalDebit - totalCredit)
}

/**
 * Get the signed balance for a single account by code.
 * Returns 0 if account not found.
 *
 * This is the canonical replacement for the legacy engine.ts getAccountBalance.
 */
export async function getAccountBalance(
  accountCode: string,
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<number> {
  const client = tx ?? db
  const account = await client.account.findUnique({
    where: { code: accountCode },
    select: { id: true, type: true },
  })
  if (!account) return 0

  const agg = await client.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: postedLinesWhere({
      accountId: account.id,
      ...dateRangeFilter(range),
    }),
  })

  const totalDebit = toNumber(agg._sum.debit)
  const totalCredit = toNumber(agg._sum.credit)
  return signForType(account.type) * (totalDebit - totalCredit)
}

// ---------------------------------------------------------------------------
// Trial Balance (ميزان المراجعة)
// ---------------------------------------------------------------------------

export interface TrialBalanceRow extends AccountBalance {
  /** Movement placed in debit column (>0 if debits exceed credits) */
  netDebit: number
  /** Movement placed in credit column (>0 if credits exceed debits) */
  netCredit: number
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[]
  totals: {
    totalDebit: number      // Σ raw debits
    totalCredit: number     // Σ raw credits
    totalNetDebit: number   // Σ netDebit column
    totalNetCredit: number  // Σ netCredit column
    isBalanced: boolean     // |totalDebit - totalCredit| < 0.01
  }
}

/**
 * Get the trial balance for all active accounts.
 *
 * Column placement rule (R10 from guard.ts):
 *   net = debit - credit (raw movement direction)
 *   netDebit  = max(0, net)
 *   netCredit = max(0, -net)
 *
 * This is independent of the account's normal balance — a credit-normal account
 * (e.g., Revenue) with only credits MUST appear in the credit column.
 *
 * Accounts with zero activity (no debit and no credit) are skipped.
 */
export async function getTrialBalance(
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<TrialBalanceResult> {
  const client = tx ?? db
  const accounts = await client.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true, activityType: true },
    orderBy: { code: 'asc' },
  })

  if (accounts.length === 0) {
    return { rows: [], totals: { totalDebit: 0, totalCredit: 0, totalNetDebit: 0, totalNetCredit: 0, isBalanced: true } }
  }

  const accountIds = accounts.map(a => a.id)
  const aggregated = await client.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: postedLinesWhere({
      accountId: { in: accountIds },
      ...dateRangeFilter(range),
    }),
  })

  const sumMap = new Map<string, { debit: number; credit: number }>()
  for (const a of aggregated) {
    sumMap.set(a.accountId, {
      debit: toNumber(a._sum.debit),
      credit: toNumber(a._sum.credit),
    })
  }

  const rows: TrialBalanceRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  let totalNetDebit = 0
  let totalNetCredit = 0

  for (const a of accounts) {
    const sums = sumMap.get(a.id) || { debit: 0, credit: 0 }
    // Skip accounts with truly zero activity (no debit and no credit)
    if (sums.debit === 0 && sums.credit === 0) continue
    const net = sums.debit - sums.credit
    const sign = signForType(a.type)
    const balance = sign * net // signed balance (positive = normal side)
    // Trial balance columns show RAW net movement direction
    const netDebit = net > 0 ? net : 0
    const netCredit = net < 0 ? Math.abs(net) : 0
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      nameAr: a.nameAr,
      type: a.type,
      accountRole: a.accountRole,
      activityType: a.activityType,
      totalDebit: sums.debit,
      totalCredit: sums.credit,
      balance,
      netDebit,
      netCredit,
    })
    totalDebit += sums.debit
    totalCredit += sums.credit
    totalNetDebit += netDebit
    totalNetCredit += netCredit
  }

  return {
    rows,
    totals: {
      totalDebit,
      totalCredit,
      totalNetDebit,
      totalNetCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    },
  }
}

// ---------------------------------------------------------------------------
// Income Statement (قائمة الدخل)
// ---------------------------------------------------------------------------

export interface IncomeStatementData {
  revenue: { accounts: AccountBalance[]; total: number }
  expenses: { accounts: AccountBalance[]; total: number }
  grossProfit: number // revenue - direct project costs
  netIncome: number // revenue - all expenses
  netProfitMargin: number
}

export async function getIncomeStatement(
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<IncomeStatementData> {
  const [revenueAccounts, expenseAccounts] = await Promise.all([
    getAccountBalancesByType(['REVENUE'], range, tx),
    getAccountBalancesByType(['EXPENSE'], range, tx),
  ])

  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0)
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0)

  // Gross profit = revenue - direct project costs (PROJECT_COST + SUBCONTRACTOR_COST + rental direct costs)
  const directCostRoles = ['PROJECT_COST', 'SUBCONTRACTOR_COST', 'FUEL_EXPENSE', 'MAINTENANCE_EXPENSE', 'DRIVER_EXPENSE', 'TRANSPORT_EXPENSE', 'RENTAL_DEPRECIATION']
  const grossCosts = expenseAccounts
    .filter(a => a.accountRole && directCostRoles.includes(a.accountRole))
    .reduce((s, a) => s + a.balance, 0)
  const grossProfit = totalRevenue - grossCosts
  const netIncome = totalRevenue - totalExpenses
  const netProfitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0

  return {
    revenue: { accounts: revenueAccounts, total: totalRevenue },
    expenses: { accounts: expenseAccounts, total: totalExpenses },
    grossProfit,
    netIncome,
    netProfitMargin,
  }
}

// ---------------------------------------------------------------------------
// Balance Sheet (الميزانية العمومية)
// ---------------------------------------------------------------------------

export interface BalanceSheetData {
  assets: { accounts: AccountBalance[]; total: number }
  liabilities: { accounts: AccountBalance[]; total: number }
  equity: { accounts: AccountBalance[]; total: number }
  totalLiabilitiesAndEquity: number
  isBalanced: boolean
  /** Net income for the current period (revenue - expenses), shown as "Current Year Earnings" in equity */
  currentYearEarnings: number
}

export async function getBalanceSheet(
  asOfDate?: Date,
  tx?: PrismaTransaction
): Promise<BalanceSheetData> {
  const range: DateRange = asOfDate ? { to: asOfDate } : {}
  const [assets, liabilities, equity, income] = await Promise.all([
    getAccountBalancesByType(['ASSET'], range, tx),
    getAccountBalancesByType(['LIABILITY'], range, tx),
    getAccountBalancesByType(['EQUITY'], range, tx),
    getIncomeStatement(range, tx),
  ])

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)

  // Net income (revenue - expenses) for the period must be included in equity
  // as "Current Year Earnings" until formally closed at period end.
  // This is required by the accounting equation: Assets = Liabilities + Equity
  // where Equity = Contributed Capital + Retained Earnings + Current Period Net Income.
  const currentYearEarnings = income.netIncome

  // Append a synthetic "Current Year Earnings" equity row so the user sees it.
  // (If account 5300 "أرباح/خسائر السنة الحالية" already has posted lines,
  // those are shown separately — this synthetic row is the unclosed P&L balance.)
  const equityWithEarnings: AccountBalance[] = [...equity]
  if (Math.abs(currentYearEarnings) > 0.005) {
    equityWithEarnings.push({
      accountId: '__current_year_earnings__',
      code: '5300',
      name: 'Current Year Earnings (Unclosed P&L)',
      nameAr: 'أرباح (خسائر) السنة الحالية - غير مُقفلة',
      type: 'EQUITY',
      accountRole: 'CURRENT_YEAR_EARNINGS',
      activityType: 'BOTH',
      totalDebit: currentYearEarnings < 0 ? Math.abs(currentYearEarnings) : 0,
      totalCredit: currentYearEarnings > 0 ? currentYearEarnings : 0,
      balance: currentYearEarnings, // equity is credit-normal, so positive net income = positive balance
    })
  }

  const totalEquity = equityWithEarnings.reduce((s, a) => s + a.balance, 0)
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  return {
    assets: { accounts: assets, total: totalAssets },
    liabilities: { accounts: liabilities, total: totalLiabilities },
    equity: { accounts: equityWithEarnings, total: totalEquity },
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    currentYearEarnings,
  }
}

// ---------------------------------------------------------------------------
// Cash Flow (قائمة التدفقات النقدية) — from posted JEs on cash/bank accounts
// ---------------------------------------------------------------------------

export interface CashFlowData {
  inflows: number
  outflows: number
  netCashFlow: number
  openingBalance: number
  closingBalance: number
  byAccount: { code: string; name: string; nameAr: string | null; inflows: number; outflows: number; net: number }[]
  monthly: { month: string; inflows: number; outflows: number; net: number }[]
}

export async function getCashFlow(
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<CashFlowData> {
  const client = tx ?? db
  // Cash & bank accounts
  const accounts = await client.account.findMany({
    where: { accountRole: { in: ['CASH', 'BANK'] }, isActive: true },
    select: { id: true, code: true, name: true, nameAr: true },
    orderBy: { code: 'asc' },
  })

  if (accounts.length === 0) {
    return { inflows: 0, outflows: 0, netCashFlow: 0, openingBalance: 0, closingBalance: 0, byAccount: [], monthly: [] }
  }

  const accountIds = accounts.map(a => a.id)

  // Lines within the period
  const periodLines = await client.journalLine.findMany({
    where: postedLinesWhere({
      accountId: { in: accountIds },
      ...dateRangeFilter(range),
    }),
    include: { journalEntry: { select: { date: true } }, account: { select: { code: true, name: true, nameAr: true } } },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  // Opening balance = sum of all lines BEFORE range.from
  let openingWhere: Prisma.JournalLineWhereInput = postedLinesWhere({ accountId: { in: accountIds } })
  if (range?.from) {
    openingWhere = {
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        date: { lt: range.from },
      },
    }
  }
  const openingAgg = await client.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: openingWhere,
  })
  const openingBalance = toNumber(openingAgg._sum.debit) - toNumber(openingAgg._sum.credit)

  // Aggregate by account
  const byAccountMap = new Map<string, { code: string; name: string; nameAr: string | null; inflows: number; outflows: number; net: number }>()
  for (const a of accounts) {
    byAccountMap.set(a.id, { code: a.code, name: a.name, nameAr: a.nameAr, inflows: 0, outflows: 0, net: 0 })
  }

  // Monthly aggregation
  const monthlyMap = new Map<string, { inflows: number; outflows: number; net: number }>()

  let totalInflows = 0
  let totalOutflows = 0

  for (const line of periodLines) {
    const debit = toNumber(line.debit)
    const credit = toNumber(line.credit)
    const acc = byAccountMap.get(line.accountId)
    if (acc) {
      acc.inflows += debit
      acc.outflows += credit
      acc.net += debit - credit
    }
    totalInflows += debit
    totalOutflows += credit

    const monthKey = line.journalEntry.date.toISOString().slice(0, 7)
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, { inflows: 0, outflows: 0, net: 0 })
    const m = monthlyMap.get(monthKey)!
    m.inflows += debit
    m.outflows += credit
    m.net += debit - credit
  }

  const closingBalance = openingBalance + (totalInflows - totalOutflows)

  return {
    inflows: totalInflows,
    outflows: totalOutflows,
    netCashFlow: totalInflows - totalOutflows,
    openingBalance,
    closingBalance,
    byAccount: Array.from(byAccountMap.values()),
    monthly: Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
  }
}

// ---------------------------------------------------------------------------
// General Ledger (دفتر الأستاذ العام) — line-level detail for an account
// ---------------------------------------------------------------------------

export interface GeneralLedgerLine {
  date: Date
  entryNo: string
  description: string | null
  lineDescription: string | null
  debit: number
  credit: number
  balance: number
  sourceType: string | null
  costCenterCode: string | null
}

export interface GeneralLedgerData {
  account: { id: string; code: string; name: string; nameAr: string | null; type: string }
  openingBalance: number
  lines: GeneralLedgerLine[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

/**
 * Get the general ledger for a single account, with proper opening balance.
 *
 * Accepts either account code or account id. Returns null if account not found.
 *
 * Opening balance = signed sum of all posted lines for this account BEFORE range.from.
 * Each line's running balance = openingBalance + Σ(signed line movements up to that point).
 */
export async function getGeneralLedger(
  accountIdOrCode: string,
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<GeneralLedgerData | null> {
  const client = tx ?? db
  // Resolve account by id first, then by code
  let account = await client.account.findUnique({
    where: { id: accountIdOrCode },
    select: { id: true, code: true, name: true, nameAr: true, type: true },
  })
  if (!account) {
    account = await client.account.findUnique({
      where: { code: accountIdOrCode },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
    })
  }
  if (!account) return null

  // Opening balance (before range.from)
  let openingBalance = 0
  if (range?.from) {
    const openingAgg = await client.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: account.id,
        journalEntry: { status: 'POSTED', deletedAt: null, date: { lt: range.from } },
      },
    })
    const d = toNumber(openingAgg._sum.debit)
    const c = toNumber(openingAgg._sum.credit)
    openingBalance = signForType(account.type) * (d - c)
  }

  // Period lines
  const lines = await client.journalLine.findMany({
    where: {
      deletedAt: null,
      accountId: account.id,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        ...(range && (range.from || range.to) && {
          date: {
            ...(range.from && { gte: range.from }),
            ...(range.to && { lte: range.to }),
          },
        }),
      },
    },
    include: {
      journalEntry: { select: { entryNo: true, date: true, description: true, sourceType: true } },
      costCenter: { select: { code: true } },
    },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  let running = openingBalance
  const sign = signForType(account.type)
  const glLines: GeneralLedgerLine[] = []
  let totalDebit = 0
  let totalCredit = 0

  for (const l of lines) {
    const debit = toNumber(l.debit)
    const credit = toNumber(l.credit)
    running += sign * (debit - credit)
    totalDebit += debit
    totalCredit += credit
    glLines.push({
      date: l.journalEntry.date,
      entryNo: l.journalEntry.entryNo,
      description: l.journalEntry.description,
      lineDescription: l.description,
      debit,
      credit,
      balance: running,
      sourceType: l.journalEntry.sourceType,
      costCenterCode: l.costCenter?.code || null,
    })
  }

  return {
    account: { id: account.id, code: account.code, name: account.name, nameAr: account.nameAr, type: account.type },
    openingBalance,
    lines: glLines,
    totalDebit,
    totalCredit,
    closingBalance: running,
  }
}

// ---------------------------------------------------------------------------
// Cost Center / Project reports
// ---------------------------------------------------------------------------

export interface CostCenterBalance {
  costCenterId: string
  code: string
  name: string
  revenue: number
  costs: number
  net: number
}

/**
 * Build a map of project.id → costCenter.id.
 * Uses the direct Project.costCenterId link first, then falls back to code/name matching.
 */
export async function buildProjectCostCenterMap(
  projectIds: string[],
  tx?: PrismaTransaction
): Promise<Map<string, string>> {
  const client = tx ?? db
  if (projectIds.length === 0) return new Map()
  const projects = await client.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, code: true, name: true, nameAr: true, costCenterId: true },
  })
  const result = new Map<string, string>()

  // 1. Direct link via costCenterId
  const linkedProjects = projects.filter(p => p.costCenterId)
  for (const p of linkedProjects) result.set(p.id, p.costCenterId!)

  // 2. Fallback for unlinked: match by code, then by name
  const unlinked = projects.filter(p => !p.costCenterId)
  if (unlinked.length > 0) {
    const costCenters = await client.costCenter.findMany({ select: { id: true, code: true, name: true } })
    for (const p of unlinked) {
      let cc = costCenters.find(c => c.code === p.code)
      if (!cc) {
        const pName = (p.nameAr || p.name || '').trim()
        cc = costCenters.find(c => pName.includes(c.name) || c.name.includes(pName))
      }
      if (!cc) {
        const m = p.code.match(/(\d+)/)
        if (m) cc = costCenters.find(c => c.code.includes(m[1]))
      }
      if (cc) result.set(p.id, cc.id)
    }
  }
  return result
}

/**
 * Get per-project revenue & cost from posted JEs via cost center.
 */
export async function getProjectBalances(
  projectIds: string[],
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<Map<string, { revenue: number; costs: number; costCenterId: string | null }>> {
  const client = tx ?? db
  const result = new Map<string, { revenue: number; costs: number; costCenterId: string | null }>()
  for (const pid of projectIds) result.set(pid, { revenue: 0, costs: 0, costCenterId: null })

  const ccMap = await buildProjectCostCenterMap(projectIds, tx)
  const costCenterIds = [...ccMap.values()]
  if (costCenterIds.length === 0) return result

  // Reverse map: costCenterId → projectId
  const ccToProject = new Map<string, string>()
  for (const [pid, ccId] of ccMap) ccToProject.set(ccId, pid)
  // Update costCenterId in result
  for (const [pid, ccId] of ccMap) {
    const r = result.get(pid)
    if (r) r.costCenterId = ccId
  }

  const lines = await client.journalLine.findMany({
    where: postedLinesWhere({
      costCenterId: { in: costCenterIds },
      ...dateRangeFilter(range),
    }),
    include: { account: { select: { type: true } }, costCenter: { select: { id: true } } },
  })

  for (const l of lines) {
    const pid = ccToProject.get(l.costCenterId || '')
    if (!pid) continue
    const r = result.get(pid)
    if (!r) continue
    const debit = toNumber(l.debit)
    const credit = toNumber(l.credit)
    if (l.account.type === 'REVENUE') {
      r.revenue += credit - debit
    } else if (l.account.type === 'EXPENSE') {
      r.costs += debit - credit
    }
  }

  return result
}

/**
 * Detailed project cost breakdown by account role, from posted JEs.
 */
export async function getProjectCostBreakdown(
  projectId: string,
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<{
  costCenterId: string | null
  byRole: Map<string, number>
  total: number
  revenue: number
}> {
  const client = tx ?? db
  const ccMap = await buildProjectCostCenterMap([projectId], tx)
  const costCenterId = ccMap.get(projectId) || null

  const byRole = new Map<string, number>()
  let total = 0
  let revenue = 0

  if (!costCenterId) {
    return { costCenterId, byRole, total, revenue }
  }

  const lines = await client.journalLine.findMany({
    where: postedLinesWhere({
      costCenterId,
      ...dateRangeFilter(range),
    }),
    include: { account: { select: { type: true, accountRole: true } } },
  })

  for (const l of lines) {
    const debit = toNumber(l.debit)
    const credit = toNumber(l.credit)
    if (l.account.type === 'EXPENSE') {
      const amt = debit - credit
      const role = l.account.accountRole || 'OTHER'
      byRole.set(role, (byRole.get(role) || 0) + amt)
      total += amt
    } else if (l.account.type === 'REVENUE') {
      revenue += credit - debit
    }
  }

  return { costCenterId, byRole, total, revenue }
}

/**
 * Cost Center report (all cost centers).
 */
export async function getCostCenterReport(
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<CostCenterBalance[]> {
  const client = tx ?? db
  const costCenters = await client.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  })
  if (costCenters.length === 0) return []

  const ccIds = costCenters.map(c => c.id)

  const lines = await client.journalLine.findMany({
    where: postedLinesWhere({
      costCenterId: { in: ccIds },
      ...dateRangeFilter(range),
    }),
    include: { account: { select: { type: true } }, costCenter: { select: { id: true } } },
  })

  const map = new Map<string, { revenue: number; costs: number }>()
  for (const cc of costCenters) map.set(cc.id, { revenue: 0, costs: 0 })

  for (const l of lines) {
    const entry = map.get(l.costCenterId || '')
    if (!entry) continue
    const debit = toNumber(l.debit)
    const credit = toNumber(l.credit)
    if (l.account.type === 'REVENUE') entry.revenue += credit - debit
    else if (l.account.type === 'EXPENSE') entry.costs += debit - credit
  }

  return costCenters.map(cc => {
    const e = map.get(cc.id)!
    return {
      costCenterId: cc.id,
      code: cc.code,
      name: cc.name,
      revenue: e.revenue,
      costs: e.costs,
      net: e.revenue - e.costs,
    }
  })
}

// ---------------------------------------------------------------------------
// VAT Reconciliation (from posted JEs on VAT accounts)
// ---------------------------------------------------------------------------

export interface VATReconciliationData {
  outputVat: number // VAT_OUTPUT credit balance
  inputVat: number // VAT_INPUT debit balance
  netVatDue: number // output - input (if positive, payable)
  vatSettlement: number
  outputAccounts: AccountBalance[]
  inputAccounts: AccountBalance[]
}

export async function getVATReconciliation(
  range?: DateRange,
  tx?: PrismaTransaction
): Promise<VATReconciliationData> {
  const [outputAccounts, inputAccounts] = await Promise.all([
    getAccountBalancesByType(['LIABILITY'], range, tx).then(list =>
      list.filter(a => ['VAT_OUTPUT', 'VAT_DUE', 'VAT_SETTLEMENT'].includes(a.accountRole || ''))
    ),
    getAccountBalancesByType(['ASSET'], range, tx).then(list =>
      list.filter(a => a.accountRole === 'VAT_INPUT')
    ),
  ])

  const outputVat = outputAccounts.reduce((s, a) => s + a.balance, 0)
  const inputVat = inputAccounts.reduce((s, a) => s + a.balance, 0)
  const netVatDue = outputVat - inputVat

  return {
    outputVat,
    inputVat,
    netVatDue,
    vatSettlement: netVatDue,
    outputAccounts,
    inputAccounts,
  }
}

// ---------------------------------------------------------------------------
// Numerical Consistency Verification (BA-02 Task 2)
// ---------------------------------------------------------------------------

/**
 * Verify that all read paths produce identical totals.
 * This is the canonical "build-breaking" consistency check.
 *
 * Invariant:
 *   TrialBalance.totals.totalDebit == TrialBalance.totals.totalCredit
 *   AND |Σ assets - Σ(liabilities + equity + currentYearEarnings)| < 0.01
 *   AND GeneralLedger.closingBalance == getAccountBalance(accountCode, range.to)
 *
 * Returns { ok, diffs } where diffs is an array of human-readable discrepancies.
 */
export async function verifyNumericalConsistency(
  asOfDate?: Date,
  tx?: PrismaTransaction
): Promise<{ ok: boolean; diffs: string[]; summary: Record<string, number> }> {
  const client = tx ?? db
  const diffs: string[] = []
  const range: DateRange = asOfDate ? { to: asOfDate } : {}

  // 1. Trial balance must tie
  const tb = await getTrialBalance(range, client)
  if (!tb.totals.isBalanced) {
    diffs.push(
      `TrialBalance not balanced: totalDebit=${tb.totals.totalDebit.toFixed(2)} ≠ totalCredit=${tb.totals.totalCredit.toFixed(2)} (diff=${Math.abs(tb.totals.totalDebit - tb.totals.totalCredit).toFixed(2)})`
    )
  }

  // 2. Σ netDebit column must equal Σ netCredit column
  if (Math.abs(tb.totals.totalNetDebit - tb.totals.totalNetCredit) > 0.01) {
    diffs.push(
      `TrialBalance columns don't tie: netDebit=${tb.totals.totalNetDebit.toFixed(2)} ≠ netCredit=${tb.totals.totalNetCredit.toFixed(2)}`
    )
  }

  // 3. Raw aggregate (independent query) must match trial balance totals
  const rawAgg = await client.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: postedLinesWhere(dateRangeFilter(range)),
  })
  const rawDebit = toNumber(rawAgg._sum.debit)
  const rawCredit = toNumber(rawAgg._sum.credit)
  if (Math.abs(rawDebit - tb.totals.totalDebit) > 0.01) {
    diffs.push(
      `TrialBalance.totalDebit (${tb.totals.totalDebit.toFixed(2)}) ≠ raw aggregate (${rawDebit.toFixed(2)})`
    )
  }
  if (Math.abs(rawCredit - tb.totals.totalCredit) > 0.01) {
    diffs.push(
      `TrialBalance.totalCredit (${tb.totals.totalCredit.toFixed(2)}) ≠ raw aggregate (${rawCredit.toFixed(2)})`
    )
  }

  // 4. Accounting equation: Assets = Liabilities + Equity (incl. current year earnings)
  const bs = await getBalanceSheet(asOfDate, client)
  if (!bs.isBalanced) {
    diffs.push(
      `Accounting equation broken: assets=${bs.assets.total.toFixed(2)} ≠ liabilities+equity=${bs.totalLiabilitiesAndEquity.toFixed(2)} (diff=${Math.abs(bs.assets.total - bs.totalLiabilitiesAndEquity).toFixed(2)})`
    )
  }

  // 5. Per-account GL closing balance must match account balance from queries
  // (sample up to 20 accounts to keep this fast)
  const sampleAccounts = tb.rows.slice(0, 20)
  for (const row of sampleAccounts) {
    const gl = await getGeneralLedger(row.accountId, range, client)
    if (!gl) continue
    const directBalance = await getAccountBalance(row.code, range, client)
    if (Math.abs(gl.closingBalance - directBalance) > 0.01) {
      diffs.push(
        `Account ${row.code}: GL closingBalance (${gl.closingBalance.toFixed(2)}) ≠ getAccountBalance (${directBalance.toFixed(2)})`
      )
    }
    // Also check that the GL closingBalance matches the trial balance signed balance
    // (both should be `signForType * (D - C)`)
    if (Math.abs(gl.closingBalance - row.balance) > 0.01) {
      diffs.push(
        `Account ${row.code}: GL closingBalance (${gl.closingBalance.toFixed(2)}) ≠ TrialBalance signed balance (${row.balance.toFixed(2)})`
      )
    }
  }

  return {
    ok: diffs.length === 0,
    diffs,
    summary: {
      trialBalanceTotalDebit: tb.totals.totalDebit,
      trialBalanceTotalCredit: tb.totals.totalCredit,
      trialBalanceNetDebit: tb.totals.totalNetDebit,
      trialBalanceNetCredit: tb.totals.totalNetCredit,
      rawAggregateDebit: rawDebit,
      rawAggregateCredit: rawCredit,
      balanceSheetAssets: bs.assets.total,
      balanceSheetLiabilities: bs.liabilities.total,
      balanceSheetEquity: bs.equity.total,
      currentYearEarnings: bs.currentYearEarnings,
    },
  }
}
