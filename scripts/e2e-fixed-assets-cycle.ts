// ============================================================================
// P3-5 E2E: Fixed Assets Cycle — End-to-End Test
// ============================================================================
// Walks the full fixed-assets business cycle:
//   1. Create prerequisites (Branch, Client, CostCenter, Project)
//   2. Create Fixed Asset (acquisitionCost > 0 → JE: Dr FIXED_ASSET / Cr CASH)
//   3. Run monthly depreciation → JE: Dr DEPRECIATION_EXPENSE / Cr ACCUM_DEPRECIATION
//   4. Verify asset.accumulatedDepreciation and netBookValue updated correctly
//   5. (Optional) Reverse the depreciation → JE: Dr ACCUM_DEPRECIATION / Cr DEPRECIATION_EXPENSE
//      Verify asset values restored (accumDep=0, NBV=acquisitionCost)
//   6. Final verification: all JEs balanced, trial balance ties,
//      verifyNumericalConsistency ok=true, source ↔ JE linkage intact,
//      fixed-asset register ties to GL.
//
// All test data is wrapped in try/finally — cleanup deletes every created
// record (and soft-deletes any JEs that survived mid-flow failures).
//
// Run: bun scripts/e2e-fixed-assets-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import {
  createAssetWithAcquisition,
  runDepreciationForAsset,
  reverseAssetDepreciation,
} from '@/lib/accounting/depreciation-engine'
import {
  getTrialBalance,
  verifyNumericalConsistency,
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
const PREFIX = 'P3FA'
// Use a distinctive (year, month) so the @@unique([fixedAssetId, year, month])
// constraint on AssetDepreciation doesn't collide with real data.
const TEST_YEAR = 2099
const TEST_MONTH = 12 // December 2099

const created = {
  branchId: '' as string,
  clientId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,
  fixedAssetId: '' as string,
  fixedAssetCode: '' as string,
  acquisitionJEId: '' as string,
  depreciationId: '' as string,           // AssetDepreciation row id
  depreciationJEId: '' as string,         // JE id for the depreciation
  depreciationReversalJEId: '' as string, // JE id for the reversal
  allJEIds: [] as string[],
}

// ---------------------------------------------------------------------------
// Test scenario constants
// ---------------------------------------------------------------------------
// Asset: cost = 12,000 SAR, useful life = 5 years, depreciation rate = 20%.
//   annualDepreciation = 12000 × 20/100 = 2,400
//   monthlyDepreciation = 2400 / 12 = 200
//   residualValue = max(0, 12000 − 2400 × 5) = max(0, 0) = 0
//   usefulLifeMonths = round(5 × 12) = 60
//   totalDepreciable = 12000 − 0 = 12000
// After 1 month of depreciation:
//   accumulatedDepreciation = 200
//   netBookValue = 12000 − 200 = 11,800
// After reversal:
//   accumulatedDepreciation = 0
//   netBookValue = 12,000
const ACQUISITION_COST = 12_000
const USEFUL_LIFE_YEARS = 5
const DEPRECIATION_RATE = 20 // %
const ANNUAL_DEP = 2_400 // 12000 × 0.20
const MONTHLY_DEP = 200 // 2400 / 12
const RESIDUAL_VALUE = 0 // 12000 − 2400 × 5 = 0
const USEFUL_LIFE_MONTHS = 60

// After 1 month:
const ACCUM_DEP_AFTER_1MO = 200
const NBV_AFTER_1MO = 11_800

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
      costCenter: { select: { code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  })
}

/**
 * Sum the debit/credit impact of THIS test's JEs on a given account role.
 * Used instead of getAccountBalance() because the DB has baseline data from
 * prior runs/tests that would otherwise contaminate the expected values.
 */
async function testImpactOnRole(role: string): Promise<{ dr: number; cr: number; net: number }> {
  const rows = await db.journalLine.findMany({
    where: {
      account: { accountRole: role },
      deletedAt: null,
      journalEntry: {
        id: { in: created.allJEIds },
        deletedAt: null,
      },
    },
    select: { debit: true, credit: true },
  })
  const dr = rows.reduce((s, l) => s + Number(l.debit), 0)
  const cr = rows.reduce((s, l) => s + Number(l.credit), 0)
  return { dr, cr, net: dr - cr }
}

/** Reverse a JE by setting deletedAt on the entry and all its lines. */
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

// ===========================================================================
// MAIN
// ===========================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  P3-5 E2E: Fixed Assets Cycle — End-to-End Test')
  console.log('  Tests the full fixed-assets cycle from asset acquisition')
  console.log('  through monthly depreciation and optional reversal, with')
  console.log('  JE verification at each step and Decimal.js rounding')
  console.log('  safety checks on accumulated depreciation / NBV.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, CostCenter, Project
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-5 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: { code: `${PREFIX}-CL-${TS}`, name: `P3-5 Test Client`, isActive: true, taxNumber: '300000000000003' },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-5 Fixed Assets Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    await step('a4: create test Project (anchor for cost center)', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-5 Anchor Project`,
          nameAr: `مشروع P3-5 لربط مركز التكلفة`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'ACTIVE',
          contractValue: 100_000,
          projectType: 'CONSTRUCTION',
          description: `P3-5 e2e fixed-assets cycle test (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `code=${p.code}, costCenterId=${p.costCenterId}`)
    })

    // =====================================================================
    // (b) Step 1 — Create Fixed Asset (acquisitionCost > 0 → JE expected)
    //     Dr FIXED_ASSET (2110-2140) / Cr CASH (1110)
    //     sourceType=ASSET_ACQUISITION, sourceId=asset.id
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create Fixed Asset (acquisitionCost=12000 → JE) ━━━')

    await step('b1: create Fixed Asset + acquisition JE (Dr FIXED_ASSET / Cr CASH)', async () => {
      const result = await createAssetWithAcquisition({
        name: 'P3-5 Test Office Equipment',
        nameAr: 'معدات مكتبية P3-5',
        category: 'OFFICE_EQUIPMENT',
        acquisitionCost: ACQUISITION_COST,
        acquisitionDate: new Date('2025-01-15'),
        usefulLifeYears: USEFUL_LIFE_YEARS,
        depreciationRate: DEPRECIATION_RATE,
        notes: `P3-5 e2e test (TS=${TS})`,
        createAcquisitionEntry: true,
        payFrom: 'TREASURY',
      })
      created.fixedAssetId = result.asset.id
      created.fixedAssetCode = result.asset.assetCode
      created.acquisitionJEId = result.acquisitionJournalEntryId || ''
      if (created.acquisitionJEId) {
        created.allJEIds.push(created.acquisitionJEId)
      }
      log('create Fixed Asset + JE', !!created.acquisitionJEId,
        `assetId=${created.fixedAssetId}, code=${created.fixedAssetCode}, jeId=${created.acquisitionJEId}, status=${result.asset.status}`)
    })

    await step('b2: acquisition JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.acquisitionJEId)
      log('acquisition JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('b3: acquisition JE has FIXED_ASSET Dr + CASH Cr, amount=12000', async () => {
      const lines = await jeLines(created.acquisitionJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'FIXED_ASSET' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), ACQUISITION_COST) &&
        approx(Number(crLine.credit), ACQUISITION_COST)
      log('acquisition JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('b4: acquisition JE sourceType=ASSET_ACQUISITION, sourceId=asset.id', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.acquisitionJEId } })
      const ok = je?.sourceType === 'ASSET_ACQUISITION' && je?.sourceId === created.fixedAssetId
      log('acquisition JE source', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId} (expected asset.id=${created.fixedAssetId})`)
    })

    await step('b5: FixedAsset.journalEntryId points to acquisition JE', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { journalEntryId: true, status: true },
      })
      log('fixedAsset ↔ JE linkage', a?.journalEntryId === created.acquisitionJEId,
        `journalEntryId=${a?.journalEntryId}, status=${a?.status}`)
    })

    await step('b6: FixedAsset has correct computed values (cost=12000, monthly=200, residual=0, NBV=12000)', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: {
          acquisitionCost: true, residualValue: true, usefulLifeMonths: true,
          usefulLifeYears: true, depreciationRate: true,
          monthlyDepreciation: true, annualDepreciation: true,
          accumulatedDepreciation: true, netBookValue: true,
          depreciationMethod: true, status: true,
        },
      })
      const ok =
        approx(toNumber(a?.acquisitionCost), ACQUISITION_COST) &&
        approx(toNumber(a?.residualValue), RESIDUAL_VALUE) &&
        a?.usefulLifeMonths === USEFUL_LIFE_MONTHS &&
        a?.usefulLifeYears === USEFUL_LIFE_YEARS &&
        approx(toNumber(a?.depreciationRate), DEPRECIATION_RATE) &&
        approx(toNumber(a?.monthlyDepreciation), MONTHLY_DEP) &&
        approx(toNumber(a?.annualDepreciation), ANNUAL_DEP) &&
        approx(toNumber(a?.accumulatedDepreciation), 0) &&
        approx(toNumber(a?.netBookValue), ACQUISITION_COST) &&
        a?.depreciationMethod === 'STRAIGHT_LINE' &&
        a?.status === 'ACTIVE'
      log('FixedAsset computed values', ok,
        `cost=${toNumber(a?.acquisitionCost)}, monthly=${toNumber(a?.monthlyDepreciation)}, ` +
        `annual=${toNumber(a?.annualDepreciation)}, residual=${toNumber(a?.residualValue)}, ` +
        `months=${a?.usefulLifeMonths}, NBV=${toNumber(a?.netBookValue)}, ` +
        `accumDep=${toNumber(a?.accumulatedDepreciation)}, method=${a?.depreciationMethod}, status=${a?.status}`)
    })

    await step('b7: confirm no depreciation JEs exist yet for this asset', async () => {
      const deps = await db.assetDepreciation.findMany({
        where: { fixedAssetId: created.fixedAssetId },
      })
      log('no depreciation rows yet', deps.length === 0, `depreciationCount=${deps.length}`)
    })

    // =====================================================================
    // (c) Step 2 — Run monthly depreciation → verify JE posted
    //     Dr DEPRECIATION_EXPENSE (8310-8340) / Cr ACCUM_DEPRECIATION (2210-2240)
    //     sourceType=DEPRECIATION, sourceId=asset.id
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Run monthly depreciation → verify JE ━━━')

    await step('c1: runDepreciationForAsset for year=2099, month=12', async () => {
      const result = await runDepreciationForAsset(
        created.fixedAssetId,
        TEST_YEAR,
        TEST_MONTH,
      )
      // The result should NOT be skipped
      const notSkipped = !result.skipped
      // Track the depreciation row id and JE id
      if (notSkipped && result.journalEntryId) {
        created.depreciationJEId = result.journalEntryId
        created.allJEIds.push(result.journalEntryId)
      }
      // Look up the AssetDepreciation row (linked via fixedAssetId + year + month)
      const depRow = await db.assetDepreciation.findFirst({
        where: { fixedAssetId: created.fixedAssetId, year: TEST_YEAR, month: TEST_MONTH },
      })
      if (depRow) {
        created.depreciationId = depRow.id
      }
      log('runDepreciationForAsset', notSkipped && !!created.depreciationJEId,
        `depreciationAmount=${result.depreciationAmount}, beginningNBV=${result.beginningNBV}, ` +
        `endingNBV=${result.endingNBV}, jeId=${result.journalEntryId}, ` +
        `fullyDepreciated=${result.fullyDepreciated}, assetDepRow=${created.depreciationId}`)
    })

    await step('c2: depreciation JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.depreciationJEId)
      log('depreciation JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('c3: depreciation JE has DEPRECIATION_EXPENSE Dr + ACCUM_DEPRECIATION Cr, amount=200', async () => {
      const lines = await jeLines(created.depreciationJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'DEPRECIATION_EXPENSE' &&
        crLine?.account.accountRole === 'ACCUM_DEPRECIATION' &&
        approx(Number(drLine.debit), MONTHLY_DEP) &&
        approx(Number(crLine.credit), MONTHLY_DEP)
      log('depreciation JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('c4: depreciation JE sourceType=DEPRECIATION, sourceId=asset.id', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.depreciationJEId } })
      const ok = je?.sourceType === 'DEPRECIATION' && je?.sourceId === created.fixedAssetId
      log('depreciation JE source', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId} (expected asset.id=${created.fixedAssetId})`)
    })

    await step('c5: depreciation JE date is first day of period (2099-12-01)', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.depreciationJEId } })
      const expected = new Date(TEST_YEAR, TEST_MONTH - 1, 1)
      const actual = je?.date ? new Date(je.date) : null
      const ok = actual !== null &&
        actual.getFullYear() === expected.getFullYear() &&
        actual.getMonth() === expected.getMonth() &&
        actual.getDate() === expected.getDate()
      log('depreciation JE date', ok,
        `date=${actual?.toISOString()} (expected ${expected.toISOString()})`)
    })

    await step('c6: FixedAsset.accumulatedDepreciation = 200 (Decimal.js safe)', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { accumulatedDepreciation: true, netBookValue: true, status: true, lastDepreciationDate: true },
      })
      const accumDep = toNumber(a?.accumulatedDepreciation)
      const nbv = toNumber(a?.netBookValue)
      const ok =
        approx(accumDep, ACCUM_DEP_AFTER_1MO) &&
        approx(nbv, NBV_AFTER_1MO) &&
        a?.status === 'ACTIVE'
      log('FixedAsset accumDep + NBV after 1 month', ok,
        `accumDep=${accumDep.toFixed(2)} (exp ${ACCUM_DEP_AFTER_1MO}), ` +
        `NBV=${nbv.toFixed(2)} (exp ${NBV_AFTER_1MO}), status=${a?.status}`)
    })

    await step('c7: FixedAsset.lastDepreciationDate = 2099-12-01', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { lastDepreciationDate: true },
      })
      const expected = new Date(TEST_YEAR, TEST_MONTH - 1, 1)
      const actual = a?.lastDepreciationDate ? new Date(a.lastDepreciationDate) : null
      const ok = actual !== null &&
        actual.getFullYear() === expected.getFullYear() &&
        actual.getMonth() === expected.getMonth() &&
        actual.getDate() === expected.getDate()
      log('FixedAsset.lastDepreciationDate', ok,
        `date=${actual?.toISOString()} (expected ${expected.toISOString()})`)
    })

    await step('c8: AssetDepreciation row created with correct beginningNBV + endingNBV', async () => {
      const dep = await db.assetDepreciation.findUnique({
        where: { id: created.depreciationId },
        select: {
          year: true, month: true, depreciationAmount: true,
          beginningNBV: true, endingNBV: true, journalEntryId: true,
          reversed: true,
        },
      })
      const ok =
        dep?.year === TEST_YEAR &&
        dep?.month === TEST_MONTH &&
        approx(toNumber(dep?.depreciationAmount), MONTHLY_DEP) &&
        approx(toNumber(dep?.beginningNBV), ACQUISITION_COST) &&  // beginningNBV = 12000 (before dep)
        approx(toNumber(dep?.endingNBV), NBV_AFTER_1MO) &&       // endingNBV = 11800 (after dep)
        dep?.journalEntryId === created.depreciationJEId &&
        dep?.reversed === false
      log('AssetDepreciation row', ok,
        `year=${dep?.year}, month=${dep?.month}, amount=${toNumber(dep?.depreciationAmount)}, ` +
        `beginningNBV=${toNumber(dep?.beginningNBV)}, endingNBV=${toNumber(dep?.endingNBV)}, ` +
        `jeId=${dep?.journalEntryId}, reversed=${dep?.reversed}`)
    })

    await step('c9: re-running depreciation for the same period is idempotent (skipped)', async () => {
      const result = await runDepreciationForAsset(
        created.fixedAssetId,
        TEST_YEAR,
        TEST_MONTH,
      )
      // Should be skipped with reason 'تم الإهلاك مسبقاً لهذه الفترة'
      const ok = result.skipped === true &&
        !!result.skipReason &&
        result.skipReason.includes('تم الإهلاك مسبقاً')
      log('idempotency: re-run skipped', ok,
        `skipped=${result.skipped}, skipReason=${result.skipReason}`)
    })

    await step('c10: confirm only 1 AssetDepreciation row exists for (asset, year, month)', async () => {
      const deps = await db.assetDepreciation.findMany({
        where: { fixedAssetId: created.fixedAssetId, year: TEST_YEAR, month: TEST_MONTH },
      })
      log('single AssetDepreciation row', deps.length === 1,
        `count=${deps.length} (expected 1 — DB-level @@unique enforces)`)
    })

    // =====================================================================
    // (d) Step 3 — Reverse the depreciation → verify JE + asset restored
    //     Dr ACCUM_DEPRECIATION (2210-2240) / Cr DEPRECIATION_EXPENSE (8310-8340)
    //     sourceType=DEPRECIATION (preserved), isReversal=true
    // =====================================================================
    console.log('\n━━━ (d) Step 3: Reverse the depreciation → verify JE + asset restored ━━━')

    await step('d1: reverseAssetDepreciation for the depreciation row', async () => {
      const result = await reverseAssetDepreciation(created.depreciationId)
      log('reverseAssetDepreciation', result.success === true, `message=${result.message}`)

      // Look up the reversal JE — it should be a JournalEntry with reversedEntryId = depreciationJEId
      const reversalJE = await db.journalEntry.findFirst({
        where: { reversedEntryId: created.depreciationJEId, deletedAt: null },
        select: { id: true, entryNo: true, isReversal: true, reversedEntryId: true, status: true },
      })
      if (reversalJE) {
        created.depreciationReversalJEId = reversalJE.id
        created.allJEIds.push(reversalJE.id)
      }
      log('reversal JE created', !!reversalJE,
        `jeId=${reversalJE?.id}, entryNo=${reversalJE?.entryNo}, ` +
        `isReversal=${reversalJE?.isReversal}, status=${reversalJE?.status}`)
    })

    await step('d2: reversal JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.depreciationReversalJEId)
      log('reversal JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('d3: reversal JE has ACCUM_DEPRECIATION Dr + DEPRECIATION_EXPENSE Cr, amount=200 (flipped)', async () => {
      const lines = await jeLines(created.depreciationReversalJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'ACCUM_DEPRECIATION' &&
        crLine?.account.accountRole === 'DEPRECIATION_EXPENSE' &&
        approx(Number(drLine.debit), MONTHLY_DEP) &&
        approx(Number(crLine.credit), MONTHLY_DEP)
      log('reversal JE structure (flipped)', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('d4: reversal JE sourceType=DEPRECIATION (preserved), isReversal=true, reversedEntryId=original', async () => {
      const je = await db.journalEntry.findUnique({
        where: { id: created.depreciationReversalJEId },
        select: { sourceType: true, sourceId: true, isReversal: true, reversedEntryId: true, status: true },
      })
      const ok =
        je?.sourceType === 'DEPRECIATION' &&
        je?.sourceId === created.fixedAssetId &&
        je?.isReversal === true &&
        je?.reversedEntryId === created.depreciationJEId &&
        je?.status === 'POSTED'
      log('reversal JE metadata', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}, ` +
        `isReversal=${je?.isReversal}, reversedEntryId=${je?.reversedEntryId}, status=${je?.status}`)
    })

    await step('d5: original depreciation JE remains POSTED (reversal JE points to it via reversedEntryId)', async () => {
      // Per the guard design (guard.ts:413): "Both entries remain POSTED and net out to zero
      // in the trial balance." The original is NOT status-flipped — the reversal JE carries
      // isReversal=true and reversedEntryId=originalId, which is how the linkage is expressed.
      const original = await db.journalEntry.findUnique({
        where: { id: created.depreciationJEId },
        select: { status: true, reversedEntryId: true, isReversal: true },
      })
      // Look up the reversal JE
      const reversal = await db.journalEntry.findFirst({
        where: { reversedEntryId: created.depreciationJEId, deletedAt: null },
        select: { status: true, isReversal: true, reversedEntryId: true },
      })
      const ok =
        original?.status === 'POSTED' &&         // original stays POSTED
        original?.isReversal === false &&         // original is NOT itself a reversal
        reversal?.status === 'POSTED' &&          // reversal is also POSTED
        reversal?.isReversal === true &&          // reversal carries the flag
        reversal?.reversedEntryId === created.depreciationJEId
      log('original POSTED + reversal JE links back', ok,
        `original.status=${original?.status}, original.isReversal=${original?.isReversal}, ` +
        `reversal.status=${reversal?.status}, reversal.isReversal=${reversal?.isReversal}, ` +
        `reversal.reversedEntryId=${reversal?.reversedEntryId}`)
    })

    await step('d6: AssetDepreciation.reversed = true, reversedAt set', async () => {
      const dep = await db.assetDepreciation.findUnique({
        where: { id: created.depreciationId },
        select: { reversed: true, reversedAt: true },
      })
      const ok =
        dep?.reversed === true &&
        dep?.reversedAt !== null
      log('AssetDepreciation reversed flag', ok,
        `reversed=${dep?.reversed}, reversedAt=${dep?.reversedAt?.toISOString()}`)
    })

    await step('d7: FixedAsset.accumulatedDepreciation restored to 0, NBV restored to 12000', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { accumulatedDepreciation: true, netBookValue: true, status: true },
      })
      const accumDep = toNumber(a?.accumulatedDepreciation)
      const nbv = toNumber(a?.netBookValue)
      const ok =
        approx(accumDep, 0) &&
        approx(nbv, ACQUISITION_COST) &&
        a?.status === 'ACTIVE' // reversal unconditionally sets status='ACTIVE'
      log('FixedAsset restored after reversal', ok,
        `accumDep=${accumDep.toFixed(2)} (exp 0), NBV=${nbv.toFixed(2)} (exp ${ACQUISITION_COST}), status=${a?.status}`)
    })

    await step('d8: reversing an already-reversed depreciation throws (idempotency guard)', async () => {
      let threw = false
      let errMsg = ''
      try {
        await reverseAssetDepreciation(created.depreciationId)
      } catch (e: any) {
        threw = true
        errMsg = e?.message || String(e)
      }
      log('double-reversal blocked', threw, `errMsg=${errMsg}`)
    })

    // =====================================================================
    // (e) Final verification — all JEs balanced, TB ties, numerical consistency
    // =====================================================================
    console.log('\n━━━ (e) Final verification ━━━')

    await step('e1: all cycle JEs are individually balanced', async () => {
      const balances = await Promise.all(created.allJEIds.map(jeBalance))
      const allBalanced = balances.every(b => b.balanced)
      const unbalanced = balances.map((b, i) => ({ id: created.allJEIds[i], ...b })).filter(b => !b.balanced)
      log('all JEs balanced', allBalanced,
        `${created.allJEIds.length} JEs total. ${allBalanced ? 'All balanced.' : `Unbalanced: ${JSON.stringify(unbalanced)}`}`)
    })

    await step('e2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr),
        `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('e3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('e4: numerical consistency check (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    await step('e5: source ↔ JE linkage intact for all source documents', async () => {
      const asset = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { journalEntryId: true, status: true },
      })
      const dep = await db.assetDepreciation.findUnique({
        where: { id: created.depreciationId },
        select: { journalEntryId: true, reversed: true },
      })

      const assetLinked = asset?.journalEntryId === created.acquisitionJEId
      const depLinked = !!dep?.journalEntryId && dep.journalEntryId === created.depreciationJEId
      const depReversed = dep?.reversed === true
      log('source↔JE linkage', assetLinked && depLinked && depReversed,
        `asset.jeId=${asset?.journalEntryId} (exp ${created.acquisitionJEId}), ` +
        `assetDep.jeId=${dep?.journalEntryId} (exp ${created.depreciationJEId}), ` +
        `asset.status=${asset?.status}, assetDep.reversed=${dep?.reversed}`)
    })

    await step('e6: fixed-asset-cycle account balances reflect expected Dr/Cr movements', async () => {
      // Verify the four key fixed-asset-cycle accounts have correct expected balances
      // contributed by THIS cycle's JEs (filter by our allJEIds).
      //
      // After 3 JEs (acquisition + depreciation + reversal):
      //   FIXED_ASSET: Dr 12000 (acquisition), Cr 0 → net +12000
      //   CASH: Dr 0, Cr 12000 (acquisition payment) → net -12000
      //   DEPRECIATION_EXPENSE: Dr 200 (depreciation), Cr 200 (reversal) → net 0
      //   ACCUM_DEPRECIATION: Dr 200 (reversal), Cr 200 (depreciation) → net 0
      const fixedAsset = await testImpactOnRole('FIXED_ASSET')
      const cash = await testImpactOnRole('CASH')
      const depExp = await testImpactOnRole('DEPRECIATION_EXPENSE')
      const accumDep = await testImpactOnRole('ACCUM_DEPRECIATION')

      const ok =
        approx(fixedAsset.dr, ACQUISITION_COST) &&           // 12000
        approx(fixedAsset.cr, 0) &&
        approx(cash.dr, 0) &&
        approx(cash.cr, ACQUISITION_COST) &&                  // 12000
        approx(depExp.dr, MONTHLY_DEP) &&                     // 200 (depreciation)
        approx(depExp.cr, MONTHLY_DEP) &&                     // 200 (reversal)
        approx(accumDep.dr, MONTHLY_DEP) &&                   // 200 (reversal)
        approx(accumDep.cr, MONTHLY_DEP)                      // 200 (depreciation)
      log('fixed-asset-cycle account balances', ok,
        `FIXED_ASSET Dr=${fixedAsset.dr}/Cr=${fixedAsset.cr} (exp Dr=12000, Cr=0), ` +
        `CASH Dr=${cash.dr}/Cr=${cash.cr} (exp Dr=0, Cr=12000), ` +
        `DEPRECIATION_EXPENSE Dr=${depExp.dr}/Cr=${depExp.cr} (exp Dr=200, Cr=200), ` +
        `ACCUM_DEPRECIATION Dr=${accumDep.dr}/Cr=${accumDep.cr} (exp Dr=200, Cr=200)`)
    })

    await step('e7: net cash impact = -12000 (only acquisition payment in this cycle)', async () => {
      const ourLines = await db.journalLine.findMany({
        where: { journalEntryId: { in: created.allJEIds }, deletedAt: null },
        include: { account: { select: { accountRole: true } } },
      })
      const cashDr = ourLines.filter(l => l.account.accountRole === 'CASH').reduce((s, l) => s + Number(l.debit), 0)
      const cashCr = ourLines.filter(l => l.account.accountRole === 'CASH').reduce((s, l) => s + Number(l.credit), 0)
      const netCash = cashDr - cashCr
      const expected = -ACQUISITION_COST // -12000 (acquisition payment out, no other cash movements)
      log('net cash impact', approx(netCash, expected),
        `net=${netCash.toFixed(2)} (Dr=${cashDr} - Cr=${cashCr}), expected=${expected} (acquisition payment)`)
    })

    await step('e8: FixedAsset.netBookValue = acquisitionCost - accumulatedDepreciation (register ties to GL)', async () => {
      const a = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { acquisitionCost: true, accumulatedDepreciation: true, netBookValue: true },
      })
      const cost = toNumber(a?.acquisitionCost)
      const accumDep = toNumber(a?.accumulatedDepreciation)
      const nbv = toNumber(a?.netBookValue)
      const computedNBV = cost - accumDep
      const ok = approx(nbv, computedNBV, 0.01)
      log('FixedAsset register ties', ok,
        `cost=${cost.toFixed(2)} - accumDep=${accumDep.toFixed(2)} = ${computedNBV.toFixed(2)}, ` +
        `stored NBV=${nbv.toFixed(2)}, diff=${Math.abs(nbv - computedNBV).toFixed(4)}`)
    })

    await step('e9: GL accum depreciation = FixedAsset.accumulatedDepreciation (filtered by sourceId)', async () => {
      // Sum Cr - Dr on ACCUM_DEPRECIATION lines where sourceId = asset.id (depreciation JEs only,
      // which carry sourceId = asset.id). Reversal JEs also carry sourceId = asset.id.
      // Per the guard design, BOTH the original and the reversal remain status='POSTED' —
      // they net out to zero in the trial balance. There is no 'REVERSED' status enum value.
      const lines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          account: { accountRole: 'ACCUM_DEPRECIATION' },
          journalEntry: {
            sourceType: 'DEPRECIATION',
            sourceId: created.fixedAssetId,
            deletedAt: null,
            status: 'POSTED',
          },
        },
        select: { debit: true, credit: true },
      })
      // After depreciation (Cr 200) + reversal (Dr 200), net = 0
      const glAccumDep = lines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)
      const asset = await db.fixedAsset.findUnique({
        where: { id: created.fixedAssetId },
        select: { accumulatedDepreciation: true },
      })
      const assetAccumDep = toNumber(asset?.accumulatedDepreciation)
      const ok = approx(glAccumDep, assetAccumDep, 0.01)
      log('GL accum dep = FixedAsset accum dep', ok,
        `GL=${glAccumDep.toFixed(2)}, FixedAsset=${assetAccumDep.toFixed(2)}, ` +
        `lines=${lines.length} (depreciation + reversal JEs for this asset)`)
    })

    await step('e10: cycle JE count = 3 (acquisition + depreciation + reversal)', async () => {
      const expected = 3
      log('cycle JE count', created.allJEIds.length === expected,
        `created ${created.allJEIds.length} JEs (expected ${expected})`)
    })

    // Silence the unused variable warning
    void Prisma

  } catch (e: any) {
    console.error('\n[FATAL] Unhandled error during cycle:', e)
    console.error(e?.stack || e)
  } finally {
    // =====================================================================
    // CLEANUP — delete all created records in reverse FK order
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
    console.log('  ✅ All fixed-assets-cycle E2E tests PASSED')
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
// Cleanup — deletes everything in reverse order, soft-deletes JEs first
// ===========================================================================

async function cleanup() {
  try {
    await db.$transaction(async (tx) => {
      // 1. Soft-delete all JEs created by this test (so they vanish from reports)
      for (const jeId of created.allJEIds) {
        if (!jeId) continue
        try {
          await softDeleteJE(jeId, tx)
        } catch { /* may already be deleted */ }
      }

      // 2. Delete source documents (FK children first)
      // AssetDepreciation rows are deleted via cascade when FixedAsset is deleted,
      // but we'll be explicit anyway in case cascade behaviour changes.
      if (created.fixedAssetId) {
        await tx.assetDepreciation.deleteMany({ where: { fixedAssetId: created.fixedAssetId } })
        await tx.fixedAsset.deleteMany({ where: { id: created.fixedAssetId } })
      }
      if (created.projectId) {
        await tx.project.deleteMany({ where: { id: created.projectId } })
      }
      if (created.costCenterId) {
        await tx.costCenter.deleteMany({ where: { id: created.costCenterId } })
      }
      if (created.clientId) {
        await tx.client.deleteMany({ where: { id: created.clientId } })
      }
      if (created.branchId) {
        await tx.branch.deleteMany({ where: { id: created.branchId } })
      }
    })
    console.log('  ✓ All test data removed (JEs soft-deleted, source docs hard-deleted)')
  } catch (e: any) {
    console.error('  ⚠ Cleanup error:', e?.message || e)
    // Best-effort: try individual deletes outside the transaction
    console.log('  Attempting best-effort individual cleanup...')
    try { await db.assetDepreciation.deleteMany({ where: { fixedAssetId: created.fixedAssetId } }) } catch { /* ignore */ }
    try { await db.fixedAsset.deleteMany({ where: { id: created.fixedAssetId } }) } catch { /* ignore */ }
    try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch { /* ignore */ }
    try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch { /* ignore */ }
    try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch { /* ignore */ }
    try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch { /* ignore */ }
    // Best-effort JE soft-deletes
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } }).catch(() => {})
      } catch { /* ignore */ }
    }
    console.log('  ✓ Best-effort cleanup done')
  }
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('FATAL:', msg)
  await db.$disconnect()
  process.exit(1)
})
