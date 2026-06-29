// ============================================================================
// BA-02 Task 2: Numerical Consistency Verification (BUILD-BREAKING)
// ============================================================================
// This script runs as a prebuild hook. If ANY invariant fails by even 1 riyal,
// the build is blocked.
//
// Invariants enforced (from queries.verifyNumericalConsistency):
//   I1. TrialBalance totalDebit == totalCredit
//   I2. TrialBalance netDebit column == netCredit column
//   I3. TrialBalance totals == raw JournalLine aggregate (no orphan lines)
//   I4. Accounting equation: Assets == Liabilities + Equity + CurrentYearEarnings
//   I5. Σ GL closingBalance by type == Σ TrialBalance signed balance by type
//   I6. Per-account: GL.closingBalance == getAccountBalance(code) == TB.signedBalance
//       (for EVERY account with activity — not just a sample)
//   I7. Account Statement (full-history GL) closingBalance == TB signed balance
//
// Run: bun scripts/verify-engine-unification.ts
// Exit: 0 = pass, 1 = fail (blocks build)
// ============================================================================

import { db } from '@/lib/db'
import {
  getTrialBalance,
  getBalanceSheet,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'

const r = (n: number) => Math.round(n * 100) / 100

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-02 Task 2: Numerical Consistency Verification')
  console.log('  (BUILD-BREAKING — any failure blocks the build)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  const failures: string[] = []
  const pass = (label: string, ok: boolean, detail?: string) => {
    const mark = ok ? '✓' : '✗'
    console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(label)
  }

  // ── Trial balance (canonical) ────────────────────────────────────────
  console.log('── Trial Balance (canonical queries.getTrialBalance) ──')
  const tb = await getTrialBalance()
  console.log(`     rows: ${tb.rows.length}`)
  console.log(`     totalDebit:  ${r(tb.totals.totalDebit)}`)
  console.log(`     totalCredit: ${r(tb.totals.totalCredit)}`)
  console.log(`     netDebit:    ${r(tb.totals.totalNetDebit)}`)
  console.log(`     netCredit:   ${r(tb.totals.totalNetCredit)}`)
  pass('I1: TrialBalance totalDebit == totalCredit',
       tb.totals.isBalanced,
       `diff=${r(Math.abs(tb.totals.totalDebit - tb.totals.totalCredit))}`)
  pass('I2: TrialBalance netDebit == netCredit',
       Math.abs(tb.totals.totalNetDebit - tb.totals.totalNetCredit) < 0.01,
       `diff=${r(Math.abs(tb.totals.totalNetDebit - tb.totals.totalNetCredit))}`)

  // ── Balance sheet (canonical) ───────────────────────────────────────
  console.log('\n── Balance Sheet (canonical queries.getBalanceSheet) ──')
  const bs = await getBalanceSheet()
  console.log(`     assets:      ${r(bs.assets.total)}`)
  console.log(`     liabilities: ${r(bs.liabilities.total)}`)
  console.log(`     equity:      ${r(bs.equity.total)}`)
  console.log(`     L+E:         ${r(bs.totalLiabilitiesAndEquity)}`)
  console.log(`     currentYearEarnings: ${r(bs.currentYearEarnings)}`)
  pass('I4: Accounting equation A == L + E',
       bs.isBalanced,
       `diff=${r(Math.abs(bs.assets.total - bs.totalLiabilitiesAndEquity))}`)

  // ── Comprehensive numerical consistency (I3, I5, I6, I7) ────────────
  console.log('\n── Comprehensive Numerical Consistency (I3, I5, I6, I7) ──')
  const verify = await verifyNumericalConsistency()
  console.log(`     ok: ${verify.ok}`)
  console.log(`     accountsChecked: ${verify.accountsChecked}`)
  console.log(`     diffs: ${verify.diffs.length}`)
  if (verify.diffs.length > 0) {
    for (const d of verify.diffs) console.log(`     ✗ ${d}`)
  }
  pass('I3+I5+I6+I7: All numerical consistency invariants pass',
       verify.ok,
       verify.diffs.length ? `${verify.diffs.length} discrepancies` : `${verify.accountsChecked} accounts verified`)

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════')
  if (failures.length === 0) {
    console.log('  ✅ ALL NUMERICAL CONSISTENCY CHECKS PASSED')
    console.log('     TrialBalance A == TrialBalance B == GL Totals == Account Statement Totals')
    console.log('     Build may proceed.')
  } else {
    console.log(`  ❌ ${failures.length} CHECKS FAILED — BUILD BLOCKED:`)
    for (const f of failures) console.log(`     - ${f}`)
    console.log('\n  Fix the discrepancies before building. Even 1 riyal of')
    console.log('  difference between read paths indicates a Single Source of')
    console.log('  Truth violation that must be resolved.')
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
