// ============================================================================
// P3-7 E2E: Accounting Closing Cycle — End-to-End Test
// ============================================================================
// Walks the FULL accounting closing cycle (the FINAL cycle of Phase 3):
//   1. Create a test fiscal year (2099) with 12 monthly periods
//      → verify 12 FiscalPeriods created, all status=OPEN, year status=OPEN
//   2. Post operational JEs in 2099 (revenue + expense)
//      → verify they hit the GL (revenue/expense balances reflect them)
//   3. Close ONE monthly period (January 2099)
//      → verify FiscalPeriod.status=CLOSED
//      → verify subsequent JE posting to that period is BLOCKED (R6:
//         AccountingGuardError code=PERIOD_CLOSED)
//   4. Close the fiscal year (the MAJOR step)
//      → verify closing JE posted:
//          Dr each REVENUE account (to zero it)
//          Cr each EXPENSE account (to zero it)
//          Cr/Dr RETAINED_EARNINGS for net income/loss
//          sourceType=YEAR_END_CLOSING, skipPeriodGuard=true
//      → verify FiscalYear.status=CLOSED
//      → verify FiscalYear.closingJournalEntryId set
//      → verify all 12 FiscalPeriods are CLOSED
//      → verify revenue & expense 2099-range balances = 0 (netted by closing JE)
//      → verify closing JE is balanced
//      → verify trial balance still ties
//   5. Reopen the fiscal year
//      → verify reversal JE posted:
//          isReversal=true, reversedEntryId=closingJE.id
//          sourceType preserved (YEAR_END_CLOSING)
//          status=POSTED (not CANCELLED)
//          lines are flipped (Dr↔Cr) from closing JE
//      → verify FiscalYear.status=OPEN
//      → verify FiscalYear.closingJournalEntryId=null
//      → verify all 12 FiscalPeriods are OPEN
//      → verify revenue & expense ALL-TIME balances restored to pre-close
//      → verify reversal JE is balanced
//      → verify trial balance still ties
//   6. Final verification:
//      - All JEs balanced throughout (operational + closing + reversal)
//      - Trial balance ties at every checkpoint
//      - Closing JE bypassed R6 correctly (it posted despite closed periods)
//      - R6 still enforced for non-system JEs (Step 3)
//
// All test data is wrapped in try/finally — cleanup reopens the year if
// needed (to reverse the closing JE), soft-deletes every JE, and hard-deletes
// the FiscalYear (cascading to its 12 FiscalPeriods).
//
// Run: bun scripts/e2e-closing-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import {
  postJournalEntry,
  getNextEntryNo,
} from '@/lib/accounting/guard'
import {
  closePeriod,
} from '@/lib/accounting/accounting-calendar'
import {
  closeFiscalYear,
  reopenFiscalYear,
  previewFiscalYearClose,
} from '@/lib/accounting/closing-engine'
import {
  getTrialBalance,
  getBalanceByType,
  getAccountBalancesByType,
} from '@/lib/accounting/queries'
import { toNumber } from '@/lib/decimal'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
const results: Array<{ test: string; passed: boolean; detail: string }> = []

function log(test: string, passed: boolean, detail: string = '') {
  const icon = passed ? '✓' : '✗'
  console.log(`  ${icon} ${test}${detail ? ': ' + detail : ''}`)
  results.push({ test, passed, detail })
}

function approx(a: number, b: number, tol = 0.02) {
  return Math.abs(a - b) < tol
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e: any) {
    log(name, false, `EXCEPTION: ${e?.message || String(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Test data tracking — for cleanup on exit
// ---------------------------------------------------------------------------
const TS = Date.now()
const PREFIX = 'P3CLOSE'

// Use a far-future year (2099) so the test never collides with real data.
// DB inspection confirms: no FiscalYear rows, no PeriodClosing for 2099.
const TEST_YEAR = 2099
const FY_NAME = `2099-E2E-${TS}` // unique per run to allow re-runs
const FY_START = new Date(TEST_YEAR, 0, 1)         // 2099-01-01
const FY_END = new Date(TEST_YEAR, 11, 31, 23, 59, 59, 999) // 2099-12-31

// Operational JE amounts in 2099 (small enough not to disturb real TB during
// test, large enough to expose rounding bugs):
const REV_JE1_AMT = 10_000   // PROJECT_REVENUE Cr 10,000 / CASH Dr 10,000
const EXP_JE1_AMT = 4_000    // ADMIN_EXPENSE Dr 4,000 / CASH Cr 4,000
const EXP_JE2_AMT = 1_500    // ADMIN_EXPENSE Dr 1,500 / CASH Cr 1,500
const EXPECTED_REVENUE = REV_JE1_AMT                       // 10,000
const EXPECTED_EXPENSE = EXP_JE1_AMT + EXP_JE2_AMT         // 5,500
const EXPECTED_NET_INCOME = EXPECTED_REVENUE - EXPECTED_EXPENSE // 4,500

const created = {
  fiscalYearId: '' as string,
  periodIds: [] as string[],
  januaryPeriodId: '' as string,
  // Operational JEs (revenue + expenses) dated inside 2099
  opJE1Id: '' as string,  // revenue JE
  opJE2Id: '' as string,  // expense JE #1
  opJE3Id: '' as string,  // expense JE #2
  closingJEId: '' as string,
  closingJENo: '' as string,
  reversalJEId: '' as string,
  reversalJENo: '' as string,
  // Snapshot balances captured BEFORE closing (all-time)
  preCloseRevenueBalance: 0,
  preCloseExpenseBalance: 0,
  preCloseRetainedEarningsBalance: 0,
  // Snapshot balances captured AFTER closing (all-time)
  postCloseRevenueBalance: 0,
  postCloseExpenseBalance: 0,
  postCloseRetainedEarningsBalance: 0,
  // All JEs created by this test (for cleanup)
  allJEIds: [] as string[],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function jeBalance(jeId: string): Promise<{ dr: number; cr: number; balanced: boolean; lines: number }> {
  const lines = await db.journalLine.findMany({
    where: { journalEntryId: jeId, deletedAt: null },
    select: { debit: true, credit: true },
  })
  const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
  const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
  return { dr, cr, balanced: approx(dr, cr), lines: lines.length }
}

async function jeLines(jeId: string) {
  return db.journalLine.findMany({
    where: { journalEntryId: jeId, deletedAt: null },
    include: {
      account: { select: { code: true, name: true, type: true, accountRole: true } },
    },
    orderBy: { id: 'asc' },
  })
}

/** Soft-delete a JE (and its lines) so it vanishes from GL reports. */
async function softDeleteJE(jeId: string, tx: PrismaTransaction) {
  await tx.journalLine.updateMany({
    where: { journalEntryId: jeId },
    data: { deletedAt: new Date() },
  })
  await tx.journalEntry.update({
    where: { id: jeId },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
}

/** Trial-balance ties check (Dr = Cr within 0.01). */
async function trialBalanceTies(): Promise<{ ties: boolean; dr: number; cr: number; diff: number }> {
  const tb = await getTrialBalance()
  const dr = toNumber(tb.totals.totalDebit)
  const cr = toNumber(tb.totals.totalCredit)
  return { ties: approx(dr, cr), dr, cr, diff: Math.abs(dr - cr) }
}

// ===========================================================================
// MAIN
// ===========================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  P3-7 E2E: Accounting Closing Cycle — End-to-End Test')
  console.log('  Tests the full cycle: monthly close → year close → reopen.')
  console.log('  Verifies closing JE zeroes revenue/expense, reversal restores,')
  console.log('  R6 blocks posting to closed periods, trial balance ties.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Step 4: Create fiscal year 2099 (12 monthly periods)
    // =====================================================================
    console.log('━━━ (a) Step 4: Create fiscal year 2099 (12 periods) ━━━')

    await step('a1: create FiscalYear 2099 with 12 OPEN periods', async () => {
      // Inline-replicate POST /api/fiscal-years body (same code path as the
      // route): validates endDate > startDate, no name collision, no overlap,
      // then creates FiscalYear + 12 FiscalPeriods in a single transaction.
      const result = await db.$transaction(async (tx) => {
        // Overlap check
        const overlapping = await tx.fiscalYear.findFirst({
          where: {
            startDate: { lte: FY_END },
            endDate: { gte: FY_START },
          },
        })
        if (overlapping) {
          throw new Error(`Overlap with existing year ${overlapping.name}`)
        }

        const fy = await tx.fiscalYear.create({
          data: {
            name: FY_NAME,
            startDate: FY_START,
            endDate: FY_END,
            status: 'OPEN',
          },
        })

        const periods: Array<{
          fiscalYearId: string
          periodNo: number
          startDate: Date
          endDate: Date
          status: string
        }> = []
        for (let i = 0; i < 12; i++) {
          const periodStart = new Date(FY_START.getFullYear(), FY_START.getMonth() + i, 1)
          const periodEnd = new Date(FY_START.getFullYear(), FY_START.getMonth() + i + 1, 0, 23, 59, 59, 999)
          periods.push({
            fiscalYearId: fy.id,
            periodNo: i + 1,
            startDate: periodStart,
            endDate: periodEnd,
            status: 'OPEN',
          })
        }
        await tx.fiscalPeriod.createMany({ data: periods })
        return tx.fiscalYear.findUnique({
          where: { id: fy.id },
          include: { periods: { orderBy: { periodNo: 'asc' } } },
        })
      })

      if (!result) throw new Error('FiscalYear not created')
      created.fiscalYearId = result.id
      created.periodIds = result.periods.map(p => p.id)
      created.januaryPeriodId = result.periods.find(p => p.periodNo === 1)?.id || ''

      const ok =
        result.status === 'OPEN' &&
        result.periods.length === 12 &&
        result.periods.every(p => p.status === 'OPEN') &&
        !!created.januaryPeriodId
      log('create FY + 12 periods', ok,
        `name=${result.name}, periods=${result.periods.length}, ` +
        `januaryId=${created.januaryPeriodId.slice(-8)}`)
    })

    await step('a2: verify period numbering 1-12 with correct month ranges', async () => {
      const periods = await db.fiscalPeriod.findMany({
        where: { fiscalYearId: created.fiscalYearId },
        orderBy: { periodNo: 'asc' },
      })
      const numbers = periods.map(p => p.periodNo)
      const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      const janStart = periods[0]?.startDate
      const decEnd = periods[11]?.endDate
      const janOk = janStart && janStart.getFullYear() === TEST_YEAR && janStart.getMonth() === 0
      const decOk = decEnd && decEnd.getFullYear() === TEST_YEAR && decEnd.getMonth() === 11
      const ok =
        JSON.stringify(numbers) === JSON.stringify(expected) &&
        !!janOk && !!decOk
      log('period numbering 1-12 + month ranges', ok,
        `numbers=[${numbers.join(',')}], janStart=${janStart?.toISOString().slice(0, 10)}, decEnd=${decEnd?.toISOString().slice(0, 10)}`)
    })

    // =====================================================================
    // (b) Step 2: Post operational JEs (revenue + expense) in 2099
    // =====================================================================
    console.log('\n━━━ (b) Step 2: Post operational JEs in 2099 ━━━')

    await step('b1: post revenue JE (Dr CASH 10,000 / Cr PROJECT_REVENUE 10,000)', async () => {
      const je = await db.$transaction(async (tx) => {
        return postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: new Date(TEST_YEAR, 0, 10), // 2099-01-10 (January)
          description: `P3-7 test revenue JE #1`,
          sourceType: 'MANUAL',
          sourceId: `P3CLOSE-REV1-${TS}`,
          lines: [
            { accountCode: '1110', debit: REV_JE1_AMT }, // CASH Dr
            { accountCode: '6110', credit: REV_JE1_AMT }, // PROJECT_REVENUE Cr
          ],
        }, tx)
      })
      created.opJE1Id = je.id
      created.allJEIds.push(je.id)
      const bal = await jeBalance(je.id)
      log('revenue JE posted', bal.balanced && bal.lines === 2,
        `entryNo=${je.entryNo}, Dr=${bal.dr}, Cr=${bal.cr}, lines=${bal.lines}`)
    })

    await step('b2: post expense JE #1 (Dr ADMIN_EXPENSE 4,000 / Cr CASH 4,000)', async () => {
      const je = await db.$transaction(async (tx) => {
        return postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: new Date(TEST_YEAR, 1, 15), // 2099-02-15 (February)
          description: `P3-7 test expense JE #1`,
          sourceType: 'MANUAL',
          sourceId: `P3CLOSE-EXP1-${TS}`,
          lines: [
            { accountCode: '8160', debit: EXP_JE1_AMT }, // ADMIN_EXPENSE Dr
            { accountCode: '1110', credit: EXP_JE1_AMT }, // CASH Cr
          ],
        }, tx)
      })
      created.opJE2Id = je.id
      created.allJEIds.push(je.id)
      const bal = await jeBalance(je.id)
      log('expense JE #1 posted', bal.balanced && bal.lines === 2,
        `entryNo=${je.entryNo}, Dr=${bal.dr}, Cr=${bal.cr}`)
    })

    await step('b3: post expense JE #2 (Dr ADMIN_EXPENSE 1,500 / Cr CASH 1,500)', async () => {
      const je = await db.$transaction(async (tx) => {
        return postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: new Date(TEST_YEAR, 2, 20), // 2099-03-20 (March)
          description: `P3-7 test expense JE #2`,
          sourceType: 'MANUAL',
          sourceId: `P3CLOSE-EXP2-${TS}`,
          lines: [
            { accountCode: '8160', debit: EXP_JE2_AMT },
            { accountCode: '1110', credit: EXP_JE2_AMT },
          ],
        }, tx)
      })
      created.opJE3Id = je.id
      created.allJEIds.push(je.id)
      const bal = await jeBalance(je.id)
      log('expense JE #2 posted', bal.balanced && bal.lines === 2,
        `entryNo=${je.entryNo}, Dr=${bal.dr}, Cr=${bal.cr}`)
    })

    await step('b4: verify 2099-range revenue balance = 10,000 (PROJECT_REVENUE)', async () => {
      const range = { from: FY_START, to: FY_END }
      const bal = await getBalanceByType('REVENUE', range)
      const ok = approx(bal, EXPECTED_REVENUE, 0.01)
      log('revenue balance in 2099', ok,
        `actual=${bal.toFixed(2)}, expected=${EXPECTED_REVENUE}`)
    })

    await step('b5: verify 2099-range expense balance = 5,500 (ADMIN_EXPENSE)', async () => {
      const range = { from: FY_START, to: FY_END }
      const bal = await getBalanceByType('EXPENSE', range)
      const ok = approx(bal, EXPECTED_EXPENSE, 0.01)
      log('expense balance in 2099', ok,
        `actual=${bal.toFixed(2)}, expected=${EXPECTED_EXPENSE}`)
    })

    await step('b6: capture pre-close ALL-TIME balances (snapshot for reopen verification)', async () => {
      // All-time balance (no range filter) — captures existing data + our test JEs
      created.preCloseRevenueBalance = await getBalanceByType('REVENUE')
      created.preCloseExpenseBalance = await getBalanceByType('EXPENSE')
      created.preCloseRetainedEarningsBalance = await getBalanceByRoleHelper('RETAINED_EARNINGS')
      log('pre-close snapshots captured', true,
        `REVENUE=${created.preCloseRevenueBalance.toFixed(2)}, ` +
        `EXPENSE=${created.preCloseExpenseBalance.toFixed(2)}, ` +
        `RE=${created.preCloseRetainedEarningsBalance.toFixed(2)}`)
    })

    await step('b7: trial balance ties pre-close', async () => {
      const tb = await trialBalanceTies()
      log('TB ties pre-close', tb.ties,
        `Dr=${tb.dr.toFixed(2)}, Cr=${tb.cr.toFixed(2)}, diff=${tb.diff.toFixed(4)}`)
    })

    // =====================================================================
    // (c) Step 1: Close January 2099 monthly period
    // =====================================================================
    console.log('\n━━━ (c) Step 1: Close January 2099 monthly period ━━━')

    await step('c1: closePeriod(januaryPeriodId) — status OPEN → CLOSED', async () => {
      await db.$transaction(async (tx) => {
        await closePeriod(created.januaryPeriodId, tx, {
          closedBy: 'P3-7-test',
          notes: 'Closing January 2099 for E2E test',
        })
      })
      const p = await db.fiscalPeriod.findUnique({
        where: { id: created.januaryPeriodId },
        select: { status: true, periodNo: true },
      })
      log('January period CLOSED', p?.status === 'CLOSED',
        `periodNo=${p?.periodNo}, status=${p?.status}`)
    })

    await step('c2: PeriodClosing audit row created for 2099/01/MONTHLY', async () => {
      const pc = await db.periodClosing.findUnique({
        where: {
          year_month_type: { year: TEST_YEAR, month: 1, type: 'MONTHLY' },
        },
      })
      const ok = !!pc && pc.status === 'CLOSED'
      log('PeriodClosing audit row', ok,
        `year=${pc?.year}, month=${pc?.month}, type=${pc?.type}, status=${pc?.status}`)
    })

    await step('c3: R6 blocks JE posting to closed January period (PERIOD_CLOSED)', async () => {
      let threw = false
      let code = ''
      try {
        await db.$transaction(async (tx) => {
          await postJournalEntry({
            entryNo: await getNextEntryNo(tx),
            date: new Date(TEST_YEAR, 0, 15), // 2099-01-15 — inside closed period
            description: 'should be blocked by R6',
            sourceType: 'MANUAL',
            sourceId: `P3CLOSE-BLOCKED-${TS}`,
            lines: [
              { accountCode: '1110', debit: 100 },
              { accountCode: '6110', credit: 100 },
            ],
            // NOTE: no skipPeriodGuard — R6 should fire
          }, tx)
        })
      } catch (e: any) {
        threw = true
        code = e?.code || e?.name || ''
      }
      const ok = threw && (code === 'PERIOD_CLOSED' || code === 'AccountingGuardError')
      log('R6 blocks posting to closed period', ok,
        `threw=${threw}, code=${code}`)
    })

    await step('c4: verify February period still OPEN (only January closed)', async () => {
      const feb = await db.fiscalPeriod.findFirst({
        where: { fiscalYearId: created.fiscalYearId, periodNo: 2 },
      })
      log('February still OPEN', feb?.status === 'OPEN',
        `periodNo=2, status=${feb?.status}`)
    })

    // =====================================================================
    // (d) Step 2: Close the fiscal year (MAJOR)
    // =====================================================================
    console.log('\n━━━ (d) Step 2: Close fiscal year 2099 (YEAR_END_CLOSING JE) ━━━')

    await step('d1: previewFiscalYearClose — returns expected structure', async () => {
      const preview = await previewFiscalYearClose(created.fiscalYearId)
      const hasRevenue = preview.revenueLines.length > 0
      const hasExpense = preview.expenseLines.length > 0
      const hasRE = !!preview.retainedEarningsAccount
      const netOk = approx(preview.netIncome, EXPECTED_NET_INCOME, 0.01)
      const revOk = approx(preview.totalRevenue, EXPECTED_REVENUE, 0.01)
      const expOk = approx(preview.totalExpenses, EXPECTED_EXPENSE, 0.01)
      const ok = hasRevenue && hasExpense && hasRE && netOk && revOk && expOk
      log('previewFiscalYearClose', ok,
        `revLines=${preview.revenueLines.length}, expLines=${preview.expenseLines.length}, ` +
        `totalRev=${preview.totalRevenue.toFixed(2)}, totalExp=${preview.totalExpenses.toFixed(2)}, ` +
        `net=${preview.netIncome.toFixed(2)}, RE=${preview.retainedEarningsAccount?.code}`)
    })

    await step('d2: closeFiscalYear — atomic close (OPEN → CLOSING → CLOSED)', async () => {
      const result = await db.$transaction(async (tx) => {
        return closeFiscalYear(created.fiscalYearId, tx, {
          closedBy: 'P3-7-test',
          approved: true,
        })
      })
      created.closingJEId = result.closingJournalEntryId
      created.closingJENo = result.closingJournalEntryNo
      created.allJEIds.push(result.closingJournalEntryId)

      // NOTE: periodsClosed counts only the periods the engine CLOSED itself.
      // January was pre-closed in step c1, so the engine closes the remaining 11.
      // The "all 12 periods CLOSED" invariant is verified in step d7.
      const ok =
        !!result.closingJournalEntryId &&
        result.periodsClosed >= 11 &&
        approx(result.totalRevenue, EXPECTED_REVENUE, 0.01) &&
        approx(result.totalExpenses, EXPECTED_EXPENSE, 0.01) &&
        approx(result.netIncome, EXPECTED_NET_INCOME, 0.01)
      log('closeFiscalYear returns', ok,
        `closingJE=${result.closingJournalEntryNo}, periodsClosed=${result.periodsClosed} (11 expected — January was pre-closed), ` +
        `totalRev=${result.totalRevenue.toFixed(2)}, totalExp=${result.totalExpenses.toFixed(2)}, ` +
        `net=${result.netIncome.toFixed(2)}`)
    })

    await step('d3: closing JE is balanced (Dr = Cr)', async () => {
      const bal = await jeBalance(created.closingJEId)
      log('closing JE balanced', bal.balanced,
        `entryNo=${created.closingJENo}, Dr=${bal.dr.toFixed(2)}, Cr=${bal.cr.toFixed(2)}, lines=${bal.lines}`)
    })

    await step('d4: closing JE has sourceType=YEAR_END_CLOSING + skipPeriodGuard effective', async () => {
      const je = await db.journalEntry.findUnique({
        where: { id: created.closingJEId },
        select: { sourceType: true, sourceId: true, date: true, isReversal: true, status: true },
      })
      const expectedDate = FY_END.toISOString().slice(0, 10)
      const actualDate = je?.date instanceof Date
        ? je.date.toISOString().slice(0, 10)
        : new Date(je?.date as any).toISOString().slice(0, 10)
      const ok =
        je?.sourceType === 'YEAR_END_CLOSING' &&
        je?.sourceId === `FY-CLOSE-${FY_NAME}` &&
        je?.isReversal === false &&
        je?.status === 'POSTED' &&
        actualDate === expectedDate
      log('closing JE metadata', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}, date=${actualDate}, ` +
        `isReversal=${je?.isReversal}, status=${je?.status}`)
    })

    await step('d5: closing JE structure — Dr REVENUE, Cr EXPENSE, Cr RETAINED_EARNINGS', async () => {
      const lines = await jeLines(created.closingJEId)
      const revenueDr = lines.filter(l =>
        l.account.type === 'REVENUE' && Number(l.debit) > 0
      )
      const expenseCr = lines.filter(l =>
        l.account.type === 'EXPENSE' && Number(l.credit) > 0
      )
      const reLine = lines.find(l =>
        l.account.accountRole === 'RETAINED_EARNINGS'
      )
      const reCredit = reLine ? Number(reLine.credit) : 0
      const reDebit = reLine ? Number(reLine.debit) : 0

      const ok =
        revenueDr.length >= 1 && // at least PROJECT_REVENUE
        expenseCr.length >= 1 && // at least ADMIN_EXPENSE
        !!reLine &&
        approx(reCredit, EXPECTED_NET_INCOME, 0.01) && // net income → Cr RE
        reDebit === 0 // no debit since we have net income (not loss)
      log('closing JE structure', ok,
        `revenueDrLines=${revenueDr.length} (ΣDr=${revenueDr.reduce((s, l) => s + Number(l.debit), 0).toFixed(2)}), ` +
        `expenseCrLines=${expenseCr.length} (ΣCr=${expenseCr.reduce((s, l) => s + Number(l.credit), 0).toFixed(2)}), ` +
        `RE: Dr=${reDebit}, Cr=${reCredit}`)
    })

    await step('d6: FiscalYear.status = CLOSED + closingJournalEntryId set', async () => {
      const fy = await db.fiscalYear.findUnique({
        where: { id: created.fiscalYearId },
        select: {
          status: true, closingJournalEntryId: true, closedBy: true, closedAt: true,
          retainedEarningsAccountCode: true, totalRevenue: true, totalExpenses: true, netProfit: true,
        },
      })
      const ok =
        fy?.status === 'CLOSED' &&
        fy?.closingJournalEntryId === created.closingJEId &&
        fy?.closedBy === 'P3-7-test' &&
        !!fy?.closedAt &&
        fy?.retainedEarningsAccountCode === '5200' &&
        approx(toNumber(fy?.totalRevenue), EXPECTED_REVENUE, 0.01) &&
        approx(toNumber(fy?.totalExpenses), EXPECTED_EXPENSE, 0.01) &&
        approx(toNumber(fy?.netProfit), EXPECTED_NET_INCOME, 0.01)
      log('FiscalYear CLOSED + totals cached', ok,
        `status=${fy?.status}, closingJEId=${fy?.closingJournalEntryId?.slice(-8)}, ` +
        `closedBy=${fy?.closedBy}, RECode=${fy?.retainedEarningsAccountCode}, ` +
        `storedRev=${toNumber(fy?.totalRevenue).toFixed(2)}, ` +
        `storedExp=${toNumber(fy?.totalExpenses).toFixed(2)}, ` +
        `storedNet=${toNumber(fy?.netProfit).toFixed(2)}`)
    })

    await step('d7: all 12 FiscalPeriods are CLOSED', async () => {
      const periods = await db.fiscalPeriod.findMany({
        where: { fiscalYearId: created.fiscalYearId },
        select: { status: true, periodNo: true },
        orderBy: { periodNo: 'asc' },
      })
      const allClosed = periods.length === 12 && periods.every(p => p.status === 'CLOSED')
      const counts = periods.reduce((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m }, {} as Record<string, number>)
      log('all 12 periods CLOSED', allClosed,
        `total=${periods.length}, byStatus=${JSON.stringify(counts)}`)
    })

    await step('d8: 2099-range REVENUE balance = 0 (closing JE zeroed it)', async () => {
      const range = { from: FY_START, to: FY_END }
      const bal = await getBalanceByType('REVENUE', range)
      const ok = approx(bal, 0, 0.01)
      log('2099 revenue zeroed after close', ok,
        `actual=${bal.toFixed(4)} (expected 0)`)
    })

    await step('d9: 2099-range EXPENSE balance = 0 (closing JE zeroed it)', async () => {
      const range = { from: FY_START, to: FY_END }
      const bal = await getBalanceByType('EXPENSE', range)
      const ok = approx(bal, 0, 0.01)
      log('2099 expense zeroed after close', ok,
        `actual=${bal.toFixed(4)} (expected 0)`)
    })

    await step('d10: all-time RETAINED_EARNINGS increased by netIncome (4,500)', async () => {
      const reAfter = await getBalanceByRoleHelper('RETAINED_EARNINGS')
      created.postCloseRetainedEarningsBalance = reAfter
      const delta = reAfter - created.preCloseRetainedEarningsBalance
      const ok = approx(delta, EXPECTED_NET_INCOME, 0.01)
      log('RE increased by netIncome', ok,
        `pre=${created.preCloseRetainedEarningsBalance.toFixed(2)}, ` +
        `post=${reAfter.toFixed(2)}, delta=${delta.toFixed(2)} (expected ${EXPECTED_NET_INCOME})`)
    })

    await step('d11: closing JE bypassed R6 (posted despite January being CLOSED)', async () => {
      // January period was closed in step c1. The closing JE is dated 2099-12-31
      // which falls in the December period (periodNo=12) — also CLOSED by the
      // engine in step d2. Without skipPeriodGuard, posting would have thrown
      // PERIOD_CLOSED. The fact that we have a closingJEId proves bypass worked.
      const je = await db.journalEntry.findUnique({
        where: { id: created.closingJEId },
        select: { status: true, date: true },
      })
      const decPeriod = await db.fiscalPeriod.findFirst({
        where: { fiscalYearId: created.fiscalYearId, periodNo: 12 },
        select: { status: true },
      })
      const closingDate = je?.date instanceof Date ? je.date : new Date(je!.date)
      const ok =
        je?.status === 'POSTED' &&
        decPeriod?.status === 'CLOSED' && // December (where closing JE lands) is CLOSED
        closingDate.getTime() >= FY_START.getTime() &&
        closingDate.getTime() <= FY_END.getTime()
      log('closing JE bypassed R6', ok,
        `closingJE.status=${je?.status}, closingDate=${closingDate.toISOString().slice(0, 10)}, ` +
        `decPeriod.status=${decPeriod?.status} (CLOSED — proves skipPeriodGuard worked)`)
    })

    await step('d12: trial balance still ties after close', async () => {
      const tb = await trialBalanceTies()
      log('TB ties after close', tb.ties,
        `Dr=${tb.dr.toFixed(2)}, Cr=${tb.cr.toFixed(2)}, diff=${tb.diff.toFixed(4)}`)
    })

    await step('d13: all-time revenue/expense captured for reopen comparison', async () => {
      // After close: all-time revenue = preClose - 10,000 (closing JE Dr'd PROJECT_REVENUE)
      // After close: all-time expense = preClose - 5,500  (closing JE Cr'd ADMIN_EXPENSE)
      created.postCloseRevenueBalance = await getBalanceByType('REVENUE')
      created.postCloseExpenseBalance = await getBalanceByType('EXPENSE')
      const revDelta = created.postCloseRevenueBalance - created.preCloseRevenueBalance
      const expDelta = created.postCloseExpenseBalance - created.preCloseExpenseBalance
      const ok =
        approx(revDelta, -EXPECTED_REVENUE, 0.01) &&
        approx(expDelta, -EXPECTED_EXPENSE, 0.01)
      log('post-close all-time deltas', ok,
        `revDelta=${revDelta.toFixed(2)} (expected ${-EXPECTED_REVENUE}), ` +
        `expDelta=${expDelta.toFixed(2)} (expected ${-EXPECTED_EXPENSE})`)
    })

    // =====================================================================
    // (e) Step 3: Reopen the fiscal year
    // =====================================================================
    console.log('\n━━━ (e) Step 3: Reopen fiscal year 2099 (reversal JE) ━━━')

    await step('e1: reopenFiscalYear — atomic reopen (CLOSED → OPEN)', async () => {
      const result = await db.$transaction(async (tx) => {
        return reopenFiscalYear(created.fiscalYearId, tx, {
          reopenedBy: 'P3-7-test',
          reverseClosingJE: true,
        })
      })
      created.reversalJEId = result.reversalEntryId || ''
      created.reversalJENo = result.reversalEntryNo || ''
      if (result.reversalEntryId) created.allJEIds.push(result.reversalEntryId)

      const ok =
        result.periodsReopened === 12 &&
        !!result.reversalEntryId &&
        !!result.reversalEntryNo
      log('reopenFiscalYear returns', ok,
        `reversalJE=${result.reversalEntryNo}, periodsReopened=${result.periodsReopened}`)
    })

    await step('e2: reversal JE is balanced (flipped Dr/Cr)', async () => {
      const bal = await jeBalance(created.reversalJEId)
      log('reversal JE balanced', bal.balanced,
        `entryNo=${created.reversalJENo}, Dr=${bal.dr.toFixed(2)}, Cr=${bal.cr.toFixed(2)}, lines=${bal.lines}`)
    })

    await step('e3: reversal JE has isReversal=true + reversedEntryId=closingJE.id', async () => {
      const je = await db.journalEntry.findUnique({
        where: { id: created.reversalJEId },
        select: {
          isReversal: true, reversedEntryId: true, sourceType: true,
          sourceId: true, status: true,
        },
      })
      const ok =
        je?.isReversal === true &&
        je?.reversedEntryId === created.closingJEId &&
        je?.sourceType === 'YEAR_END_CLOSING' && // preserved from original
        je?.status === 'POSTED' // NOT CANCELLED — both stay POSTED
      log('reversal JE metadata', ok,
        `isReversal=${je?.isReversal}, reversedEntryId=${je?.reversedEntryId?.slice(-8)} (closing), ` +
        `sourceType=${je?.sourceType}, status=${je?.status}`)
    })

    await step('e4: reversal JE lines are flipped (Dr↔Cr) from closing JE', async () => {
      const closingLines = await jeLines(created.closingJEId)
      const reversalLines = await jeLines(created.reversalJEId)
      let allFlipped = true
      const mismatches: string[] = []
      for (const cLine of closingLines) {
        const rLine = reversalLines.find(l => l.accountId === cLine.accountId)
        if (!rLine) {
          allFlipped = false
          mismatches.push(`account ${cLine.account.code}: missing in reversal`)
          continue
        }
        const cDr = Number(cLine.debit)
        const cCr = Number(cLine.credit)
        const rDr = Number(rLine.debit)
        const rCr = Number(rLine.credit)
        if (!approx(rDr, cCr, 0.01) || !approx(rCr, cDr, 0.01)) {
          allFlipped = false
          mismatches.push(
            `account ${cLine.account.code}: closing Dr=${cDr}/Cr=${cCr} vs reversal Dr=${rDr}/Cr=${rCr}`
          )
        }
      }
      log('reversal lines flipped', allFlipped,
        allFlipped
          ? `all ${closingLines.length} lines correctly flipped (Dr↔Cr)`
          : mismatches.slice(0, 3).join('; '))
    })

    await step('e5: original closing JE stays POSTED (not CANCELLED)', async () => {
      const je = await db.journalEntry.findUnique({
        where: { id: created.closingJEId },
        select: { status: true, isReversal: true },
      })
      log('closing JE stays POSTED', je?.status === 'POSTED' && je?.isReversal === false,
        `status=${je?.status}, isReversal=${je?.isReversal} (per guard design — both stay POSTED, net to zero)`)
    })

    await step('e6: FiscalYear.status = OPEN + closingJournalEntryId cleared', async () => {
      const fy = await db.fiscalYear.findUnique({
        where: { id: created.fiscalYearId },
        select: {
          status: true, closingJournalEntryId: true, closedBy: true, closedAt: true,
          closingNotes: true, totalRevenue: true, totalExpenses: true, netProfit: true,
        },
      })
      const ok =
        fy?.status === 'OPEN' &&
        fy?.closingJournalEntryId === null &&
        fy?.closedBy === null &&
        fy?.closedAt === null
      // Note: totalRevenue/totalExpenses/netProfit are PRESERVED as historical snapshot
      const totalsPreserved =
        approx(toNumber(fy?.totalRevenue), EXPECTED_REVENUE, 0.01) &&
        approx(toNumber(fy?.totalExpenses), EXPECTED_EXPENSE, 0.01) &&
        approx(toNumber(fy?.netProfit), EXPECTED_NET_INCOME, 0.01)
      log('FiscalYear OPEN + closing info cleared + totals preserved', ok && totalsPreserved,
        `status=${fy?.status}, closingJEId=${fy?.closingJournalEntryId}, ` +
        `closedBy=${fy?.closedBy}, closedAt=${fy?.closedAt}, ` +
        `storedRev=${toNumber(fy?.totalRevenue).toFixed(2)} (preserved), ` +
        `storedExp=${toNumber(fy?.totalExpenses).toFixed(2)} (preserved)`)
    })

    await step('e7: all 12 FiscalPeriods are OPEN after reopen', async () => {
      const periods = await db.fiscalPeriod.findMany({
        where: { fiscalYearId: created.fiscalYearId },
        select: { status: true, periodNo: true },
        orderBy: { periodNo: 'asc' },
      })
      const allOpen = periods.length === 12 && periods.every(p => p.status === 'OPEN')
      const counts = periods.reduce((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m }, {} as Record<string, number>)
      log('all 12 periods OPEN after reopen', allOpen,
        `total=${periods.length}, byStatus=${JSON.stringify(counts)}`)
    })

    await step('e8: all-time REVENUE balance restored to pre-close value', async () => {
      const bal = await getBalanceByType('REVENUE')
      const ok = approx(bal, created.preCloseRevenueBalance, 0.01)
      log('all-time revenue restored', ok,
        `actual=${bal.toFixed(2)}, preClose=${created.preCloseRevenueBalance.toFixed(2)}, ` +
        `diff=${(bal - created.preCloseRevenueBalance).toFixed(4)}`)
    })

    await step('e9: all-time EXPENSE balance restored to pre-close value', async () => {
      const bal = await getBalanceByType('EXPENSE')
      const ok = approx(bal, created.preCloseExpenseBalance, 0.01)
      log('all-time expense restored', ok,
        `actual=${bal.toFixed(2)}, preClose=${created.preCloseExpenseBalance.toFixed(2)}, ` +
        `diff=${(bal - created.preCloseExpenseBalance).toFixed(4)}`)
    })

    await step('e10: all-time RETAINED_EARNINGS restored to pre-close value', async () => {
      const bal = await getBalanceByRoleHelper('RETAINED_EARNINGS')
      const ok = approx(bal, created.preCloseRetainedEarningsBalance, 0.01)
      log('all-time RE restored', ok,
        `actual=${bal.toFixed(2)}, preClose=${created.preCloseRetainedEarningsBalance.toFixed(2)}, ` +
        `diff=${(bal - created.preCloseRetainedEarningsBalance).toFixed(4)}`)
    })

    await step('e11: trial balance still ties after reopen', async () => {
      const tb = await trialBalanceTies()
      log('TB ties after reopen', tb.ties,
        `Dr=${tb.dr.toFixed(2)}, Cr=${tb.cr.toFixed(2)}, diff=${tb.diff.toFixed(4)}`)
    })

    // =====================================================================
    // (f) Final verification
    // =====================================================================
    console.log('\n━━━ (f) Final verification ━━━')

    await step('f1: all JEs balanced throughout cycle', async () => {
      let allBalanced = true
      const unbalanced: string[] = []
      for (const jeId of created.allJEIds) {
        if (!jeId) continue
        const b = await jeBalance(jeId)
        if (!b.balanced) {
          allBalanced = false
          unbalanced.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
        }
      }
      log('all JEs balanced', allBalanced,
        `${created.allJEIds.length} JEs total (3 operational + 1 closing + 1 reversal). ` +
        `${allBalanced ? 'All balanced.' : `Unbalanced: ${unbalanced.join(', ')}`}`)
    })

    await step('f2: source↔JE linkage intact (FiscalYear.closingJournalEntryId cleared)', async () => {
      const fy = await db.fiscalYear.findUnique({
        where: { id: created.fiscalYearId },
        select: { status: true, closingJournalEntryId: true },
      })
      const ok = fy?.status === 'OPEN' && fy?.closingJournalEntryId === null
      log('FY linkage cleared', ok,
        `status=${fy?.status}, closingJournalEntryId=${fy?.closingJournalEntryId}`)
    })

    await step('f3: closing engine uses unique sourceId per FY (idempotency index)', async () => {
      // The closing engine uses sourceId = `FY-CLOSE-${fy.name}` for the closing
      // JE. The DB has a partial unique index:
      //   JournalEntry_source_isReversal_unique ON (sourceType, sourceId)
      //   WHERE isReversal = 0 AND sourceId IS NOT NULL AND deletedAt IS NULL
      // This means: only ONE non-reversal, non-deleted closing JE can exist per
      // fiscal year. Re-closing without soft-deleting the original (which the
      // engine does NOT do — both entries stay POSTED for audit) would violate
      // the index. This is by design: it prevents accidental double-close.
      //
      // We verify the original closing JE is still POSTED (not soft-deleted),
      // so a second close attempt with the same sourceId would fail with a
      // unique-constraint error. The engine does NOT attempt this — to re-close,
      // the accountant must first reopen (which creates a reversal JE that
      // cancels the closing JE in the GL, but leaves the original POSTED). The
      // 2099-range balances are zeroed by the closing JE; the reversal is dated
      // TODAY (outside 2099 range), so 2099-range balances stay zeroed until
      // new operational JEs are posted in 2099 (which the accountant can do
      // since the year and its periods are OPEN after reopen).
      const closingJE = await db.journalEntry.findUnique({
        where: { id: created.closingJEId },
        select: { sourceType: true, sourceId: true, isReversal: true, deletedAt: true, status: true },
      })
      const ok =
        closingJE?.sourceType === 'YEAR_END_CLOSING' &&
        closingJE?.sourceId === `FY-CLOSE-${FY_NAME}` &&
        closingJE?.isReversal === false &&
        closingJE?.deletedAt === null && // NOT soft-deleted → blocks re-close via unique index
        closingJE?.status === 'POSTED'
      log('original closing JE blocks re-close via unique index', ok,
        `sourceType=${closingJE?.sourceType}, sourceId=${closingJE?.sourceId}, ` +
        `isReversal=${closingJE?.isReversal}, deletedAt=${closingJE?.deletedAt}, ` +
        `status=${closingJE?.status} (stays POSTED → idempotency index prevents duplicate)`)
    })

    await step('f4: closing engine refuses un-approved close (NOT_APPROVED)', async () => {
      let threw = false
      let code = ''
      try {
        await db.$transaction(async (tx) => {
          // @ts-expect-error — deliberately omitting approved to test the guard
          await closeFiscalYear(created.fiscalYearId, tx, { closedBy: 'test' })
        })
      } catch (e: any) {
        threw = true
        code = e?.code || ''
      }
      log('engine refuses un-approved close', threw && code === 'NOT_APPROVED',
        `threw=${threw}, code=${code}`)
    })

    await step('f5: closing engine refuses call without tx (CLOSE_NO_TX)', async () => {
      let threw = false
      let code = ''
      try {
        // @ts-expect-error — deliberately omitting tx to test the P1-4 guard
        await closeFiscalYear(created.fiscalYearId, undefined, { approved: true })
      } catch (e: any) {
        threw = true
        code = e?.code || ''
      }
      log('engine refuses no-tx call', threw && code === 'CLOSE_NO_TX',
        `threw=${threw}, code=${code}`)
    })

    await step('f6: reopen engine refuses call without tx (REOPEN_NO_TX)', async () => {
      let threw = false
      let code = ''
      try {
        // @ts-expect-error — deliberately omitting tx to test the P1-4 guard
        await reopenFiscalYear(created.fiscalYearId, undefined, {})
      } catch (e: any) {
        threw = true
        code = e?.code || ''
      }
      log('reopen engine refuses no-tx call', threw && code === 'REOPEN_NO_TX',
        `threw=${threw}, code=${code}`)
    })

    await step('f7: cannot close an already-closed year (YEAR_ALREADY_CLOSED)', async () => {
      // Verify the engine rejects double-close at the status-check stage
      // (BEFORE computing balances or attempting to create a JE).
      // We first need to put the year into CLOSED state. The original closing
      // JE (from d2) is still POSTED, so re-closing would conflict with the
      // idempotency unique index. To create a NEW closed state cleanly, we
      // soft-delete the original closing JE (and its reversal) first — this
      // simulates an admin cleanup and frees the sourceId for a new close.
      // This is purely test scaffolding to exercise the YEAR_ALREADY_CLOSED
      // guard; it does NOT reflect normal accounting workflow.
      await db.$transaction(async (tx) => {
        // Soft-delete the original closing JE + its reversal so the sourceId is free
        if (created.closingJEId) await softDeleteJE(created.closingJEId, tx)
        if (created.reversalJEId) await softDeleteJE(created.reversalJEId, tx)
        // Reset the FY to a clean OPEN state (no closing JE linked)
        await tx.fiscalYear.update({
          where: { id: created.fiscalYearId },
          data: {
            status: 'OPEN',
            closingJournalEntryId: null,
            closedBy: null,
            closedAt: null,
            closingNotes: null,
          },
        })
        // Reopen all periods (they were CLOSED by d2)
        await tx.fiscalPeriod.updateMany({
          where: { fiscalYearId: created.fiscalYearId },
          data: { status: 'OPEN' },
        })
      })

      // Post a small op JE so the close has something to close
      const prepJE = await db.$transaction(async (tx) => {
        return postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: new Date(TEST_YEAR, 6, 15), // 2099-07-15
          description: 'P3-7 test prep for double-close test',
          sourceType: 'MANUAL',
          sourceId: `P3CLOSE-PREP-F7-${TS}`,
          lines: [
            { accountCode: '1110', debit: 1_000 },
            { accountCode: '6110', credit: 1_000 },
          ],
        }, tx)
      })
      created.allJEIds.push(prepJE.id)

      // Close once — should succeed (year is OPEN, sourceId is free)
      const firstClose = await db.$transaction(async (tx) => {
        return closeFiscalYear(created.fiscalYearId, tx, { closedBy: 'test-f7', approved: true })
      })
      created.allJEIds.push(firstClose.closingJournalEntryId)

      // Try to close again — should throw YEAR_ALREADY_CLOSED before computing balances
      let threw = false
      let code = ''
      try {
        await db.$transaction(async (tx) => {
          await closeFiscalYear(created.fiscalYearId, tx, { closedBy: 'test-f7', approved: true })
        })
      } catch (e: any) {
        threw = true
        code = e?.code || ''
      }
      log('double-close refused (YEAR_ALREADY_CLOSED)', threw && code === 'YEAR_ALREADY_CLOSED',
        `threw=${threw}, code=${code}`)

      // Reopen for cleanup
      const r = await db.$transaction(async (tx) => {
        return reopenFiscalYear(created.fiscalYearId, tx, { reopenedBy: 'test-f7' })
      })
      if (r.reversalEntryId) created.allJEIds.push(r.reversalEntryId)
    })

    await step('f8: cannot reopen an OPEN year (YEAR_NOT_CLOSED)', async () => {
      let threw = false
      let code = ''
      try {
        await db.$transaction(async (tx) => {
          await reopenFiscalYear(created.fiscalYearId, tx, {})
        })
      } catch (e: any) {
        threw = true
        code = e?.code || ''
      }
      log('reopen OPEN year refused', threw && code === 'YEAR_NOT_CLOSED',
        `threw=${threw}, code=${code}`)
    })

    await step('f9: closing-preview uses 2099 range (zeroed by closing JEs)', async () => {
      // After the full cycle (close → reopen → re-close → re-reopen → close → reopen),
      // the 2099-range revenue/expense balances are zeroed by the cumulative closing
      // JEs (all reversal JEs are dated TODAY, outside 2099 range). The preview uses
      // the FY date range, so it shows zero. This is the correct accounting treatment:
      // the closed year's "as-closed" view shows zero; the all-time view (verified in
      // e8/e9/e10) shows the restored operational balances.
      const preview = await previewFiscalYearClose(created.fiscalYearId)
      const revOk = approx(preview.totalRevenue, 0, 0.01)
      const expOk = approx(preview.totalExpenses, 0, 0.01)
      const netOk = approx(preview.netIncome, 0, 0.01)
      log('preview uses 2099 range (zeroed)', revOk && expOk && netOk,
        `totalRev=${preview.totalRevenue.toFixed(2)}, ` +
        `totalExp=${preview.totalExpenses.toFixed(2)}, ` +
        `net=${preview.netIncome.toFixed(2)} ` +
        `(all 0 — closing JEs zeroed 2099 range; reversals are dated today, outside range)`)
    })

    await step('f10: final trial balance ties', async () => {
      const tb = await trialBalanceTies()
      log('final TB ties', tb.ties,
        `Dr=${tb.dr.toFixed(2)}, Cr=${tb.cr.toFixed(2)}, diff=${tb.diff.toFixed(4)}`)
    })

  } catch (e: any) {
    console.error('\n[FATAL] Unhandled error during cycle:', e)
    console.error(e?.stack || e)
  } finally {
    // =====================================================================
    // CLEANUP — reopen year if closed, soft-delete JEs, hard-delete FY
    // =====================================================================
    console.log('\n━━━ Cleanup: removing all test data ━━━')
    await cleanup()
  }

  // =====================================================================
  // Final summary
  // =====================================================================
  console.log('\n═══════════════════════════════════════════════════════════════')
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (out of ${results.length})`)
  if (failed === 0) {
    console.log('  ✅ All closing-cycle E2E tests PASSED')
  } else {
    console.log('  ⚠  Some tests FAILED — review details above')
    console.log('\n  FAILED TESTS:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    ✗ ${r.test}: ${r.detail}`)
    }
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

// ===========================================================================
// Helper: get balance for a single account role (all-time)
// ===========================================================================
async function getBalanceByRoleHelper(role: string): Promise<number> {
  // Use getAccountBalancesByType for EQUITY (RETAINED_EARNINGS is EQUITY type),
  // then filter by role. This avoids relying on getBalanceByRole's
  // "first-account-type" heuristic for mixed-role type queries.
  const range = undefined // all-time
  const accounts = await getAccountBalancesByType(['EQUITY'], range)
  const match = accounts.find(a => a.accountRole === role)
  return match?.balance || 0
}

// ===========================================================================
// Cleanup — reopens year if closed, soft-deletes JEs, hard-deletes FY
// ===========================================================================
async function cleanup() {
  try {
    await db.$transaction(async (tx) => {
      // 1. If the fiscal year is CLOSED, reopen it (reverses closing JE).
      //    This ensures no orphan closing JEs remain linked to the FY.
      if (created.fiscalYearId) {
        const fy = await tx.fiscalYear.findUnique({
          where: { id: created.fiscalYearId },
          select: { status: true, closingJournalEntryId: true },
        })
        if (fy?.status === 'CLOSED') {
          try {
            const r = await reopenFiscalYear(created.fiscalYearId, tx, {
              reopenedBy: 'P3-7-cleanup',
              reverseClosingJE: true,
            })
            if (r.reversalEntryId) created.allJEIds.push(r.reversalEntryId)
            console.log(`  ✓ Reopened CLOSED year during cleanup (reversal JE: ${r.reversalEntryNo})`)
          } catch (e: any) {
            console.warn(`  ⚠ Could not reopen year during cleanup: ${e?.message || e}`)
          }
        }
      }

      // 2. Soft-delete all JEs created by this test (operational + closing +
      //    reversal + any re-close/re-reopen JEs from f3/f7). They vanish
      //    from GL reports but stay in the DB for audit.
      for (const jeId of created.allJEIds) {
        if (!jeId) continue
        try {
          await softDeleteJE(jeId, tx)
        } catch { /* may already be soft-deleted */ }
      }

      // 3. Hard-delete the FiscalYear. This cascades to its 12 FiscalPeriods
      //    (onDelete: Cascade in schema). The PeriodClosing audit rows for
      //    2099 are left in place (they are harmless audit records — they
      //    don't gate any posting decision per the SSOT design).
      if (created.fiscalYearId) {
        try {
          await tx.fiscalYear.delete({ where: { id: created.fiscalYearId } })
          console.log(`  ✓ Deleted FiscalYear ${FY_NAME} (cascaded to 12 periods)`)
        } catch (e: any) {
          // If delete fails (e.g., JEs still reference the year via date range),
          // best-effort: delete periods then year
          console.warn(`  ⚠ Direct FY delete failed: ${e?.message || e}. Trying period-by-period...`)
          try {
            await tx.fiscalPeriod.deleteMany({ where: { fiscalYearId: created.fiscalYearId } })
            await tx.fiscalYear.delete({ where: { id: created.fiscalYearId } })
            console.log(`  ✓ Deleted FiscalYear (via period-by-period fallback)`)
          } catch (e2: any) {
            console.warn(`  ⚠ Could not delete FiscalYear: ${e2?.message || e2}`)
          }
        }
      }

      // 4. Clean up PeriodClosing audit rows for 2099 (best-effort)
      try {
        await tx.periodClosing.deleteMany({ where: { year: TEST_YEAR } })
      } catch { /* may not exist */ }
    })
    console.log('  ✓ All test data removed (JEs soft-deleted, FiscalYear + periods hard-deleted)')
  } catch (e: any) {
    console.error('  ⚠ Cleanup error:', e?.message || e)
    console.log('  Attempting best-effort individual cleanup...')
    // Best-effort: soft-delete JEs individually
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } })
      } catch {}
    }
    // Best-effort: delete FY
    if (created.fiscalYearId) {
      try {
        await db.fiscalPeriod.deleteMany({ where: { fiscalYearId: created.fiscalYearId } })
        await db.fiscalYear.deleteMany({ where: { id: created.fiscalYearId } })
        console.log('  ✓ Best-effort FY cleanup done')
      } catch (e2: any) {
        console.error('  ⚠ Best-effort FY cleanup failed:', e2?.message || e2)
      }
    }
    // Best-effort: delete PeriodClosing rows
    try { await db.periodClosing.deleteMany({ where: { year: TEST_YEAR } }) } catch {}
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
