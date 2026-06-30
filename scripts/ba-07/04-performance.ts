// ============================================================================
// BA-07.4 — Performance Test on Large Dataset (50,000 entries)
// ============================================================================
//
// Goal: verify that financial reports & queries still perform at acceptable
// speed on a database with tens of thousands of journal entries.
//
// Methodology (read-only audit; data is cleaned up at the end):
//   1. Measure baseline query times on current dataset (~19 entries).
//   2. Bulk-seed 50,000 journal entries (100,000 lines) spread across FY2025,
//      using 6 accounts from 5 types (ASSET / LIABILITY / REVENUE / EXPENSE).
//      Use db.journalEntry.createMany + db.journalLine.createMany in batches
//      wrapped in $transaction, with explicit IDs (so we can write lines
//      without first reading back entry IDs).
//   3. Re-measure the same queries on the large dataset.
//   4. Test the HTTP endpoints the UI uses (curl-style timings).
//   5. DELETE all BA07PERF-* entries and lines. Verify baseline restored.
//
// Acceptance thresholds:
//   < 2s  = GOOD
//   2-5s  = ACCEPTABLE (borderline)
//   5-10s = SLOW
//   > 10s = UNACCEPTABLE
//
// Run: bun scripts/ba-07/04-performance.ts
// ============================================================================

import { db } from '@/lib/db'
import { performance } from 'perf_hooks'
import {
  getTrialBalance,
  getGeneralLedger,
  getAccountBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREFIX = 'BA07PERF-'
const TOTAL_ENTRIES = 50_000
const BATCH_SIZE = 200 // 200 entries × 2 lines = 400 lines per $transaction
const RUNS = 3 // take median of 3 runs per query

const RANGE = {
  from: new Date('2025-01-01T00:00:00.000Z'),
  to: new Date('2025-12-31T23:59:59.999Z'),
}
const AS_OF = new Date('2025-12-31T23:59:59.999Z')
const CASH_CODE = '1110'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function fmt(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`
}

function verdict(ms: number): string {
  if (ms < 2000) return 'GOOD'
  if (ms < 5000) return 'ACCEPTABLE'
  if (ms < 10000) return 'SLOW'
  return 'UNACCEPTABLE'
}

async function time3<T>(fn: () => Promise<T>): Promise<{ medianMs: number; sample: T }> {
  const times: number[] = []
  let sample: T | undefined
  // Warm-up run (not counted) so first-call cache priming doesn't skew the median.
  try {
    sample = await fn()
  } catch (e) {
    sample = undefined as unknown as T
    console.warn('  [time3] warm-up threw:', (e as Error).message)
  }
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now()
    try {
      sample = await fn()
    } catch (e) {
      console.warn('  [time3] run threw:', (e as Error).message)
    }
    times.push(performance.now() - start)
  }
  return { medianMs: median(times), sample: sample as T }
}

function logStage(msg: string) {
  console.log('\n' + '='.repeat(78))
  console.log(msg)
  console.log('='.repeat(78))
}

// Generate a pseudo-random but stable ID. We need 50k unique IDs and don't
// want to depend on a cuid library; a counter prefix is fine since SQLite
// accepts any unique string for the @id column.
function makeEntryId(n: number): string {
  return `perfje${String(n).padStart(8, '0')}`
}
function makeLineId(entryN: number, lineIdx: number): string {
  return `perfjl${String(entryN).padStart(8, '0')}${lineIdx}`
}

// ---------------------------------------------------------------------------
// Phase 1: baseline measurement
// ---------------------------------------------------------------------------

interface QueryResult {
  label: string
  medianMs: number
  notes?: string
}

async function measureAllQueries(): Promise<QueryResult[]> {
  const results: QueryResult[] = []

  // 1. Trial balance
  {
    const r = await time3(() => getTrialBalance(RANGE))
    results.push({ label: 'getTrialBalance(range)', medianMs: r.medianMs, notes: `${r.sample.rows.length} rows` })
  }
  // 2. General ledger for CASH account
  {
    const r = await time3(() => getGeneralLedger(CASH_CODE, RANGE))
    const lineCount = r.sample ? r.sample.lines.length : 0
    results.push({ label: `getGeneralLedger(${CASH_CODE}, range)`, medianMs: r.medianMs, notes: `${lineCount} lines` })
  }
  // 3. Account balance for CASH
  {
    const r = await time3(() => getAccountBalance(CASH_CODE, RANGE))
    results.push({ label: `getAccountBalance(${CASH_CODE}, range)`, medianMs: r.medianMs, notes: `bal=${r.sample.toFixed(2)}` })
  }
  // 4. Income statement
  {
    const r = await time3(() => getIncomeStatement(RANGE))
    results.push({ label: 'getIncomeStatement(range)', medianMs: r.medianMs, notes: `rev=${r.sample.revenue.accounts.length}, exp=${r.sample.expenses.accounts.length}` })
  }
  // 5. Balance sheet
  {
    const r = await time3(() => getBalanceSheet(AS_OF))
    results.push({ label: 'getBalanceSheet(asOf)', medianMs: r.medianMs, notes: `A=${r.sample.assets.total.toFixed(0)} L+E=${r.sample.totalLiabilitiesAndEquity.toFixed(0)} bal=${r.sample.isBalanced}` })
  }
  // 6. Cash flow
  {
    const r = await time3(() => getCashFlow(RANGE))
    results.push({ label: 'getCashFlow(range)', medianMs: r.medianMs, notes: `byAccount=${r.sample.byAccount.length}, monthly=${r.sample.monthly.length}` })
  }
  // 7. verifyNumericalConsistency
  {
    const r = await time3(() => verifyNumericalConsistency(AS_OF))
    results.push({ label: 'verifyNumericalConsistency(asOf)', medianMs: r.medianMs, notes: `ok=${r.sample.ok}, checked=${r.sample.accountsChecked}, diffs=${r.sample.diffs.length}` })
  }
  // 8. Raw journalLine aggregate
  {
    const r = await time3(async () => {
      return db.journalLine.aggregate({
        _sum: { debit: true, credit: true },
        where: {
          deletedAt: null,
          journalEntry: { status: 'POSTED', deletedAt: null, date: { gte: RANGE.from, lte: RANGE.to } },
        },
      })
    })
    results.push({ label: 'db.journalLine.aggregate (raw)', medianMs: r.medianMs, notes: `dr=${r.sample._sum.debit?.toString() ?? '0'}` })
  }
  // 9. Count of journalEntry in range (extra sanity)
  {
    const r = await time3(async () => {
      return db.journalEntry.count({
        where: { status: 'POSTED', deletedAt: null, date: { gte: RANGE.from, lte: RANGE.to } },
      })
    })
    results.push({ label: 'db.journalEntry.count (range)', medianMs: r.medianMs, notes: `count=${r.sample}` })
  }

  return results
}

// ---------------------------------------------------------------------------
// Phase 2: bulk seed 50,000 entries
// ---------------------------------------------------------------------------

async function bulkSeed(): Promise<{ totalMs: number; entriesCreated: number; linesCreated: number }> {
  logStage(`PHASE 2 — Seeding ${TOTAL_ENTRIES} entries (${TOTAL_ENTRIES * 2} lines)`)

  // 1. Get account IDs (we want 6 accounts across 5 types)
  const accountCodes = ['1110', '1120', '1210', '3210', '6110', '7110']
  const accounts = await db.account.findMany({
    where: { code: { in: accountCodes }, isActive: true },
    select: { id: true, code: true, type: true, name: true },
  })
  if (accounts.length !== 6) {
    throw new Error(`Expected 6 accounts, found ${accounts.length}: ${JSON.stringify(accounts.map(a => a.code))}`)
  }
  console.log(`Using ${accounts.length} accounts:`, accounts.map(a => `${a.code}/${a.type}`).join(', '))

  // Pre-pick random account pairs (Dr account, Cr account). To make balances
  // balanced (Dr X == Cr X), we don't care which accounts — every entry has
  // Dr=X on one account and Cr=X on another. Random pairing from 6 accounts.
  // We want variety across the 5 types so all aggregates touch all rows.

  // Random helpers (deterministic for reproducibility if needed — but here we
  // use Math.random; the data will be deleted at the end anyway).
  const startMs = performance.now()

  let entriesCreated = 0
  let linesCreated = 0

  // Build batches and flush each via $transaction
  // Each batch: BATCH_SIZE entries × 2 lines = 2*BATCH_SIZE lines.
  // SQLite variable limit = 999; with ~10 cols per entry row and ~7 cols per
  // line row, BATCH_SIZE=200 gives ~2000 entry-vars + ~2800 line-vars — Prisma
  // splits internally into chunks of 999/Ncols, so this is safe.
  const entryBatch: Array<{
    id: string
    entryNo: string
    date: Date
    status: 'POSTED'
    description: string
    sourceType: string
    isSystem: boolean
    deletedAt: null
  }> = []
  const lineBatch: Array<{
    id: string
    journalEntryId: string
    accountId: string
    debit: number
    credit: number
    description: string | null
    deletedAt: null
  }> = []

  function flushBatch(batchEntries: typeof entryBatch, batchLines: typeof lineBatch) {
    // NOTE: SQLite + Prisma does NOT support `skipDuplicates` — omit it.
    // We generate deterministic unique IDs/entryNos, so no duplicates are possible.
    return db.$transaction([
      db.journalEntry.createMany({ data: batchEntries as any }),
      db.journalLine.createMany({ data: batchLines as any }),
    ])
  }

  const FLUSH_EVERY = BATCH_SIZE
  let batchesFlushed = 0
  const t0 = performance.now()

  for (let i = 1; i <= TOTAL_ENTRIES; i++) {
    const entryId = makeEntryId(i)
    const entryNo = `${PREFIX}${String(i).padStart(6, '0')}`
    // Random date in 2025
    const month = 1 + Math.floor(Math.random() * 12) // 1-12
    const day = 1 + Math.floor(Math.random() * 28) // 1-28 (avoid month-end edge)
    const date = new Date(Date.UTC(2025, month - 1, day, 12, 0, 0, 0))

    // Pick two distinct accounts for Dr/Cr
    const drIdx = Math.floor(Math.random() * 6)
    let crIdx = Math.floor(Math.random() * 6)
    while (crIdx === drIdx) crIdx = Math.floor(Math.random() * 6)
    const drAcc = accounts[drIdx]
    const crAcc = accounts[crIdx]

    // Random amount 100-10000 (round to nearest 10)
    const amount = Math.round((100 + Math.random() * 9900) / 10) * 10

    entryBatch.push({
      id: entryId,
      entryNo,
      date,
      status: 'POSTED',
      description: 'BA-07 perf seed',
      sourceType: 'BA07PERF',
      isSystem: false,
      deletedAt: null,
    })
    lineBatch.push({
      id: makeLineId(i, 1),
      journalEntryId: entryId,
      accountId: drAcc.id,
      debit: amount,
      credit: 0,
      description: null,
      deletedAt: null,
    })
    lineBatch.push({
      id: makeLineId(i, 2),
      journalEntryId: entryId,
      accountId: crAcc.id,
      debit: 0,
      credit: amount,
      description: null,
      deletedAt: null,
    })

    if (entryBatch.length >= FLUSH_EVERY) {
      await flushBatch(entryBatch, lineBatch)
      entriesCreated += entryBatch.length
      linesCreated += lineBatch.length
      entryBatch.length = 0
      lineBatch.length = 0
      batchesFlushed++
      if (batchesFlushed % 10 === 0) {
        const elapsed = (performance.now() - t0) / 1000
        const rate = entriesCreated / elapsed
        process.stdout.write(`  ... ${entriesCreated}/${TOTAL_ENTRIES} entries (${rate.toFixed(0)}/s, ${elapsed.toFixed(1)}s)\r`)
      }
    }
  }

  // Flush remainder
  if (entryBatch.length > 0) {
    await flushBatch(entryBatch, lineBatch)
    entriesCreated += entryBatch.length
    linesCreated += lineBatch.length
    entryBatch.length = 0
    lineBatch.length = 0
  }

  const totalMs = performance.now() - startMs
  const elapsedS = totalMs / 1000
  const rate = entriesCreated / elapsedS
  console.log(`\nDone: ${entriesCreated} entries + ${linesCreated} lines in ${elapsedS.toFixed(2)}s (${rate.toFixed(0)} entries/sec)`)

  return { totalMs, entriesCreated, linesCreated }
}

// ---------------------------------------------------------------------------
// Phase 5: cleanup
// ---------------------------------------------------------------------------

async function cleanup(): Promise<{ ms: number; entriesDeleted: number; linesDeleted: number }> {
  logStage('PHASE 5 — Cleanup (DELETE all BA07PERF-* entries and lines)')
  const t0 = performance.now()

  // Delete lines first (by entryNo prefix → join) to avoid relying on cascade
  // behavior alone. Then delete entries.
  // Note: Prisma's deleteMany on JournalEntry WILL cascade-delete lines (FK
  // onDelete: Cascade). But we delete lines explicitly first to verify the
  // count independently.
  const linesDeleted = await db.journalLine.deleteMany({
    where: { journalEntry: { entryNo: { startsWith: PREFIX } } },
  })
  const entriesDeleted = await db.journalEntry.deleteMany({
    where: { entryNo: { startsWith: PREFIX } },
  })

  const ms = performance.now() - t0
  console.log(`  Deleted ${entriesDeleted.count} entries + ${linesDeleted.count} lines in ${fmt(ms)}`)
  return { ms, entriesDeleted: entriesDeleted.count, linesDeleted: linesDeleted.count }
}

// ---------------------------------------------------------------------------
// HTTP endpoint timings (separate function; runs while dev server is up)
// ---------------------------------------------------------------------------

async function curlTiming(url: string, runs = 3): Promise<{ medianMs: number; http: number; ok: boolean }> {
  // Use Bun.fetch — dev server is on localhost:3000
  const times: number[] = []
  let http = 0
  let ok = false
  for (let i = 0; i < runs + 1; i++) {
    const t0 = performance.now()
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } })
      http = resp.status
      ok = resp.ok
      // Drain the body
      await resp.text()
    } catch (e) {
      http = 0
      ok = false
    }
    times.push(performance.now() - t0)
  }
  return { medianMs: median(times.slice(0, RUNS)), http, ok }
}

async function httpTests(): Promise<Array<{ endpoint: string; medianMs: number; http: number; ok: boolean }>> {
  logStage('PHASE 4 — HTTP endpoint timings (dev server :3000)')
  const endpoints = [
    { endpoint: 'GET /api/journal-entries?limit=50', url: 'http://localhost:3000/api/journal-entries?limit=50' },
    { endpoint: 'GET /api/dashboard', url: 'http://localhost:3000/api/dashboard' },
    { endpoint: 'GET /api/reports/balance-sheet', url: 'http://localhost:3000/api/reports/balance-sheet' },
  ]
  const out: Array<{ endpoint: string; medianMs: number; http: number; ok: boolean }> = []
  for (const e of endpoints) {
    const r = await curlTiming(e.url)
    console.log(`  ${e.endpoint.padEnd(48)} → ${fmt(r.medianMs).padStart(8)}  HTTP=${r.http}  ok=${r.ok}`)
    out.push({ endpoint: e.endpoint, ...r })
  }
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  logStage('BA-07.4 — Performance Test on Large Dataset')
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Prefix: ${PREFIX}`)
  console.log(`Target: ${TOTAL_ENTRIES} entries × 2 lines = ${TOTAL_ENTRIES * 2} lines`)

  // Pre-flight: baseline DB counts
  const preJe = await db.journalEntry.count()
  const preJl = await db.journalLine.count()
  const preAcc = await db.account.count()
  console.log(`Pre-seed DB: JE=${preJe}, JL=${preJl}, Acc=${preAcc}`)
  // Also count BA07PERF-* (should be 0)
  const stalePerf = await db.journalEntry.count({ where: { entryNo: { startsWith: PREFIX } } })
  if (stalePerf > 0) {
    console.warn(`  WARNING: ${stalePerf} stale BA07PERF-* entries found from previous runs — will clean up first.`)
    await cleanup()
  }

  // ----- PHASE 1: baseline -----
  logStage('PHASE 1 — Baseline measurements (current dataset)')
  console.log(`Median of ${RUNS} runs (with 1 warm-up).`)
  const baseline = await measureAllQueries()
  console.log('\nBaseline query times:')
  for (const r of baseline) {
    console.log(`  ${r.label.padEnd(45)} ${fmt(r.medianMs).padStart(10)}  [${verdict(r.medianMs)}]  ${r.notes ?? ''}`)
  }

  // ----- PHASE 2: seed -----
  const seedResult = await bulkSeed()
  const postSeedJe = await db.journalEntry.count()
  const postSeedJl = await db.journalLine.count()
  console.log(`Post-seed DB: JE=${postSeedJe} (Δ=${postSeedJe - preJe}), JL=${postSeedJl} (Δ=${postSeedJl - preJl})`)

  // ----- PHASE 3: re-measure -----
  logStage('PHASE 3 — Large dataset measurements')
  console.log(`Median of ${RUNS} runs (with 1 warm-up).`)
  const large = await measureAllQueries()
  console.log('\nLarge dataset query times:')
  for (const r of large) {
    console.log(`  ${r.label.padEnd(45)} ${fmt(r.medianMs).padStart(10)}  [${verdict(r.medianMs)}]  ${r.notes ?? ''}`)
  }

  // ----- PHASE 4: HTTP endpoints -----
  const httpResults = await httpTests()

  // ----- PHASE 5: cleanup -----
  const cleanupResult = await cleanup()
  const postCleanupJe = await db.journalEntry.count()
  const postCleanupJl = await db.journalLine.count()
  console.log(`Post-cleanup DB: JE=${postCleanupJe} (expected ${preJe}), JL=${postCleanupJl} (expected ${preJl})`)
  const ok = postCleanupJe === preJe && postCleanupJl === preJl
  console.log(`Cleanup verified: ${ok ? 'OK ✓ baseline restored' : 'MISMATCH ✗'}`)

  // ----- Summary -----
  logStage('SUMMARY')
  console.log('\nQuery                       | Baseline  | Large     | Δx      | Verdict')
  console.log('--------------------------- | --------- | --------- | ------- | ----------')
  for (let i = 0; i < baseline.length; i++) {
    const b = baseline[i]
    const l = large[i]
    const delta = (l.medianMs / Math.max(b.medianMs, 0.1)).toFixed(1)
    console.log(`${b.label.padEnd(27)} | ${fmt(b.medianMs).padStart(9)} | ${fmt(l.medianMs).padStart(9)} | ${delta.padStart(7)}x | ${verdict(l.medianMs)}`)
  }

  console.log('\nHTTP endpoints (large dataset):')
  for (const r of httpResults) {
    console.log(`  ${r.endpoint.padEnd(48)} ${fmt(r.medianMs).padStart(10)}  HTTP=${r.http}  ok=${r.ok}  [${verdict(r.medianMs)}]`)
  }

  console.log('\nSeed summary:')
  console.log(`  ${seedResult.entriesCreated} entries + ${seedResult.linesCreated} lines in ${fmt(seedResult.totalMs)} (${(seedResult.entriesCreated / (seedResult.totalMs / 1000)).toFixed(0)} entries/sec)`)

  console.log('\nCleanup summary:')
  console.log(`  Deleted ${cleanupResult.entriesDeleted} entries + ${cleanupResult.linesDeleted} lines in ${fmt(cleanupResult.ms)}`)
  console.log(`  Baseline restored: ${ok ? 'YES ✓' : 'NO ✗'}`)

  await db.$disconnect()
  console.log('\nBA-07.4 done.')
}

main().catch(async (e) => {
  console.error('BA-07.4 FATAL:', e)
  // Best-effort cleanup on fatal error
  try {
    await cleanup()
  } catch (e2) {
    console.error('Cleanup-on-fatal also failed:', e2)
  }
  await db.$disconnect()
  process.exit(1)
})
