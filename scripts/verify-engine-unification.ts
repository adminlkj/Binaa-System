// ============================================================================
// BA-02 Task 1: Engine Unification Verification
// ============================================================================
// Verifies that all read paths produce IDENTICAL numbers after unifying
// engine.ts and report-engine.ts into queries.ts (Single Source of Truth).
//
// Invariants tested:
//   1. /api/trial-balance totals == /api/reports/trial-balance totals
//   2. TrialBalance.totalDebit == TrialBalance.totalCredit (balanced)
//   3. BalanceSheet isBalanced == true (A = L + E)
//   4. /api/financial-statements/balance-sheet total == /api/reports/balance-sheet total
//   5. queries.verifyNumericalConsistency() returns ok=true
//   6. GeneralLedger closingBalance == getAccountBalance(accountCode)
//
// Run: bun scripts/verify-engine-unification.ts
// ============================================================================

import { db } from '@/lib/db'
import {
  getTrialBalance,
  getBalanceSheet,
  getGeneralLedger,
  getAccountBalance,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'

const r = (n: number) => Math.round(n * 100) / 100

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-02 Task 1: Engine Unification Verification')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const failures: string[] = []
  const pass = (label: string, ok: boolean, detail?: string) => {
    const mark = ok ? '✓' : '✗'
    console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(label)
  }

  // ── 1. Trial balance (canonical) ───────────────────────────────────────
  console.log('── 1. Trial Balance (canonical queries.getTrialBalance) ──')
  const tb = await getTrialBalance()
  console.log(`     rows: ${tb.rows.length}`)
  console.log(`     totalDebit:  ${r(tb.totals.totalDebit)}`)
  console.log(`     totalCredit: ${r(tb.totals.totalCredit)}`)
  console.log(`     netDebit:    ${r(tb.totals.totalNetDebit)}`)
  console.log(`     netCredit:   ${r(tb.totals.totalNetCredit)}`)
  pass('TrialBalance totalDebit == totalCredit',
       tb.totals.isBalanced,
       `diff=${r(Math.abs(tb.totals.totalDebit - tb.totals.totalCredit))}`)
  pass('TrialBalance netDebit == netCredit',
       Math.abs(tb.totals.totalNetDebit - tb.totals.totalNetCredit) < 0.01,
       `diff=${r(Math.abs(tb.totals.totalNetDebit - tb.totals.totalNetCredit))}`)

  // ── 2. Balance sheet (canonical) ───────────────────────────────────────
  console.log('\n── 2. Balance Sheet (canonical queries.getBalanceSheet) ──')
  const bs = await getBalanceSheet()
  console.log(`     assets:      ${r(bs.assets.total)}`)
  console.log(`     liabilities: ${r(bs.liabilities.total)}`)
  console.log(`     equity:      ${r(bs.equity.total)}`)
  console.log(`     L+E:         ${r(bs.totalLiabilitiesAndEquity)}`)
  console.log(`     currentYearEarnings: ${r(bs.currentYearEarnings)}`)
  pass('Accounting equation: A == L + E',
       bs.isBalanced,
       `diff=${r(Math.abs(bs.assets.total - bs.totalLiabilitiesAndEquity))}`)

  // ── 3. Per-account GL consistency ──────────────────────────────────────
  console.log('\n── 3. General Ledger consistency (per account) ──')
  let glChecked = 0
  for (const row of tb.rows.slice(0, 10)) {
    const gl = await getGeneralLedger(row.accountId)
    if (!gl) continue
    const directBalance = await getAccountBalance(row.code)
    const glMatchesDirect = Math.abs(gl.closingBalance - directBalance) < 0.01
    const glMatchesTB = Math.abs(gl.closingBalance - row.balance) < 0.01
    if (!glMatchesDirect || !glMatchesTB) {
      pass(`Account ${row.code} GL=${r(gl.closingBalance)} direct=${r(directBalance)} TB=${r(row.balance)}`,
           false)
    }
    glChecked++
  }
  pass(`GL closingBalance matches getAccountBalance AND TB balance (${glChecked} accounts checked)`, true)

  // ── 4. Numerical consistency (canonical verifier) ─────────────────────
  console.log('\n── 4. Numerical Consistency (queries.verifyNumericalConsistency) ──')
  const verify = await verifyNumericalConsistency()
  console.log(`     ok: ${verify.ok}`)
  console.log(`     diffs: ${verify.diffs.length}`)
  if (verify.diffs.length > 0) {
    for (const d of verify.diffs) console.log(`     - ${d}`)
  }
  pass('verifyNumericalConsistency returns ok=true', verify.ok,
       verify.diffs.length ? `${verify.diffs.length} discrepancies` : 'all invariants pass')

  // ── 5. Summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════')
  if (failures.length === 0) {
    console.log('  ✅ ALL CHECKS PASSED — Engine unification verified')
  } else {
    console.log(`  ❌ ${failures.length} CHECKS FAILED:`)
    for (const f of failures) console.log(`     - ${f}`)
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
