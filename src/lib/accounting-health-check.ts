// ============================================================================
// فحص السلامة المحاسبي - Accounting Health Check Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// This engine performs comprehensive integrity checks on the accounting
// system and produces a health score (0-100%) displayed on the dashboard.
//
// Checks:
// 1. Unmapped roles (role without any account)
// 2. Inactive account still used in mappings
// 3. Role mapped to non-posting account (parent only, no children)
// 4. Multiple default accounts for same role
// 5. Journal entries using deleted/inactive accounts
// 6. Operation types without financial mapping
// 7. Parent account mapped to role instead of children
// ============================================================================

import { db } from '@/lib/db'
import { AccountRole, ACCOUNT_ROLES, type AccountRoleKey } from '@/lib/account-roles'
import { FINANCIAL_MAPPING_TEMPLATES } from '@/lib/financial-mapping-engine'

// ---------------------------------------------------------------------------
// Health Check Result Types
// ---------------------------------------------------------------------------

export type CheckSeverity = 'error' | 'warning' | 'info'

export interface HealthCheckResult {
  checkId: string
  checkNameAr: string
  checkNameEn: string
  severity: CheckSeverity
  passed: boolean
  messageAr: string
  messageEn: string
  details?: any
}

export interface HealthCheckReport {
  overallScore: number
  totalChecks: number
  passedChecks: number
  warnings: number
  errors: number
  checks: HealthCheckResult[]
  checkedAt: Date
}

// ---------------------------------------------------------------------------
// Health Check Functions
// ---------------------------------------------------------------------------

/**
 * Check 1: Are there any roles without any account mapping?
 * This is CRITICAL - unmapped roles will cause operations to fail.
 */
async function checkUnmappedRoles(): Promise<HealthCheckResult> {
  const roles = Object.values(AccountRole) as AccountRoleKey[]
  const unmappedRoles: { role: AccountRoleKey; labelAr: string }[] = []

  for (const role of roles) {
    const count = await db.account.count({
      where: { accountRole: role, isActive: true },
    })
    if (count === 0) {
      const info = ACCOUNT_ROLES[role]
      unmappedRoles.push({ role, labelAr: info?.labelAr || role })
    }
  }

  return {
    checkId: 'UNMAPPED_ROLES',
    checkNameAr: 'أدوار بدون ربط بحسابات',
    checkNameEn: 'Unmapped Account Roles',
    severity: 'error',
    passed: unmappedRoles.length === 0,
    messageAr: unmappedRoles.length === 0
      ? 'جميع الأدوار مربوطة بحسابات ✅'
      : `${unmappedRoles.length} دور غير مربوط: ${unmappedRoles.map(r => r.labelAr).join('، ')}`,
    messageEn: unmappedRoles.length === 0
      ? 'All roles are mapped to accounts ✅'
      : `${unmappedRoles.length} unmapped role(s): ${unmappedRoles.map(r => r.role).join(', ')}`,
    details: unmappedRoles,
  }
}

/**
 * Check 2: Are there inactive accounts that are still used in role mappings?
 */
async function checkInactiveAccountsInMappings(): Promise<HealthCheckResult> {
  const inactiveRoleAccounts = await db.account.findMany({
    where: {
      isActive: false,
      accountRole: { not: null },
    },
  })

  return {
    checkId: 'INACTIVE_ACCOUNTS_IN_MAPPINGS',
    checkNameAr: 'حسابات معطلة مربوطة بأدوار',
    checkNameEn: 'Inactive Accounts in Role Mappings',
    severity: 'warning',
    passed: inactiveRoleAccounts.length === 0,
    messageAr: inactiveRoleAccounts.length === 0
      ? 'لا توجد حسابات معطلة مربوطة بأدوار ✅'
      : `${inactiveRoleAccounts.length} حساب معطل مربوط بدور: ${inactiveRoleAccounts.map(a => `${a.code} ${a.nameAr || a.name}`).join('، ')}`,
    messageEn: inactiveRoleAccounts.length === 0
      ? 'No inactive accounts in role mappings ✅'
      : `${inactiveRoleAccounts.length} inactive account(s) in mappings`,
    details: inactiveRoleAccounts.map(a => ({ code: a.code, name: a.nameAr || a.name, role: a.accountRole })),
  }
}

/**
 * Check 3: Are there roles mapped only to parent (non-posting) accounts?
 * This means no child accounts exist for posting.
 */
async function checkParentOnlyRoles(): Promise<HealthCheckResult> {
  const roles = Object.values(AccountRole) as AccountRoleKey[]
  const parentOnlyRoles: { role: AccountRoleKey; labelAr: string; parentCode: string }[] = []

  for (const role of roles) {
    const postingAccounts = await db.account.findMany({
      where: { accountRole: role, isActive: true, allowPosting: true },
    })
    const parentAccounts = await db.account.findMany({
      where: { accountRole: role, isActive: true, allowPosting: false },
    })

    if (postingAccounts.length === 0 && parentAccounts.length > 0) {
      // Check if any of the parents have children
      let hasChildren = false
      for (const parent of parentAccounts) {
        const children = await db.account.count({
          where: { parentCode: parent.code, isActive: true, allowPosting: true },
        })
        if (children > 0) hasChildren = true
      }

      if (!hasChildren) {
        parentOnlyRoles.push({
          role,
          labelAr: ACCOUNT_ROLES[role]?.labelAr || role,
          parentCode: parentAccounts.map(a => a.code).join(', '),
        })
      }
    }
  }

  return {
    checkId: 'PARENT_ONLY_ROLES',
    checkNameAr: 'أدوار مربوطة بحسابات أب فقط بدون أبناء',
    checkNameEn: 'Roles Mapped to Parent Accounts Without Children',
    severity: 'warning',
    passed: parentOnlyRoles.length === 0,
    messageAr: parentOnlyRoles.length === 0
      ? 'جميع الأدوار لها حسابات قابلة للترحيل ✅'
      : `${parentOnlyRoles.length} دور مربوط بحسابات أب فقط: ${parentOnlyRoles.map(r => `${r.labelAr} (${r.parentCode})`).join('، ')}`,
    messageEn: parentOnlyRoles.length === 0
      ? 'All roles have posting accounts ✅'
      : `${parentOnlyRoles.length} role(s) with parent-only mapping`,
    details: parentOnlyRoles,
  }
}

/**
 * Check 4: Are there multiple default accounts for the same role?
 * While this can be valid, it may indicate a misconfiguration.
 */
async function checkMultipleDefaultAccounts(): Promise<HealthCheckResult> {
  const roles = Object.values(AccountRole) as AccountRoleKey[]
  const multiDefaultRoles: { role: AccountRoleKey; labelAr: string; count: number; codes: string[] }[] = []

  for (const role of roles) {
    const postingAccounts = await db.account.findMany({
      where: { accountRole: role, isActive: true, allowPosting: true },
    })

    if (postingAccounts.length > 1) {
      multiDefaultRoles.push({
        role,
        labelAr: ACCOUNT_ROLES[role]?.labelAr || role,
        count: postingAccounts.length,
        codes: postingAccounts.map(a => a.code),
      })
    }
  }

  return {
    checkId: 'MULTIPLE_DEFAULT_ACCOUNTS',
    checkNameAr: 'أدوار مربوطة بأكثر من حساب افتراضي',
    checkNameEn: 'Roles With Multiple Default Accounts',
    severity: 'info',
    passed: true, // This is informational, not an error
    messageAr: multiDefaultRoles.length === 0
      ? 'كل دور مربوط بحساب واحد فقط ✅'
      : `${multiDefaultRoles.length} دور مربوط بأكثر من حساب: ${multiDefaultRoles.map(r => `${r.labelAr} (${r.count} حسابات)`).join('، ')}`,
    messageEn: multiDefaultRoles.length === 0
      ? 'Each role maps to one account ✅'
      : `${multiDefaultRoles.length} role(s) with multiple accounts`,
    details: multiDefaultRoles,
  }
}

/**
 * Check 5: Are there journal entries using deleted/inactive accounts?
 * This is CRITICAL - it indicates data integrity issues.
 */
async function checkJournalEntriesWithInactiveAccounts(): Promise<HealthCheckResult> {
  // Find journal lines where the account is inactive
  const linesWithInactiveAccounts = await db.journalLine.findMany({
    where: {
      account: { isActive: false },
      deletedAt: null,
    },
    include: { account: true, journalEntry: true },
    take: 10,
  })

  const totalCount = await db.journalLine.count({
    where: {
      account: { isActive: false },
      deletedAt: null,
    },
  })

  return {
    checkId: 'JE_INACTIVE_ACCOUNTS',
    checkNameAr: 'قيود يومية تستخدم حسابات معطلة',
    checkNameEn: 'Journal Entries Using Inactive Accounts',
    severity: totalCount > 0 ? 'error' : 'info',
    passed: totalCount === 0,
    messageAr: totalCount === 0
      ? 'لا توجد قيود تستخدم حسابات معطلة ✅'
      : `${totalCount} قيد يستخدم حسابات معطلة! هذا خطر على سلامة البيانات`,
    messageEn: totalCount === 0
      ? 'No journal entries use inactive accounts ✅'
      : `${totalCount} journal line(s) using inactive accounts!`,
    details: linesWithInactiveAccounts.map(l => ({
      entryNo: l.journalEntry.entryNo,
      accountCode: l.account.code,
      accountName: l.account.nameAr || l.account.name,
    })),
  }
}

/**
 * Check 6: Are there operation types without financial mapping?
 */
async function checkUnmappedOperations(): Promise<HealthCheckResult> {
  const definedTypes = FINANCIAL_MAPPING_TEMPLATES.map(t => t.operationType)
  const dbMappings = await db.financialMapping.findMany()
  const mappedTypes = dbMappings.map(m => m.operationType)

  const unmapped = definedTypes.filter(t => !mappedTypes.includes(t))

  return {
    checkId: 'UNMAPPED_OPERATIONS',
    checkNameAr: 'أنواع عمليات بدون ربط محاسبي',
    checkNameEn: 'Operation Types Without Financial Mapping',
    severity: 'warning',
    passed: unmapped.length === 0,
    messageAr: unmapped.length === 0
      ? 'جميع أنواع العمليات مربوطة محاسبياً ✅'
      : `${unmapped.length} نوع عملية بدون ربط: ${unmapped.join('، ')}`,
    messageEn: unmapped.length === 0
      ? 'All operation types have financial mappings ✅'
      : `${unmapped.length} unmapped operation type(s)`,
    details: unmapped,
  }
}

/**
 * Check 7: Are there accounts with role but the role is used in mappings as parent instead of child?
 */
async function checkRoleOnParentAccount(): Promise<HealthCheckResult> {
  const parentWithRoles = await db.account.findMany({
    where: {
      accountRole: { not: null },
      allowPosting: false,
      isActive: true,
    },
  })

  // Filter to only those that have children
  const problematicAccounts: { code: string; name: string; role: string | null }[] = []

  for (const acct of parentWithRoles) {
    const childCount = await db.account.count({
      where: { parentCode: acct.code, isActive: true },
    })

    if (childCount > 0) {
      // This parent has a role AND has children - the role should ideally
      // be on the children or the system should resolve to children
      // This is actually OK if the engine resolves correctly,
      // so we make it informational
      problematicAccounts.push({
        code: acct.code,
        name: acct.nameAr || acct.name,
        role: acct.accountRole,
      })
    }
  }

  return {
    checkId: 'ROLE_ON_PARENT_ACCOUNT',
    checkNameAr: 'أدوار مربوطة بحسابات أب (تجميعية)',
    checkNameEn: 'Roles on Parent (Group) Accounts',
    severity: 'info',
    passed: true, // This is handled by the resolveRoleToAccounts function
    messageAr: problematicAccounts.length === 0
      ? 'لا توجد أدوار مربوطة بحسابات أب ✅'
      : `${problematicAccounts.length} حساب أب مربوط بدور (سيتم الحل تلقائياً للأبناء)`,
    messageEn: problematicAccounts.length === 0
      ? 'No roles on parent accounts ✅'
      : `${problematicAccounts.length} parent account(s) with role (auto-resolved to children)`,
    details: problematicAccounts,
  }
}

// ---------------------------------------------------------------------------
// Main Health Check Runner
// ---------------------------------------------------------------------------

/**
 * Run all health checks and produce a comprehensive report.
 * The overall score is calculated as:
 *   (passed checks / total checks) * 100
 * Where errors reduce score by full weight, warnings by half.
 */
export async function runAccountingHealthCheck(): Promise<HealthCheckReport> {
  const checks: HealthCheckResult[] = []

  // Run all checks
  checks.push(await checkUnmappedRoles())
  checks.push(await checkInactiveAccountsInMappings())
  checks.push(await checkParentOnlyRoles())
  checks.push(await checkMultipleDefaultAccounts())
  checks.push(await checkJournalEntriesWithInactiveAccounts())
  checks.push(await checkUnmappedOperations())
  checks.push(await checkRoleOnParentAccount())

  // Calculate score
  let totalWeight = 0
  let earnedWeight = 0

  for (const check of checks) {
    const weight = check.severity === 'error' ? 2 : check.severity === 'warning' ? 1.5 : 1
    totalWeight += weight
    if (check.passed) {
      earnedWeight += weight
    } else if (check.severity === 'warning') {
      earnedWeight += weight * 0.5 // Warnings get half credit
    }
    // Errors get zero credit
  }

  const overallScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 100
  const passedChecks = checks.filter(c => c.passed).length
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning').length
  const errors = checks.filter(c => !c.passed && c.severity === 'error').length

  const report: HealthCheckReport = {
    overallScore,
    totalChecks: checks.length,
    passedChecks,
    warnings,
    errors,
    checks,
    checkedAt: new Date(),
  }

  // Save to database
  await db.accountingHealthCheck.create({
    data: {
      overallScore,
      totalChecks: checks.length,
      passedChecks,
      warnings,
      errors,
      details: JSON.stringify(checks),
    },
  })

  return report
}

/**
 * Get the latest health check report from the database.
 */
export async function getLatestHealthCheck(): Promise<HealthCheckReport | null> {
  const latest = await db.accountingHealthCheck.findFirst({
    orderBy: { checkDate: 'desc' },
  })

  if (!latest) return null

  return {
    overallScore: latest.overallScore,
    totalChecks: latest.totalChecks,
    passedChecks: latest.passedChecks,
    warnings: latest.warnings,
    errors: latest.errors,
    checks: JSON.parse(latest.details),
    checkedAt: latest.checkDate,
  }
}

/**
 * Get health score history for trend analysis.
 */
export async function getHealthCheckHistory(limit = 10) {
  return db.accountingHealthCheck.findMany({
    orderBy: { checkDate: 'desc' },
    take: limit,
    select: {
      id: true,
      checkDate: true,
      overallScore: true,
      totalChecks: true,
      passedChecks: true,
      warnings: true,
      errors: true,
    },
  })
}

/**
 * Get a quick health summary for the dashboard.
 */
export async function getHealthSummary() {
  const latest = await db.accountingHealthCheck.findFirst({
    orderBy: { checkDate: 'desc' },
  })

  if (!latest) {
    // Run a check if none exists
    const report = await runAccountingHealthCheck()
    return {
      score: report.overallScore,
      status: report.overallScore >= 90 ? 'healthy' as const : report.overallScore >= 70 ? 'warning' as const : 'critical' as const,
      errors: report.errors,
      warnings: report.warnings,
      lastChecked: report.checkedAt,
    }
  }

  return {
    score: latest.overallScore,
    status: latest.overallScore >= 90 ? 'healthy' as const : latest.overallScore >= 70 ? 'warning' as const : 'critical' as const,
    errors: latest.errors,
    warnings: latest.warnings,
    lastChecked: latest.checkDate,
  }
}
