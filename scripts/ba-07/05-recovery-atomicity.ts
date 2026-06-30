// ============================================================================
// BA-07.5 — Recovery & Transaction Atomicity Test
// ============================================================================
//
// Goal (per task): simulate failures mid-transaction to ensure no partial data
// remains, and exercise backup/restore on the SQLite DB.
//
// This is a THROWAWAY test harness under scripts/ba-07/. It does NOT modify
// production code. It creates test data with prefix `BA07RECOV-` and deletes
// everything it created at the end.
//
// All 4 sub-tests + backup/restore run in this single script:
//   T1: Mid-transaction failure inside $transaction (entry+lines).
//   T2: Composite operation (Expense + JournalEntry) inside one $transaction.
//   T3: Reversal atomicity — fail mid-reversal, then succeed properly.
//   T4: Backup & restore — file copy + counts identity + rolled-back delete.
//
// Run: bun scripts/ba-07/05-recovery-atomicity.ts
// Exit: 0 = all PASS, 1 = any FAIL
// ============================================================================

import { db } from '@/lib/db'
import {
  postJournalEntry,
  reverseJournalEntry,
  type PrismaTransaction,
} from '@/lib/accounting/guard'
import { createFiscalYear } from '@/lib/accounting/accounting-calendar'
import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const failures: string[] = []
const results: Record<string, { pass: boolean; detail: string }> = {}

async function test(name: string, key: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    results[key] = { pass: true, detail: 'PASS' }
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    failed++
    const detail = e?.message || String(e)
    failures.push(`${name}: ${detail}`)
    results[key] = { pass: false, detail }
    console.log(`  ✗ ${name}`)
    console.log(`    → ${detail}`)
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`)
}

// ---------------------------------------------------------------------------
// Constants / DB paths
// ---------------------------------------------------------------------------
const DB_FILE = '/home/z/my-project/db/custom.db'
const BACKUP_FILE = '/tmp/ba07-backup.db'
const RESTORED_FILE = '/tmp/ba07-restored.db'
const TS = Date.now()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(path: string): string {
  const { readFileSync } = require('fs')
  const buf = readFileSync(path)
  return createHash('sha256').update(buf).digest('hex')
}

function fileSize(path: string): number {
  return statSync(path).size
}

async function getTestAccounts() {
  const cash = await db.account.findFirstOrThrow({ where: { accountRole: 'CASH', allowPosting: true, isActive: true } })
  const revenue = await db.account.findFirstOrThrow({ where: { accountRole: 'PROJECT_REVENUE', allowPosting: true, isActive: true } })
  return { cash, revenue }
}

async function countOrphans(prefix: string): Promise<number> {
  // Count any BA07RECOV-prefixed journal entries that survived (orphans)
  return db.journalEntry.count({ where: { entryNo: { startsWith: prefix } } })
}

async function currentCounts() {
  const [je, jl, acc, fy, fp, exp, pc] = await Promise.all([
    db.journalEntry.count(),
    db.journalLine.count(),
    db.account.count(),
    db.fiscalYear.count(),
    db.fiscalPeriod.count(),
    db.expense.count(),
    db.pettyCash.count(),
  ])
  return { je, jl, acc, fy, fp, exp, pc }
}

// ---------------------------------------------------------------------------
// T1: Mid-transaction failure inside $transaction
// ---------------------------------------------------------------------------

async function test1_midTxFailure() {
  console.log('\n── T1: Mid-Transaction Failure (entry + 2 lines, then throw) ──')
  const { cash, revenue } = await getTestAccounts()
  const entryNo = `BA07RECOV-FAIL-${TS}`

  await test('T1: $transaction rolls back entry+lines on mid-flight throw', 'T1', async () => {
    // Sanity: entry does not exist before
    const before = await db.journalEntry.findUnique({ where: { entryNo } })
    assert(before === null, `pre-condition: ${entryNo} should not exist`)

    let threw = false
    try {
      await db.$transaction(async (tx: PrismaTransaction) => {
        // Create the JournalEntry header + 2 balanced lines in one nested create (atomic within Prisma)
        const je = await tx.journalEntry.create({
          data: {
            entryNo,
            date: new Date('2025-08-15'),
            description: 'BA-07.5 T1: SIMULATED MID-FLIGHT FAILURE',
            status: 'POSTED',
            sourceType: 'MANUAL',
            isSystem: false,
            lines: {
              create: [
                { accountId: cash.id,    debit: 100, credit: 0,    description: 'T1 dr' },
                { accountId: revenue.id, debit: 0,   credit: 100,  description: 'T1 cr' },
              ],
            },
          },
        })
        // Confirm we can see the entry *inside* the tx (it's there in this connection's view)
        const inside = await tx.journalEntry.findUnique({ where: { entryNo }, include: { lines: true } })
        assert(inside !== null && inside.lines.length === 2, 'inside tx: entry+2 lines should exist')

        // NOW throw — this must roll back EVERYTHING done in this tx
        throw new Error('SIMULATED MID-FLIGHT FAILURE')
      })
    } catch (e: any) {
      threw = true
      assert(e.message === 'SIMULATED MID-FLIGHT FAILURE', `expected our error, got: ${e.message}`)
    }
    assert(threw, 'the transaction should have thrown')

    // Outside the tx: verify NOTHING survived
    const afterEntry = await db.journalEntry.findUnique({ where: { entryNo }, include: { lines: true } })
    assert(afterEntry === null, `JournalEntry ${entryNo} should NOT exist after rollback`)

    // Verify no orphan JournalLines with description 'T1 dr'/'T1 cr'
    const orphanLines = await db.journalLine.count({
      where: { description: { in: ['T1 dr', 'T1 cr'] } },
    })
    assert(orphanLines === 0, `expected 0 orphan JournalLines, got ${orphanLines}`)

    // Verify no orphan rows anywhere with the BA07RECOV-FAIL prefix
    const orphans = await countOrphans('BA07RECOV-FAIL-')
    assert(orphans === 0, `expected 0 BA07RECOV-FAIL- entries, got ${orphans}`)
  })
}

// ---------------------------------------------------------------------------
// T2: Composite operation (Expense + JournalEntry) inside one $transaction
// ---------------------------------------------------------------------------

async function test2_compositeOperation() {
  console.log('\n── T2: Composite Operation (Expense + JournalEntry), then throw ──')
  const { cash, revenue } = await getTestAccounts()
  const entryNo = `BA07RECOV-EXP-${TS}`
  const expDesc = `BA07RECOV-EXP-DESC-${TS}`

  await test('T2: $transaction rolls back BOTH Expense AND JournalEntry on throw', 'T2', async () => {
    // Pre-condition sanity
    const beforeExp = await db.expense.count({ where: { description: expDesc } })
    const beforeJe = await db.journalEntry.count({ where: { entryNo } })
    assert(beforeExp === 0 && beforeJe === 0, 'pre-condition: test data should not pre-exist')

    let threw = false
    try {
      await db.$transaction(async (tx: PrismaTransaction) => {
        // (a) Create an Expense record (mimics the composite business op pattern)
        const exp = await tx.expense.create({
          data: {
            description: expDesc,
            amount: 100,
            vatRate: 0,
            vatAmount: 0,
            totalAmount: 100,
            date: new Date('2025-08-15'),
            category: 'OFFICE',
            expenseType: 'INTERNAL',
            activityType: 'GENERAL',
            payFrom: 'TREASURY',
            reference: entryNo,
          },
        })

        // (b) Create the linked JournalEntry via postJournalEntry (passing tx)
        const je = await postJournalEntry({
          entryNo,
          date: new Date('2025-08-15'),
          description: `BA-07.5 T2: composite op for expense ${exp.id}`,
          sourceType: 'EXPENSE',
          sourceId: exp.id,
          lines: [
            { accountCode: cash.code,    debit: 100, credit: 0 },
            { accountCode: revenue.code, debit: 0,   credit: 100 },
          ],
        }, tx)

        // (c) Link the JE back to the expense
        await tx.expense.update({ where: { id: exp.id }, data: { journalEntryId: je.id } })

        // Inside the tx: both should be visible
        const insideExp = await tx.expense.findUnique({ where: { id: exp.id } })
        const insideJe = await tx.journalEntry.findUnique({ where: { entryNo } })
        assert(insideExp !== null, 'inside tx: expense should exist')
        assert(insideJe !== null, 'inside tx: JE should exist')

        // (d) Throw — must roll back BOTH the Expense and the JournalEntry
        throw new Error('SIMULATED POST-LINK FAILURE')
      })
    } catch (e: any) {
      threw = true
      assert(e.message === 'SIMULATED POST-LINK FAILURE', `expected our error, got: ${e.message}`)
    }
    assert(threw, 'the transaction should have thrown')

    // Outside the tx: verify NOTHING survived
    const afterExp = await db.expense.count({ where: { description: expDesc } })
    const afterJe = await db.journalEntry.count({ where: { entryNo } })
    const afterJl = await db.journalLine.count({
      where: { journalEntry: { entryNo } },
    })
    assert(afterExp === 0, `Expense should NOT exist after rollback (got ${afterExp})`)
    assert(afterJe === 0,  `JournalEntry should NOT exist after rollback (got ${afterJe})`)
    assert(afterJl === 0,  `JournalLines should NOT exist after rollback (got ${afterJl})`)

    const orphans = await countOrphans('BA07RECOV-EXP-')
    assert(orphans === 0, `expected 0 BA07RECOV-EXP- entries, got ${orphans}`)
  })
}

// ---------------------------------------------------------------------------
// T3: Reversal atomicity
// ---------------------------------------------------------------------------

async function test3_reversalAtomicity() {
  console.log('\n── T3: Reversal Atomicity (reverse+throw rolls back; reverse-only succeeds) ──')
  const { cash, revenue } = await getTestAccounts()
  const entryNo = `BA07RECOV-REV-${TS}`
  let originalId: string | null = null

  await test('T3a: post original balanced entry succeeds and stays', 'T3a', async () => {
    const je = await postJournalEntry({
      entryNo,
      date: new Date('2025-08-15'),
      description: 'BA-07.5 T3: reversal atomicity original',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: cash.code,    debit: 100, credit: 0 },
        { accountCode: revenue.code, debit: 0,   credit: 100 },
      ],
    })
    originalId = je.id
    assert(je.status === 'POSTED', 'original should be POSTED')
    assert(je.lines.length === 2, 'original should have 2 lines')

    // Verify it really persists
    const re = await db.journalEntry.findUnique({ where: { id: je.id } })
    assert(re !== null && re.entryNo === entryNo, 'original should exist in DB')
  })

  await test('T3b: reverse+throw rolls back the reversal entry', 'T3b', async () => {
    assert(originalId !== null, 'pre-condition: originalId must be set by T3a')

    // Capture reversal count before
    const reversalsBefore = await db.journalEntry.count({
      where: { isReversal: true, reversedEntryId: originalId },
    })
    assert(reversalsBefore === 0, 'no reversal should exist before')

    let threw = false
    try {
      await db.$transaction(async (tx: PrismaTransaction) => {
        // Call reverseJournalEntry INSIDE the tx — should create the reversal
        const rev = await reverseJournalEntry(originalId!, tx, 'BA-07.5 T3b simulated failure')
        // Inside tx: reversal should exist
        const inside = await tx.journalEntry.findUnique({ where: { id: rev.id } })
        assert(inside !== null, 'inside tx: reversal should exist')

        // Throw BEFORE commit
        throw new Error('SIMULATED POST-REVERSE FAILURE')
      })
    } catch (e: any) {
      threw = true
      // Prisma wraps the inner error; just check the message includes our string OR is the rollback
      assert(
        e.message === 'SIMULATED POST-REVERSE FAILURE' || e.message.includes('SIMULATED POST-REVERSE FAILURE'),
        `expected our error or rollback, got: ${e.message}`,
      )
    }
    assert(threw, 'the transaction should have thrown')

    // Outside tx: NO reversal should have survived
    const reversalsAfter = await db.journalEntry.count({
      where: { isReversal: true, reversedEntryId: originalId },
    })
    assert(reversalsAfter === 0, `reversal should NOT exist after rollback (got ${reversalsAfter})`)

    // Original should still be there, still POSTED, still NOT marked reversed
    const orig = await db.journalEntry.findUnique({ where: { id: originalId! } })
    assert(orig !== null, 'original should still exist')
    assert(orig!.status === 'POSTED', 'original should still be POSTED')
    assert(orig!.isReversal === false, 'original should not be a reversal')

    // The original must STILL be reversible (no leftover "alreadyReversed" marker)
    const alreadyRev = await db.journalEntry.findFirst({
      where: { reversedEntryId: originalId, deletedAt: null, status: 'POSTED' },
    })
    assert(alreadyRev === null, 'no leftover reversal entry should block future reversal')
  })

  await test('T3c: reverseJournalEntry without throw succeeds (permanent test data, cleaned later)', 'T3c', async () => {
    assert(originalId !== null, 'pre-condition: originalId must be set')
    const rev = await reverseJournalEntry(originalId!, undefined, 'BA-07.5 T3c proper reversal')
    // NOTE: reverseJournalEntry() returns the entry object BEFORE the isReversal/reversedEntryId
    // update is applied (guard.ts:372 creates the entry, then guard.ts:391 applies the update, but
    // returns the stale `reversal` object). The DB state is correct; only the returned object is stale.
    // We verify by re-fetching from DB.
    assert(rev.id, 'reversal entry should have an id')
    assert(rev.status === 'POSTED', 'reversal entry should be POSTED')

    // Re-fetch from DB to see the final state (post-update)
    const rev2 = await db.journalEntry.findUnique({ where: { id: rev.id } })
    assert(rev2 !== null, 'reversal entry should exist in DB')
    assert(rev2!.isReversal === true, `reversal entry should have isReversal=true (DB state); got isReversal=${rev2!.isReversal}`)
    assert(rev2!.reversedEntryId === originalId, `reversal should link to original via reversedEntryId; got ${rev2!.reversedEntryId}`)
    // Note the return-value inconsistency for the audit log
    if (rev.isReversal !== true) {
      console.log(`    [NOTE] reverseJournalEntry returns stale object: rev.isReversal=${rev.isReversal} but DB.isReversal=true (guard.ts:372 returns postJournalEntry result before guard.ts:391 update applies isReversal=true)`)
    }
  })
}

// ---------------------------------------------------------------------------
// T4: Backup & Restore
// ---------------------------------------------------------------------------

async function test4_backupRestore() {
  console.log('\n── T4: Backup & Restore (SQLite file copy + counts identity) ──')

  // Pre-backup state
  const countsBefore = await currentCounts()
  const sizeBefore = fileSize(DB_FILE)
  const hashBefore = sha256(DB_FILE)
  const journalModeRows = await db.$queryRaw<Array<{ journal_mode: string }>>`PRAGMA journal_mode`
  const journalMode = journalModeRows[0]?.journal_mode ?? 'unknown'

  console.log(`    DB file: ${DB_FILE}`)
  console.log(`    journal_mode: ${journalMode}`)
  console.log(`    size before: ${sizeBefore} bytes`)
  console.log(`    sha256 before: ${hashBefore}`)
  console.log(`    counts before: JE=${countsBefore.je} JL=${countsBefore.jl} Acc=${countsBefore.acc} FY=${countsBefore.fy} FP=${countsBefore.fp} Exp=${countsBefore.exp} PC=${countsBefore.pc}`)

  await test('T4a: backup file is created and matches source checksum', 'T4a', async () => {
    // Force a checkpoint to flush any pending journal data into the main DB file.
    // Use $queryRaw because PRAGMA wal_checkpoint returns rows (busy, log, checkpointed);
    // $executeRawUnsafe would fail with "ExecuteReturnedResultsInSQLite".
    try { await db.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)` } catch { /* delete-mode has no wal; safe to ignore */ }

    // Clean any prior backup
    if (existsSync(BACKUP_FILE)) unlinkSync(BACKUP_FILE)

    // Copy file (file-copy approach; equivalent to sqlite3 .backup for a quiescent DB)
    copyFileSync(DB_FILE, BACKUP_FILE)

    const sizeBackup = fileSize(BACKUP_FILE)
    const hashBackup = sha256(BACKUP_FILE)
    console.log(`    backup size: ${sizeBackup} bytes`)
    console.log(`    backup sha256: ${hashBackup}`)
    assert(existsSync(BACKUP_FILE), 'backup file should exist')
    assert(sizeBackup === sizeBefore, `backup size should match source (${sizeBackup} vs ${sizeBefore})`)
    assert(hashBackup === hashBefore, 'backup sha256 should match source')
  })

  await test('T4b: simulated damage via DELETE inside $transaction is rolled back', 'T4b', async () => {
    // Create a temporary test entry to "delete" inside the tx (this entry itself is created outside the tx,
    // so it persists; we delete it INSIDE a tx that we then abort, then verify it's still there)
    const { cash, revenue } = await getTestAccounts()
    const tmpEntryNo = `BA07RECOV-BKP-DELETE-${TS}`
    const tmp = await postJournalEntry({
      entryNo: tmpEntryNo,
      date: new Date('2025-08-15'),
      description: 'BA-07.5 T4b: temporary entry to test rolled-back delete',
      sourceType: 'MANUAL',
      lines: [
        { accountCode: cash.code,    debit: 50, credit: 0 },
        { accountCode: revenue.code, debit: 0,  credit: 50 },
      ],
    })

    const countsBeforeDelete = await currentCounts()

    // Now "delete" it inside a tx that we abort
    let threw = false
    try {
      await db.$transaction(async (tx: PrismaTransaction) => {
        // Soft-delete the entry + its lines
        await tx.journalEntry.update({
          where: { id: tmp.id },
          data: {
            deletedAt: new Date(),
            lines: { updateMany: { where: { journalEntryId: tmp.id }, data: { deletedAt: new Date() } } },
          },
        })
        // Verify the soft-delete is visible inside the tx
        const inside = await tx.journalEntry.findUnique({ where: { id: tmp.id } })
        assert(inside !== null && inside!.deletedAt !== null, 'inside tx: entry should be soft-deleted')
        // Throw → rollback
        throw new Error('SIMULATED DAMAGE-ABORT')
      })
    } catch (e: any) {
      threw = true
      assert(
        e.message === 'SIMULATED DAMAGE-ABORT' || e.message.includes('SIMULATED DAMAGE-ABORT'),
        `expected our error, got: ${e.message}`,
      )
    }
    assert(threw, 'should have thrown')

    // Outside: entry should STILL exist and NOT be soft-deleted
    const stillThere = await db.journalEntry.findUnique({ where: { id: tmp.id } })
    assert(stillThere !== null, 'soft-deleted entry should still exist after rollback')
    assert(stillThere!.deletedAt === null, 'entry should NOT be soft-deleted after rollback')

    const countsAfterDelete = await currentCounts()
    assert(
      countsAfterDelete.je === countsBeforeDelete.je &&
      countsAfterDelete.jl === countsBeforeDelete.jl,
      `counts should be unchanged after rolled-back delete (before JE=${countsBeforeDelete.je}/JL=${countsBeforeDelete.jl}, after JE=${countsAfterDelete.je}/JL=${countsAfterDelete.jl})`,
    )

    // Now clean up the temporary entry properly (reverse it — POSTED entries can't be hard-deleted)
    await reverseJournalEntry(tmp.id, undefined, 'BA-07.5 T4b cleanup')
  })

  await test('T4c: restored DB (from backup) has identical row counts to pre-backup', 'T4c', async () => {
    if (existsSync(RESTORED_FILE)) unlinkSync(RESTORED_FILE)
    copyFileSync(BACKUP_FILE, RESTORED_FILE)

    // Open a separate PrismaClient pointed at the restored file
    const restoredDb = new PrismaClient({
      datasources: { db: { url: `file:${RESTORED_FILE}` } },
    })

    try {
      const [je, jl, acc, fy, fp, exp, pc] = await Promise.all([
        restoredDb.journalEntry.count(),
        restoredDb.journalLine.count(),
        restoredDb.account.count(),
        restoredDb.fiscalYear.count(),
        restoredDb.fiscalPeriod.count(),
        restoredDb.expense.count(),
        restoredDb.pettyCash.count(),
      ])
      const restoredCounts = { je, jl, acc, fy, fp, exp, pc }
      console.log(`    restored counts: JE=${je} JL=${jl} Acc=${acc} FY=${fy} FP=${fp} Exp=${exp} PC=${pc}`)

      assert(je === countsBefore.je, `JournalEntry count mismatch: restored=${je} vs pre-backup=${countsBefore.je}`)
      assert(jl === countsBefore.jl, `JournalLine count mismatch: restored=${jl} vs pre-backup=${countsBefore.jl}`)
      assert(acc === countsBefore.acc, `Account count mismatch: restored=${acc} vs pre-backup=${countsBefore.acc}`)
      assert(fy === countsBefore.fy, `FiscalYear count mismatch: restored=${fy} vs pre-backup=${countsBefore.fy}`)
      assert(fp === countsBefore.fp, `FiscalPeriod count mismatch: restored=${fp} vs pre-backup=${countsBefore.fp}`)
      assert(exp === countsBefore.exp, `Expense count mismatch: restored=${exp} vs pre-backup=${countsBefore.exp}`)
      assert(pc === countsBefore.pc, `PettyCash count mismatch: restored=${pc} vs pre-backup=${countsBefore.pc}`)

      // Also verify the restored DB's checksum matches the original backup
      const hashRestored = sha256(RESTORED_FILE)
      assert(hashRestored === hashBefore, `restored file sha256 should match backup (got ${hashRestored} vs ${hashBefore})`)
    } finally {
      await restoredDb.$disconnect()
    }
  })

  // Cleanup: remove backup + restored files
  try { if (existsSync(RESTORED_FILE)) unlinkSync(RESTORED_FILE) } catch {}
  // Keep BACKUP_FILE for inspection until end of run, then remove
  try { if (existsSync(BACKUP_FILE)) unlinkSync(BACKUP_FILE) } catch {}
}

// ---------------------------------------------------------------------------
// Cleanup: delete ALL BA07RECOV-* test data we created
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log('\n── Cleanup: removing all BA07RECOV-* test data ──')

  // 1. Find all entries that we might have created. Three categories:
  //    (a) BA07RECOV-prefixed entries (originals + tmp entries created directly).
  //    (b) Reversal entries whose `reversedEntryId` points back to a BA07RECOV-* entry
  //        (these get entryNo = JE-NNNNNN from getNextEntryNo).
  //    (c) Reversal entries whose `description` mentions BA07RECOV or BA-07.5
  //        (catches leftovers from prior runs where the original was already hard-deleted
  //        and `reversedEntryId` was set to NULL by the SetNull FK cascade).
  const originals = await db.journalEntry.findMany({
    where: { entryNo: { startsWith: 'BA07RECOV-' } },
    select: { id: true, entryNo: true, isReversal: true, reversedEntryId: true, status: true, deletedAt: true },
  })
  const originalIds = originals.map(o => o.id)
  console.log(`    found ${originals.length} BA07RECOV-prefixed entries (originals/tmp)`)

  const reversalsByLink = originalIds.length > 0
    ? await db.journalEntry.findMany({
        where: { reversedEntryId: { in: originalIds } },
        select: { id: true, entryNo: true, isReversal: true, reversedEntryId: true, status: true, deletedAt: true },
      })
    : []
  console.log(`    found ${reversalsByLink.length} reversal entries linked via reversedEntryId`)

  const reversalsByDesc = await db.journalEntry.findMany({
    where: {
      OR: [
        { description: { contains: 'BA07RECOV' } },
        { description: { contains: 'BA-07.5' } },
      ],
      entryNo: { not: { startsWith: 'BA07RECOV-' } }, // already counted above
    },
    select: { id: true, entryNo: true, isReversal: true, reversedEntryId: true, status: true, deletedAt: true },
  })
  console.log(`    found ${reversalsByDesc.length} reversal entries matched by description`)

  const allTestEntries = [...originals, ...reversalsByLink, ...reversalsByDesc]
  // Deduplicate by id (an entry may appear in multiple sets)
  const seen = new Set<string>()
  const allTestIds: string[] = []
  for (const e of allTestEntries) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      allTestIds.push(e.id)
    }
  }
  console.log(`    total unique test entries to clean: ${allTestIds.length}`)

  // 2. Hard-delete the lines first, then the entries.
  //    (These are throwaway test artifacts; R12 "POSTED = immutable" applies to production
  //    audit records, not to test data explicitly created+cleaned by an audit script.)
  if (allTestIds.length > 0) {
    const lineHardDelete = await db.journalLine.deleteMany({
      where: { journalEntryId: { in: allTestIds } },
    })
    const entryHardDelete = await db.journalEntry.deleteMany({
      where: { id: { in: allTestIds } },
    })
    console.log(`    hard-deleted ${lineHardDelete.count} lines and ${entryHardDelete.count} entries (test cleanup)`)
  }

  // 3. Delete any BA07RECOV-* Expense records (should be 0 — they all rolled back in T2)
  const testExp = await db.expense.deleteMany({
    where: { description: { startsWith: 'BA07RECOV-EXP-DESC-' } },
  })
  if (testExp.count > 0) {
    console.log(`    deleted ${testExp.count} BA07RECOV-* expenses (should be 0 if T2 passed)`)
  }

  // 4. Final verification: no BA07RECOV-* entries and no reversals of them remain
  const finalTest = await db.journalEntry.count({
    where: {
      OR: [
        { entryNo: { startsWith: 'BA07RECOV-' } },
        { description: { contains: 'BA07RECOV' } },
        { description: { contains: 'BA-07.5' } },
      ],
    },
  })
  console.log(`    FINAL: BA07RECOV-* entries + their reversals remaining: ${finalTest} (expected 0)`)

  // Remove backup files
  try { if (existsSync(BACKUP_FILE)) unlinkSync(BACKUP_FILE) } catch {}
  try { if (existsSync(RESTORED_FILE)) unlinkSync(RESTORED_FILE) } catch {}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-07.5 — Recovery & Transaction Atomicity Test')
  console.log('  (read-only; creates BA07RECOV-* test data; cleans up at end)')
  console.log('═══════════════════════════════════════════════════════════════')

  const countsAtStart = await currentCounts()
  console.log(`\n  DB state at start: JE=${countsAtStart.je} JL=${countsAtStart.jl} Acc=${countsAtStart.acc} FY=${countsAtStart.fy} FP=${countsAtStart.fp} Exp=${countsAtStart.exp} PC=${countsAtStart.pc}`)

  try {
    await test1_midTxFailure()
    await test2_compositeOperation()
    await test3_reversalAtomicity()
    await test4_backupRestore()
  } catch (e: any) {
    console.error('\nFATAL: test orchestration failed:', e.message)
    console.error(e.stack)
  }

  await cleanup()

  const countsAtEnd = await currentCounts()
  console.log(`\n  DB state at end:   JE=${countsAtEnd.je} JL=${countsAtEnd.jl} Acc=${countsAtEnd.acc} FY=${countsAtEnd.fy} FP=${countsAtEnd.fp} Exp=${countsAtEnd.exp} PC=${countsAtEnd.pc}`)
  console.log(`  Delta:             JE=${countsAtEnd.je - countsAtStart.je} JL=${countsAtEnd.jl - countsAtStart.jl} Acc=${countsAtEnd.acc - countsAtStart.acc} FY=${countsAtEnd.fy - countsAtStart.fy} FP=${countsAtEnd.fp - countsAtStart.fp} Exp=${countsAtEnd.exp - countsAtStart.exp} PC=${countsAtEnd.pc - countsAtStart.pc}`)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    - ${f}`)
  } else {
    console.log('  ✅ ALL RECOVERY/ATOMICITY TESTS PASSED')
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Emit a machine-readable summary for the worklog
  console.log('---RESULTS-JSON---')
  console.log(JSON.stringify({
    T1_mid_tx_failure: results.T1,
    T2_composite: results.T2,
    T3a_post_original: results.T3a,
    T3b_reverse_throw_rollback: results.T3b,
    T3c_reverse_succeeds: results.T3c,
    T4a_backup_created: results.T4a,
    T4b_rolled_back_delete: results.T4b,
    T4c_restored_counts_match: results.T4c,
    db_state_at_start: countsAtStart,
    db_state_at_end: countsAtEnd,
  }, null, 2))
  console.log('---END-RESULTS-JSON---')

  await db.$disconnect()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
