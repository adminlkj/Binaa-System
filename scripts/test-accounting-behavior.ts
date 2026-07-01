// ============================================================================
// BA-02 Task 5: Behavioral Accounting Tests
// ============================================================================
//
// هذه اختبارات سلوكية حقيقية تغطي سيناريوهات محاسبية فعلية، تستبدل
// الاختبارات السطحية السبعة التي كانت تُعطي 100% بينما النظام يحتوي
// على أخطاء قاتلة.
//
// كل اختبار يغطي سيناريو محاسبي كامل:
//   - إنشاء القيود
//   - التحقق من التوازن
//   - التحقق من المعادلة المحاسبية
//   - التحقق من حالة الفترات
//   - التحقق من عدم قابلية التعديل
//   - التحقق من القيد العكسي
//   - التحقق من الاتساق الرقمي عبر مسارات القراءة المختلفة
//
// Run: bun scripts/test-accounting-behavior.ts
// Exit: 0 = all pass, 1 = any fail
// ============================================================================

import { db } from '@/lib/db'
import {
  postJournalEntry,
  reverseJournalEntry,
  assertJournalEntryValid,
  assertJournalEntryMutable,
  AccountingGuardError,
  getNextEntryNo,
} from '@/lib/accounting/guard'
import {
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getGeneralLedger,
  getAccountBalance,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'
import {
  createFiscalYear,
  assertPeriodOpen,
  closePeriod,
  reopenPeriod,
  AccountingCalendarError,
} from '@/lib/accounting/accounting-calendar'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    failed++
    failures.push(`${name}: ${e.message}`)
    console.log(`  ✗ ${name}`)
    console.log(`    → ${e.message}`)
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERT FAIL: ${message}`)
}

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) < tolerance
}

// ---------------------------------------------------------------------------
// Setup: get test accounts
// ---------------------------------------------------------------------------

async function getTestAccounts() {
  const cash = await db.account.findFirstOrThrow({ where: { accountRole: 'CASH' } })
  const bank = await db.account.findFirstOrThrow({ where: { accountRole: 'BANK' } })
  const ar = await db.account.findFirstOrThrow({ where: { accountRole: 'CUSTOMER_AR' } })
  const revenue = await db.account.findFirstOrThrow({ where: { accountRole: 'PROJECT_REVENUE' } })
  const vatOutput = await db.account.findFirstOrThrow({ where: { accountRole: 'VAT_OUTPUT' } })
  const expense = await db.account.findFirstOrThrow({ where: { accountRole: 'PAYROLL_EXPENSE' } })
  const ap = await db.account.findFirstOrThrow({ where: { accountRole: 'SUPPLIER_AP' } })
  return { cash, bank, ar, revenue, vatOutput, expense, ap }
}

// ---------------------------------------------------------------------------
// Behavioral test scenarios
// ---------------------------------------------------------------------------

async function scenario_1_doubleEntryBalance() {
  console.log('\n── Scenario 1: Double-Entry Balance (R2) ──')
  const { cash, revenue } = await getTestAccounts()
  const entryNo = `BEHAV-TEST-${Date.now()}-1`

  await test('Balanced entry (Dr 100 / Cr 100) is accepted', async () => {
    const je = await postJournalEntry({
      entryNo,
      date: new Date('2025-08-01'),
      description: 'Test balanced entry',
      lines: [
        { accountCode: cash.code, debit: 100, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 100 },
      ],
    })
    assert(je.status === 'POSTED', 'entry should be POSTED')
    assert(je.lines.length === 2, 'should have 2 lines')
  })

  await test('Unbalanced entry (Dr 100 / Cr 99) is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `${entryNo}-UNBALANCED`,
        date: new Date('2025-08-01'),
        description: 'Test unbalanced entry',
        lines: [
          { accountCode: cash.code, debit: 100, credit: 0 },
          { accountCode: revenue.code, debit: 0, credit: 99 },
        ],
      })
      throw new Error('Should have thrown NOT_BALANCED')
    } catch (e: any) {
      assert(e.code === 'NOT_BALANCED', `expected NOT_BALANCED, got ${e.code}`)
    }
  })
}

async function scenario_2_minimumLines() {
  console.log('\n── Scenario 2: Minimum 2 Lines (R3) ──')
  const { cash, revenue } = await getTestAccounts()

  await test('Single-line entry is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-${Date.now()}-2`,
        date: new Date('2025-08-01'),
        description: 'Test single-line entry',
        lines: [
          { accountCode: cash.code, debit: 100, credit: 0 },
        ],
      })
      throw new Error('Should have thrown MIN_LINES')
    } catch (e: any) {
      assert(e.code === 'MIN_LINES', `expected MIN_LINES, got ${e.code}`)
    }
  })

  await test('Empty lines array is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-${Date.now()}-2b`,
        date: new Date('2025-08-01'),
        description: 'Test empty entry',
        lines: [],
      })
      throw new Error('Should have thrown MIN_LINES')
    } catch (e: any) {
      assert(e.code === 'MIN_LINES', `expected MIN_LINES, got ${e.code}`)
    }
  })
}

async function scenario_3_vatCalculation() {
  console.log('\n── Scenario 3: VAT Calculation (15% output VAT) ──')
  const { ar, revenue, vatOutput } = await getTestAccounts()

  await test('Sales invoice with VAT: Dr AR 1150 / Cr Revenue 1000 / Cr VAT 150', async () => {
    const je = await postJournalEntry({
      entryNo: `BEHAV-TEST-VAT-${Date.now()}`,
      date: new Date('2025-08-05'),
      description: 'Sales invoice with 15% VAT',
      lines: [
        { accountCode: ar.code, debit: 1150, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 1000 },
        { accountCode: vatOutput.code, debit: 0, credit: 150 },
      ],
    })
    assert(je.status === 'POSTED', 'entry should be POSTED')

    // Verify the GL reflects the VAT correctly
    const vatBalance = await getAccountBalance(vatOutput.code)
    assert(vatBalance >= 150, `VAT output balance should include 150, got ${vatBalance}`)
  })
}

async function scenario_4_reversalNetZero() {
  console.log('\n── Scenario 4: Reversal Creates Net-Zero Effect ──')
  const { cash, expense } = await getTestAccounts()
  const entryNo = `BEHAV-TEST-REV-${Date.now()}`

  let originalId: string
  let reversalId: string

  await test('Post an entry, then reverse it', async () => {
    const original = await postJournalEntry({
      entryNo,
      date: new Date('2025-08-10'),
      description: 'Original entry to be reversed',
      lines: [
        { accountCode: expense.code, debit: 300, credit: 0 },
        { accountCode: cash.code, debit: 0, credit: 300 },
      ],
    })
    originalId = original.id

    const reversal = await db.$transaction(async (tx) => reverseJournalEntry(originalId, tx, 'Test reversal'))
    reversalId = reversal.id
    assert(reversal.isReversal !== undefined, 'reversal should exist')
  })

  await test('Double-reversal is blocked', async () => {
    try {
      await db.$transaction(async (tx) => reverseJournalEntry(originalId!, tx))
      throw new Error('Should have thrown ALREADY_REVERSED')
    } catch (e: any) {
      assert(e.code === 'ALREADY_REVERSED', `expected ALREADY_REVERSED, got ${e.code}`)
    }
  })

  await test('Net GL effect is zero (original + reversal = 0)', async () => {
    const lines = await db.journalLine.findMany({
      where: {
        journalEntryId: { in: [originalId!, reversalId!] },
        deletedAt: null,
      },
    })
    const totalDebit = lines.reduce((s, l) => Number(l.debit) + s, 0)
    const totalCredit = lines.reduce((s, l) => Number(l.credit) + s, 0)
    assert(approxEqual(totalDebit, totalCredit), `debit ${totalDebit} ≠ credit ${totalCredit}`)
    assert(approxEqual(totalDebit, 600), `total should be 600 (300+300), got ${totalDebit}`)
  })
}

async function scenario_5_immutability() {
  console.log('\n── Scenario 5: POSTED = Immutable (BA-02 Task 4) ──')
  const { cash, revenue } = await getTestAccounts()

  let postedId: string
  await test('POSTED entry cannot be mutated', async () => {
    const je = await postJournalEntry({
      entryNo: `BEHAV-TEST-IMMUT-${Date.now()}`,
      date: new Date('2025-08-15'),
      description: 'Immutable posted entry',
      lines: [
        { accountCode: cash.code, debit: 200, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 200 },
      ],
    })
    postedId = je.id

    try {
      await assertJournalEntryMutable(postedId)
      throw new Error('Should have thrown ENTRY_IMMUTABLE')
    } catch (e: any) {
      assert(e.code === 'ENTRY_IMMUTABLE', `expected ENTRY_IMMUTABLE, got ${e.code}`)
    }
  })

  await test('Original entry remains POSTED after attempted mutation', async () => {
    const entry = await db.journalEntry.findUniqueOrThrow({ where: { id: postedId! } })
    assert(entry.status === 'POSTED', 'status should still be POSTED')
    assert(entry.deletedAt === null, 'should not be soft-deleted')
  })
}

async function scenario_6_accountingEquation() {
  console.log('\n── Scenario 6: Accounting Equation (A = L + E) ──')
  await test('Balance sheet balances after multiple postings', async () => {
    const bs = await getBalanceSheet()
    assert(
      bs.isBalanced,
      `A=${bs.assets.total} ≠ L+E=${bs.totalLiabilitiesAndEquity} (diff=${Math.abs(bs.assets.total - bs.totalLiabilitiesAndEquity)})`
    )
  })

  await test('Income statement netIncome ties to balance sheet currentYearEarnings', async () => {
    const [bs, is] = await Promise.all([getBalanceSheet(), getIncomeStatement()])
    assert(
      approxEqual(bs.currentYearEarnings, is.netIncome),
      `BS currentYearEarnings ${bs.currentYearEarnings} ≠ IS netIncome ${is.netIncome}`
    )
  })
}

async function scenario_7_trialBalanceConsistency() {
  console.log('\n── Scenario 7: Trial Balance Cross-Path Consistency ──')
  await test('TrialBalance totalDebit == totalCredit', async () => {
    const tb = await getTrialBalance()
    assert(
      tb.totals.isBalanced,
      `totalDebit ${tb.totals.totalDebit} ≠ totalCredit ${tb.totals.totalCredit}`
    )
  })

  await test('TrialBalance netDebit == netCredit (columnar tie)', async () => {
    const tb = await getTrialBalance()
    assert(
      approxEqual(tb.totals.totalNetDebit, tb.totals.totalNetCredit),
      `netDebit ${tb.totals.totalNetDebit} ≠ netCredit ${tb.totals.totalNetCredit}`
    )
  })

  await test('Per-account GL closingBalance == TrialBalance signed balance (ALL accounts)', async () => {
    const tb = await getTrialBalance()
    for (const row of tb.rows) {
      const gl = await getGeneralLedger(row.accountId)
      if (!gl) continue
      assert(
        approxEqual(gl.closingBalance, row.balance),
        `Account ${row.code}: GL ${gl.closingBalance} ≠ TB ${row.balance}`
      )
    }
  })

  await test('verifyNumericalConsistency returns ok=true', async () => {
    const result = await verifyNumericalConsistency()
    if (!result.ok) {
      throw new Error(`Consistency check failed: ${result.diffs.join('; ')}`)
    }
  })
}

async function scenario_8_periodEnforcement() {
  console.log('\n── Scenario 8: Period Closing Enforcement (BA-02 Task 3) ──')
  const { cash, revenue } = await getTestAccounts()

  // Find or create a period to close
  const period = await db.fiscalPeriod.findFirst({
    where: { periodNo: 9, fiscalYear: { name: '2025' } },
  })
  if (!period) {
    console.log('  (skipped — no fiscal period for September 2025)')
    return
  }

  // Ensure period is OPEN first
  await db.fiscalPeriod.update({ where: { id: period.id }, data: { status: 'OPEN' } })

  await test('Posting to OPEN period succeeds', async () => {
    await postJournalEntry({
      entryNo: `BEHAV-TEST-PERIOD-OPEN-${Date.now()}`,
      date: new Date('2025-09-10'),
      description: 'Entry to open period',
      lines: [
        { accountCode: cash.code, debit: 50, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 50 },
      ],
    })
  })

  await test('Close the period', async () => {
    await closePeriod(period.id, undefined, { closedBy: 'test' })
    const updated = await db.fiscalPeriod.findUniqueOrThrow({ where: { id: period.id } })
    assert(updated.status === 'CLOSED', `expected CLOSED, got ${updated.status}`)
  })

  await test('Posting to CLOSED period is blocked', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-PERIOD-CLOSED-${Date.now()}`,
        date: new Date('2025-09-15'),
        description: 'Entry to closed period',
        lines: [
          { accountCode: cash.code, debit: 75, credit: 0 },
          { accountCode: revenue.code, debit: 0, credit: 75 },
        ],
      })
      throw new Error('Should have thrown PERIOD_CLOSED')
    } catch (e: any) {
      assert(e.code === 'PERIOD_CLOSED', `expected PERIOD_CLOSED, got ${e.code}`)
    }
  })

  await test('Reopen the period', async () => {
    await reopenPeriod(period.id)
    const updated = await db.fiscalPeriod.findUniqueOrThrow({ where: { id: period.id } })
    assert(updated.status === 'OPEN', `expected OPEN, got ${updated.status}`)
  })

  await test('Posting to reopened period succeeds', async () => {
    await postJournalEntry({
      entryNo: `BEHAV-TEST-PERIOD-REOPEN-${Date.now()}`,
      date: new Date('2025-09-20'),
      description: 'Entry to reopened period',
      lines: [
        { accountCode: cash.code, debit: 25, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 25 },
      ],
    })
  })
}

async function scenario_9_negativeValues() {
  console.log('\n── Scenario 9: Negative Values Rejected (R5) ──')
  const { cash, revenue } = await getTestAccounts()

  await test('Negative debit is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-NEG-DEBIT-${Date.now()}`,
        date: new Date('2025-08-01'),
        description: 'Negative debit',
        lines: [
          { accountCode: cash.code, debit: -100, credit: 0 },
          { accountCode: revenue.code, debit: 0, credit: 100 },
        ],
      })
      throw new Error('Should have thrown LINE_NEGATIVE')
    } catch (e: any) {
      assert(e.code === 'LINE_NEGATIVE', `expected LINE_NEGATIVE, got ${e.code}`)
    }
  })

  await test('Both debit and credit on same line is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-BOTH-SIDES-${Date.now()}`,
        date: new Date('2025-08-01'),
        description: 'Both sides',
        lines: [
          { accountCode: cash.code, debit: 100, credit: 100 },
          { accountCode: revenue.code, debit: 0, credit: 100 },
        ],
      })
      throw new Error('Should have thrown LINE_BOTH_SIDES')
    } catch (e: any) {
      assert(e.code === 'LINE_BOTH_SIDES', `expected LINE_BOTH_SIDES, got ${e.code}`)
    }
  })

  await test('Zero on both sides is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo: `BEHAV-TEST-ZERO-${Date.now()}`,
        date: new Date('2025-08-01'),
        description: 'Zero entry',
        lines: [
          { accountCode: cash.code, debit: 0, credit: 0 },
          { accountCode: revenue.code, debit: 100, credit: 100 },
        ],
      })
      throw new Error('Should have thrown LINE_ZERO')
    } catch (e: any) {
      assert(e.code === 'LINE_ZERO', `expected LINE_ZERO, got ${e.code}`)
    }
  })
}

async function scenario_10_duplicateEntryNo() {
  console.log('\n── Scenario 10: Duplicate Entry Number Rejected (R7) ──')
  const { cash, revenue } = await getTestAccounts()
  const entryNo = `BEHAV-TEST-DUP-${Date.now()}`

  await test('First entry with unique number succeeds', async () => {
    await postJournalEntry({
      entryNo,
      date: new Date('2025-08-01'),
      description: 'First entry',
      lines: [
        { accountCode: cash.code, debit: 50, credit: 0 },
        { accountCode: revenue.code, debit: 0, credit: 50 },
      ],
    })
  })

  await test('Second entry with same number is rejected', async () => {
    try {
      await postJournalEntry({
        entryNo,
        date: new Date('2025-08-02'),
        description: 'Duplicate entry',
        lines: [
          { accountCode: cash.code, debit: 75, credit: 0 },
          { accountCode: revenue.code, debit: 0, credit: 75 },
        ],
      })
      throw new Error('Should have thrown DUPLICATE_ENTRY_NO')
    } catch (e: any) {
      assert(e.code === 'DUPLICATE_ENTRY_NO', `expected DUPLICATE_ENTRY_NO, got ${e.code}`)
    }
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-02 Task 5: Behavioral Accounting Tests')
  console.log('  (replaces the 7 superficial tests that gave false 100%)')
  console.log('═══════════════════════════════════════════════════════════════')

  try {
    await scenario_1_doubleEntryBalance()
    await scenario_2_minimumLines()
    await scenario_3_vatCalculation()
    await scenario_4_reversalNetZero()
    await scenario_5_immutability()
    await scenario_6_accountingEquation()
    await scenario_7_trialBalanceConsistency()
    await scenario_8_periodEnforcement()
    await scenario_9_negativeValues()
    await scenario_10_duplicateEntryNo()
  } catch (e: any) {
    console.error('\nFATAL: Scenario setup failed:', e.message)
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    - ${f}`)
  } else {
    console.log('  ✅ ALL BEHAVIORAL TESTS PASSED')
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
