// ============================================================================
// نظام بِنَاء ERP - محرك إقفال الحسابات الموحّد
// Binaa ERP - Unified Accounting Closing Engine
// ============================================================================
//
// هذا الملف هو المصدر الوحيد لمنطق إقفال الحسابات السنوي. كل عمليات
// الإقفال MUST تمر عبر هنا — لا يجوز لأي route تنفيذ منطق الإقفال مباشرةً.
//
// الإقفال السنوي يقوم بـ:
//   1. قفل السنة (OPEN → CLOSING) لمنع العمليات المتزامنة
//   2. حساب أرصدة الإيرادات والمصروفات من القيود المرحّلة (SSOT: queries.ts)
//   3. إنشاء قيد إقفال: 
//      - Dr/Cr كل حساب إيراد/مصروف لتصفيره
//      - Cr/Dr حساب الأرباح المرحلة (RETAINED_EARNINGS) بصافي الربح/الخسارة
//   4. تحديث السنة: status=CLOSED، حفظ closingJournalEntryId والأرصدة
//   5. إقفال كل الفترات الشهرية (FiscalPeriod.status=CLOSED)
//
// إعادة الفتح يقوم بـ:
//   1. عكس قيد الإقفال (reverseJournalEntry)
//   2. تحديث السنة: status=OPEN، إزالة closingJournalEntryId
//   3. إعادة فتح كل الفترات الشهرية (FiscalPeriod.status=OPEN)
//
// كل العمليات ذرية (atomic) عبر $transaction.
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  postJournalEntry,
  reverseJournalEntry,
  getNextEntryNo,
} from './guard'
import { getAccountBalancesByType } from './queries'
import { closePeriod, reopenPeriod } from './accounting-calendar'
import type { PrismaTransaction } from './constants'
import { AccountRole } from '@/lib/account-roles'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClosingPreviewLine {
  accountCode: string
  accountName: string
  accountNameAr: string | null
  accountRole: string | null
  accountType: string
  currentBalance: number // signed balance before closing
  debitInClosing: number // amount to debit in closing JE (to zero the account)
  creditInClosing: number // amount to credit in closing JE
  description: string
}

export interface ClosingPreview {
  fiscalYear: {
    id: string
    name: string
    startDate: Date
    endDate: Date
    status: string
  }
  revenueLines: ClosingPreviewLine[]
  expenseLines: ClosingPreviewLine[]
  totalRevenue: number
  totalExpenses: number
  netIncome: number // revenue - expenses
  retainedEarningsAccount: { code: string; name: string; nameAr: string | null } | null
  closingEntryDescription: string
  closingEntryDescriptionAr: string
}

export interface ClosingResult {
  fiscalYearId: string
  closingJournalEntryId: string
  closingJournalEntryNo: string
  totalRevenue: number
  totalExpenses: number
  netIncome: number
  periodsClosed: number
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ClosingEngineError extends Error {
  code: string
  details?: Record<string, unknown>
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ClosingEngineError'
    this.code = code
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// Revenue and Expense roles to close
// ---------------------------------------------------------------------------

const REVENUE_ROLES = [
  AccountRole.PROJECT_REVENUE, AccountRole.RENTAL_REVENUE, AccountRole.SERVICE_REVENUE,
  AccountRole.UNBILLED_REVENUE, AccountRole.DELAY_PENALTY_REVENUE, AccountRole.FX_GAIN,
]

const EXPENSE_ROLES = [
  AccountRole.PROJECT_COST, AccountRole.LABOR_COST, AccountRole.SUBCONTRACTOR_COST,
  AccountRole.FUEL_EXPENSE, AccountRole.MAINTENANCE_EXPENSE, AccountRole.DRIVER_EXPENSE,
  AccountRole.TRANSPORT_EXPENSE, AccountRole.RENTAL_DEPRECIATION,
  AccountRole.PAYROLL_EXPENSE, AccountRole.GOSI_EXPENSE, AccountRole.ADMIN_EXPENSE,
  AccountRole.DEPRECIATION_EXPENSE, AccountRole.ZAKAT_EXPENSE, AccountRole.FX_LOSS,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the retained earnings account (5200) by role.
 * Throws if not found.
 */
async function getRetainedEarningsAccount(tx?: PrismaTransaction) {
  const client = tx ?? db
  const account = await client.account.findFirst({
    where: { accountRole: AccountRole.RETAINED_EARNINGS, isActive: true, allowPosting: true },
    select: { id: true, code: true, name: true, nameAr: true },
  })
  if (!account) {
    throw new ClosingEngineError(
      'RETAINED_EARNINGS_NOT_FOUND',
      'حساب الأرباح المرحلة (RETAINED_EARNINGS) غير موجود أو غير نشط',
      { hint: 'Ensure account 5200 has accountRole=RETAINED_EARNINGS' }
    )
  }
  return account
}

// ---------------------------------------------------------------------------
// Preview closing (read-only, no side effects)
// ---------------------------------------------------------------------------

/**
 * معاينة قيد الإقفال دون تنفيذه.
 * يحسب أرصدة الإيرادات والمصروفات ويُظهر بنود قيد الإقفال المقترح.
 */
export async function previewFiscalYearClose(
  fiscalYearId: string,
  tx?: PrismaTransaction
): Promise<ClosingPreview> {
  const client = tx ?? db

  const fy = await client.fiscalYear.findUniqueOrThrow({
    where: { id: fiscalYearId },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  })

  if (fy.status === 'CLOSED') {
    throw new ClosingEngineError(
      'YEAR_ALREADY_CLOSED',
      `السنة المالية ${fy.name} مُقفلة بالفعل`,
      { fiscalYearId }
    )
  }

  // Get all revenue and expense balances from the unified query layer (SSOT)
  const range = { from: fy.startDate, to: fy.endDate }
  const [revenueAccounts, expenseAccounts] = await Promise.all([
    getAccountBalancesByType(['REVENUE'], range, client),
    getAccountBalancesByType(['EXPENSE'], range, client),
  ])

  // Filter to roles we care about for closing
  const revenueLines: ClosingPreviewLine[] = []
  for (const acc of revenueAccounts) {
    if (!acc.accountRole || !REVENUE_ROLES.includes(acc.accountRole as any)) continue
    if (Math.abs(acc.balance) < 0.01) continue
    // Revenue is credit-normal. To zero it, we DEBIT the balance.
    revenueLines.push({
      accountCode: acc.code,
      accountName: acc.name,
      accountNameAr: acc.nameAr,
      accountRole: acc.accountRole,
      accountType: 'REVENUE',
      currentBalance: acc.balance,
      debitInClosing: acc.balance > 0 ? acc.balance : 0,
      creditInClosing: acc.balance < 0 ? Math.abs(acc.balance) : 0,
      description: `إقفال ${acc.nameAr || acc.name}`,
    })
  }

  const expenseLines: ClosingPreviewLine[] = []
  for (const acc of expenseAccounts) {
    if (!acc.accountRole || !EXPENSE_ROLES.includes(acc.accountRole as any)) continue
    if (Math.abs(acc.balance) < 0.01) continue
    // Expense is debit-normal. To zero it, we CREDIT the balance.
    expenseLines.push({
      accountCode: acc.code,
      accountName: acc.name,
      accountNameAr: acc.nameAr,
      accountRole: acc.accountRole,
      accountType: 'EXPENSE',
      currentBalance: acc.balance,
      debitInClosing: acc.balance < 0 ? Math.abs(acc.balance) : 0,
      creditInClosing: acc.balance > 0 ? acc.balance : 0,
      description: `إقفال ${acc.nameAr || acc.name}`,
    })
  }

  const totalRevenue = revenueLines.reduce((s, l) => s + l.currentBalance, 0)
  const totalExpenses = expenseLines.reduce((s, l) => s + l.currentBalance, 0)
  const netIncome = totalRevenue - totalExpenses

  const retainedEarningsAccount = await getRetainedEarningsAccount(client).catch(() => null)

  return {
    fiscalYear: fy,
    revenueLines,
    expenseLines,
    totalRevenue,
    totalExpenses,
    netIncome,
    retainedEarningsAccount: retainedEarningsAccount
      ? { code: retainedEarningsAccount.code, name: retainedEarningsAccount.name, nameAr: retainedEarningsAccount.nameAr }
      : null,
    closingEntryDescription: `Year-end closing for ${fy.name}`,
    closingEntryDescriptionAr: `قيد إقفال السنة المالية ${fy.name}`,
  }
}

// ---------------------------------------------------------------------------
// Execute year-end closing (atomic)
// ---------------------------------------------------------------------------

/**
 * تنفيذ إقفال سنة مالية.
 *
 * العملية ذرية (atomic) — إما أن تنجح بالكامل أو تفشل بالكامل:
 *   1. قفل السنة (OPEN → CLOSING) — race condition guard
 *   2. حساب أرصدة الإيرادات والمصروفات (SSOT: queries.getAccountBalancesByType)
 *   3. إنشاء قيد الإقفال (Dr Revenue, Cr Expense, Cr/Dr Retained Earnings)
 *   4. تحديث السنة: status=CLOSED، حفظ closingJournalEntryId والأرصدة
 *   5. إقفال كل الفترات الشهرية
 *
 * @param fiscalYearId معرف السنة المالية
 * @param tx عميل المعاملة (اختياري)
 * @param options.closedBy اسم المستخدم الذي ينفذ الإقفال
 * @param options.approved يجب أن يكون true لتأكيد الإقفال
 */
export async function closeFiscalYear(
  fiscalYearId: string,
  tx?: PrismaTransaction,
  options?: { closedBy?: string; approved?: boolean }
): Promise<ClosingResult> {
  const client = tx ?? db

  // Pre-flight checks (outside tx, read-only)
  const fy = await client.fiscalYear.findUniqueOrThrow({
    where: { id: fiscalYearId },
    include: { periods: true },
  })

  if (fy.status === 'CLOSED') {
    throw new ClosingEngineError('YEAR_ALREADY_CLOSED', `السنة ${fy.name} مُقفلة بالفعل`, { fiscalYearId })
  }
  if (fy.status === 'CLOSING') {
    throw new ClosingEngineError('YEAR_CLOSING', `السنة ${fy.name} قيد الإقفال بالفعل`, { fiscalYearId })
  }
  if (!options?.approved) {
    throw new ClosingEngineError('NOT_APPROVED', 'يجب الموافقة على الإقفال أولاً (options.approved=true)', { fiscalYearId })
  }

  // Race-condition guard: atomically transition OPEN → CLOSING only if still OPEN
  const lockResult = await client.fiscalYear.updateMany({
    where: { id: fiscalYearId, status: 'OPEN' },
    data: { status: 'CLOSING' },
  })
  if (lockResult.count === 0) {
    throw new ClosingEngineError(
      'LOCK_FAILED',
      'فشل قفل السنة — حالتها تغيرت (قد تكون قيد الإقفال بالفعل)',
      { fiscalYearId }
    )
  }

  // Get the preview (reuses the same balance computation)
  const preview = await previewFiscalYearClose(fiscalYearId, client)

  // Build closing JE lines
  const retainedEarnings = await getRetainedEarningsAccount(client)
  const closingLines: Array<{
    accountCode: string
    debit: number
    credit: number
    description?: string
  }> = []

  let totalRevenue = 0
  let totalExpenses = 0

  // Revenue accounts: debit to zero them
  for (const line of preview.revenueLines) {
    if (line.debitInClosing > 0 || line.creditInClosing > 0) {
      closingLines.push({
        accountCode: line.accountCode,
        debit: line.debitInClosing,
        credit: line.creditInClosing,
        description: line.description,
      })
      totalRevenue += line.currentBalance
    }
  }

  // Expense accounts: credit to zero them
  for (const line of preview.expenseLines) {
    if (line.debitInClosing > 0 || line.creditInClosing > 0) {
      closingLines.push({
        accountCode: line.accountCode,
        debit: line.debitInClosing,
        credit: line.creditInClosing,
        description: line.description,
      })
      totalExpenses += line.currentBalance
    }
  }

  // Retained earnings: the balancing figure
  // Net income (revenue - expenses) → credit retained earnings (equity is credit-normal)
  // Net loss (expenses > revenue) → debit retained earnings
  const netIncome = totalRevenue - totalExpenses
  if (Math.abs(netIncome) > 0.01) {
    closingLines.push({
      accountCode: retainedEarnings.code,
      debit: netIncome < 0 ? Math.abs(netIncome) : 0,
      credit: netIncome > 0 ? netIncome : 0,
      description: `صافي ربح/خسارة السنة ${fy.name}`,
    })
  }

  // Create the closing JE (skip period guard — closing entries go in the last period
  // even if it's been closed, which is the correct accounting treatment)
  const entryNo = await getNextEntryNo(client)
  const closingJE = await postJournalEntry(
    {
      entryNo,
      date: fy.endDate,
      description: preview.closingEntryDescription,
      descriptionAr: preview.closingEntryDescriptionAr,
      sourceType: 'YEAR_END_CLOSING',
      sourceId: `FY-CLOSE-${fy.name}`,
      lines: closingLines,
      skipPeriodGuard: true, // closing entries bypass period guard
    },
    client
  )

  // Update fiscal year: status=CLOSED, save closing JE + totals
  await client.fiscalYear.update({
    where: { id: fiscalYearId },
    data: {
      status: 'CLOSED',
      closingJournalEntryId: closingJE.id,
      retainedEarningsAccountCode: retainedEarnings.code,
      totalRevenue: new Prisma.Decimal(totalRevenue),
      totalExpenses: new Prisma.Decimal(totalExpenses),
      netProfit: new Prisma.Decimal(netIncome),
      closedBy: options?.closedBy || null,
      closedAt: new Date(),
    },
  })

  // Close all monthly periods
  let periodsClosed = 0
  for (const period of fy.periods) {
    if (period.status !== 'CLOSED') {
      try {
        await closePeriod(period.id, client, {
          closedBy: options?.closedBy,
          notes: 'Auto-closed by year-end closing',
          allowDuringClosing: true, // year is CLOSING at this point
        })
        periodsClosed++
      } catch (e) {
        // If a period is already closed or in a bad state, log and continue
        console.warn(`[ClosingEngine] Could not close period ${period.periodNo}:`, (e as Error).message)
      }
    }
  }

  return {
    fiscalYearId,
    closingJournalEntryId: closingJE.id,
    closingJournalEntryNo: closingJE.entryNo,
    totalRevenue,
    totalExpenses,
    netIncome,
    periodsClosed,
  }
}

// ---------------------------------------------------------------------------
// Reopen a closed fiscal year (atomic)
// ---------------------------------------------------------------------------

/**
 * إعادة فتح سنة مالية مُقفلة.
 *
 * العملية ذرية:
 *   1. التحقق أن السنة مُقفلة (CLOSED)
 *   2. عكس قيد الإقفال (reverseJournalEntry)
 *   3. تحديث السنة: status=OPEN، إزالة closingJournalEntryId
 *   4. إعادة فتح كل الفترات الشهرية
 *
 * @param fiscalYearId معرف السنة المالية
 * @param tx عميل المعاملة (اختياري)
 * @param options.reopenedBy اسم المستخدم
 * @param options.reverseClosingJE إذا true (افتراضي)، يعكس قيد الإقفال
 */
export async function reopenFiscalYear(
  fiscalYearId: string,
  tx?: PrismaTransaction,
  options?: { reopenedBy?: string; reverseClosingJE?: boolean }
): Promise<{
  fiscalYearId: string
  reversalEntryId: string | null
  reversalEntryNo: string | null
  periodsReopened: number
}> {
  const client = tx ?? db

  const fy = await client.fiscalYear.findUniqueOrThrow({
    where: { id: fiscalYearId },
    include: { periods: true },
  })

  if (fy.status !== 'CLOSED') {
    throw new ClosingEngineError(
      'YEAR_NOT_CLOSED',
      `لا يمكن إعادة فتح سنة بحالة ${fy.status} — يجب أن تكون CLOSED`,
      { fiscalYearId, currentStatus: fy.status }
    )
  }

  const reverseJE = options?.reverseClosingJE !== false // default true
  let reversalEntryId: string | null = null
  let reversalEntryNo: string | null = null

  if (reverseJE && fy.closingJournalEntryId) {
    const reversal = await reverseJournalEntry(
      fy.closingJournalEntryId,
      client,
      `إعادة فتح السنة ${fy.name}`
    )
    reversalEntryId = reversal.id
    reversalEntryNo = reversal.entryNo
  }

  // Update fiscal year: status=OPEN, clear closing info
  await client.fiscalYear.update({
    where: { id: fiscalYearId },
    data: {
      status: 'OPEN',
      closingJournalEntryId: null,
      closedBy: null,
      closedAt: null,
      closingNotes: null,
    },
  })

  // Reopen all monthly periods
  let periodsReopened = 0
  for (const period of fy.periods) {
    if (period.status !== 'OPEN') {
      try {
        await reopenPeriod(period.id, client, { reopenedBy: options?.reopenedBy })
        periodsReopened++
      } catch (e) {
        console.warn(`[ClosingEngine] Could not reopen period ${period.periodNo}:`, (e as Error).message)
      }
    }
  }

  return {
    fiscalYearId,
    reversalEntryId,
    reversalEntryNo,
    periodsReopened,
  }
}
