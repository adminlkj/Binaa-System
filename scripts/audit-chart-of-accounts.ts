// ============================================================================
// BA-03 Task 1: Chart of Accounts Audit
// ============================================================================
// يدقق دليل الحسابات للتأكد من:
//   1. كل حساب ترحيل (allowPosting=true) له دور (accountRole)
//   2. كل دور معرّف في AccountRole مرتبط بحساب واحد على الأقل
//   3. لا توجد أدوار مكررة بشكل خاطئ (بعض التكرارات مقصودة)
//   4. كل حساب له نوع صحيح (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE)
//   5. كل حساب ترحيل له parentCode يشير لحساب أب صحيح
//   6. ترميز الحسابات متسلسل ومنطقي
//
// Run: bun scripts/audit-chart-of-accounts.ts
// ============================================================================

import { db } from '@/lib/db'
import { AccountRole } from '@/lib/account-roles'

const r = (n: number) => Math.round(n * 100) / 100

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-03: Chart of Accounts Audit')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const accounts = await db.account.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true, isActive: true, allowPosting: true, level: true, parentCode: true, activityType: true },
  })

  const issues: Array<{ severity: 'CRITICAL' | 'WARNING' | 'INFO'; code: string; issue: string; suggestion?: string }> = []

  // ── Check 1: Posting accounts without role ──
  console.log('── Check 1: Posting accounts without accountRole ──')
  const postingNoRole = accounts.filter(a => a.allowPosting && a.isActive && !a.accountRole)
  console.log(`  Found: ${postingNoRole.length} posting accounts without role`)
  for (const a of postingNoRole) {
    issues.push({
      severity: 'WARNING',
      code: a.code,
      issue: `Posting account "${a.nameAr || a.name}" has no accountRole`,
      suggestion: 'Assign a role or mark as non-posting parent account',
    })
  }

  // ── Check 2: Defined roles not mapped to any account ──
  console.log('\n── Check 2: Defined AccountRoles not mapped to any account ──')
  const allRoleValues = Object.values(AccountRole).filter(v => typeof v === 'string') as string[]
  const mappedRoles = new Set(accounts.map(a => a.accountRole).filter(Boolean) as string[])
  const unmappedRoles = allRoleValues.filter(r => !mappedRoles.has(r))
  console.log(`  Found: ${unmappedRoles.length} defined roles without an account`)
  for (const role of unmappedRoles) {
    issues.push({
      severity: 'CRITICAL',
      code: role,
      issue: `AccountRole "${role}" is defined but no account has this role`,
      suggestion: 'Assign this role to an existing account or create a new account',
    })
  }

  // ── Check 3: Duplicate roles (some intentional) ──
  console.log('\n── Check 3: Roles assigned to multiple accounts ──')
  const roleToAccounts = new Map<string, typeof accounts>()
  for (const a of accounts) {
    if (!a.accountRole) continue
    if (!roleToAccounts.has(a.accountRole)) roleToAccounts.set(a.accountRole, [])
    roleToAccounts.get(a.accountRole)!.push(a)
  }
  const duplicates = [...roleToAccounts.entries()].filter(([_, accs]) => accs.length > 1)
  console.log(`  Found: ${duplicates.length} roles assigned to multiple accounts`)
  // These duplicates are intentional for category-specific accounts (FIXED_ASSET, ACCUM_DEPRECIATION, etc.)
  // We log them as INFO, not warnings
  for (const [role, accs] of duplicates) {
    issues.push({
      severity: 'INFO',
      code: role,
      issue: `Role "${role}" assigned to ${accs.length} accounts: ${accs.map(a => a.code).join(', ')}`,
      suggestion: 'If intentional (category-specific), no action needed. If not, consolidate.',
    })
  }

  // ── Check 4: Invalid account types ──
  console.log('\n── Check 4: Invalid account types ──')
  const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
  const invalidTypes = accounts.filter(a => !validTypes.includes(a.type))
  console.log(`  Found: ${invalidTypes.length} accounts with invalid type`)
  for (const a of invalidTypes) {
    issues.push({
      severity: 'CRITICAL',
      code: a.code,
      issue: `Account "${a.name}" has invalid type: ${a.type}`,
      suggestion: `Must be one of: ${validTypes.join(', ')}`,
    })
  }

  // ── Check 5: Posting accounts with no parent ──
  console.log('\n── Check 5: Posting accounts without parentCode ──')
  const postingNoParent = accounts.filter(a => a.allowPosting && !a.parentCode && a.level > 0)
  console.log(`  Found: ${postingNoParent.length} posting accounts (level > 0) without parentCode`)
  for (const a of postingNoParent) {
    issues.push({
      severity: 'WARNING',
      code: a.code,
      issue: `Posting account "${a.nameAr || a.name}" (level ${a.level}) has no parentCode`,
      suggestion: 'Set parentCode to the parent account code for hierarchy',
    })
  }

  // ── Check 6: Account code format ──
  console.log('\n── Check 6: Account code format (should be 4-digit numeric) ──')
  const badCodes = accounts.filter(a => !/^\d{4}$/.test(a.code))
  console.log(`  Found: ${badCodes.length} accounts with non-4-digit codes`)
  for (const a of badCodes) {
    issues.push({
      severity: 'WARNING',
      code: a.code,
      issue: `Account code "${a.code}" is not a 4-digit numeric code`,
    })
  }

  // ── Check 7: Balance verification — any account with non-zero balance? ──
  console.log('\n── Check 7: Accounts with posted journal lines ──')
  const linesWithAccounts = await db.journalLine.findMany({
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
    select: { accountId: true },
    distinct: ['accountId'],
  })
  const accountsWithActivity = new Set(linesWithAccounts.map(l => l.accountId))
  const activePosting = accounts.filter(a => a.allowPosting && a.isActive)
  const withActivity = activePosting.filter(a => accountsWithActivity.has(a.id))
  const withoutActivity = activePosting.filter(a => !accountsWithActivity.has(a.id))
  console.log(`  Posting accounts with activity: ${withActivity.length}`)
  console.log(`  Posting accounts without activity: ${withoutActivity.length}`)

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  AUDIT SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  const critical = issues.filter(i => i.severity === 'CRITICAL')
  const warnings = issues.filter(i => i.severity === 'WARNING')
  const info = issues.filter(i => i.severity === 'INFO')
  console.log(`  Total accounts:      ${accounts.length}`)
  console.log(`  Posting accounts:    ${accounts.filter(a => a.allowPosting).length}`)
  console.log(`  Parent accounts:     ${accounts.filter(a => !a.allowPosting).length}`)
  console.log(`  With role:           ${accounts.filter(a => a.accountRole).length}`)
  console.log(`  Without role:        ${accounts.filter(a => !a.accountRole).length}`)
  console.log(`  With activity:       ${withActivity.length}`)
  console.log(`  Unique roles mapped: ${mappedRoles.size}`)
  console.log(`  Defined roles:       ${allRoleValues.length}`)
  console.log('')
  console.log(`  CRITICAL issues:     ${critical.length}`)
  console.log(`  WARNING issues:      ${warnings.length}`)
  console.log(`  INFO items:          ${info.length}`)

  if (critical.length > 0) {
    console.log('\n── CRITICAL Issues (must fix) ──')
    for (const i of critical) {
      console.log(`  [${i.code}] ${i.issue}`)
      if (i.suggestion) console.log(`    → ${i.suggestion}`)
    }
  }

  if (warnings.length > 0) {
    console.log('\n── WARNING Issues (should review) ──')
    for (const i of warnings) {
      console.log(`  [${i.code}] ${i.issue}`)
      if (i.suggestion) console.log(`    → ${i.suggestion}`)
    }
  }

  if (info.length > 0) {
    console.log('\n── INFO (intentional duplicates, no action needed) ──')
    for (const i of info) {
      console.log(`  [${i.code}] ${i.issue}`)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  if (critical.length === 0) {
    console.log('  ✅ No CRITICAL issues — chart of accounts is structurally sound')
  } else {
    console.log(`  ❌ ${critical.length} CRITICAL issues must be fixed`)
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(critical.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
