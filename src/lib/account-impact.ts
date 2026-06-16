// ============================================================================
// أثر الحسابات على النظام - Account Impact Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// This engine analyzes how each account is used across the system,
// showing the accountant which operations, documents, and reports
// reference a particular account BEFORE they make any changes.
//
// This implements the user's vision:
// "يجب أن يفهم المحاسب أثر الحساب قبل استخدامه"
// ============================================================================

import { db } from '@/lib/db'
import { getOperationsUsingRole, getAllFinancialMappings } from '@/lib/financial-mapping-engine'
import { ACCOUNT_ROLES, type AccountRoleKey } from '@/lib/account-roles'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountImpactInfo {
  account: {
    id: string
    code: string
    name: string
    nameAr: string | null
    type: string
    accountRole: string | null
    parentCode: string | null
    isActive: boolean
    allowPosting: boolean
    level: number
  }
  parentAccount: {
    id: string
    code: string
    name: string
    nameAr: string | null
  } | null
  childAccounts: {
    id: string
    code: string
    name: string
    nameAr: string | null
    isActive: boolean
  }[]
  role: {
    role: string
    labelAr: string
    labelEn: string
  } | null
  operations: {
    operationType: string
    labelAr: string
    labelEn: string
    side: 'debit' | 'credit' | 'both'
  }[]
  usageStats: {
    journalLineCount: number
    totalDebit: number
    totalCredit: number
    netBalance: number
    lastUsedDate: Date | null
  }
  documentReferences: {
    type: string
    labelAr: string
    count: number
  }[]
  canDeactivate: boolean
  deactivationBlockers: string[]
}

// ---------------------------------------------------------------------------
// Main Impact Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze the full impact of an account on the system.
 * Returns comprehensive information about how the account is used.
 */
export async function getAccountImpact(accountId: string): Promise<AccountImpactInfo | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
  })

  if (!account) return null

  // Get parent account
  let parentAccount = null
  if (account.parentCode) {
    parentAccount = await db.account.findFirst({
      where: { code: account.parentCode },
      select: { id: true, code: true, name: true, nameAr: true },
    })
  }

  // Get child accounts
  const childAccounts = await db.account.findMany({
    where: { parentCode: account.code },
    select: { id: true, code: true, name: true, nameAr: true, isActive: true },
    orderBy: { code: 'asc' },
  })

  // Get role info
  let role = null
  if (account.accountRole) {
    const roleInfo = ACCOUNT_ROLES[account.accountRole as AccountRoleKey]
    if (roleInfo) {
      role = {
        role: roleInfo.role,
        labelAr: roleInfo.labelAr,
        labelEn: roleInfo.labelEn,
      }
    }
  }

  // Get operations using this account's role
  let operations: AccountImpactInfo['operations'] = []
  if (account.accountRole) {
    operations = await getOperationsUsingRole(account.accountRole as AccountRoleKey)
  }

  // Get journal line statistics
  const journalLines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      deletedAt: null,
    },
    include: {
      journalEntry: {
        select: { date: true, status: true },
      },
    },
  })

  const postedLines = journalLines.filter(l => l.journalEntry.status === 'POSTED')
  const totalDebit = postedLines.reduce((sum, l) => sum + Number(l.debit), 0)
  const totalCredit = postedLines.reduce((sum, l) => sum + Number(l.credit), 0)
  const lastUsedDate = postedLines.length > 0
    ? new Date(Math.max(...postedLines.map(l => new Date(l.journalEntry.date).getTime())))
    : null

  // Get document references (which modules use this account)
  const documentReferences: { type: string; labelAr: string; count: number }[] = []

  // Check Sales Invoices
  const salesInvoiceCount = await db.salesInvoice.count({
    where: { journalEntryId: { not: null } },
  })
  if (salesInvoiceCount > 0 && operations.some(o => o.operationType.includes('INVOICE'))) {
    documentReferences.push({
      type: 'sales_invoices',
      labelAr: 'فواتير المبيعات',
      count: salesInvoiceCount,
    })
  }

  // Check Client Payments
  const clientPaymentCount = await db.clientPayment.count({
    where: { receivingAccountId: account.id },
  })
  if (clientPaymentCount > 0) {
    documentReferences.push({
      type: 'client_payments',
      labelAr: 'تحصيلات العملاء',
      count: clientPaymentCount,
    })
  }

  // Check Supplier Payments
  const supplierPaymentCount = await db.supplierPayment.count({
    where: { payingAccountId: account.id },
  })
  if (supplierPaymentCount > 0) {
    documentReferences.push({
      type: 'supplier_payments',
      labelAr: 'سداد الموردين',
      count: supplierPaymentCount,
    })
  }

  // Check Salaries
  const salaryCount = await db.salary.count({
    where: { journalEntryId: { not: null } },
  })
  if (salaryCount > 0 && operations.some(o => o.operationType === 'PAYROLL')) {
    documentReferences.push({
      type: 'salaries',
      labelAr: 'مسيرات الرواتب',
      count: salaryCount,
    })
  }

  // Check Expenses
  const expenseCount = await db.expense.count({
    where: { journalEntryId: { not: null } },
  })
  if (expenseCount > 0) {
    documentReferences.push({
      type: 'expenses',
      labelAr: 'المصروفات',
      count: expenseCount,
    })
  }

  // Check Journal Entries
  const jeCount = await db.journalLine.count({
    where: { accountId: account.id, deletedAt: null },
  })
  if (jeCount > 0) {
    documentReferences.push({
      type: 'journal_entries',
      labelAr: 'قيود اليومية',
      count: jeCount,
    })
  }

  // Check if account is linked to equipment
  const equipmentCount = await db.equipment.count({
    where: { assetAccountId: account.id },
  })
  if (equipmentCount > 0) {
    documentReferences.push({
      type: 'equipment',
      labelAr: 'المعدات (أصول)',
      count: equipmentCount,
    })
  }

  // Check if account is linked to employees
  const employeeCount = await db.employee.count({
    where: { expenseAccountId: account.id },
  })
  if (employeeCount > 0) {
    documentReferences.push({
      type: 'employees',
      labelAr: 'الموظفون (رواتب)',
      count: employeeCount,
    })
  }

  // Check if account is linked to bank accounts
  const bankAccountCount = await db.bankAccount.count({
    where: { accountId: account.id },
  })
  if (bankAccountCount > 0) {
    documentReferences.push({
      type: 'bank_accounts',
      labelAr: 'حسابات بنكية',
      count: bankAccountCount,
    })
  }

  // Determine if the account can be deactivated
  const deactivationBlockers: string[] = []

  if (journalLines.length > 0) {
    deactivationBlockers.push(`يوجد ${journalLines.length} قيد يومي يستخدم هذا الحساب`)
  }

  if (account.accountRole) {
    // Check if this is the only account for its role
    const sameRoleAccounts = await db.account.count({
      where: {
        accountRole: account.accountRole,
        isActive: true,
        id: { not: account.id },
      },
    })
    if (sameRoleAccounts === 0) {
      deactivationBlockers.push(`هذا الحساب هو الوحيد المرتبط بدور "${ACCOUNT_ROLES[account.accountRole as AccountRoleKey]?.labelAr || account.accountRole}"`)
    }
  }

  if (bankAccountCount > 0) {
    deactivationBlockers.push('هناك حسابات بنكية مرتبطة بهذا الحساب')
  }

  if (equipmentCount > 0) {
    deactivationBlockers.push(`هناك ${equipmentCount} معدة مرتبطة بهذا الحساب كأصل`)
  }

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      nameAr: account.nameAr,
      type: account.type,
      accountRole: account.accountRole,
      parentCode: account.parentCode,
      isActive: account.isActive,
      allowPosting: account.allowPosting,
      level: account.level,
    },
    parentAccount,
    childAccounts,
    role,
    operations,
    usageStats: {
      journalLineCount: journalLines.length,
      totalDebit,
      totalCredit,
      netBalance: totalDebit - totalCredit,
      lastUsedDate,
    },
    documentReferences,
    canDeactivate: deactivationBlockers.length === 0,
    deactivationBlockers,
  }
}

/**
 * Get a simplified impact summary for all accounts.
 * Used by the Account Impact list view.
 */
export async function getAccountImpactSummary() {
  const accounts = await db.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      type: true,
      accountRole: true,
      parentCode: true,
      allowPosting: true,
      level: true,
    },
  })

  const summary = []

  for (const account of accounts) {
    // Quick usage count
    const journalLineCount = await db.journalLine.count({
      where: { accountId: account.id, deletedAt: null },
    })

    const childCount = await db.account.count({
      where: { parentCode: account.code, isActive: true },
    })

    const roleLabel = account.accountRole
      ? ACCOUNT_ROLES[account.accountRole as AccountRoleKey]?.labelAr || account.accountRole
      : null

    summary.push({
      id: account.id,
      code: account.code,
      name: account.nameAr || account.name,
      type: account.type,
      accountRole: account.accountRole,
      roleLabel,
      parentCode: account.parentCode,
      allowPosting: account.allowPosting,
      level: account.level,
      childCount,
      journalLineCount,
      hasUsage: journalLineCount > 0 || childCount > 0,
    })
  }

  return summary
}

/**
 * Deactivate an account (soft delete) instead of hard deleting it.
 * Only allows deactivation if the account has no critical dependencies.
 */
export async function deactivateAccount(accountId: string): Promise<{ success: boolean; message: string }> {
  const impact = await getAccountImpact(accountId)

  if (!impact) {
    return { success: false, message: 'الحساب غير موجود' }
  }

  if (!impact.canDeactivate) {
    return {
      success: false,
      message: `لا يمكن تعطيل هذا الحساب:\n${impact.deactivationBlockers.join('\n')}`,
    }
  }

  await db.account.update({
    where: { id: accountId },
    data: { isActive: false },
  })

  return { success: true, message: 'تم تعطيل الحساب بنجاح' }
}
