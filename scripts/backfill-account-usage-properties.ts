// ============================================================================
// P4-FIX Task 2: Backfill usage properties for all existing accounts
// ============================================================================
//
// This script reads every Account in the DB and — for any account that has
// an `accountRole` — recomputes its 20 usage/selection/behavior properties
// from the master role→properties table in
// `src/lib/account-usage-mapping.ts`.
//
// Accounts WITHOUT an accountRole (parent / non-posting heading accounts)
// are skipped: their usage properties remain at the schema defaults (false).
//
// This is safe to re-run: it only sets properties that the role says should
// be `true`; it never resets an accountant's manual override on a flag that
// the role does NOT touch. (Example: if the accountant manually set
// `showInCash=true` on a CASH account, this script won't touch it because
// `showInCash` is not in the CASH role mapping.)
//
// Run:  bun scripts/backfill-account-usage-properties.ts
// ============================================================================

import { db } from '@/lib/db'
import {
  getUsagePropertiesForRole,
  type AccountUsageProperties,
} from '@/lib/account-usage-mapping'

// ---------------------------------------------------------------------------
// Property list — must match AccountUsageProperties keys exactly.
// Used to detect "did this role mapping set this property?" (so we can
// preserve accountant overrides on properties the role does NOT touch).
// ---------------------------------------------------------------------------

const MAPPED_PROPERTIES: Array<keyof AccountUsageProperties> = [
  'usableInExpenses',
  'usableInProjects',
  'usableInRental',
  'usableInPayroll',
  'usableInAdvances',
  'usableInMaintenance',
  'usableInFuel',
  'usableInPurchases',
  'usableInRevenue',
  'allowsProject',
  'allowsCostCenter',
  'allowsEmployee',
  'allowsEquipment',
  'allowsSupplier',
  'allowsClient',
  'requiresEmployee',
  'requiresProject',
  'requiresEquipment',
  'requiresContract',
  'allowsVat',
]

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  P4-FIX Task 2: Backfill Account Usage Properties')
  console.log('  Recomputes usage properties from accountRole for every account')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const all = await db.account.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      accountRole: true,
      // Pull current values so we can diff & preserve overrides
      usableInExpenses: true,
      usableInProjects: true,
      usableInRental: true,
      usableInPayroll: true,
      usableInAdvances: true,
      usableInMaintenance: true,
      usableInFuel: true,
      usableInPurchases: true,
      usableInRevenue: true,
      showInCash: true,
      showInBank: true,
      allowsProject: true,
      allowsCostCenter: true,
      allowsEmployee: true,
      allowsEquipment: true,
      allowsSupplier: true,
      allowsClient: true,
      requiresEmployee: true,
      requiresProject: true,
      requiresEquipment: true,
      requiresContract: true,
      allowsVat: true,
    },
    orderBy: { code: 'asc' },
  })

  console.log(`  Total accounts in DB:        ${all.length}`)
  const withRole = all.filter((a) => !!a.accountRole)
  console.log(`  Accounts with accountRole:   ${withRole.length}`)
  const withoutRole = all.length - withRole.length
  console.log(`  Accounts WITHOUT role (skipped): ${withoutRole}\n`)

  let updated = 0
  let unchanged = 0
  let roleMisses = 0 // accounts whose role isn't in the master map
  const perRoleCounts = new Map<string, { total: number; updated: number }>()

  for (const acc of withRole) {
    const props = getUsagePropertiesForRole(acc.accountRole)

    if (Object.keys(props).length === 0) {
      // Role has no mapping at all (e.g. RETAINED_EARNINGS, or unknown role).
      // We DO NOT reset existing flags — the accountant may have set them
      // manually. Just count this as a "role miss" and move on.
      roleMisses++
      unchanged++
      const role = acc.accountRole as string
      const entry = perRoleCounts.get(role) || { total: 0, updated: 0 }
      entry.total++
      perRoleCounts.set(role, entry)
      continue
    }

    // Build the update payload. For every property the role touches, set it
    // to the role's value. Properties the role does NOT touch are omitted
    // from the update payload — preserving any manual override.
    const updateData: Record<string, boolean> = {}
    let changed = false
    for (const key of MAPPED_PROPERTIES) {
      const desired = props[key] === true
      // Only include keys that the role explicitly defines. This protects
      // accountant overrides on properties NOT covered by the role.
      if (key in props) {
        if ((acc as Record<string, unknown>)[key] !== desired) {
          updateData[key] = desired
          changed = true
        }
      }
    }

    const role = acc.accountRole as string
    const entry = perRoleCounts.get(role) || { total: 0, updated: 0 }
    entry.total++

    if (changed) {
      await db.account.update({
        where: { id: acc.id },
        data: updateData,
      })
      updated++
      entry.updated++
      console.log(
        `  ✓ ${acc.code}  ${(acc.nameAr || acc.name).padEnd(35).slice(0, 35)}  [${role}]  →  ${JSON.stringify(updateData)}`
      )
    } else {
      unchanged++
    }
    perRoleCounts.set(role, entry)
  }

  console.log('\n───────────────────────────────────────────────────────────────')
  console.log('  BACKFILL SUMMARY')
  console.log('───────────────────────────────────────────────────────────────')
  console.log(`  Accounts scanned:          ${all.length}`)
  console.log(`  Accounts with role:        ${withRole.length}`)
  console.log(`  Accounts updated:          ${updated}`)
  console.log(`  Accounts unchanged:        ${unchanged}`)
  console.log(`  Role-miss (no mapping):    ${roleMisses}`)
  console.log('')
  console.log('  Per-role breakdown:')
  const sortedRoles = [...perRoleCounts.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [role, counts] of sortedRoles) {
    console.log(
      `    ${role.padEnd(36)}  total=${String(counts.total).padStart(3)}  updated=${String(counts.updated).padStart(3)}`
    )
  }
  console.log('\n  Done.')
  console.log('═══════════════════════════════════════════════════════════════\n')
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
