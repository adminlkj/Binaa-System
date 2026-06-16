// ============================================================================
// نظام بِنَاء ERP - أدوار الحسابات المحاسبية
// Binaa ERP - Account Roles Definitions & Utilities
// ============================================================================
//
// This file defines all functional account roles used throughout the Binaa ERP
// system. Each role maps to one or more SOCPA chart-of-accounts codes and
// provides bilingual labels (Arabic / English) plus a human-readable description.
//
// The exported utility functions query the database for active, posting-allowed
// accounts filtered by role or parent code.
// ============================================================================

import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Role key constants
// ---------------------------------------------------------------------------

/**
 * Constant object holding every account-role key used in the system.
 * Use these keys instead of raw strings to avoid typos and enable
 * IDE auto-completion.
 */
export const AccountRole = {
  CASH: 'CASH',
  BANK: 'BANK',
  CUSTOMER_AR: 'CUSTOMER_AR',
  SUPPLIER_AP: 'SUPPLIER_AP',
  SUBCONTRACTOR_AP: 'SUBCONTRACTOR_AP',
  RENTAL_REVENUE: 'RENTAL_REVENUE',
  PROJECT_REVENUE: 'PROJECT_REVENUE',
  SERVICE_REVENUE: 'SERVICE_REVENUE',
  FUEL_EXPENSE: 'FUEL_EXPENSE',
  MAINTENANCE_EXPENSE: 'MAINTENANCE_EXPENSE',
  DRIVER_EXPENSE: 'DRIVER_EXPENSE',
  TRANSPORT_EXPENSE: 'TRANSPORT_EXPENSE',
  RENTAL_DEPRECIATION: 'RENTAL_DEPRECIATION',
  PROJECT_COST: 'PROJECT_COST',
  SUBCONTRACTOR_COST: 'SUBCONTRACTOR_COST',
  PAYROLL_EXPENSE: 'PAYROLL_EXPENSE',
  GOSI_EXPENSE: 'GOSI_EXPENSE',
  ADMIN_EXPENSE: 'ADMIN_EXPENSE',
  DEPRECIATION_EXPENSE: 'DEPRECIATION_EXPENSE',
  FIXED_ASSET: 'FIXED_ASSET',
  ACCUM_DEPRECIATION: 'ACCUM_DEPRECIATION',
  VAT_INPUT: 'VAT_INPUT',
  VAT_OUTPUT: 'VAT_OUTPUT',
  VAT_DUE: 'VAT_DUE',
  SALARIES_PAYABLE: 'SALARIES_PAYABLE',
  GOSI_PAYABLE: 'GOSI_PAYABLE',
  ZAKAT_EXPENSE: 'ZAKAT_EXPENSE',
  ZAKAT_PAYABLE: 'ZAKAT_PAYABLE',
  EMPLOYEE_ADVANCE: 'EMPLOYEE_ADVANCE',
  CUSTOMER_ADVANCE: 'CUSTOMER_ADVANCE',
  RETENTION_RECEIVABLE: 'RETENTION_RECEIVABLE',
  EOS_PROVISION: 'EOS_PROVISION',
} as const

/** TypeScript type derived from the keys of `AccountRole` */
export type AccountRoleKey = keyof typeof AccountRole

// ---------------------------------------------------------------------------
// AccountRoleInfo interface
// ---------------------------------------------------------------------------

/**
 * Descriptive metadata for a single account role.
 */
export interface AccountRoleInfo {
  /** Machine-readable role key (matches `AccountRole` constant) */
  role: AccountRoleKey
  /** Arabic display label */
  labelAr: string
  /** English display label */
  labelEn: string
  /** Short bilingual description of the role's purpose */
  description: string
  /** Default SOCPA account codes that typically carry this role */
  defaultCodes: string[]
}

// ---------------------------------------------------------------------------
// Full role registry
// ---------------------------------------------------------------------------

/**
 * Complete mapping of every account role key to its metadata.
 * Grouped roughly by financial-statement section for readability.
 */
export const ACCOUNT_ROLES: Record<AccountRoleKey, AccountRoleInfo> = {
  // ── Current Assets ────────────────────────────────────────────────────

  CASH: {
    role: 'CASH',
    labelAr: 'النقدية',
    labelEn: 'Cash',
    description: 'حسابات النقدية والصناديق النقدية',
    defaultCodes: ['1110', '1130'],
  },

  BANK: {
    role: 'BANK',
    labelAr: 'البنوك',
    labelEn: 'Bank',
    description: 'حسابات البنوك والودائع المصرفية',
    defaultCodes: ['1120'],
  },

  CUSTOMER_AR: {
    role: 'CUSTOMER_AR',
    labelAr: 'ذمم العملاء',
    labelEn: 'Customer Receivable',
    description: 'حسابات المدينين - عملاء المشروعات والإيجارات',
    defaultCodes: ['1210'],
  },

  RETENTION_RECEIVABLE: {
    role: 'RETENTION_RECEIVABLE',
    labelAr: 'الاحتجازات المستحقة',
    labelEn: 'Retention Receivable',
    description: 'المبالغ المحتجزة لدى العملاء كضمان',
    defaultCodes: ['1220'],
  },

  EMPLOYEE_ADVANCE: {
    role: 'EMPLOYEE_ADVANCE',
    labelAr: 'سلف الموظفين',
    labelEn: 'Employee Advances',
    description: 'السلف والمقدمات المدفوعة للموظفين',
    defaultCodes: ['1230'],
  },

  // ── Fixed Assets & Depreciation ───────────────────────────────────────

  FIXED_ASSET: {
    role: 'FIXED_ASSET',
    labelAr: 'الأصول الثابتة',
    labelEn: 'Fixed Assets',
    description: 'حسابات الأصول الثابتة - أراضٍ ومباني ومعدات وآليات',
    defaultCodes: ['2110', '2120', '2130', '2140'],
  },

  ACCUM_DEPRECIATION: {
    role: 'ACCUM_DEPRECIATION',
    labelAr: 'مجمع الإهلاك',
    labelEn: 'Accumulated Depreciation',
    description: 'الإهلاك المتراكم للأصول الثابتة',
    defaultCodes: ['2210', '2220', '2230', '2240'],
  },

  // ── VAT ───────────────────────────────────────────────────────────────

  VAT_INPUT: {
    role: 'VAT_INPUT',
    labelAr: 'ضريبة القيمة المضافة المدخلة',
    labelEn: 'Input VAT',
    description: 'ضريبة القيمة المضافة على المشتريات والمصروفات',
    defaultCodes: ['1410'],
  },

  VAT_OUTPUT: {
    role: 'VAT_OUTPUT',
    labelAr: 'ضريبة القيمة المضافة المخرجة',
    labelEn: 'Output VAT',
    description: 'ضريبة القيمة المضافة على الإيرادات والمبيعات',
    defaultCodes: ['3110'],
  },

  VAT_DUE: {
    role: 'VAT_DUE',
    labelAr: 'ضريبة القيمة المضافة المستحقة',
    labelEn: 'VAT Due',
    description: 'صافي ضريبة القيمة المضافة المستحقة للهيئة',
    defaultCodes: ['3130'],
  },

  // ── Current Liabilities ──────────────────────────────────────────────

  SUPPLIER_AP: {
    role: 'SUPPLIER_AP',
    labelAr: 'ذمم الموردين',
    labelEn: 'Supplier Payable',
    description: 'حسابات الدائنين - الموردين',
    defaultCodes: ['3210'],
  },

  SUBCONTRACTOR_AP: {
    role: 'SUBCONTRACTOR_AP',
    labelAr: 'ذمم المقاولين من الباطن',
    labelEn: 'Subcontractor Payable',
    description: 'حسابات الدائنين - المقاولين من الباطن',
    defaultCodes: ['3220'],
  },

  SALARIES_PAYABLE: {
    role: 'SALARIES_PAYABLE',
    labelAr: 'رواتب مستحقة',
    labelEn: 'Salaries Payable',
    description: 'الرواتب والأجور المستحقة للعاملين',
    defaultCodes: ['3310'],
  },

  GOSI_PAYABLE: {
    role: 'GOSI_PAYABLE',
    labelAr: 'مستحقات التأمينات الاجتماعية',
    labelEn: 'GOSI Payable',
    description: 'المبالغ المستحقة لمنظمة التأمينات الاجتماعية',
    defaultCodes: ['3830'],
  },

  ZAKAT_PAYABLE: {
    role: 'ZAKAT_PAYABLE',
    labelAr: 'الزكاة المستحقة',
    labelEn: 'Zakat Payable',
    description: 'المبالغ المستحقة لهيئة الزكاة والضريبة والجمارك',
    defaultCodes: ['3810'],
  },

  CUSTOMER_ADVANCE: {
    role: 'CUSTOMER_ADVANCE',
    labelAr: 'مقدمات العملاء',
    labelEn: 'Customer Advances',
    description: 'المبالغ المقدمة من العملاء قبل تنفيذ الخدمة',
    defaultCodes: ['3410', '3420'],
  },

  EOS_PROVISION: {
    role: 'EOS_PROVISION',
    labelAr: 'مخصص مكافأة نهاية الخدمة',
    labelEn: 'End of Service Provision',
    description: 'المخصص المحسوب لمكافآت نهاية الخدمة',
    defaultCodes: ['3710'],
  },

  // ── Revenue ───────────────────────────────────────────────────────────

  RENTAL_REVENUE: {
    role: 'RENTAL_REVENUE',
    labelAr: 'إيرادات التأجير',
    labelEn: 'Rental Revenue',
    description: 'إيرادات تأجير المعدات والآليات',
    defaultCodes: ['6210', '6220', '6230'],
  },

  PROJECT_REVENUE: {
    role: 'PROJECT_REVENUE',
    labelAr: 'إيرادات المشاريع',
    labelEn: 'Project Revenue',
    description: 'إيرادات المشاريع الإنشائية',
    defaultCodes: ['6110', '6120', '6130'],
  },

  SERVICE_REVENUE: {
    role: 'SERVICE_REVENUE',
    labelAr: 'إيرادات الخدمات',
    labelEn: 'Service Revenue',
    description: 'إيرادات الخدمات التشغيلية والأخرى',
    defaultCodes: ['6340'],
  },

  // ── Project Costs ─────────────────────────────────────────────────────

  PROJECT_COST: {
    role: 'PROJECT_COST',
    labelAr: 'تكاليف المشاريع المباشرة',
    labelEn: 'Project Direct Costs',
    description: 'التكاليف المباشرة للمشاريع الإنشائية',
    defaultCodes: ['7110', '7120', '7130', '7140', '7150', '7160', '7170', '7180'],
  },

  SUBCONTRACTOR_COST: {
    role: 'SUBCONTRACTOR_COST',
    labelAr: 'تكاليف المقاولين من الباطن',
    labelEn: 'Subcontractor Costs',
    description: 'تكاليف أعمال المقاولين من الباطن على المشاريع',
    defaultCodes: ['7130'],
  },

  // ── Rental Operation Expenses ─────────────────────────────────────────

  FUEL_EXPENSE: {
    role: 'FUEL_EXPENSE',
    labelAr: 'تكاليف الوقود',
    labelEn: 'Fuel Expense',
    description: 'تكاليف وقود المعدات والآليات',
    defaultCodes: ['7210'],
  },

  MAINTENANCE_EXPENSE: {
    role: 'MAINTENANCE_EXPENSE',
    labelAr: 'تكاليف الصيانة',
    labelEn: 'Maintenance Expense',
    description: 'تكاليف صيانة المعدات والآليات',
    defaultCodes: ['7220'],
  },

  DRIVER_EXPENSE: {
    role: 'DRIVER_EXPENSE',
    labelAr: 'تكاليف السائقين',
    labelEn: 'Driver Expense',
    description: 'تكاليف رواتب ومستلزمات السائقين',
    defaultCodes: ['7230'],
  },

  TRANSPORT_EXPENSE: {
    role: 'TRANSPORT_EXPENSE',
    labelAr: 'تكاليف النقل',
    labelEn: 'Transport Expense',
    description: 'تكاليف نقل المعدات والآليات',
    defaultCodes: ['7240'],
  },

  RENTAL_DEPRECIATION: {
    role: 'RENTAL_DEPRECIATION',
    labelAr: 'إهلاك معدات التأجير',
    labelEn: 'Rental Equipment Depreciation',
    description: 'مصروف إهلاك المعدات المؤجرة',
    defaultCodes: ['7250'],
  },

  // ── General & Administrative Expenses ─────────────────────────────────

  PAYROLL_EXPENSE: {
    role: 'PAYROLL_EXPENSE',
    labelAr: 'الرواتب والأجور',
    labelEn: 'Payroll Expense',
    description: 'مصروف الرواتب والأجور',
    defaultCodes: ['8110'],
  },

  GOSI_EXPENSE: {
    role: 'GOSI_EXPENSE',
    labelAr: 'مصروف التأمينات الاجتماعية',
    labelEn: 'GOSI Expense',
    description: 'حصة المنشأة من اشتراكات التأمينات الاجتماعية',
    defaultCodes: ['8210'],
  },

  ADMIN_EXPENSE: {
    role: 'ADMIN_EXPENSE',
    labelAr: 'المصروفات الإدارية والعمومية',
    labelEn: 'Administrative Expenses',
    description: 'المصروفات الإدارية والعمومية المتنوعة',
    defaultCodes: ['8120', '8130', '8140', '8150', '8160', '8170'],
  },

  DEPRECIATION_EXPENSE: {
    role: 'DEPRECIATION_EXPENSE',
    labelAr: 'مصروف الإهلاك',
    labelEn: 'Depreciation Expense',
    description: 'مصروف إهلاك الأصول الثابتة الإدارية',
    defaultCodes: ['8310', '8320', '8330', '8340'],
  },

  ZAKAT_EXPENSE: {
    role: 'ZAKAT_EXPENSE',
    labelAr: 'مصروف الزكاة',
    labelEn: 'Zakat Expense',
    description: 'مصروف الزكاة السنوي',
    defaultCodes: ['8510'],
  },
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Retrieve all active, posting-allowed accounts that carry the given role.
 *
 * @param role - One of the `AccountRole` keys (e.g. `'CASH'`, `'BANK'`)
 * @returns Array of matching Account records ordered by code
 */
export async function getAccountsByRole(role: string) {
  return db.account.findMany({
    where: {
      accountRole: role,
      isActive: true,
      allowPosting: true,
    },
    orderBy: { code: 'asc' },
  })
}

/**
 * Retrieve all active, posting-allowed accounts that match **any** of the
 * provided roles. Useful when a transaction may post to several related
 * accounts (e.g. all revenue accounts).
 *
 * @param roles - Array of `AccountRole` keys
 * @returns Array of matching Account records ordered by code
 */
export async function getAccountsByRoles(roles: string[]) {
  return db.account.findMany({
    where: {
      accountRole: { in: roles },
      isActive: true,
      allowPosting: true,
    },
    orderBy: { code: 'asc' },
  })
}

/**
 * Retrieve all active child accounts whose `parentCode` matches the given
 * value. This is handy for selecting a specific sub-account under a known
 * parent heading.
 *
 * @param parentCode - The SOCPA code of the parent account
 * @returns Array of matching Account records ordered by code
 */
export async function getAccountsByParentCode(parentCode: string) {
  return db.account.findMany({
    where: {
      parentCode,
      isActive: true,
    },
    orderBy: { code: 'asc' },
  })
}

// ---------------------------------------------------------------------------
// Default Account Resolution (THE CORE ENGINE FUNCTIONS)
// ---------------------------------------------------------------------------
// These functions are the backbone of the role-based accounting system.
// They replace ALL hardcoded account codes throughout the engine.
//
// Flow: AccountRole → DB Query → Account Code/ID
// If the accountant changes account 6210 → 6215, these functions
// automatically pick up the new mapping. ZERO code changes needed.
// ---------------------------------------------------------------------------

/**
 * Get the DEFAULT (first) account for a given role.
 * This is the primary function used by the accounting engine to resolve
 * account roles to actual account codes at runtime.
 *
 * @param role - One of the `AccountRole` keys (e.g. 'CASH', 'RENTAL_REVENUE')
 * @param tx - Optional Prisma transaction client for use within $transaction()
 * @returns The first matching Account record, or null if none found
 *
 * @example
 * const cashAccount = await getDefaultAccountByRole('CASH')
 * // Returns: { id: '...', code: '1110', name: 'Cash - Treasury', ... }
 *
 * const revenueAccount = await getDefaultAccountByRole('RENTAL_REVENUE', tx)
 * // Returns: { id: '...', code: '6210', name: 'Equipment Rental Revenue', ... }
 */
export async function getDefaultAccountByRole(
  role: string,
  tx?: { account: { findFirst: (args: any) => Promise<any> } }
) {
  const client = tx || db
  return client.account.findFirst({
    where: {
      accountRole: role,
      isActive: true,
      allowPosting: true,
    },
    orderBy: { code: 'asc' },
  })
}

/**
 * Get the account code for a given role. Convenience wrapper around
 * `getDefaultAccountByRole` that returns just the code string.
 *
 * @param role - One of the `AccountRole` keys
 * @param tx - Optional Prisma transaction client
 * @returns The account code string (e.g. '6210'), or null if not found
 */
export async function getAccountCodeByRole(
  role: string,
  tx?: { account: { findFirst: (args: any) => Promise<any> } }
): Promise<string | null> {
  const account = await getDefaultAccountByRole(role, tx)
  return account?.code ?? null
}

/**
 * REQUIRE an account for a given role. Throws a descriptive error if no
 * account is mapped to the role. This is the validation gate that prevents
 * any financial operation from proceeding without a proper accounting mapping.
 *
 * This implements the critical rule:
 * ❌ لا يمكن إنشاء العملية - لا يوجد ربط محاسبي معتمد لهذا النوع من العمليات
 *
 * @param role - One of the `AccountRole` keys
 * @param operationName - Human-readable name of the operation (for error message)
 * @param tx - Optional Prisma transaction client
 * @returns The Account record (guaranteed to exist)
 * @throws Error if no account is mapped to the role
 *
 * @example
 * const arAccount = await requireAccountByRole('CUSTOMER_AR', 'فاتورة مبيعات', tx)
 * // If no CUSTOMER_AR account exists: throws "لا يمكن إنشاء فاتورة مبيعات - لا يوجد حساب مرتبط بدور CUSTOMER_AR في دليل الحسابات"
 */
export async function requireAccountByRole(
  role: string,
  operationName: string,
  tx?: { account: { findFirst: (args: any) => Promise<any> } }
) {
  const account = await getDefaultAccountByRole(role, tx)
  if (!account) {
    const roleInfo = ACCOUNT_ROLES[role as AccountRoleKey]
    const roleLabel = roleInfo?.labelAr || role
    throw new Error(
      `لا يمكن إنشاء ${operationName} - لا يوجد حساب مرتبط بدور "${roleLabel}" (${role}) في دليل الحسابات. ` +
      `يرجى ربط حساب بهذا الدور من شاشة دليل الحسابات → تبويب ربط الحسابات.`
    )
  }
  return account
}

/**
 * Get all accounts for a role, optionally filtered by activity type.
 * Used when a screen needs to show all available accounts for a role
 * (e.g., showing all CASH + BANK accounts for payment method selection).
 *
 * @param role - One of the `AccountRole` keys
 * @param activityType - Optional filter: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'
 * @param tx - Optional Prisma transaction client
 * @returns Array of matching Account records
 */
export async function getAccountsByRoleFiltered(
  role: string,
  activityType?: string,
  tx?: { account: { findMany: (args: any) => Promise<any> } }
) {
  const client = tx || db
  return client.account.findMany({
    where: {
      accountRole: role,
      isActive: true,
      allowPosting: true,
      ...(activityType && { activityType }),
    },
    orderBy: { code: 'asc' },
  })
}

/**
 * Resolve a payment method to an account code using role-based lookup.
 * Replaces hardcoded: TREASURY → '1110', BANK → '1120', PETTY_CASH → '1130'
 *
 * @param payFrom - Payment method: 'TREASURY' | 'BANK' | 'PETTY_CASH'
 * @param tx - Optional Prisma transaction client
 * @returns The account code string
 */
export async function resolvePaymentAccountCode(
  payFrom: 'TREASURY' | 'BANK' | 'PETTY_CASH',
  tx?: { account: { findFirst: (args: any) => Promise<any> } }
): Promise<string> {
  const roleMap: Record<string, string> = {
    'TREASURY': 'CASH',
    'BANK': 'BANK',
    'PETTY_CASH': 'CASH',
  }
  const role = roleMap[payFrom] || 'CASH'
  const code = await getAccountCodeByRole(role, tx)
  if (!code) {
    // Fallback: if no role-mapped account, try the other cash role
    if (payFrom === 'TREASURY') {
      const bankCode = await getAccountCodeByRole('BANK', tx)
      return bankCode || '1110'
    }
    return payFrom === 'BANK' ? '1120' : '1110'
  }
  return code
}

/**
 * Get a complete mapping of all roles to their current account assignments.
 * Used by the Chart of Accounts screen's "Role Mapping" tab to display
 * which account is currently assigned to each role.
 *
 * @returns Array of { role, labelAr, labelEn, accountCode, accountNameAr, accountId }
 */
export async function getRoleAccountMapping() {
  const allRoles = Object.values(AccountRole) as string[]
  const mappings = []

  for (const role of allRoles) {
    const roleInfo = ACCOUNT_ROLES[role as AccountRoleKey]
    if (!roleInfo) continue

    const accounts = await db.account.findMany({
      where: {
        accountRole: role,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    })

    mappings.push({
      role,
      labelAr: roleInfo.labelAr,
      labelEn: roleInfo.labelEn,
      description: roleInfo.description,
      defaultCodes: roleInfo.defaultCodes,
      accounts: accounts.map(a => ({
        id: a.id,
        code: a.code,
        nameAr: a.nameAr,
        name: a.name,
      })),
      primaryAccount: accounts.find(a => a.allowPosting) || null,
    })
  }

  return mappings
}
