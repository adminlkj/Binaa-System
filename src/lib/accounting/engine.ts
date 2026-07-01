// ============================================================================
// المحرك المحاسبي - Accounting Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Core accounting engine with automatic journal entries for all business transactions.
// Follows double-entry bookkeeping principles and Saudi SOCPA standards.
// Supports both Construction Projects and Equipment Rental activities.
// ============================================================================

import { db } from '@/lib/db'
import {
  getAccountCodeByRole,
  requireAccountByRole,
  requireAccountCodeByRole,
  resolvePaymentAccountCode,
  AccountRole,
} from '@/lib/account-roles'
import {
  postJournalEntry as guardedPost,
  reverseJournalEntry as guardedReverse,
  getNextEntryNo,
} from '@/lib/accounting/guard'

// ============================================================================
// BA-02 Task 1: Single Source of Truth — Unified Accounting Engine
// ============================================================================
// Constants and read functions have been extracted to dedicated modules:
//   - constants.ts        → NORMAL_BALANCE, AccountType, DateRange, PrismaTransaction
//   - chart-of-accounts.ts → CHART_OF_ACCOUNTS_TEMPLATE
//   - queries.ts          → ALL read functions (getTrialBalance, getGeneralLedger, etc.)
//
// This file (engine.ts) is now WRITE-ONLY:
//   - createJournalEntry / reverseEntry → proxies to guard.ts
//   - autoEntry* functions → business transaction journal entry creators
//   - ensureAccountExists / initializeChartOfAccounts → chart seeding
//
// The constants and types below are re-exported for backward compatibility.
// New code MUST import from the canonical modules directly.
// ============================================================================

// Re-export canonical constants for backward compatibility.
// Consumers historically did `import { AccountType, NORMAL_BALANCE } from '@/lib/accounting/engine'`.
// The AccountType const is re-exported under the same name so existing imports keep working.
export {
  ACCOUNT_TYPES,
  AccountType,
  NORMAL_BALANCE,
  signForType,
} from './constants'
export type { AccountType as AccountTypeT, AccountTypeValue, DateRange, PrismaTransaction } from './constants'

// Re-export chart of accounts (canonical location)
export { CHART_OF_ACCOUNTS_TEMPLATE } from './chart-of-accounts'
export type { AccountTemplate } from './constants'

// Re-export all read functions for backward compatibility.
// New code MUST import these from '@/lib/accounting/queries' directly.
export {
  getAccountByCode,
  getAccountBalancesByType,
  getBalanceByRole,
  getBalanceByType,
  getAccountBalance,
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
  buildProjectCostCenterMap,
  getProjectBalances,
  getProjectCostBreakdown,
  getCostCenterReport,
  getVATReconciliation,
  verifyNumericalConsistency,
} from './queries'

// Local imports retained for in-file usage (autoEntry* functions still need these)
import type { PrismaTransaction } from './constants'
import { CHART_OF_ACCOUNTS_TEMPLATE } from './chart-of-accounts'
import type { AccountTemplate } from './constants'
import { getUsagePropertiesForRole } from '@/lib/account-usage-mapping'

// ============ STANDARD CHART OF ACCOUNTS TEMPLATE ============
// Based on Saudi SOCPA standards for construction & equipment rental companies

// CHART_OF_ACCOUNTS_TEMPLATE is now imported from ./chart-of-accounts
// (kept here as a comment to mark the historical location — actual definition
// is in chart-of-accounts.ts for clean separation).
//
// The template is re-exported above for backward compatibility.

// Legacy export marker — the template array below is intentionally omitted.
// To read the template: import { CHART_OF_ACCOUNTS_TEMPLATE } from '@/lib/accounting/chart-of-accounts'

// ============ AUTO-ENTRY ACCOUNT RESOLVER ============
// Maps business transactions to their debit/credit accounts

export interface JournalEntryTemplate {
  /**
   * رقم القيد. إذا تُرك فارغاً أو undefined، يتم توليده تلقائياً عبر getNextEntryNo(tx)
   * بصيغة JE-NNNNNN التسلسلية الموحَّدة. هذا يضمن أن كل القيود لها رقم فريد
   * ومتسلسل ولا يستخدم Date.now() (الذي كان يخلق أرقاماً غير متسلسلة وقابلة للتصادم).
   */
  entryNo?: string
  date: Date
  description: string
  descriptionAr: string
  lines: {
    accountCode: string
    debit: number
    credit: number
    costCenterId?: string
    description?: string
  }[]
  sourceType: string   // What triggered this entry
  sourceId: string     // ID of the source document
}

// ============ ACCOUNT LOOKUP HELPERS ============
//
// getAccountByCode has been moved to ./queries (canonical location).
// It is re-exported above for backward compatibility.

export async function ensureAccountExists(template: AccountTemplate, tx?: PrismaTransaction) {
  const client = tx || db
  const existing = await client.account.findUnique({ where: { code: template.code } })
  // P4-FIX: compute usage properties from the role at seed time so newly
  // seeded accounts immediately appear in the right operational screens.
  const usageProps = getUsagePropertiesForRole(template.accountRole)
  if (existing) {
    // Update existing account with new fields if they are missing
    if (
      existing.activityType !== (template.activityType || null) ||
      existing.isSystem !== (template.isSystem || false) ||
      existing.allowPosting !== (template.allowPosting || false) ||
      existing.level !== (template.level || 0) ||
      (template.accountRole && existing.accountRole !== template.accountRole) ||
      (template.parentId && existing.parentCode !== template.parentId)
    ) {
      await client.account.update({
        where: { code: template.code },
        data: {
          name: template.name,
          nameAr: template.nameAr,
          type: template.type,
          activityType: template.activityType || null,
          isSystem: template.isSystem || false,
          allowPosting: template.allowPosting || false,
          level: template.level || 0,
          accountRole: template.accountRole || existing.accountRole,
          parentCode: template.parentId || existing.parentCode,
          ...usageProps,
        },
      })
    }
    return client.account.findUnique({ where: { code: template.code } })
  }

  let parentId: string | undefined
  if (template.parentId) {
    const parent = await client.account.findUnique({ where: { code: template.parentId } })
    if (parent) parentId = parent.id
  }

  return client.account.create({
    data: {
      code: template.code,
      name: template.name,
      nameAr: template.nameAr,
      type: template.type,
      parentId,
      parentCode: template.parentId || null,
      isActive: true,
      activityType: template.activityType || null,
      accountRole: template.accountRole || null,
      isSystem: template.isSystem || false,
      allowPosting: template.allowPosting || false,
      level: template.level || 0,
      ...usageProps,
    },
  })
}

// ============ INITIALIZE CHART OF ACCOUNTS ============

/**
 * Initialize / sync the chart of accounts from the CHART_OF_ACCOUNTS_TEMPLATE.
 *
 * IMPORTANT (CRITICAL #12 fix): This function is EXPENSIVE — it iterates ~110 accounts
 * and performs an upsert on each. It must ONLY be called during database seeding or
 * an explicit "sync chart of accounts" admin action. It must NOT be called on every
 * POST of an expense/advance/invoice (the prior pattern caused a major performance
 * regression and made every transaction non-atomic because the writes used `db`
 * instead of the caller's `tx`).
 *
 * @param tx - Optional Prisma transaction client. When provided, all writes are
 *             performed on `tx` so they are atomic with the caller's transaction.
 *             When omitted, falls back to the global `db` (for seed scripts).
 */
export async function initializeChartOfAccounts(tx?: PrismaTransaction) {
  const client = tx || db
  let created = 0
  let updated = 0

  // Create parent accounts first, then children (sorted by code length then code)
  const sorted = [...CHART_OF_ACCOUNTS_TEMPLATE].sort((a, b) => {
    if (a.code.length !== b.code.length) return a.code.length - b.code.length
    return a.code.localeCompare(b.code)
  })

  for (const tmpl of sorted) {
    // P4-FIX: compute usage properties from the role at seed time so newly
    // seeded accounts immediately appear in the right operational screens
    // and are usable in the right journal-entry operations.
    const usageProps = getUsagePropertiesForRole(tmpl.accountRole)
    const existing = await client.account.findUnique({ where: { code: tmpl.code } })
    if (existing) {
      // Update existing account with new fields
      await client.account.update({
        where: { code: tmpl.code },
        data: {
          name: tmpl.name,
          nameAr: tmpl.nameAr,
          type: tmpl.type,
          activityType: tmpl.activityType || null,
          accountRole: tmpl.accountRole || null,
          parentCode: tmpl.parentId || null,
          isSystem: tmpl.isSystem || false,
          allowPosting: tmpl.allowPosting || false,
          level: tmpl.level || 0,
          isActive: true,
          ...usageProps,
        },
      })
      // Update parent reference if needed
      if (tmpl.parentId) {
        const parent = await client.account.findUnique({ where: { code: tmpl.parentId } })
        if (parent && existing.parentId !== parent.id) {
          await client.account.update({
            where: { code: tmpl.code },
            data: { parentId: parent.id },
          })
        }
      }
      updated++
    } else {
      // Create new account. Note: ensureAccountExists uses the global db; for atomicity
      // inside a tx we inline a minimal create here.
      await client.account.create({
        data: {
          code: tmpl.code,
          name: tmpl.name,
          nameAr: tmpl.nameAr,
          type: tmpl.type,
          parentCode: tmpl.parentId || null,
          accountRole: tmpl.accountRole || null,
          isSystem: tmpl.isSystem || false,
          allowPosting: tmpl.allowPosting || false,
          level: tmpl.level || 0,
          activityType: tmpl.activityType || null,
          ...usageProps,
        },
      })
      created++
    }
  }

  const total = await client.account.count()
  return { created, updated, total }
}

// ============ JOURNAL ENTRY REVERSAL ============

/**
 * عكس قيد محاسبي - Reverse a posted journal entry
 *
 * Creates a reversal entry with flipped debit/credit on all lines,
 * marks the original entry as CANCELLED, and links them together.
 *
 * IMPORTANT: This function MUST be called inside a $transaction callback.
 * The `tx` parameter is required — no standalone calls allowed.
 *
 * @param journalEntryId - ID of the journal entry to reverse
 * @param tx - Prisma transaction client (required)
 * @returns The reversal journal entry with its lines
 * @throws Error if entry not found, not POSTED, or already reversed
 */
export async function reverseEntry(journalEntryId: string, tx: PrismaTransaction) {
  // Delegate to the unbreakable guard — all R1-R12 rules enforced centrally.
  return guardedReverse(journalEntryId, tx)
}


// ============ JOURNAL ENTRY CREATION ============
//
// هذه الدالة الآن مجرد proxy لـ postJournalEntry في guard.ts.
// كل التحققات الصارمة (R1-R12) تُفرض في طبقة الحارس ولا يمكن تجاوزها.
// لا يجوز لأي كود في النظام أن يستدعي db.journalEntry.create مباشرةً.

export async function createJournalEntry(template: JournalEntryTemplate, tx?: PrismaTransaction) {
  // P1-4 FIX: توليد رقم القيد تلقائياً إذا لم يُمرَّر. هذا يضمن أن كل القيود
  // تستخدم JE-NNNNNN التسلسلية الموحَّدة من جدول Sequence بدلاً من Date.now().
  // يجب تمرير tx لأن getNextEntryNo تتطلبه.
  const entryNo = template.entryNo && template.entryNo.trim() !== ''
    ? template.entryNo
    : await getNextEntryNo(tx)
  return guardedPost(
    {
      entryNo,
      date: template.date,
      description: template.description,
      descriptionAr: template.descriptionAr,
      sourceType: template.sourceType,
      sourceId: template.sourceId,
      lines: template.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        costCenterId: l.costCenterId,
        description: l.description,
      })),
    },
    tx
  )
}

// ============ AUTO-ENTRY FUNCTIONS ============
// Each function creates the appropriate journal entries for a business transaction

/**
 * فاتورة مبيعات - Sales Invoice (from Extract)
 * Dr: Clients Receivable (1210) - totalAmount
 * Cr: Progress Claims Revenue (6110) - subtotal
 * Cr: VAT Payable (3200) - vatAmount
 */
export async function autoEntrySalesInvoice(data: {
  invoiceNo: string
  clientId: string
  subtotal: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  invoiceType: string // TAX_INVOICE, PROGRESS_CLAIM, RENTAL
  date: Date
  projectId?: string
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolve accounts by ROLE — no hardcoded codes!
  const arAccount = await requireAccountByRole(AccountRole.CUSTOMER_AR, 'فاتورة مبيعات', tx)
  const arCode = arAccount.code

  // Determine revenue role based on invoice type
  let revenueRole: string
  switch (data.invoiceType) {
    case 'RENTAL':
      revenueRole = AccountRole.RENTAL_REVENUE
      break
    case 'PROGRESS_CLAIM':
      revenueRole = AccountRole.PROJECT_REVENUE
      break
    default:
      revenueRole = AccountRole.SERVICE_REVENUE
  }
  const revenueAccount = await requireAccountByRole(revenueRole, 'فاتورة مبيعات', tx)
  const revenueCode = revenueAccount.code

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.subtotal, costCenterId: data.costCenterId },
  ]

  // Add VAT line only if VAT > 0 — resolved by role
  if (data.vatAmount > 0) {
    const vatCode = await getAccountCodeByRole(AccountRole.VAT_OUTPUT, tx)
    if (vatCode) {
      lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
    }
  }

  return createJournalEntry({
    date: data.date,
    description: `Sales Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة مبيعات ${data.invoiceNo}`,
    lines,
    sourceType: 'SALES_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
}

/**
 * فاتورة مشتريات - Purchase Invoice
 * Dr: Expense/Asset account - subtotal
 * Dr: VAT Receivable (1400) - vatAmount
 * Cr: Suppliers Payable (3110) - totalAmount
 */
/**
 * فاتورة مشتريات - Purchase Invoice (DEPRECATED — use createPurchaseInvoiceJournalEntry instead)
 *
 * P5-CRIT-006/015 FIX: This function is DEPRECATED. The unified generator is
 * `createPurchaseInvoiceJournalEntry` in `src/lib/auto-journal.ts`, which:
 *   - Is expenseCategory-aware (uses the same category→role map)
 *   - Uses requireAccountByRole (throws on missing role mapping, no hardcoded fallbacks)
 *   - Uses getNextEntryNo (standard JE-NNNNNN format, not JE-PI-...)
 *   - Propagates costCenterId from the linked project's cost center
 *
 * This function is kept for backwards compatibility but now THROWS to force
 * callers to migrate. The only previous callers were supplier-invoices/[id]
 * (PUT approve + PUT edit), which have been migrated to createPurchaseInvoiceJournalEntry.
 *
 * DEPRECATED — purchase invoices use createPurchaseInvoiceJournalEntry (auto-journal.ts).
 *
 * Cr: Suppliers Payable (3110) - totalAmount
 */
export async function autoEntryPurchaseInvoice(_data: {
  invoiceNo: string
  supplierId: string
  subtotal: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  projectId?: string
  costCenterId?: string
  expenseCategory?: string
  activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'
}, _tx?: PrismaTransaction) {
  throw new Error(
    'autoEntryPurchaseInvoice is DEPRECATED. Use createPurchaseInvoiceJournalEntry(invoiceId, tx) ' +
    'from src/lib/auto-journal.ts instead — it is expenseCategory-aware, uses requireAccountByRole ' +
    '(no hardcoded fallback codes), uses getNextEntryNo (standard JE-NNNNNN format), and propagates costCenterId.'
  )
}

/**
 * مستخلص - Progress Claim
 *
 * DEPRECATED — Progress claims do NOT create journal entries.
 *
 * A progress claim is a request for payment, not an invoice. Creating a JE
 * here would double-count revenue once the approved claim is converted into
 * a sales invoice (which itself creates the proper JE via
 * `createSalesInvoiceJournalEntry`).
 *
 * To preserve API compatibility this function now throws a descriptive
 * error so callers are forced to migrate to the correct workflow:
 *   1. Create claim (DRAFT) — no JE.
 *   2. Approve claim — no JE.
 *   3. Generate invoice from approved claim — JE created by the sales
 *      invoice API.
 */
export async function autoEntryProgressClaim(_data: {
  claimNo: string
  projectId: string
  contractId: string
  amount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, _tx?: PrismaTransaction) {
  throw new Error(
    'Progress claims do not create journal entries. ' +
    'Generate an invoice from the approved claim instead.'
  )
}

/**
 * مصروف - Expense
 * Dr: Expense account - amount
 * Dr: VAT Receivable (1400) - vatAmount (if applicable)
 * Cr: Cash (1110/1120/1130) - total
 */
export async function autoEntryExpense(data: {
  description: string
  amount: number
  vatAmount: number | null
  category: string
  date: Date
  payFrom: 'TREASURY' | 'PETTY_CASH' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const categoryRoleMap: Record<string, string> = {
    'CONSUMABLES': AccountRole.PROJECT_COST,
    'SERVICES': AccountRole.SUBCONTRACTOR_COST,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'FUEL': AccountRole.FUEL_EXPENSE,
    'DRIVERS': AccountRole.DRIVER_EXPENSE,
    'TRANSPORT': AccountRole.TRANSPORT_EXPENSE,
    'DELIVERY': AccountRole.TRANSPORT_EXPENSE,
    'RENT': AccountRole.ADMIN_EXPENSE,
    'OFFICE': AccountRole.ADMIN_EXPENSE,
    'INTERNET': AccountRole.ADMIN_EXPENSE,
    'ELECTRICITY': AccountRole.ADMIN_EXPENSE,
    'WATER': AccountRole.ADMIN_EXPENSE,
    'SALARIES': AccountRole.PAYROLL_EXPENSE,
    'INSURANCE': AccountRole.PROJECT_COST,
    'PERMITS': AccountRole.PROJECT_COST,
    'HOSPITALITY': AccountRole.ADMIN_EXPENSE,
    'MANAGEMENT_CARS': AccountRole.ADMIN_EXPENSE,
    'OTHER': AccountRole.ADMIN_EXPENSE,
  }
  const expenseRole = categoryRoleMap[data.category] || AccountRole.ADMIN_EXPENSE
  const expenseAccountCode = await requireAccountCodeByRole(expenseRole, 'العملية المحاسبية', tx)
  const cashAccountCode = await resolvePaymentAccountCode(data.payFrom, tx)
  const vatInputCode = await requireAccountCodeByRole(AccountRole.VAT_INPUT, 'العملية المحاسبية', tx)

  const totalCashOut = data.amount + (data.vatAmount || 0)

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount && data.vatAmount > 0) {
    lines.push({ accountCode: vatInputCode, debit: data.vatAmount, credit: 0 })
  }

  lines.push({ accountCode: cashAccountCode, debit: 0, credit: totalCashOut })

  return createJournalEntry({
    date: data.date,
    description: `Expense: ${data.description}`,
    descriptionAr: `مصروف: ${data.description}`,
    lines,
    sourceType: 'EXPENSE',
    sourceId: `EXP-${Date.now()}`,
  }, tx)
}

/**
 * تحصيل من عميل - Client Payment Receipt
 * Dr: Cash/Bank (1110/1120)
 * Cr: Clients Receivable (1210)
 */
export async function autoEntryClientPayment(data: {
  clientName: string
  amount: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
  reference?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const arCode = await requireAccountCodeByRole(AccountRole.CUSTOMER_AR, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: `Payment received from ${data.clientName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `تحصيل من ${data.clientName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: cashAccountCode, debit: data.amount, credit: 0 },
      { accountCode: arCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'CLIENT_PAYMENT',
    sourceId: data.reference || `CP-${Date.now()}`,
  }, tx)
}

/**
 * دفع لمورد - Supplier Payment
 * Dr: Suppliers Payable (3110)
 * Cr: Cash/Bank (1110/1120)
 */
export async function autoEntrySupplierPayment(data: {
  supplierName: string
  amount: number
  date: Date
  paidFrom: 'TREASURY' | 'BANK'
  reference?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const apCode = await requireAccountCodeByRole(AccountRole.SUPPLIER_AP, 'العملية المحاسبية', tx)
  const cashAccountCode = await resolvePaymentAccountCode(data.paidFrom === 'BANK' ? 'BANK' : 'TREASURY', tx)

  return createJournalEntry({
    date: data.date,
    description: `Payment to ${data.supplierName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `دفع إلى ${data.supplierName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: apCode, debit: data.amount, credit: 0 },
      { accountCode: cashAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUPPLIER_PAYMENT',
    sourceId: data.reference || `SP-${Date.now()}`,
  }, tx)
}

/**
 * سلفة موظف - Employee Advance
 * Dr: Advances to Employees (1230)
 * Cr: Cash (1110)
 */
export async function autoEntryEmployeeAdvance(data: {
  employeeName: string
  amount: number
  date: Date
  /**
   * مصدر السداد — يحترم اختيار المستخدم (المستخدم سيد النظام):
   *   'BANK'               : دائن البنك
   *   'CASH'               : دائن النقدية (الصندوق)
   *   'EMPLOYEE_DEDUCTION' : دائن حساب أرباح/خسائر أضرار (سرقة/تلف/إهمال)
   * إن لم يُحدد، يستخدم النقدية افتراضياً (للتوافق مع السلوك السابق).
   */
  paymentSource?: 'BANK' | 'CASH' | 'EMPLOYEE_DEDUCTION'
  /** كود الحساب الدائن الفعلي (اختياري — يحترم اختيار المستخدم بدقة) */
  paymentAccountCode?: string
  description?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const advanceCode = await requireAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, 'العملية المحاسبية', tx)

  // احترم اختيار المستخدم لمصدر السداد
  let creditCode: string
  let creditLabel: string
  if (data.paymentAccountCode) {
    creditCode = data.paymentAccountCode
    creditLabel = 'حسب اختيار المستخدم'
  } else if (data.paymentSource === 'BANK') {
    creditCode = await resolvePaymentAccountCode('BANK', tx)
    creditLabel = 'بنك'
  } else if (data.paymentSource === 'EMPLOYEE_DEDUCTION') {
    // خصم على الموظف بسبب سرقة/تلف/إهمال — دائن من حساب مخصصات/خسائر أضرار
    // نستخدم حساب EMPLOYEE_ADVANCE نفسه في الحالة الاستثنائية: الشركة تعتبر المبلغ
    // سلفة على الموظف دون خروج نقدي فعلي. الحساب الدائن البديل: LOSS_ON_DAMAGE أو مشابه.
    // للأمان: نستخدم TREASURY كقيمة افتراضية، لكن المستخدم يمكنه تحديد كود مخصص.
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
    creditLabel = 'خصم على الموظف (سرقة/تلف/إهمال)'
  } else {
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
    creditLabel = 'نقدية'
  }

  const descAr = data.description || `سلفة لموظف ${data.employeeName} - ${creditLabel}`

  return createJournalEntry({
    date: data.date,
    description: `Advance to ${data.employeeName}`,
    descriptionAr: descAr,
    lines: [
      { accountCode: advanceCode, debit: data.amount, credit: 0 },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EMPLOYEE_ADVANCE',
    sourceId: `EA-${Date.now()}`,
  }, tx)
}

/**
 * تسوية سلفة - Advance Settlement
 * P4-CRIT-010 FIX: Dr SALARIES_PAYABLE (3310) — relieves the salary liability when the
 * advance is recovered from a future salary. (Was: Dr PAYROLL_EXPENSE which inflated
 * salary expense and produced negative Salaries Payable before accrual.)
 * Cr: Advances to Employees (1230) — relieves the advance asset.
 */
export async function autoEntryAdvanceSettlement(data: {
  employeeName: string
  settledAmount: number
  date: Date
  /**
   * طريقة التحصيل — يحترم اختيار المستخدم (المستخدم سيد النظام):
   *   'SALARY_DEDUCTION' : مدين رواتب مستحقة (الخصم من الراتب) — السلوك الافتراضي
   *   'BANK'             : مدين البنك (استرداد نقدي عبر البنك)
   *   'CASH'             : مدين النقدية (استرداد نقدي من الصندوق)
   */
  settlementMethod?: 'BANK' | 'CASH' | 'SALARY_DEDUCTION'
  /** كود الحساب المدين الفعلي (اختياري — يحترم اختيار المستخدم بدقة) */
  settlementAccountCode?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const advanceCode = await requireAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, 'العملية المحاسبية', tx)

  // احترم اختيار المستخدم لطريقة التحصيل
  let debitCode: string
  let debitLabel: string
  if (data.settlementAccountCode) {
    debitCode = data.settlementAccountCode
    debitLabel = 'حسب اختيار المستخدم'
  } else if (data.settlementMethod === 'BANK') {
    debitCode = await resolvePaymentAccountCode('BANK', tx)
    debitLabel = 'بنك'
  } else if (data.settlementMethod === 'CASH') {
    debitCode = await resolvePaymentAccountCode('TREASURY', tx)
    debitLabel = 'نقدية'
  } else {
    // SALARY_DEDUCTION (default) — Dr SALARIES_PAYABLE
    debitCode = await requireAccountCodeByRole(AccountRole.SALARIES_PAYABLE, 'العملية المحاسبية', tx)
    debitLabel = 'خصم من الراتب'
  }

  return createJournalEntry({
    date: data.date,
    description: `Advance settlement - ${data.employeeName}`,
    descriptionAr: `تسوية سلفة - ${data.employeeName} - ${debitLabel}`,
    lines: [
      { accountCode: debitCode, debit: data.settledAmount, credit: 0 },
      { accountCode: advanceCode, debit: 0, credit: data.settledAmount },
    ],
    sourceType: 'ADVANCE_SETTLEMENT',
    sourceId: `AS-${Date.now()}`,
  }, tx)
}

/**
 * فاتورة مقاول باطن - Subcontractor Invoice
 * Dr: Subcontractor Costs (7130)
 * Dr: VAT Receivable (1400)
 * Cr: Subcontractors Payable (3120)
 */
export async function autoEntrySubcontractorInvoice(data: {
  invoiceNo: string
  subcontractorName: string
  amount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const costCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_COST, 'العملية المحاسبية', tx)
  const vatInputCode = await requireAccountCodeByRole(AccountRole.VAT_INPUT, 'العملية المحاسبية', tx)
  const apCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, 'العملية المحاسبية', tx)

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: costCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: vatInputCode, debit: data.vatAmount, credit: 0 })
  }

  lines.push({ accountCode: apCode, debit: 0, credit: data.totalAmount })

  return createJournalEntry({
    date: data.date,
    description: `Subcontractor Invoice ${data.invoiceNo} - ${data.subcontractorName}`,
    descriptionAr: `فاتورة مقاول باطن ${data.invoiceNo} - ${data.subcontractorName}`,
    lines,
    sourceType: 'SUBCONTRACTOR_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
}

/**
 * تكلفة معدات - Equipment Cost
 * Dr: Equipment Costs (7210/7220/7230/7240)
 * Cr: Cash/Accounts Payable
 */
export async function autoEntryEquipmentCost(data: {
  equipmentName: string
  costType: 'OPERATION' | 'MAINTENANCE' | 'FUEL' | 'OTHER'
  amount: number
  date: Date
  payFrom: 'CASH' | 'AP'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const accountRoleMap: Record<string, string> = {
    'OPERATION': AccountRole.FUEL_EXPENSE,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'FUEL': AccountRole.FUEL_EXPENSE,
    'OTHER': AccountRole.PROJECT_COST,
  }
  const debitRole = accountRoleMap[data.costType] || AccountRole.PROJECT_COST
  const debitAccountCode = await requireAccountCodeByRole(debitRole, 'العملية المحاسبية', tx)
  const creditAccountCode = data.payFrom === 'AP'
    ? (await requireAccountCodeByRole(AccountRole.SUPPLIER_AP, 'العملية المحاسبية', tx))
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    date: data.date,
    description: `Equipment ${data.costType} cost - ${data.equipmentName}`,
    descriptionAr: `تكلفة ${data.costType === 'OPERATION' ? 'تشغيل' : data.costType === 'MAINTENANCE' ? 'صيانة' : data.costType === 'FUEL' ? 'وقود' : 'أخرى'} معدات - ${data.equipmentName}`,
    lines: [
      { accountCode: debitAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EQUIPMENT_COST',
    sourceId: `EQC-${Date.now()}`,
  }, tx)
}

/**
 * شراء معدات - Equipment Purchase
 * Dr: Fixed Asset — Equipment (2120) [FIXED_ASSET role]
 * Cr: Cash (if payFrom=CASH) or Supplier AP (if payFrom=AP)
 *
 * Capitalizes the equipment as a fixed asset on the balance sheet.
 */
export async function autoEntryEquipmentPurchase(data: {
  equipmentCode: string
  equipmentName: string
  amount: number
  date: Date
  payFrom: 'CASH' | 'AP'
}, tx?: PrismaTransaction) {
  const assetCode = await requireAccountCodeByRole(AccountRole.FIXED_ASSET, 'العملية المحاسبية', tx)
  const creditAccountCode = data.payFrom === 'AP'
    ? (await requireAccountCodeByRole(AccountRole.SUPPLIER_AP, 'العملية المحاسبية', tx))
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    date: data.date,
    description: `Equipment Purchase - ${data.equipmentCode} ${data.equipmentName}`,
    descriptionAr: `شراء معدات - ${data.equipmentCode} ${data.equipmentName}`,
    lines: [
      { accountCode: assetCode, debit: data.amount, credit: 0 },
      { accountCode: creditAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EQUIPMENT_PURCHASE',
    sourceId: data.equipmentCode,
  }, tx)
}

/**
 * إيراد تأجير - Rental Invoice (from Timesheet)
 * Dr: Clients Receivable (1210)
 * Cr: Equipment Rental Revenue (6210)
 * Cr: Output VAT (3110)
 */
export async function autoEntryRentalInvoice(data: {
  invoiceNo: string
  subtotal: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const arCode = await requireAccountCodeByRole(AccountRole.CUSTOMER_AR, 'العملية المحاسبية', tx)
  const revenueCode = await requireAccountCodeByRole(AccountRole.RENTAL_REVENUE, 'العملية المحاسبية', tx)

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.subtotal, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    const vatCode = await requireAccountCodeByRole(AccountRole.VAT_OUTPUT, 'العملية المحاسبية', tx)
    lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
  }

  return createJournalEntry({
    date: data.date,
    description: `Rental Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة تأجير ${data.invoiceNo}`,
    lines,
    sourceType: 'RENTAL_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
}

/**
 * صندوق نقدي - Petty Cash
 * Dr: Expense account (8xxx)
 * Cr: Petty Cash (1130)
 */
export async function autoEntryPettyCash(data: {
  description: string
  amount: number
  category: string
  date: Date
  costCenterId?: string
  // P4-CRIT-011: distinguish fund replenishment from disbursement.
  //   FUND     → Dr PETTY_CASH (1130) / Cr BANK (1120)   — moves cash from bank to petty cash box
  //   DISBURSE → Dr EXPENSE  / Cr PETTY_CASH (1130)       — pays for a small expense out of petty cash
  transactionType?: 'FUND' | 'DISBURSE'
  bankAccountCode?: string  // optional — for FUND, the bank to credit
}, tx?: PrismaTransaction) {
  const txnType = data.transactionType || 'DISBURSE'

  if (txnType === 'FUND') {
    // Fund replenishment: Dr PETTY_CASH (1130) / Cr BANK (1120)
    const pettyCashCode = await requireAccountCodeByRole(AccountRole.PETTY_CASH, 'العملية المحاسبية', tx)
    const bankCode = data.bankAccountCode
      || (await requireAccountCodeByRole(AccountRole.BANK, 'تغذية صندوق نثرية', tx))

    return createJournalEntry({
      date: data.date,
      description: `Petty Cash Fund: ${data.description}`,
      descriptionAr: `تغذية صندوق نثرية: ${data.description}`,
      lines: [
        { accountCode: pettyCashCode, debit: data.amount, credit: 0 },
        { accountCode: bankCode, debit: 0, credit: data.amount },
      ],
      sourceType: 'PETTY_CASH',
      sourceId: `PTC-${Date.now()}`,
    }, tx)
  }

  // Default: DISBURSE — Dr EXPENSE / Cr PETTY_CASH (1130)
  const categoryRoleMap: Record<string, string> = {
    'OFFICE': AccountRole.ADMIN_EXPENSE,
    'TRANSPORT': AccountRole.TRANSPORT_EXPENSE,
    'HOSPITALITY': AccountRole.ADMIN_EXPENSE,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'OTHER': AccountRole.ADMIN_EXPENSE,
  }
  const expenseRole = categoryRoleMap[data.category] || AccountRole.ADMIN_EXPENSE
  const expenseAccountCode = await requireAccountCodeByRole(expenseRole, 'العملية المحاسبية', tx)
  // P4-CRIT-011 FIX: use PETTY_CASH (1130), not the first CASH (1110 = Treasury).
  // The CASH role has defaultCodes ['1110', '1130'] and getAccountCodeByRole returns
  // the first by code:asc, which is 1110 (Treasury) — so all petty cash disbursements
  // hit Treasury instead of the Petty Cash sub-account 1130. Use PETTY_CASH role instead.
  const pettyCashCode = await requireAccountCodeByRole(AccountRole.PETTY_CASH, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: `Petty Cash: ${data.description}`,
    descriptionAr: `صندوق نقدي: ${data.description}`,
    lines: [
      { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: pettyCashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'PETTY_CASH',
    sourceId: `PTC-${Date.now()}`,
  }, tx)
}

// ============================================================================
// NEW AUTO-ENTRY FUNCTIONS
// ============================================================================

/**
 * رواتب - Salary Payment
 * Dr: Salaries & Wages (8110)
 * Dr: GOSI Expense (8210)
 * Cr: Cash/Bank (1110/1120)
 * Cr: GOSI Payable (3830)
 */
export async function autoEntrySalary(data: {
  employeeName: string
  grossSalary: number
  gosiEmployeeDeduction: number
  gosiEmployerContribution: number
  date: Date
  payFrom: 'TREASURY' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const payrollCode = await requireAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, 'العملية المحاسبية', tx)
  const gosiExpenseCode = await requireAccountCodeByRole(AccountRole.GOSI_EXPENSE, 'العملية المحاسبية', tx)
  const cashAccountCode = await resolvePaymentAccountCode(data.payFrom === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const gosiPayableCode = await requireAccountCodeByRole(AccountRole.GOSI_PAYABLE, 'العملية المحاسبية', tx)
  const netCashPaid = data.grossSalary - data.gosiEmployeeDeduction

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: payrollCode, debit: data.grossSalary, credit: 0, costCenterId: data.costCenterId },
    { accountCode: gosiExpenseCode, debit: data.gosiEmployerContribution, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.gosiEmployeeDeduction > 0) {
    lines.push({ accountCode: payrollCode, debit: 0, credit: data.gosiEmployeeDeduction, costCenterId: data.costCenterId })
  }

  lines.push({ accountCode: cashAccountCode, debit: 0, credit: netCashPaid })
  lines.push({ accountCode: gosiPayableCode, debit: 0, credit: data.gosiEmployeeDeduction + data.gosiEmployerContribution })

  return createJournalEntry({
    date: data.date,
    description: `Salary payment - ${data.employeeName}`,
    descriptionAr: `صرف راتب - ${data.employeeName}`,
    lines,
    sourceType: 'SALARY',
    sourceId: `SAL-${Date.now()}`,
  }, tx)
}

/**
 * تأمينات اجتماعية - GOSI Contribution
 * Dr: GOSI Expense (8210)
 * Cr: GOSI Payable (3830)
 */
export async function autoEntryGOSI(data: {
  employeeContribution: number
  employerContribution: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const gosiExpenseCode = await requireAccountCodeByRole(AccountRole.GOSI_EXPENSE, 'العملية المحاسبية', tx)
  const gosiPayableCode = await requireAccountCodeByRole(AccountRole.GOSI_PAYABLE, 'العملية المحاسبية', tx)
  const totalGOSI = data.employeeContribution + data.employerContribution

  return createJournalEntry({
    date: data.date,
    description: `GOSI contribution - Employer: ${data.employerContribution}, Employee: ${data.employeeContribution}`,
    descriptionAr: `اشتراك تأمينات اجتماعية - صاحب العمل: ${data.employerContribution}, الموظف: ${data.employeeContribution}`,
    lines: [
      { accountCode: gosiExpenseCode, debit: data.employerContribution, credit: 0, costCenterId: data.costCenterId },
      { accountCode: gosiPayableCode, debit: 0, credit: totalGOSI },
    ],
    sourceType: 'GOSI',
    sourceId: `GOSI-${Date.now()}`,
  }, tx)
}

/**
 * إهلاك - Depreciation (General)
 * Dr: Depreciation Expense (8310/8320/8330/8340)
 * Cr: Accumulated Depreciation (2210/2220/2230/2240)
 */
export async function autoEntryDepreciation(data: {
  assetType: 'CONSTRUCTION_EQUIPMENT' | 'VEHICLES' | 'OFFICE' | 'SOFTWARE'
  amount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const depreciationRoleMap: Record<string, { expense: string; accumulated: string }> = {
    'CONSTRUCTION_EQUIPMENT': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'VEHICLES': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'OFFICE': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'SOFTWARE': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
  }

  const mapping = depreciationRoleMap[data.assetType]
  const expenseCode = await requireAccountCodeByRole(mapping.expense, 'العملية المحاسبية', tx)
  const accumulatedCode = await requireAccountCodeByRole(mapping.accumulated, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: `Depreciation - ${data.assetType}`,
    descriptionAr: `إهلاك - ${data.assetType === 'CONSTRUCTION_EQUIPMENT' ? 'معدات إنشاء' : data.assetType === 'VEHICLES' ? 'مركبات' : data.assetType === 'OFFICE' ? 'أثاث' : 'برمجيات'}`,
    lines: [
      { accountCode: expenseCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: accumulatedCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'DEPRECIATION',
    sourceId: `DEP-${Date.now()}`,
  }, tx)
}

/**
 * إهلاك معدات التأجير - Rental Equipment Depreciation
 * Dr: Rental Equipment Depreciation (7250)
 * Cr: Accum. Depreciation - Rental Equip (2220)
 */
export async function autoEntryRentalDepreciation(data: {
  amount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const depExpenseCode = await requireAccountCodeByRole(AccountRole.RENTAL_DEPRECIATION, 'العملية المحاسبية', tx)
  const accumDepCode = await requireAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: 'Rental equipment depreciation',
    descriptionAr: 'إهلاك معدات التأجير',
    lines: [
      { accountCode: depExpenseCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: accumDepCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'RENTAL_DEPRECIATION',
    sourceId: `RDEP-${Date.now()}`,
  }, tx)
}

/**
 * رسوم نقل وتوصيل - Delivery Fees on Rental
 * Dr: Clients Receivable (1210)
 * Cr: Delivery Fees Revenue (6220)
 * Cr: VAT Payable (3200)
 */
export async function autoEntryDeliveryFees(data: {
  clientId: string
  amount: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const arCode = await requireAccountCodeByRole(AccountRole.CUSTOMER_AR, 'العملية المحاسبية', tx)
  const revenueCode = await requireAccountCodeByRole(AccountRole.RENTAL_REVENUE, 'العملية المحاسبية', tx)

  const lines: { accountCode: string; debit: number; credit: number; costCenterId?: string }[] = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.amount, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    const vatCode = await requireAccountCodeByRole(AccountRole.VAT_OUTPUT, 'العملية المحاسبية', tx)
    lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
  }

  return createJournalEntry({
    date: data.date,
    description: 'Delivery fees',
    descriptionAr: 'رسوم نقل وتوصيل',
    lines,
    sourceType: 'DELIVERY_FEES',
    sourceId: `DF-${Date.now()}`,
  }, tx)
}

/**
 * مقدمات العملاء - Contract Advance
 * Dr: Cash/Bank (1110/1120)
 * Cr: Construction Customer Advances (3410) or Rental Customer Advances (3420)
 */
export async function autoEntryContractAdvance(data: {
  clientName: string
  amount: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
  activityType: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL'
  reference?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const advanceAccountCode = await requireAccountCodeByRole(AccountRole.CUSTOMER_ADVANCE, 'دفعة مقدمة عقد', tx)

  return createJournalEntry({
    date: data.date,
    description: `Contract advance from ${data.clientName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `مقدمة عقد من ${data.clientName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: cashAccountCode, debit: data.amount, credit: 0 },
      { accountCode: advanceAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'CONTRACT_ADVANCE',
    sourceId: data.reference || `CA-${Date.now()}`,
  }, tx)
}

/**
 * احتجازات - Retention
 * Dr: Retention Receivable (1220)
 * Cr: Clients Receivable (1210)
 */
export async function autoEntryRetention(data: {
  clientName: string
  retentionAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const retentionCode = await requireAccountCodeByRole(AccountRole.RETENTION_RECEIVABLE, 'العملية المحاسبية', tx)
  const arCode = await requireAccountCodeByRole(AccountRole.CUSTOMER_AR, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: `Retention withheld by ${data.clientName}`,
    descriptionAr: `احتجاز لدى ${data.clientName}`,
    lines: [
      { accountCode: retentionCode, debit: data.retentionAmount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: arCode, debit: 0, credit: data.retentionAmount, costCenterId: data.costCenterId },
    ],
    sourceType: 'RETENTION',
    sourceId: `RET-${Date.now()}`,
  }, tx)
}

/**
 * زكاة - Zakat
 * Dr: Zakat Expense (8510)
 * Cr: Zakat Payable (3810)
 */
export async function autoEntryZakat(data: {
  amount: number
  date: Date
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const zakatExpenseCode = await requireAccountCodeByRole(AccountRole.ZAKAT_EXPENSE, 'العملية المحاسبية', tx)
  const zakatPayableCode = await requireAccountCodeByRole(AccountRole.ZAKAT_PAYABLE, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: 'Zakat provision',
    descriptionAr: 'مخصص الزكاة',
    lines: [
      { accountCode: zakatExpenseCode, debit: data.amount, credit: 0 },
      { accountCode: zakatPayableCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'ZAKAT',
    sourceId: `ZAK-${Date.now()}`,
  }, tx)
}

/**
 * مكافأة نهاية الخدمة - End of Service Provision
 * Dr: Salaries & Wages (8110)
 * Cr: End of Service Benefits Provision (3710)
 */
export async function autoEntryEndOfService(data: {
  amount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const payrollCode = await requireAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, 'العملية المحاسبية', tx)
  const eosCode = await requireAccountCodeByRole(AccountRole.EOS_PROVISION, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: 'End of service benefits provision',
    descriptionAr: 'مخصص مكافأة نهاية الخدمة',
    lines: [
      { accountCode: payrollCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: eosCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'END_OF_SERVICE',
    sourceId: `EOS-${Date.now()}`,
  }, tx)
}

/**
 * التخلص من أصل - Asset Disposal
 * Dr: Cash/Bank (1110/1120) - sale price
 * Cr: Asset account (2110/2120/2130/2140) - original cost (or net book value)
 * Dr/Cr: Gain/Loss on disposal (6310 gain / 8610 loss)
 */
export async function autoEntryAssetDisposal(data: {
  assetAccountCode: string // e.g., '2110', '2120', '2130', '2140'
  accumulatedDepAccountCode: string // e.g., '2210', '2220', '2230', '2240'
  originalCost: number
  accumulatedDepreciation: number
  salePrice: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const netBookValue = data.originalCost - data.accumulatedDepreciation
  const gainLoss = data.salePrice - netBookValue

  const lines = [
    { accountCode: cashAccountCode, debit: data.salePrice, credit: 0 }, // Cash received
    { accountCode: data.accumulatedDepAccountCode, debit: data.accumulatedDepreciation, credit: 0 }, // Remove accumulated depreciation
    { accountCode: data.assetAccountCode, debit: 0, credit: data.originalCost }, // Remove asset
  ]

  // If gain, credit gain account. If loss, debit loss account.
  // BA-08: resolved by role — no hardcoded account codes.
  if (gainLoss > 0) {
    const gainCode = await requireAccountCodeByRole(AccountRole.ASSET_DISPOSAL_GAIN, 'التخلص من أصل', tx)
    lines.push({ accountCode: gainCode, debit: 0, credit: gainLoss })
  } else if (gainLoss < 0) {
    const lossCode = await requireAccountCodeByRole(AccountRole.ASSET_DISPOSAL_LOSS, 'التخلص من أصل', tx)
    lines.push({ accountCode: lossCode, debit: Math.abs(gainLoss), credit: 0 })
  }

  return createJournalEntry({
    date: data.date,
    description: `Asset disposal - ${data.assetAccountCode}`,
    descriptionAr: `التخلص من أصل - ${data.assetAccountCode}`,
    lines,
    sourceType: 'ASSET_DISPOSAL',
    sourceId: `DSP-${Date.now()}`,
  }, tx)
}

/**
 * إقرار ضريبي - VAT Declaration
 * Dr: Output VAT (3110) - total output VAT
 * Cr: Input VAT (3120) - total input VAT
 * Cr: VAT Due (3130) - net VAT payable (if output > input)
 * OR
 * Dr: Input VAT (3120) - if input > output (refund scenario)
 * Cr: Output VAT (3110)
 * Dr: VAT Refund Receivable (1410) - if refund due
 */
export async function autoEntryVATDeclaration(data: {
  period: string
  outputVat: number
  inputVat: number
  netVat: number // positive = payable, negative = refundable
  date: Date
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const vatOutputCode = await requireAccountCodeByRole(AccountRole.VAT_OUTPUT, 'العملية المحاسبية', tx)
  const vatInputCode = await requireAccountCodeByRole(AccountRole.VAT_INPUT, 'العملية المحاسبية', tx)
  const vatDueCode = await requireAccountCodeByRole(AccountRole.VAT_DUE, 'العملية المحاسبية', tx)
  // FIXED (CRITICAL #14): VAT refund is an ASSET (1410), not a liability.
  // The prior code used VAT_INPUT role (which maps to liability 3120) as the refund
  // debit account → zeroed out the liability instead of creating a receivable asset.
  // Now uses the dedicated VAT_REFUND_RECEIVABLE role.
  const vatRefundCode = await requireAccountCodeByRole(AccountRole.VAT_REFUND_RECEIVABLE, 'العملية المحاسبية', tx)

  const lines: { accountCode: string; debit: number; credit: number }[] = []

  // Close Output VAT - debit to zero it out
  lines.push({ accountCode: vatOutputCode, debit: data.outputVat, credit: 0 })

  // Close Input VAT - credit to zero it out
  lines.push({ accountCode: vatInputCode, debit: 0, credit: data.inputVat })

  // Net VAT position
  if (data.netVat > 0) {
    // More output than input → owe VAT
    lines.push({ accountCode: vatDueCode, debit: 0, credit: data.netVat })
  } else if (data.netVat < 0) {
    // More input than output → refund due
    lines.push({ accountCode: vatRefundCode, debit: Math.abs(data.netVat), credit: 0 })
  }

  return createJournalEntry({
    date: data.date,
    description: `VAT Declaration - ${data.period}`,
    descriptionAr: `إقرار ضريبي - ${data.period}`,
    lines,
    sourceType: 'VAT_DECLARATION',
    sourceId: `VAT-${data.period}`,
  }, tx)
}

/**
 * سداد الضريبة - VAT Payment
 * Dr: VAT Due (3130)
 * Cr: Bank (1120)
 */
export async function autoEntryVATPayment(data: {
  period: string
  amount: number
  date: Date
  reference?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const vatDueCode = await requireAccountCodeByRole(AccountRole.VAT_DUE, 'العملية المحاسبية', tx)
  const bankCode = await resolvePaymentAccountCode('BANK', tx)

  return createJournalEntry({
    date: data.date,
    description: `VAT Payment - ${data.period}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `سداد ضريبي - ${data.period}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: vatDueCode, debit: data.amount, credit: 0 },
      { accountCode: bankCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'VAT_PAYMENT',
    sourceId: `VTP-${data.period}`,
  }, tx)
}


// ============ SALARY ACCOUNT HELPER ============

/**
 * Get the salary expense account code based on activity type
 * PROJECT: Salaries & Wages (8110)
 * RENTAL: Equipment Operation Costs (7210)
 * ADMIN: Salaries & Wages (8110)
 */
export async function getSalaryAccountCode(activity: 'PROJECT' | 'RENTAL' | 'ADMIN', tx?: PrismaTransaction): Promise<string> {
  switch (activity) {
    case 'RENTAL':
      return await requireAccountCodeByRole(AccountRole.DRIVER_EXPENSE, 'العملية المحاسبية', tx)
    case 'PROJECT':
      return await requireAccountCodeByRole(AccountRole.PROJECT_COST, 'العملية المحاسبية', tx)
    case 'ADMIN':
    default:
      return await requireAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, 'العملية المحاسبية', tx)
  }
}

// ============ ACCOUNT BALANCE HELPERS ============
//
// getAccountBalance has been moved to ./queries (canonical location).
// It is re-exported above for backward compatibility.
// The legacy signature `getAccountBalance(accountCode)` is preserved —
// the canonical version accepts an optional `range` parameter.

// ============ SUBCONTRACTOR CASH-FLOW AUTO ENTRIES ============
// Added in Phase 2 Cycle 1 to fix P2-CRIT-002: subcontractor advances, payments,
// and retentions were creating DB records without journal entries — the GL was
// blind to all subcontractor cash flows. Now every subcontractor financial
// operation creates a proper double-entry posting through the guard.

/**
 * سلفة مقاول باطن - Subcontractor Advance
 * Dr: SUBCONTRACTOR_ADVANCE (1230)  — asset (advance is recoverable)
 * Cr: CASH (1110) or BANK
 *
 * The advance is recovered later via autoEntrySubcontractorPayment (offset)
 * or via a dedicated recovery endpoint.
 */
export async function autoEntrySubcontractorAdvance(data: {
  advanceNo: string
  subcontractorName: string
  amount: number
  date: Date
  paymentMethod?: 'CASH' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const advanceCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_ADVANCE, 'العملية المحاسبية', tx)
  const cashCode = data.paymentMethod === 'BANK'
    ? (await requireAccountCodeByRole(AccountRole.BANK, 'العملية المحاسبية', tx))
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    date: data.date,
    description: `Subcontractor Advance ${data.advanceNo} - ${data.subcontractorName}`,
    descriptionAr: `سلفة مقاول باطن ${data.advanceNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: advanceCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: cashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUBCONTRACTOR_ADVANCE',
    sourceId: data.advanceNo,
  }, tx)
}

/**
 * سداد لمقاول باطن - Subcontractor Payment
 * Dr: SUBCONTRACTOR_AP (3220)  — settles the payable accrued at invoice
 * Cr: CASH (1110) or BANK
 *
 * If the payment includes a retention withholding portion, the caller should
 * also invoke autoEntrySubcontractorRetention to accrue the retained amount
 * as a liability (Cr SUBCONTRACTOR_RETENTION_PAYABLE / Dr SUBCONTRACTOR_AP).
 */
export async function autoEntrySubcontractorPayment(data: {
  paymentNo: string
  subcontractorName: string
  amount: number
  date: Date
  paymentMethod?: 'CASH' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const apCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, 'العملية المحاسبية', tx)
  const cashCode = data.paymentMethod === 'BANK'
    ? (await requireAccountCodeByRole(AccountRole.BANK, 'العملية المحاسبية', tx))
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    date: data.date,
    description: `Subcontractor Payment ${data.paymentNo} - ${data.subcontractorName}`,
    descriptionAr: `سداد لمقاول باطن ${data.paymentNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: apCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: cashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUBCONTRACTOR_PAYMENT',
    sourceId: data.paymentNo,
  }, tx)
}

/**
 * احتجاز ضمان مقاول باطن - Subcontractor Retention
 * Dr: SUBCONTRACTOR_AP (3220)        — reduces the AP (cash not paid)
 * Cr: SUBCONTRACTOR_RETENTION_PAYABLE (3500)  — liability until released
 *
 * Called either at invoice time (accrue retention) or at payment time
 * (withhold retention from cash payment).
 */
export async function autoEntrySubcontractorRetention(data: {
  retentionNo: string
  subcontractorName: string
  withheldAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const apCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, 'العملية المحاسبية', tx)
  const retentionCode = await requireAccountCodeByRole(AccountRole.SUBCONTRACTOR_RETENTION_PAYABLE, 'العملية المحاسبية', tx)

  return createJournalEntry({
    date: data.date,
    description: `Subcontractor Retention ${data.retentionNo} - ${data.subcontractorName}`,
    descriptionAr: `احتجاز ضمان مقاول باطن ${data.retentionNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: apCode, debit: data.withheldAmount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: retentionCode, debit: 0, credit: data.withheldAmount },
    ],
    sourceType: 'SUBCONTRACTOR_RETENTION',
    sourceId: data.retentionNo,
  }, tx)
}

/**
 * تكلفة يدوية على مشروع - Manual Cost Entry
 * Dr: PROJECT_COST (7110)  — or costType-specific role
 * Cr: CASH (1110) / AP (3210) based on payFrom
 *
 * Used for manual project cost entries that aren't from a source document
 * (e.g., overhead allocation, journal correction to project cost).
 */
export async function autoEntryManualCost(data: {
  description: string
  amount: number
  date: Date
  costType?: string
  payFrom?: 'CASH' | 'AP'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const costCode = await requireAccountCodeByRole(AccountRole.PROJECT_COST, 'العملية المحاسبية', tx)
  const creditCode = data.payFrom === 'AP'
    ? (await requireAccountCodeByRole(AccountRole.SUPPLIER_AP, 'العملية المحاسبية', tx))
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    date: data.date,
    description: `Manual Cost Entry - ${data.description}`,
    descriptionAr: `قيد تكلفة يدوية - ${data.description}`,
    lines: [
      { accountCode: costCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'MANUAL_COST',
    sourceId: `MCE-${Date.now()}`,
  }, tx)
}

/**
 * تكلفة العمالة المباشرة - Direct Labor Cost
 * P4-CRIT-005 FIX: previously LaborCost had NO journal entry — GL was blind to all
 * project labor costs. Now creates:
 *   Dr LABOR_COST (7110) — with costCenterId from Project.costCenter
 *   Cr CASH/BANK (1110/1120) — account chosen by the user (المستخدم سيد النظام)
 * If a specific employee is linked AND paid via salary accrual, this is a direct cash
 * payment (e.g. daily laborers) which is distinct from monthly salaries.
 *
 * User-empowering override: data.paymentAccountCode lets the user pick the credit account.
 * Falls back to role-based TREASURY (cash) if not provided.
 */
export async function autoEntryLaborCost(data: {
  description: string
  amount: number
  date: Date
  costCenterId?: string
  /** 'BANK' | 'CASH' — إذا لم تُحدد، تُستخدم النقدية */
  paymentSource?: 'BANK' | 'CASH'
  /** كود الحساب الدائن الفعلي (اختياري — يحترم اختيار المستخدم) */
  paymentAccountCode?: string
}, tx?: PrismaTransaction) {
  const laborCode = await requireAccountCodeByRole(AccountRole.LABOR_COST, 'العملية المحاسبية', tx)
  // احترم اختيار المستخدم: استخدم paymentAccountCode إن وُجد، وإلا احلل من paymentSource
  let creditCode: string
  if (data.paymentAccountCode) {
    creditCode = data.paymentAccountCode
  } else if (data.paymentSource === 'BANK') {
    creditCode = await resolvePaymentAccountCode('BANK', tx)
  } else {
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
  }

  return createJournalEntry({
    date: data.date,
    description: `Labor Cost - ${data.description}`,
    descriptionAr: `تكلفة عمالة - ${data.description}`,
    lines: [
      { accountCode: laborCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'LABOR_COST',
    sourceId: `LC-${Date.now()}`,
  }, tx)
}

// ============ GENERAL LEDGER ============
//
// getGeneralLedger has been moved to ./queries (canonical location).
// It is re-exported above for backward compatibility.
//
// IMPORTANT: The legacy signature returned `Promise<Array>` and did NOT compute
// an opening balance (running balance started at 0). The canonical version
// returns `Promise<GeneralLedgerData | null>` with a proper opening balance.
//
// Consumers that did `const entries = await getGeneralLedger(code, from, to)`
// will now get a structured object. Callers needing only the lines array can
// destructure: `const { lines } = await getGeneralLedger(code, { from, to })`.
// The /api/general-ledger route has been updated to use the canonical shape.
