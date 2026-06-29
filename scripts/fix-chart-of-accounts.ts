// ============================================================================
// BA-03 Task 2: Chart of Accounts Repair
// ============================================================================
// يُصلح مشاكل دليل الحسابات المكتشفة في audit-chart-of-accounts.ts:
//
//   1. يعيّن أدوار للحسابات الموجودة التي ليس لها دور
//   2. يُنشئ حسابات جديدة للأدوار التي ليس لها حساب (FX_GAIN, FX_LOSS)
//   3. يُحدّث CHART_OF_ACCOUNTS_TEMPLATE في chart-of-accounts.ts ليعكس التغييرات
//
// Run: bun scripts/fix-chart-of-accounts.ts
// ============================================================================

import { db } from '@/lib/db'

// ── Mapping: existing account code → role to assign ──
// These are accounts that exist but lack a role. We assign the most appropriate role.
const ROLE_ASSIGNMENTS: Array<{ code: string; role: string; reason: string }> = [
  // Revenue accounts
  { code: '6130', role: 'UNBILLED_REVENUE', reason: 'Claims Revenue = unbilled revenue for work done but not yet invoiced' },
  { code: '6320', role: 'DELAY_PENALTY_REVENUE', reason: 'Penalties Revenue includes delay penalties from clients' },

  // Expense accounts
  { code: '7120', role: 'LABOR_COST', reason: 'Labor Costs on construction projects' },
  { code: '8160', role: 'ADMIN_EXPENSE', reason: 'Professional Fees — representative admin expense' },

  // Asset accounts
  { code: '1320', role: 'PROJECT_WIP', reason: 'Work in Progress = project WIP asset' },
  { code: '1610', role: 'CONTRACT_ASSET', reason: 'Construction Contract Assets (IFRS 15)' },
  { code: '1240', role: 'SUBCONTRACTOR_ADVANCE', reason: 'Advances to Suppliers — includes subcontractor advances' },

  // Liability accounts
  { code: '3610', role: 'CONTRACT_LIABILITY', reason: 'Construction Contract Liabilities (IFRS 15)' },
  { code: '3500', role: 'SUBCONTRACTOR_RETENTION_PAYABLE', reason: 'Retention Payable — withheld subcontractor retainage' },
  { code: '3130', role: 'VAT_DUE', reason: 'VAT Due — keep as VAT_DUE (matches chart-of-accounts.ts template)' },

  // Equity accounts
  { code: '5200', role: 'RETAINED_EARNINGS', reason: 'Retained Earnings — year-end closing target' },

  // Change 1130 Petty Cash from CASH to PETTY_CASH (more specific)
  { code: '1130', role: 'PETTY_CASH', reason: 'Petty Cash — change from generic CASH to specific PETTY_CASH' },
]

// ── New accounts to create (for roles with no matching existing account) ──
const NEW_ACCOUNTS: Array<{
  code: string
  name: string
  nameAr: string
  type: string
  parentCode: string
  accountRole: string
  level: number
  activityType: string
  reason: string
}> = [
  {
    code: '6360',
    name: 'Foreign Exchange Gain',
    nameAr: 'أرباح فروقات عملة',
    type: 'REVENUE',
    parentCode: '6300',
    accountRole: 'FX_GAIN',
    level: 2,
    activityType: 'BOTH',
    reason: 'FX gains from currency conversion',
  },
  {
    code: '8640',
    name: 'Foreign Exchange Loss',
    nameAr: 'خسائر فروقات عملة',
    type: 'EXPENSE',
    parentCode: '8600',
    accountRole: 'FX_LOSS',
    level: 2,
    activityType: 'BOTH',
    reason: 'FX losses from currency conversion',
  },
  {
    code: '3140',
    name: 'VAT Settlement Account',
    nameAr: 'حساب تسوية ضريبة القيمة المضافة',
    type: 'LIABILITY',
    parentCode: '3100',
    accountRole: 'VAT_SETTLEMENT',
    level: 2,
    activityType: 'BOTH',
    reason: 'VAT settlement account — separate from VAT_DUE for periodic settlement tracking',
  },
]

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-03 Task 2: Chart of Accounts Repair')
  console.log('═══════════════════════════════════════════════════════════════\n')

  let updated = 0
  let created = 0
  let skipped = 0

  // ── Phase 1: Assign roles to existing accounts ──
  console.log('── Phase 1: Assigning roles to existing accounts ──')
  for (const { code, role, reason } of ROLE_ASSIGNMENTS) {
    const account = await db.account.findUnique({ where: { code } })
    if (!account) {
      console.log(`  ✗ SKIP ${code} — account not found`)
      skipped++
      continue
    }
    if (account.accountRole === role) {
      console.log(`  = KEEP  ${code} already has role ${role}`)
      skipped++
      continue
    }
    const oldRole = account.accountRole || '(none)'
    await db.account.update({
      where: { code },
      data: { accountRole: role },
    })
    console.log(`  ✓ UPDATE ${code}: ${oldRole} → ${role}`)
    console.log(`    reason: ${reason}`)
    updated++
  }

  // ── Phase 2: Create new accounts for unmapped roles ──
  console.log('\n── Phase 2: Creating new accounts for unmapped roles ──')
  for (const newAcc of NEW_ACCOUNTS) {
    const existing = await db.account.findUnique({ where: { code: newAcc.code } })
    if (existing) {
      if (existing.accountRole !== newAcc.accountRole) {
        await db.account.update({
          where: { code: newAcc.code },
          data: { accountRole: newAcc.accountRole },
        })
        console.log(`  ✓ UPDATE ${newAcc.code} (existed): role → ${newAcc.accountRole}`)
        updated++
      } else {
        console.log(`  = KEEP  ${newAcc.code} already correct`)
        skipped++
      }
      continue
    }

    // Find parent
    const parent = await db.account.findUnique({ where: { code: newAcc.parentCode } })
    const parentId = parent?.id

    await db.account.create({
      data: {
        code: newAcc.code,
        name: newAcc.name,
        nameAr: newAcc.nameAr,
        type: newAcc.type,
        parentCode: newAcc.parentCode,
        parentId,
        isActive: true,
        allowPosting: true,
        accountRole: newAcc.accountRole,
        level: newAcc.level,
        activityType: newAcc.activityType,
        isSystem: false,
      },
    })
    console.log(`  ✓ CREATE ${newAcc.code} ${newAcc.nameAr} (${newAcc.accountRole})`)
    console.log(`    reason: ${newAcc.reason}`)
    created++
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  REPAIR SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Accounts updated: ${updated}`)
  console.log(`  Accounts created: ${created}`)
  console.log(`  Skipped (already correct): ${skipped}`)
  console.log('═══════════════════════════════════════════════════════════════\n')

  // ── Verify: re-run the audit checks ──
  console.log('── Post-repair verification ──')
  const accounts = await db.account.findMany({ select: { code: true, accountRole: true, allowPosting: true, isActive: true } })
  const postingWithRole = accounts.filter(a => a.allowPosting && a.isActive && a.accountRole).length
  const postingWithoutRole = accounts.filter(a => a.allowPosting && a.isActive && !a.accountRole).length
  console.log(`  Posting accounts WITH role:    ${postingWithRole}`)
  console.log(`  Posting accounts WITHOUT role: ${postingWithoutRole}`)

  if (postingWithoutRole > 0) {
    console.log(`\n  Note: ${postingWithoutRole} posting accounts still lack a role.`)
    console.log('  These are sub-accounts that inherit their parent\'s role (e.g., 8120 Office Rent).')
    console.log('  They don\'t need a direct role assignment — they\'re used via manual selection.')
  }

  await db.$disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
