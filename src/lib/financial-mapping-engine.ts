// ============================================================================
// محرك الربط المحاسبي - Financial Mapping Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// This is the central engine that defines how each business operation maps
// to accounting roles (debit & credit). When an accountant changes the
// account assigned to a role, ALL operations using that role automatically
// use the new account - zero code changes needed.
//
// Architecture:
//   Operation Type → FinancialMapping → Debit Roles + Credit Roles
//   Each Role → Account (via account-roles.ts)
//   Account can be a Parent (group) → allows child account selection
//
// This implements the user's vision:
//   Chart of Accounts → Account Roles → Financial Mapping Engine
//   → Business Operations → Journal Entries → General Ledger → Financial Statements
// ============================================================================

import { db } from '@/lib/db'
import { AccountRole, ACCOUNT_ROLES, type AccountRoleInfo, type AccountRoleKey } from '@/lib/account-roles'
import type { Account } from '@prisma/client'

// ---------------------------------------------------------------------------
// Operation Type Definitions
// ---------------------------------------------------------------------------

/**
 * Every business operation that creates a journal entry is defined here.
 * Each operation type maps to a FinancialMapping record that specifies
 * which account roles are debited and credited.
 */
export const OperationType = {
  // ── Sales / Revenue Operations ──────────────────────────────────────
  RENTAL_INVOICE: 'RENTAL_INVOICE',           // فاتورة تأجير معدات
  PROJECT_INVOICE: 'PROJECT_INVOICE',         // فاتورة مشروع / مستخلص
  SERVICE_INVOICE: 'SERVICE_INVOICE',         // فاتورة خدمات

  // ── Payment Operations ──────────────────────────────────────────────
  CLIENT_PAYMENT: 'CLIENT_PAYMENT',           // تحصيل من عميل
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',       // سداد مورد
  SUBCONTRACTOR_PAYMENT: 'SUBCONTRACTOR_PAYMENT', // سداد مقاول باطن

  // ── Purchase Operations ─────────────────────────────────────────────
  PURCHASE_INVOICE: 'PURCHASE_INVOICE',       // فاتورة شراء
  GOODS_RECEIPT: 'GOODS_RECEIPT',             // استلام بضائع

  // ── HR / Payroll Operations ─────────────────────────────────────────
  PAYROLL: 'PAYROLL',                         // مسير رواتب
  EMPLOYEE_ADVANCE: 'EMPLOYEE_ADVANCE',       // سلفة موظف
  ADVANCE_SETTLEMENT: 'ADVANCE_SETTLEMENT',   // تسوية سلفة

  // ── Expense Operations ──────────────────────────────────────────────
  FUEL_EXPENSE: 'FUEL_EXPENSE',               // مصروف وقود
  MAINTENANCE_EXPENSE: 'MAINTENANCE_EXPENSE', // مصروف صيانة
  GENERAL_EXPENSE: 'GENERAL_EXPENSE',         // مصروف عام
  PROJECT_EXPENSE: 'PROJECT_EXPENSE',         // مصروف مشروع

  // ── Asset Operations ────────────────────────────────────────────────
  ASSET_ACQUISITION: 'ASSET_ACQUISITION',     // شراء أصل ثابت
  ASSET_DEPRECIATION: 'ASSET_DEPRECIATION',   // إهلاك أصل ثابت

  // ── Tax Operations ──────────────────────────────────────────────────
  VAT_PAYMENT: 'VAT_PAYMENT',                 // سداد ضريبة
  VAT_RETURN: 'VAT_RETURN',                   // إقرار ضريبي

  // ── Other Operations ────────────────────────────────────────────────
  MANUAL_JOURNAL: 'MANUAL_JOURNAL',           // قيد يدوي
  PETTY_CASH: 'PETTY_CASH',                   // مصروف نثري
  BANK_RECONCILIATION: 'BANK_RECONCILIATION', // تسوية بنكية
  PROVISION: 'PROVISION',                     // مخصص
  ZAKAT: 'ZAKAT',                             // زكاة
} as const

export type OperationTypeKey = keyof typeof OperationType

// ---------------------------------------------------------------------------
// Financial Mapping Template
// ---------------------------------------------------------------------------

export interface FinancialMappingTemplate {
  operationType: string
  labelAr: string
  labelEn: string
  description: string
  debitRoles: AccountRoleKey[]
  creditRoles: AccountRoleKey[]
}

/**
 * Default financial mapping templates.
 * These define the standard accounting logic for each operation type.
 * They are seeded into the FinancialMapping table on first run.
 *
 * Pattern: Operation → Debit Roles | Credit Roles
 * When the accountant changes which account a role points to,
 * ALL operations automatically use the new account.
 */
export const FINANCIAL_MAPPING_TEMPLATES: FinancialMappingTemplate[] = [
  // ── Sales / Revenue ──────────────────────────────────────────────────
  {
    operationType: 'RENTAL_INVOICE',
    labelAr: 'فاتورة تأجير معدات',
    labelEn: 'Equipment Rental Invoice',
    description: 'إصدار فاتورة تأجير معدات - مدين: ذمم العملاء | دائن: إيرادات التأجير + ضريبة القيمة المضافة',
    debitRoles: ['CUSTOMER_AR'],
    creditRoles: ['RENTAL_REVENUE', 'VAT_OUTPUT'],
  },
  {
    operationType: 'PROJECT_INVOICE',
    labelAr: 'فاتورة مشروع',
    labelEn: 'Project Invoice',
    description: 'إصدار فاتورة مشروع / مستخلص - مدين: ذمم العملاء | دائن: إيرادات المشاريع + ضريبة القيمة المضافة',
    debitRoles: ['CUSTOMER_AR'],
    creditRoles: ['PROJECT_REVENUE', 'VAT_OUTPUT'],
  },
  {
    operationType: 'SERVICE_INVOICE',
    labelAr: 'فاتورة خدمات',
    labelEn: 'Service Invoice',
    description: 'إصدار فاتورة خدمات - مدين: ذمم العملاء | دائن: إيرادات الخدمات + ضريبة القيمة المضافة',
    debitRoles: ['CUSTOMER_AR'],
    creditRoles: ['SERVICE_REVENUE', 'VAT_OUTPUT'],
  },

  // ── Client Payments ──────────────────────────────────────────────────
  {
    operationType: 'CLIENT_PAYMENT',
    labelAr: 'تحصيل من عميل',
    labelEn: 'Client Payment',
    description: 'تحصيل مبلغ من عميل - مدين: البنك/النقدية | دائن: ذمم العملاء',
    debitRoles: ['BANK', 'CASH'],
    creditRoles: ['CUSTOMER_AR'],
  },

  // ── Supplier Payments ────────────────────────────────────────────────
  {
    operationType: 'SUPPLIER_PAYMENT',
    labelAr: 'سداد مورد',
    labelEn: 'Supplier Payment',
    description: 'سداد مبلغ لمورد - مدين: ذمم الموردين | دائن: البنك/النقدية',
    debitRoles: ['SUPPLIER_AP'],
    creditRoles: ['BANK', 'CASH'],
  },
  {
    operationType: 'SUBCONTRACTOR_PAYMENT',
    labelAr: 'سداد مقاول باطن',
    labelEn: 'Subcontractor Payment',
    description: 'سداد مبلغ لمقاول من الباطن - مدين: ذمم المقاولين | دائن: البنك/النقدية',
    debitRoles: ['SUBCONTRACTOR_AP'],
    creditRoles: ['BANK', 'CASH'],
  },

  // ── Purchase Operations ──────────────────────────────────────────────
  {
    operationType: 'PURCHASE_INVOICE',
    labelAr: 'فاتورة شراء',
    labelEn: 'Purchase Invoice',
    description: 'فاتورة شراء من مورد - مدين: التكاليف + ضريبة مدخلة | دائن: ذمم الموردين',
    debitRoles: ['PROJECT_COST', 'FUEL_EXPENSE', 'MAINTENANCE_EXPENSE', 'ADMIN_EXPENSE', 'VAT_INPUT'],
    creditRoles: ['SUPPLIER_AP'],
  },
  {
    operationType: 'GOODS_RECEIPT',
    labelAr: 'استلام بضائع',
    labelEn: 'Goods Receipt',
    description: 'استلام بضائع من مورد - مدين: تكاليف المشاريع + ضريبة مدخلة | دائن: ذمم الموردين',
    debitRoles: ['PROJECT_COST', 'VAT_INPUT'],
    creditRoles: ['SUPPLIER_AP'],
  },

  // ── Payroll ──────────────────────────────────────────────────────────
  {
    operationType: 'PAYROLL',
    labelAr: 'مسير الرواتب',
    labelEn: 'Payroll Run',
    description: 'ترحيل مسير الرواتب - مدين: مصروف الرواتب + مصروف التأمينات | دائن: رواتب مستحقة + مستحقات التأمينات',
    debitRoles: ['PAYROLL_EXPENSE', 'GOSI_EXPENSE'],
    creditRoles: ['SALARIES_PAYABLE', 'GOSI_PAYABLE'],
  },
  {
    operationType: 'EMPLOYEE_ADVANCE',
    labelAr: 'سلفة موظف',
    labelEn: 'Employee Advance',
    description: 'صرف سلفة لموظف - مدين: سلف الموظفين | دائن: البنك/النقدية',
    debitRoles: ['EMPLOYEE_ADVANCE'],
    creditRoles: ['BANK', 'CASH'],
  },
  {
    operationType: 'ADVANCE_SETTLEMENT',
    labelAr: 'تسوية سلفة',
    labelEn: 'Advance Settlement',
    description: 'تسوية سلفة موظف مع الراتب - مدين: رواتب مستحقة | دائن: سلف الموظفين',
    debitRoles: ['SALARIES_PAYABLE'],
    creditRoles: ['EMPLOYEE_ADVANCE'],
  },

  // ── Expenses ─────────────────────────────────────────────────────────
  {
    operationType: 'FUEL_EXPENSE',
    labelAr: 'مصروف وقود',
    labelEn: 'Fuel Expense',
    description: 'تسجيل مصروف وقود - مدين: تكاليف الوقود + ضريبة مدخلة | دائن: البنك/النقدية',
    debitRoles: ['FUEL_EXPENSE', 'VAT_INPUT'],
    creditRoles: ['BANK', 'CASH'],
  },
  {
    operationType: 'MAINTENANCE_EXPENSE',
    labelAr: 'مصروف صيانة',
    labelEn: 'Maintenance Expense',
    description: 'تسجيل مصروف صيانة - مدين: تكاليف الصيانة + ضريبة مدخلة | دائن: البنك/النقدية',
    debitRoles: ['MAINTENANCE_EXPENSE', 'VAT_INPUT'],
    creditRoles: ['BANK', 'CASH'],
  },
  {
    operationType: 'GENERAL_EXPENSE',
    labelAr: 'مصروف عام',
    labelEn: 'General Expense',
    description: 'تسجيل مصروف إداري عام - مدين: المصروفات الإدارية + ضريبة مدخلة | دائن: البنك/النقدية',
    debitRoles: ['ADMIN_EXPENSE', 'VAT_INPUT'],
    creditRoles: ['BANK', 'CASH'],
  },
  {
    operationType: 'PROJECT_EXPENSE',
    labelAr: 'مصروع مشروع',
    labelEn: 'Project Expense',
    description: 'تسجيل مصروع مشروع مباشر - مدين: تكاليف المشاريع + ضريبة مدخلة | دائن: البنك/النقدية',
    debitRoles: ['PROJECT_COST', 'VAT_INPUT'],
    creditRoles: ['BANK', 'CASH'],
  },

  // ── Assets ───────────────────────────────────────────────────────────
  {
    operationType: 'ASSET_ACQUISITION',
    labelAr: 'شراء أصل ثابت',
    labelEn: 'Asset Acquisition',
    description: 'شراء أصل ثابت - مدين: الأصول الثابتة + ضريبة مدخلة | دائن: البنك/ذمم الموردين',
    debitRoles: ['FIXED_ASSET', 'VAT_INPUT'],
    creditRoles: ['BANK', 'SUPPLIER_AP'],
  },
  {
    operationType: 'ASSET_DEPRECIATION',
    labelAr: 'إهلاك أصل ثابت',
    labelEn: 'Asset Depreciation',
    description: 'إهلاك أصل ثابت - مدين: مصروف الإهلاك | دائن: مجمع الإهلاك',
    debitRoles: ['DEPRECIATION_EXPENSE'],
    creditRoles: ['ACCUM_DEPRECIATION'],
  },

  // ── Tax ──────────────────────────────────────────────────────────────
  {
    operationType: 'VAT_PAYMENT',
    labelAr: 'سداد ضريبة القيمة المضافة',
    labelEn: 'VAT Payment',
    description: 'سداد ضريبة القيمة المضافة للهيئة - مدين: ضريبة مستحقة | دائن: البنك',
    debitRoles: ['VAT_DUE'],
    creditRoles: ['BANK'],
  },
  {
    operationType: 'VAT_RETURN',
    labelAr: 'إقرار ضريبي',
    labelEn: 'VAT Return',
    description: 'إعداد الإقرار الضريبي - مدين: ضريبة مخرجة | دائن: ضريبة مدخلة + ضريبة مستحقة',
    debitRoles: ['VAT_OUTPUT'],
    creditRoles: ['VAT_INPUT', 'VAT_DUE'],
  },

  // ── Other ────────────────────────────────────────────────────────────
  {
    operationType: 'MANUAL_JOURNAL',
    labelAr: 'قيد يومية يدوي',
    labelEn: 'Manual Journal Entry',
    description: 'قيد يومية يدوي - يحدد المحاسب الحسابات',
    debitRoles: [],
    creditRoles: [],
  },
  {
    operationType: 'PETTY_CASH',
    labelAr: 'مصروف نثري',
    labelEn: 'Petty Cash',
    description: 'مصروف نثري - مدين: المصروفات + ضريبة مدخلة | دائن: النقدية',
    debitRoles: ['ADMIN_EXPENSE', 'VAT_INPUT'],
    creditRoles: ['CASH'],
  },
  {
    operationType: 'BANK_RECONCILIATION',
    labelAr: 'تسوية بنكية',
    labelEn: 'Bank Reconciliation',
    description: 'تسوية بنكية - تعديل رصيد البنك',
    debitRoles: ['BANK'],
    creditRoles: ['BANK'],
  },
  {
    operationType: 'PROVISION',
    labelAr: 'مخصص',
    labelEn: 'Provision',
    description: 'إنشاء/زيادة مخصص - مدين: مصروف المخصص | دائن: المخصص',
    debitRoles: ['ADMIN_EXPENSE'],
    creditRoles: ['EOS_PROVISION'],
  },
  {
    operationType: 'ZAKAT',
    labelAr: 'زكاة',
    labelEn: 'Zakat',
    description: 'تسوية زكاة - مدين: مصروف الزكاة | دائن: الزكاة مستحقة',
    debitRoles: ['ZAKAT_EXPENSE'],
    creditRoles: ['ZAKAT_PAYABLE'],
  },
]

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

/**
 * Seed the FinancialMapping table with default templates.
 * This should be called during system initialization.
 * Existing mappings are not overwritten.
 */
export async function seedFinancialMappings() {
  let created = 0
  let skipped = 0

  for (const template of FINANCIAL_MAPPING_TEMPLATES) {
    const existing = await db.financialMapping.findUnique({
      where: { operationType: template.operationType },
    })

    if (!existing) {
      await db.financialMapping.create({
        data: {
          operationType: template.operationType,
          labelAr: template.labelAr,
          labelEn: template.labelEn,
          description: template.description,
          debitRoles: JSON.stringify(template.debitRoles),
          creditRoles: JSON.stringify(template.creditRoles),
        },
      })
      created++
    } else {
      skipped++
    }
  }

  return { created, skipped }
}

/**
 * Get the financial mapping for a specific operation type.
 * Returns parsed debit/credit role arrays.
 */
export async function getFinancialMapping(operationType: string) {
  const mapping = await db.financialMapping.findUnique({
    where: { operationType },
  })

  if (!mapping) return null

  return {
    ...mapping,
    debitRoles: JSON.parse(mapping.debitRoles) as AccountRoleKey[],
    creditRoles: JSON.parse(mapping.creditRoles) as AccountRoleKey[],
  }
}

/**
 * Get all financial mappings with parsed role arrays.
 */
export async function getAllFinancialMappings() {
  const mappings = await db.financialMapping.findMany({
    orderBy: { operationType: 'asc' },
  })

  return mappings.map(m => ({
    ...m,
    debitRoles: JSON.parse(m.debitRoles) as AccountRoleKey[],
    creditRoles: JSON.parse(m.creditRoles) as AccountRoleKey[],
  }))
}

/**
 * Resolve an operation type to its actual account codes.
 * This is THE function that makes the system dynamic:
 * When the accountant changes account 6210 → 6250 for RENTAL_REVENUE,
 * this function automatically returns 6250 instead of 6210.
 *
 * Returns debit accounts and credit accounts with their details.
 */
export async function resolveOperationAccounts(operationType: string) {
  const mapping = await getFinancialMapping(operationType)
  if (!mapping) {
    throw new Error(`لا يوجد ربط محاسبي لنوع العملية "${operationType}". يرجى تعريفه من شاشة محرك الربط المحاسبي.`)
  }

  const debitAccounts: {
    role: AccountRoleKey
    roleInfo: AccountRoleInfo | null
    accounts: Account[]
  }[] = []
  for (const role of mapping.debitRoles) {
    const accounts = await resolveRoleToAccounts(role)
    debitAccounts.push({
      role,
      roleInfo: ACCOUNT_ROLES[role] || null,
      accounts,
    })
  }

  const creditAccounts: {
    role: AccountRoleKey
    roleInfo: AccountRoleInfo | null
    accounts: Account[]
  }[] = []
  for (const role of mapping.creditRoles) {
    const accounts = await resolveRoleToAccounts(role)
    creditAccounts.push({
      role,
      roleInfo: ACCOUNT_ROLES[role] || null,
      accounts,
    })
  }

  return {
    operationType,
    labelAr: mapping.labelAr,
    labelEn: mapping.labelEn,
    debitAccounts,
    creditAccounts,
  }
}

/**
 * Resolve a role to its parent account and all child accounts.
 * This implements: Role → Account Group (Parent) → Child Accounts
 *
 * If the role-mapped account is a parent (non-posting), returns all children.
 * If the role-mapped account is a posting account, returns just that account.
 */
export async function resolveRoleToAccounts(role: AccountRoleKey) {
  // Get all accounts mapped to this role
  const roleAccounts = await db.account.findMany({
    where: {
      accountRole: role,
      isActive: true,
    },
    orderBy: { code: 'asc' },
  })

  if (roleAccounts.length === 0) return []

  // Separate posting and non-posting accounts
  const postingAccounts = roleAccounts.filter(a => a.allowPosting)
  const parentAccounts = roleAccounts.filter(a => !a.allowPosting)

  const result: Account[] = []

  // Add all posting accounts directly
  result.push(...postingAccounts)

  // For parent accounts, also get their children
  for (const parent of parentAccounts) {
    const children = await db.account.findMany({
      where: {
        parentCode: parent.code,
        isActive: true,
        allowPosting: true,
      },
      orderBy: { code: 'asc' },
    })
    result.push(...children)
  }

  // Also check if any of the posting accounts have children (e.g., 1120 Bank → 1121 Rajhi, 1122 AlAhli)
  const codesWithPotentialChildren = postingAccounts.map(a => a.code)
  for (const code of codesWithPotentialChildren) {
    const children = await db.account.findMany({
      where: {
        parentCode: code,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    })
    if (children.length > 0) {
      // The parent posting account becomes non-selectable if it has children
      // Remove it from result and add children instead
      const parentIdx = result.findIndex(a => a.code === code)
      if (parentIdx >= 0) {
        result.splice(parentIdx, 1)
      }
      result.push(...children.filter(c => c.allowPosting))
    }
  }

  // Deduplicate by code
  const seen = new Set<string>()
  return result.filter(a => {
    if (seen.has(a.code)) return false
    seen.add(a.code)
    return true
  })
}

/**
 * Get the default (first) posting account for a role.
 * This is used for automatic journal entry creation where
 * the user doesn't need to select a specific child account.
 */
export async function getDefaultAccountForOperation(
  role: AccountRoleKey,
  tx?: { account: { findFirst: (args: any) => Promise<any> }; account_findMany?: (args: any) => Promise<any[]> }
) {
  const client = tx || db

  // First try to find a posting account directly mapped to this role
  const directAccount = await client.account.findFirst({
    where: {
      accountRole: role,
      isActive: true,
      allowPosting: true,
    },
    orderBy: { code: 'asc' },
  })

  if (directAccount) {
    // Check if this account has children - if so, use the first child
    const children = await db.account.findMany({
      where: {
        parentCode: directAccount.code,
        isActive: true,
        allowPosting: true,
      },
      orderBy: { code: 'asc' },
    })
    if (children.length > 0) return children[0]
    return directAccount
  }

  // If no direct posting account, check if there's a parent account for this role
  const parentAccount = await client.account.findFirst({
    where: {
      accountRole: role,
      isActive: true,
      allowPosting: false,
    },
    orderBy: { code: 'asc' },
  })

  if (parentAccount) {
    // Get the first child of this parent
    const child = await db.account.findFirst({
      where: {
        parentCode: parentAccount.code,
        isActive: true,
        allowPosting: true,
      },
      orderBy: { code: 'asc' },
    })
    return child
  }

  return null
}

/**
 * Validate that an operation type can be executed.
 * Checks that all required roles have accounts mapped.
 * Returns validation result with any missing mappings.
 */
export async function validateOperationMapping(operationType: string) {
  const mapping = await getFinancialMapping(operationType)
  if (!mapping) {
    return {
      valid: false,
      missingRoles: [],
      error: `لا يوجد ربط محاسبي لنوع العملية "${operationType}"`,
    }
  }

  const missingRoles: { role: AccountRoleKey; side: 'debit' | 'credit' }[] = []

  for (const role of mapping.debitRoles) {
    const accounts = await resolveRoleToAccounts(role)
    if (accounts.length === 0) {
      missingRoles.push({ role, side: 'debit' })
    }
  }

  for (const role of mapping.creditRoles) {
    const accounts = await resolveRoleToAccounts(role)
    if (accounts.length === 0) {
      missingRoles.push({ role, side: 'credit' })
    }
  }

  return {
    valid: missingRoles.length === 0,
    missingRoles,
    error: missingRoles.length > 0
      ? `لا يمكن تنفيذ العملية - الأدوار التالية غير مربوطة بحسابات: ${missingRoles.map(m => ACCOUNT_ROLES[m.role]?.labelAr || m.role).join('، ')}`
      : null,
  }
}

/**
 * Get all operations that use a specific account role.
 * Used by the "Account Impact" screen to show where an account is used.
 */
export async function getOperationsUsingRole(role: AccountRoleKey) {
  const allMappings = await getAllFinancialMappings()

  return allMappings
    .filter(m => m.debitRoles.includes(role) || m.creditRoles.includes(role))
    .map(m => ({
      operationType: m.operationType,
      labelAr: m.labelAr,
      labelEn: m.labelEn,
      side: m.debitRoles.includes(role) ? (m.creditRoles.includes(role) ? 'both' as const : 'debit' as const) : 'credit' as const,
    }))
}

/**
 * Get a complete overview of all account roles and their mapping status.
 * Used by the Role Mapping tab and Health Check.
 */
export async function getRoleMappingOverview() {
  const roles = Object.values(AccountRole) as AccountRoleKey[]
  const overview: {
    role: AccountRoleKey
    labelAr: string
    labelEn: string
    description: string
    defaultCodes: string[]
    isMapped: boolean
    totalAccounts: number
    activeAccounts: number
    postingAccounts: number
    childAccounts: number
    accounts: {
      id: string
      code: string
      nameAr: string | null
      name: string
      isActive: boolean
      allowPosting: boolean
      parentCode: string | null
    }[]
    childAccountList: {
      id: string
      code: string
      nameAr: string | null
      name: string
      parentCode: string | null
    }[]
    operations: Awaited<ReturnType<typeof getOperationsUsingRole>>
  }[] = []

  for (const role of roles) {
    const roleInfo = ACCOUNT_ROLES[role]
    if (!roleInfo) continue

    // Get all accounts with this role
    const accounts = await db.account.findMany({
      where: { accountRole: role },
      orderBy: { code: 'asc' },
    })

    const activeAccounts = accounts.filter(a => a.isActive)
    const postingAccounts = accounts.filter(a => a.isActive && a.allowPosting)

    // Get children for parent accounts
    const parentAccounts = accounts.filter(a => !a.allowPosting)
    const childAccounts: Account[] = []
    for (const parent of parentAccounts) {
      const children = await db.account.findMany({
        where: {
          parentCode: parent.code,
          isActive: true,
        },
        orderBy: { code: 'asc' },
      })
      childAccounts.push(...children)
    }

    // Also get children of posting accounts that act as groups
    for (const acct of postingAccounts) {
      const children = await db.account.findMany({
        where: {
          parentCode: acct.code,
          isActive: true,
        },
        orderBy: { code: 'asc' },
      })
      if (children.length > 0) {
        childAccounts.push(...children)
      }
    }

    // Get operations using this role
    const operations = await getOperationsUsingRole(role)

    overview.push({
      role,
      labelAr: roleInfo.labelAr,
      labelEn: roleInfo.labelEn,
      description: roleInfo.description,
      defaultCodes: roleInfo.defaultCodes,
      isMapped: accounts.length > 0,
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      postingAccounts: postingAccounts.length,
      childAccounts: childAccounts.length,
      accounts: accounts.map(a => ({
        id: a.id,
        code: a.code,
        nameAr: a.nameAr,
        name: a.name,
        isActive: a.isActive,
        allowPosting: a.allowPosting,
        parentCode: a.parentCode,
      })),
      childAccountList: childAccounts.map(a => ({
        id: a.id,
        code: a.code,
        nameAr: a.nameAr,
        name: a.name,
        parentCode: a.parentCode,
      })),
      operations,
    })
  }

  return overview
}
