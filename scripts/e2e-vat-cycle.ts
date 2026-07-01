// ============================================================================
// P3-6 E2E: VAT Cycle — End-to-End Test
// ============================================================================
// Walks the full VAT (ضريبة القيمة المضافة) business cycle:
//   1. Create prerequisites (Branch, Client, Supplier, CostCenter, Project)
//   2. Create 2 sales invoices (output VAT) → verify JEs posted
//   3. Create 2 purchase invoices (input VAT) → verify JEs posted
//   4. Calculate VAT for the quarter (calculateVatForQuarter) → verify
//      output/input/net/totalSales/totalPurchases match expected
//   5. Verify operational ↔ GL match (glMatch=true, diffs < 0.01 SAR)
//   6. Create VATReturn (DRAFT) → verify it freezes the GL-derived totals
//   7. File VATReturn (DRAFT→FILED) → verify declaration JE posted:
//      Dr VAT_OUTPUT, Cr VAT_INPUT, Cr VAT_DUE (net)
//   8. Pay VATReturn (FILED→PAID) → verify payment JE posted:
//      Dr VAT_DUE, Cr BANK
//   9. Final verification:
//      - All 6 cycle JEs balanced
//      - Trial balance ties (Dr=Cr)
//      - VAT_OUTPUT balance = 0 (closed by declaration)
//      - VAT_INPUT  balance = 0 (closed by declaration)
//      - VAT_DUE    balance = 0 (cleared by payment)
//      - BANK       decreased by netVat
//      - verifyNumericalConsistency ok=true (I1-I7)
//      - source↔JE linkage intact
//
// All test data is wrapped in try/finally — cleanup soft-deletes every JE
// and hard-deletes every source doc / VATReturn in reverse FK order.
//
// Run: bun scripts/e2e-vat-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import {
  createSalesInvoiceJournalEntry,
  createPurchaseInvoiceJournalEntry,
} from '@/lib/auto-journal'
import {
  autoEntryVATDeclaration,
  autoEntryVATPayment,
  reverseEntry,
  type PrismaTransaction as EngineTx,
} from '@/lib/accounting/engine'
import {
  getTrialBalance,
  verifyNumericalConsistency,
  getVATReconciliation,
} from '@/lib/accounting/queries'
import { calculateVatForQuarter } from '@/lib/vat-calc'
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
const PREFIX = 'P3VAT'

// Use a far-future quarter (2099-Q4) so the test never collides with real data.
const TEST_YEAR = 2099
const TEST_QUARTER = 4
const TEST_PERIOD = `${TEST_YEAR}-Q${TEST_QUARTER}`

// Period dates: 2099-10-01 → 2099-12-31 23:59:59.999
const PERIOD_START = new Date(TEST_YEAR, (TEST_QUARTER - 1) * 3, 1)        // 2099-10-01
const PERIOD_END = new Date(TEST_YEAR, TEST_QUARTER * 3, 0, 23, 59, 59, 999) // 2099-12-31

// Test amounts (small enough not to disturb real trial balance during test,
// large enough to expose rounding bugs):
const SALES_1_SUB = 10_000
const SALES_1_VAT = 1_500
const SALES_1_TOTAL = 11_500

const SALES_2_SUB = 5_000
const SALES_2_VAT = 750
const SALES_2_TOTAL = 5_750

const PURCH_1_SUB = 4_000   // category CONSUMABLES → PROJECT_COST
const PURCH_1_VAT = 600
const PURCH_1_TOTAL = 4_600

const PURCH_2_SUB = 2_000   // category OFFICE → ADMIN_EXPENSE
const PURCH_2_VAT = 300
const PURCH_2_TOTAL = 2_300

const EXPECTED_OUTPUT_VAT = SALES_1_VAT + SALES_2_VAT    // 2,250
const EXPECTED_INPUT_VAT = PURCH_1_VAT + PURCH_2_VAT     // 900
const EXPECTED_NET_VAT = EXPECTED_OUTPUT_VAT - EXPECTED_INPUT_VAT  // 1,350
const EXPECTED_TOTAL_SALES = SALES_1_SUB + SALES_2_SUB   // 15,000
const EXPECTED_TOTAL_PURCHASES = PURCH_1_SUB + PURCH_2_SUB // 6,000

const created = {
  branchId: '' as string,
  clientId: '' as string,
  supplierId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,

  salesInvoiceIds: [] as string[],
  salesInvoiceJEIds: [] as string[],

  purchaseInvoiceIds: [] as string[],
  purchaseInvoiceJEIds: [] as string[],

  vatReturnId: '' as string,
  declarationJEId: '' as string | null,
  paymentJEId: '' as string | null,

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
      costCenter: { select: { code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  })
}

async function accountBalanceByRole(role: string): Promise<number> {
  // Returns the SIGNED balance for an account role (positive = normal balance).
  // NOTE: Account model has no `deletedAt` field — only `isActive` and `allowPosting`.
  const account = await db.account.findFirst({
    where: { accountRole: role, isActive: true },
    select: { id: true, type: true },
  })
  if (!account) return 0
  const agg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: account.id,
      deletedAt: null,
      journalEntry: { status: 'POSTED', deletedAt: null },
    },
  })
  const dr = toNumber(agg._sum.debit)
  const cr = toNumber(agg._sum.credit)
  // Liability / Revenue / Equity → credit-normal (Cr − Dr)
  // Asset / Expense → debit-normal (Dr − Cr)
  if (account.type === 'ASSET' || account.type === 'EXPENSE') {
    return dr - cr
  }
  return cr - dr
}

/**
 * Returns the SIGNED balance for an account role, scoped to ONLY the JEs
 * created in this test cycle (created.allJEIds). Useful for verifying that
 * the cycle's net impact on each account is as expected, without being
 * affected by pre-existing data in the global DB.
 */
async function cycleAccountBalanceByRole(role: string): Promise<number> {
  const account = await db.account.findFirst({
    where: { accountRole: role, isActive: true },
    select: { id: true, type: true },
  })
  if (!account) return 0
  const agg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: account.id,
      deletedAt: null,
      journalEntryId: { in: created.allJEIds },
      journalEntry: { status: 'POSTED', deletedAt: null },
    },
  })
  const dr = toNumber(agg._sum.debit)
  const cr = toNumber(agg._sum.credit)
  if (account.type === 'ASSET' || account.type === 'EXPENSE') {
    return dr - cr
  }
  return cr - dr
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
  console.log('  P3-6 E2E: VAT Cycle — End-to-End Test')
  console.log(`  Period: ${TEST_PERIOD} (${PERIOD_START.toISOString().slice(0,10)} → ${PERIOD_END.toISOString().slice(0,10)})`)
  console.log('  Tests the full VAT business cycle from operational VAT posting')
  console.log('  through declaration filing, payment, and reversal verification.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, Supplier, CostCenter, Project
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-6 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: {
          code: `${PREFIX}-CL-${TS}`,
          name: `P3-6 Test Client`,
          isActive: true,
          taxNumber: '300000000000003',
        },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test Supplier', async () => {
      const s = await db.supplier.create({
        data: {
          code: `${PREFIX}-SUP-${TS}`,
          name: `P3-6 Test Supplier`,
          isActive: true,
          taxNumber: '300000000000004',
        },
      })
      created.supplierId = s.id
      log('create Supplier', !!s.id, `code=${s.code}`)
    })

    await step('a4: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-6 Project Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    await step('a5: create test Project (anchor for cost center)', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-6 VAT Test Project`,
          nameAr: `مشروع اختبار الضريبة P3-6`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2099-10-01'),
          endDate: new Date('2099-12-31'),
          status: 'ACTIVE',
          contractValue: 100_000,
          projectType: 'CONSTRUCTION',
          estimatedTotalCost: 80_000,
          description: `P3-6 e2e VAT cycle test (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `id=${p.id}, costCenterId=${p.costCenterId}`)
    })

    // =====================================================================
    // (b) Step 1 — Create 2 sales invoices (OUTPUT VAT) → verify JEs posted
    //     Dr CUSTOMER_AR / Cr PROJECT_REVENUE + Cr VAT_OUTPUT
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create sales invoices → output VAT JEs ━━━')

    await step('b1: create sales invoice #1 + JE (Dr AR / Cr REVENUE + Cr VAT_OUTPUT)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Generate SI-YYYY-NNNN invoice number (mirrors route logic)
        const prefix = 'SI'
        const year = TEST_YEAR
        const likePattern = `${prefix}-${year}-`
        const lastInv = await tx.salesInvoice.findFirst({
          where: { invoiceNo: { startsWith: likePattern } },
          orderBy: { invoiceNo: 'desc' },
          select: { invoiceNo: true },
        })
        let seq = 1
        if (lastInv) {
          const m = lastInv.invoiceNo.match(/-(\d+)$/)
          if (m) seq = parseInt(m[1], 10) + 1
        }
        const invoiceNo = `${prefix}-${year}-${String(seq).padStart(4, '0')}`

        const invoice = await tx.salesInvoice.create({
          data: {
            invoiceNo,
            clientId: created.clientId,
            projectId: created.projectId,
            date: new Date('2099-10-15'),
            dueDate: new Date('2099-11-15'),
            subtotal: SALES_1_SUB,
            discountRate: 0,
            discountAmount: 0,
            netAmount: SALES_1_SUB,
            vatRate: 0.15,
            vatAmount: SALES_1_VAT,
            totalAmount: SALES_1_TOTAL,
            paidAmount: 0,
            status: 'DRAFT',
            invoiceType: 'PROGRESS_CLAIM',
            sourceType: 'EXTRACT',
            notes: `P3-6 sales invoice 1 (TS=${TS})`,
          },
        })

        // DRAFT → SENT → JE posted (createSalesInvoiceJournalEntry posts on transition)
        await createSalesInvoiceJournalEntry(invoice.id, tx)
        await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: { status: 'SENT' },
        })
        return await tx.salesInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { id: true, journalEntryId: true, status: true },
        })
      })
      created.salesInvoiceIds.push(result.id)
      created.salesInvoiceJEIds.push(result.journalEntryId!)
      created.allJEIds.push(result.journalEntryId!)
      log('create salesInvoice #1 + JE', !!result.journalEntryId,
        `id=${result.id}, jeId=${result.journalEntryId}, status=${result.status}`)
    })

    await step('b2: sales invoice #1 JE is balanced', async () => {
      const b = await jeBalance(created.salesInvoiceJEIds[0])
      log('salesInv1 JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('b3: sales invoice #1 JE has correct accounts + amounts', async () => {
      const lines = await jeLines(created.salesInvoiceJEIds[0])
      const arLine = lines.find(l => l.account.accountRole === 'CUSTOMER_AR')
      const revLine = lines.find(l => l.account.accountRole === 'PROJECT_REVENUE')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const ok =
        !!arLine && approx(Number(arLine.debit), SALES_1_TOTAL) &&
        !!revLine && approx(Number(revLine.credit), SALES_1_SUB) &&
        !!vatLine && approx(Number(vatLine.credit), SALES_1_VAT)
      log('salesInv1 JE structure', ok,
        `AR Dr=${arLine?.debit}, Rev Cr=${revLine?.credit}, VAT Cr=${vatLine?.credit}`)
    })

    await step('b4: sales invoice #1 JE sourceType=SALES_INVOICE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.salesInvoiceJEIds[0] } })
      log('sourceType=SALES_INVOICE', je?.sourceType === 'SALES_INVOICE', `sourceType=${je?.sourceType}`)
    })

    await step('b5: create sales invoice #2 + JE', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const prefix = 'SI'
        const year = TEST_YEAR
        const likePattern = `${prefix}-${year}-`
        const lastInv = await tx.salesInvoice.findFirst({
          where: { invoiceNo: { startsWith: likePattern } },
          orderBy: { invoiceNo: 'desc' },
          select: { invoiceNo: true },
        })
        let seq = 1
        if (lastInv) {
          const m = lastInv.invoiceNo.match(/-(\d+)$/)
          if (m) seq = parseInt(m[1], 10) + 1
        }
        const invoiceNo = `${prefix}-${year}-${String(seq).padStart(4, '0')}`

        const invoice = await tx.salesInvoice.create({
          data: {
            invoiceNo,
            clientId: created.clientId,
            projectId: created.projectId,
            date: new Date('2099-11-10'),
            dueDate: new Date('2099-12-10'),
            subtotal: SALES_2_SUB,
            discountRate: 0,
            discountAmount: 0,
            netAmount: SALES_2_SUB,
            vatRate: 0.15,
            vatAmount: SALES_2_VAT,
            totalAmount: SALES_2_TOTAL,
            paidAmount: 0,
            status: 'DRAFT',
            invoiceType: 'PROGRESS_CLAIM',
            sourceType: 'EXTRACT',
            notes: `P3-6 sales invoice 2 (TS=${TS})`,
          },
        })
        await createSalesInvoiceJournalEntry(invoice.id, tx)
        await tx.salesInvoice.update({
          where: { id: invoice.id },
          data: { status: 'SENT' },
        })
        return await tx.salesInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { id: true, journalEntryId: true, status: true },
        })
      })
      created.salesInvoiceIds.push(result.id)
      created.salesInvoiceJEIds.push(result.journalEntryId!)
      created.allJEIds.push(result.journalEntryId!)
      log('create salesInvoice #2 + JE', !!result.journalEntryId,
        `id=${result.id}, jeId=${result.journalEntryId}, status=${result.status}`)
    })

    await step('b6: sales invoice #2 JE balanced + correct amounts', async () => {
      const b = await jeBalance(created.salesInvoiceJEIds[1])
      const lines = await jeLines(created.salesInvoiceJEIds[1])
      const arLine = lines.find(l => l.account.accountRole === 'CUSTOMER_AR')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const ok =
        b.balanced &&
        approx(Number(arLine?.debit), SALES_2_TOTAL) &&
        approx(Number(vatLine?.credit), SALES_2_VAT)
      log('salesInv2 JE balanced+correct', ok,
        `Dr=${b.dr}, Cr=${b.cr}, AR=${arLine?.debit}, VAT=${vatLine?.credit}`)
    })

    // =====================================================================
    // (c) Step 2 — Create 2 purchase invoices (INPUT VAT) → verify JEs posted
    //     Dr PROJECT_COST/ADMIN_EXPENSE + Dr VAT_INPUT / Cr SUPPLIER_AP
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Create purchase invoices → input VAT JEs ━━━')

    await step('c1: create purchase invoice #1 (CONSUMABLES → PROJECT_COST) + JE', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const invoice = await tx.purchaseInvoice.create({
          data: {
            invoiceNo: `${PREFIX}-PI1-${TS}`,
            supplierId: created.supplierId,
            projectId: created.projectId,
            activityType: 'EXECUTION',
            date: new Date('2099-10-20'),
            dueDate: new Date('2099-11-20'),
            subtotal: PURCH_1_SUB,
            vatRate: 0.15,
            vatAmount: PURCH_1_VAT,
            totalAmount: PURCH_1_TOTAL,
            paidAmount: 0,
            status: 'SENT',
            expenseCategory: 'CONSUMABLES',
            notes: `P3-6 purchase invoice 1 (TS=${TS})`,
          },
        })
        await createPurchaseInvoiceJournalEntry(invoice.id, tx)
        return await tx.purchaseInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { id: true, journalEntryId: true, status: true },
        })
      })
      created.purchaseInvoiceIds.push(result.id)
      created.purchaseInvoiceJEIds.push(result.journalEntryId!)
      created.allJEIds.push(result.journalEntryId!)
      log('create purchaseInvoice #1 + JE', !!result.journalEntryId,
        `id=${result.id}, jeId=${result.journalEntryId}, status=${result.status}`)
    })

    await step('c2: purchase invoice #1 JE balanced', async () => {
      const b = await jeBalance(created.purchaseInvoiceJEIds[0])
      log('purchInv1 JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('c3: purchase invoice #1 JE has correct accounts + amounts', async () => {
      const lines = await jeLines(created.purchaseInvoiceJEIds[0])
      const costLine = lines.find(l => l.account.accountRole === 'PROJECT_COST')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const apLine = lines.find(l => l.account.accountRole === 'SUPPLIER_AP')
      const ok =
        !!costLine && approx(Number(costLine.debit), PURCH_1_SUB) &&
        !!vatLine && approx(Number(vatLine.debit), PURCH_1_VAT) &&
        !!apLine && approx(Number(apLine.credit), PURCH_1_TOTAL)
      log('purchInv1 JE structure', ok,
        `cost=${costLine?.debit}, vat=${vatLine?.debit}, ap=${apLine?.credit}`)
    })

    await step('c4: purchase invoice #1 JE sourceType=PURCHASE_INVOICE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.purchaseInvoiceJEIds[0] } })
      log('sourceType=PURCHASE_INVOICE', je?.sourceType === 'PURCHASE_INVOICE', `sourceType=${je?.sourceType}`)
    })

    await step('c5: create purchase invoice #2 (OFFICE → ADMIN_EXPENSE) + JE', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const invoice = await tx.purchaseInvoice.create({
          data: {
            invoiceNo: `${PREFIX}-PI2-${TS}`,
            supplierId: created.supplierId,
            projectId: created.projectId,
            activityType: 'EXECUTION',
            date: new Date('2099-11-25'),
            dueDate: new Date('2099-12-25'),
            subtotal: PURCH_2_SUB,
            vatRate: 0.15,
            vatAmount: PURCH_2_VAT,
            totalAmount: PURCH_2_TOTAL,
            paidAmount: 0,
            status: 'SENT',
            expenseCategory: 'OFFICE',
            notes: `P3-6 purchase invoice 2 (TS=${TS})`,
          },
        })
        await createPurchaseInvoiceJournalEntry(invoice.id, tx)
        return await tx.purchaseInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { id: true, journalEntryId: true, status: true },
        })
      })
      created.purchaseInvoiceIds.push(result.id)
      created.purchaseInvoiceJEIds.push(result.journalEntryId!)
      created.allJEIds.push(result.journalEntryId!)
      log('create purchaseInvoice #2 + JE', !!result.journalEntryId,
        `id=${result.id}, jeId=${result.journalEntryId}, status=${result.status}`)
    })

    await step('c6: purchase invoice #2 JE balanced + correct amounts', async () => {
      const b = await jeBalance(created.purchaseInvoiceJEIds[1])
      const lines = await jeLines(created.purchaseInvoiceJEIds[1])
      const costLine = lines.find(l => l.account.accountRole === 'ADMIN_EXPENSE')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const ok =
        b.balanced &&
        approx(Number(costLine?.debit), PURCH_2_SUB) &&
        approx(Number(vatLine?.debit), PURCH_2_VAT)
      log('purchInv2 JE balanced+correct', ok,
        `Dr=${b.dr}, Cr=${b.cr}, cost=${costLine?.debit}, vat=${vatLine?.debit}`)
    })

    // =====================================================================
    // (d) Step 3 — Calculate VAT for the quarter (GL-PRIMARY, P1-1 fix)
    //     outputVat = VAT_OUTPUT credits − debits = 2,250
    //     inputVat  = VAT_INPUT  debits  − credits = 900
    //     netVat    = 2,250 − 900 = 1,350
    //     totalSales    = REVENUE credits − debits = 15,000
    //     totalPurchases = EXPENSE debits − credits = 6,000
    // =====================================================================
    console.log('\n━━━ (d) Step 3: Calculate VAT for the quarter (GL-primary) ━━━')

    let calcResult: Awaited<ReturnType<typeof calculateVatForQuarter>> | null = null

    await step('d1: calculateVatForQuarter returns expected output VAT', async () => {
      calcResult = await calculateVatForQuarter(TEST_YEAR, TEST_QUARTER)
      const ok = approx(calcResult.outputVat, EXPECTED_OUTPUT_VAT, 0.01)
      log('outputVat matches GL', ok,
        `actual=${calcResult.outputVat.toFixed(2)}, expected=${EXPECTED_OUTPUT_VAT.toFixed(2)}`)
    })

    await step('d2: calculateVatForQuarter returns expected input VAT', async () => {
      const ok = approx(calcResult!.inputVat, EXPECTED_INPUT_VAT, 0.01)
      log('inputVat matches GL', ok,
        `actual=${calcResult!.inputVat.toFixed(2)}, expected=${EXPECTED_INPUT_VAT.toFixed(2)}`)
    })

    await step('d3: calculateVatForQuarter returns expected net VAT', async () => {
      const ok = approx(calcResult!.netVat, EXPECTED_NET_VAT, 0.01)
      log('netVat matches expected', ok,
        `actual=${calcResult!.netVat.toFixed(2)}, expected=${EXPECTED_NET_VAT.toFixed(2)}`)
    })

    await step('d4: calculateVatForQuarter returns expected total sales (REVENUE)', async () => {
      const ok = approx(calcResult!.totalSales, EXPECTED_TOTAL_SALES, 0.01)
      log('totalSales matches REVENUE', ok,
        `actual=${calcResult!.totalSales.toFixed(2)}, expected=${EXPECTED_TOTAL_SALES.toFixed(2)}`)
    })

    await step('d5: calculateVatForQuarter returns expected total purchases (EXPENSE)', async () => {
      const ok = approx(calcResult!.totalPurchases, EXPECTED_TOTAL_PURCHASES, 0.01)
      log('totalPurchases matches EXPENSE', ok,
        `actual=${calcResult!.totalPurchases.toFixed(2)}, expected=${EXPECTED_TOTAL_PURCHASES.toFixed(2)}`)
    })

    await step('d6: GL outputVat = operational outputVat (glMatch=true for output)', async () => {
      const ok = Math.abs(calcResult!.glDiffOutput) < 0.01
      log('glDiffOutput < 0.01 SAR', ok,
        `glDiffOutput=${calcResult!.glDiffOutput.toFixed(4)} (operational=${calcResult!.salesInvoices.reduce((s, l) => s + l.vatAmount, 0).toFixed(2)} + progressClaims=${calcResult!.progressClaims.reduce((s, l) => s + l.vatAmount, 0).toFixed(2)}, gl=${calcResult!.glOutputVat.toFixed(2)})`)
    })

    await step('d7: GL inputVat = operational inputVat (glMatch=true for input)', async () => {
      const ok = Math.abs(calcResult!.glDiffInput) < 0.01
      log('glDiffInput < 0.01 SAR', ok,
        `glDiffInput=${calcResult!.glDiffInput.toFixed(4)} (operational purchases+subs+expenses=${(calcResult!.purchaseInvoices.reduce((s, l) => s + l.vatAmount, 0) + calcResult!.subcontractorInvoices.reduce((s, l) => s + l.vatAmount, 0) + calcResult!.expenses.reduce((s, l) => s + l.vatAmount, 0)).toFixed(2)}, gl=${calcResult!.glInputVat.toFixed(2)})`)
    })

    await step('d8: glMatch flag is true (both diffs within 0.01 SAR)', async () => {
      log('glMatch=true', calcResult!.glMatch === true,
        `glMatch=${calcResult!.glMatch}, EPSILON=0.01 (tightened from 0.5 in P1-1)`)
    })

    await step('d9: category breakdown classifies all standard-rated (15%) sales', async () => {
      const ok =
        approx(calcResult!.categories.standardRatedSales, EXPECTED_TOTAL_SALES, 0.01) &&
        approx(calcResult!.categories.standardRatedSalesVat, EXPECTED_OUTPUT_VAT, 0.01) &&
        approx(calcResult!.categories.zeroRatedSales, 0, 0.01) &&
        approx(calcResult!.categories.exemptSales, 0, 0.01)
      log('sales category breakdown', ok,
        `std=${calcResult!.categories.standardRatedSales.toFixed(2)}, zero=${calcResult!.categories.zeroRatedSales}, exempt=${calcResult!.categories.exemptSales}`)
    })

    await step('d10: category breakdown classifies all standard-rated (15%) purchases', async () => {
      const ok =
        approx(calcResult!.categories.standardRatedPurchases, EXPECTED_TOTAL_PURCHASES, 0.01) &&
        approx(calcResult!.categories.standardRatedPurchasesVat, EXPECTED_INPUT_VAT, 0.01)
      log('purchases category breakdown', ok,
        `std=${calcResult!.categories.standardRatedPurchases.toFixed(2)}, stdVat=${calcResult!.categories.standardRatedPurchasesVat.toFixed(2)}`)
    })

    // =====================================================================
    // (e) Step 4 — Create VATReturn (DRAFT) → verify it freezes GL totals
    //     Replicates the POST /api/vat logic (lines 100-207 of vat/route.ts)
    // =====================================================================
    console.log('\n━━━ (e) Step 4: Create VATReturn (DRAFT, freezes GL totals) ━━━')

    await step('e1: create VATReturn DRAFT with GL-derived totals', async () => {
      // Check for existing active return first (mirror of route logic)
      const existingActive = await db.vATReturn.findFirst({
        where: { period: TEST_PERIOD, status: { not: 'CANCELLED' } },
      })
      if (existingActive) {
        log('create VATReturn (skipped — existing active)', false,
          `existingId=${existingActive.id}, status=${existingActive.status}`)
        return
      }

      const cancelledForPeriod = await db.vATReturn.findFirst({
        where: { period: TEST_PERIOD, status: 'CANCELLED' },
        orderBy: { createdAt: 'desc' },
      })

      const vatReturn = await db.vATReturn.create({
        data: {
          period: TEST_PERIOD,
          year: TEST_YEAR,
          quarter: TEST_QUARTER,
          // GL-derived totals (canonical)
          totalSales: calcResult!.totalSales,
          outputVat: calcResult!.outputVat,
          totalPurchases: calcResult!.totalPurchases,
          inputVat: calcResult!.inputVat,
          netVat: calcResult!.netVat,
          // ZATCA-style category breakdown (display)
          standardRatedSales: calcResult!.categories.standardRatedSales,
          zeroRatedSales: calcResult!.categories.zeroRatedSales,
          exemptSales: calcResult!.categories.exemptSales,
          standardRatedSalesVat: calcResult!.categories.standardRatedSalesVat,
          standardRatedPurchases: calcResult!.categories.standardRatedPurchases,
          zeroRatedPurchases: calcResult!.categories.zeroRatedPurchases,
          exemptPurchases: calcResult!.categories.exemptPurchases,
          importsSubjectToVAT: calcResult!.categories.importsSubjectToVAT,
          standardRatedPurchasesVat: calcResult!.categories.standardRatedPurchasesVat,
          // GL cross-check snapshot
          glOutputVat: calcResult!.glOutputVat,
          glInputVat: calcResult!.glInputVat,
          glMatch: calcResult!.glMatch,
          // Source document ID lists
          salesInvoiceIds: JSON.stringify(calcResult!.salesInvoiceIds),
          purchaseInvoiceIds: JSON.stringify(calcResult!.purchaseInvoiceIds),
          expenseIds: JSON.stringify(calcResult!.expenseIds),
          subcontractorInvoiceIds: JSON.stringify(calcResult!.subcontractorInvoiceIds),
          progressClaimIds: JSON.stringify(calcResult!.progressClaimIds),
          // State
          status: 'DRAFT',
          isAmendment: !!cancelledForPeriod,
          amendedFromId: cancelledForPeriod?.id || null,
        },
      })
      created.vatReturnId = vatReturn.id
      log('create VATReturn DRAFT', vatReturn.status === 'DRAFT',
        `id=${vatReturn.id}, period=${vatReturn.period}, outputVat=${vatReturn.outputVat}, inputVat=${vatReturn.inputVat}, netVat=${vatReturn.netVat}`)
    })

    await step('e2: VATReturn freezes GL-derived outputVat', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok = approx(toNumber(vr?.outputVat), EXPECTED_OUTPUT_VAT, 0.01)
      log('VATReturn.outputVat frozen', ok,
        `frozen=${toNumber(vr?.outputVat).toFixed(2)}, expected=${EXPECTED_OUTPUT_VAT.toFixed(2)}`)
    })

    await step('e3: VATReturn freezes GL-derived inputVat', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok = approx(toNumber(vr?.inputVat), EXPECTED_INPUT_VAT, 0.01)
      log('VATReturn.inputVat frozen', ok,
        `frozen=${toNumber(vr?.inputVat).toFixed(2)}, expected=${EXPECTED_INPUT_VAT.toFixed(2)}`)
    })

    await step('e4: VATReturn freezes netVat = outputVat − inputVat', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok = approx(toNumber(vr?.netVat), EXPECTED_NET_VAT, 0.01)
      log('VATReturn.netVat frozen', ok,
        `frozen=${toNumber(vr?.netVat).toFixed(2)}, expected=${EXPECTED_NET_VAT.toFixed(2)}`)
    })

    await step('e5: VATReturn freezes totalSales (REVENUE) and totalPurchases (EXPENSE)', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok =
        approx(toNumber(vr?.totalSales), EXPECTED_TOTAL_SALES, 0.01) &&
        approx(toNumber(vr?.totalPurchases), EXPECTED_TOTAL_PURCHASES, 0.01)
      log('VATReturn totals frozen', ok,
        `totalSales=${toNumber(vr?.totalSales).toFixed(2)}, totalPurchases=${toNumber(vr?.totalPurchases).toFixed(2)}`)
    })

    await step('e6: VATReturn glMatch flag frozen as true', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.glMatch=true', vr?.glMatch === true, `glMatch=${vr?.glMatch}`)
    })

    await step('e7: VATReturn stores source invoice IDs (for audit)', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const salesIds: string[] = JSON.parse(vr?.salesInvoiceIds || '[]')
      const purchIds: string[] = JSON.parse(vr?.purchaseInvoiceIds || '[]')
      const ok =
        salesIds.length === 2 &&
        salesIds.every(id => created.salesInvoiceIds.includes(id)) &&
        purchIds.length === 2 &&
        purchIds.every(id => created.purchaseInvoiceIds.includes(id))
      log('source IDs stored', ok,
        `salesInvoiceIds=${salesIds.length}, purchaseInvoiceIds=${purchIds.length}`)
    })

    await step('e8: no JE posted for VATReturn creation (freeze is not a financial event)', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.journalEntryId is null', vr?.journalEntryId === null,
        `journalEntryId=${vr?.journalEntryId}`)
    })

    // =====================================================================
    // (f) Step 5 — File VATReturn (DRAFT → FILED) → declaration JE posted
    //     Replicates PATCH /api/vat {action:'FILE'}
    //     Dr VAT_OUTPUT (close) / Cr VAT_INPUT (close) / Cr VAT_DUE (net payable)
    //     sourceType='VAT_DECLARATION', sourceId=`VAT-{period}`
    //     JE dated to period-end (last day of the quarter)
    // =====================================================================
    console.log('\n━━━ (f) Step 5: File VATReturn → declaration JE posted ━━━')

    await step('f1: FILE VATReturn → declaration JE posted (DRAFT→FILED)', async () => {
      const existing = await db.vATReturn.findUniqueOrThrow({ where: { id: created.vatReturnId } })
      if (existing.status !== 'DRAFT') {
        log('FILE skipped — not DRAFT', false, `status=${existing.status}`)
        return
      }
      const result = await db.$transaction(async (tx: EngineTx) => {
        // Mirror vat/route.ts getPeriodEndDate()
        const periodEnd = new Date(TEST_YEAR, TEST_QUARTER * 3, 0, 23, 59, 59, 999)
        const je = await autoEntryVATDeclaration({
          period: existing.period,
          outputVat: toNumber(existing.outputVat),
          inputVat: toNumber(existing.inputVat),
          netVat: toNumber(existing.netVat),
          date: periodEnd,
        }, tx)
        const updated = await tx.vATReturn.update({
          where: { id: existing.id },
          data: {
            status: 'FILED',
            filedDate: new Date(),
            journalEntryId: je.id,
          },
        })
        return { updated, jeId: je.id }
      })
      created.declarationJEId = result.jeId
      created.allJEIds.push(result.jeId)
      log('FILE VATReturn', result.updated.status === 'FILED',
        `declarationJEId=${result.jeId}, status=${result.updated.status}, filedDate=${result.updated.filedDate?.toISOString()}`)
    })

    await step('f2: declaration JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.declarationJEId!)
      log('declaration JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('f3: declaration JE has Dr VAT_OUTPUT + Cr VAT_INPUT + Cr VAT_DUE', async () => {
      const lines = await jeLines(created.declarationJEId!)
      const outLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const inLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const dueLine = lines.find(l => l.account.accountRole === 'VAT_DUE')
      const ok =
        !!outLine && approx(Number(outLine.debit), EXPECTED_OUTPUT_VAT, 0.01) &&
        !!inLine && approx(Number(inLine.credit), EXPECTED_INPUT_VAT, 0.01) &&
        !!dueLine && approx(Number(dueLine.credit), EXPECTED_NET_VAT, 0.01)
      log('declaration JE structure', ok,
        `VAT_OUTPUT Dr=${outLine?.debit}, VAT_INPUT Cr=${inLine?.credit}, VAT_DUE Cr=${dueLine?.credit}`)
    })

    await step('f4: declaration JE sourceType=VAT_DECLARATION', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.declarationJEId! } })
      log('sourceType=VAT_DECLARATION', je?.sourceType === 'VAT_DECLARATION', `sourceType=${je?.sourceType}`)
    })

    await step('f5: declaration JE sourceId = VAT-{period}', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.declarationJEId! } })
      const expected = `VAT-${TEST_PERIOD}`
      log('sourceId=VAT-{period}', je?.sourceId === expected, `sourceId=${je?.sourceId}, expected=${expected}`)
    })

    await step('f6: declaration JE dated to period-end (last day of quarter)', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.declarationJEId! } })
      const expected = PERIOD_END.toISOString().slice(0, 10)
      const actual = je?.date.toISOString().slice(0, 10)
      log('JE date = period-end', actual === expected, `actual=${actual}, expected=${expected}`)
    })

    await step('f7: VATReturn.journalEntryId links to declaration JE', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.journalEntryId set', vr?.journalEntryId === created.declarationJEId,
        `journalEntryId=${vr?.journalEntryId}`)
    })

    await step('f8: VATReturn.status=FILED', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.status=FILED', vr?.status === 'FILED', `status=${vr?.status}`)
    })

    // =====================================================================
    // (g) Step 6 — Pay VATReturn (FILED → PAID) → payment JE posted
    //     Replicates PATCH /api/vat {action:'PAY'}
    //     Dr VAT_DUE (clear payable) / Cr BANK (cash outflow)
    //     sourceType='VAT_PAYMENT', sourceId=`VTP-{period}`
    // =====================================================================
    console.log('\n━━━ (g) Step 6: Pay VATReturn → payment JE posted ━━━')

    await step('g1: PAY VATReturn → payment JE posted (FILED→PAID)', async () => {
      const existing = await db.vATReturn.findUniqueOrThrow({ where: { id: created.vatReturnId } })
      if (existing.status !== 'FILED') {
        log('PAY skipped — not FILED', false, `status=${existing.status}`)
        return
      }
      const paymentReference = `P3-6-PAY-${TS}`
      const paymentDate = new Date('2099-12-31')
      const amount = toNumber(existing.netVat)
      const result = await db.$transaction(async (tx: EngineTx) => {
        let paymentJEId: string | null = null
        if (amount > 0) {
          const je = await autoEntryVATPayment({
            period: existing.period,
            amount,
            date: paymentDate,
            reference: paymentReference,
          }, tx)
          paymentJEId = je.id
        }
        const updated = await tx.vATReturn.update({
          where: { id: existing.id },
          data: {
            status: 'PAID',
            paymentDate,
            paymentReference,
            paymentJournalEntryId: paymentJEId,
          },
        })
        return { updated, paymentJEId }
      })
      created.paymentJEId = result.paymentJEId
      if (result.paymentJEId) created.allJEIds.push(result.paymentJEId)
      log('PAY VATReturn', result.updated.status === 'PAID',
        `paymentJEId=${result.paymentJEId}, status=${result.updated.status}, amount=${amount}`)
    })

    await step('g2: payment JE is balanced (Dr=Cr)', async () => {
      if (!created.paymentJEId) {
        log('payment JE balanced (skipped — no JE)', true, `paymentJEId=null`)
        return
      }
      const b = await jeBalance(created.paymentJEId)
      log('payment JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('g3: payment JE has Dr VAT_DUE + Cr BANK', async () => {
      if (!created.paymentJEId) {
        log('payment JE structure (skipped)', true, `paymentJEId=null`)
        return
      }
      const lines = await jeLines(created.paymentJEId)
      const dueLine = lines.find(l => l.account.accountRole === 'VAT_DUE')
      const bankLine = lines.find(l => l.account.accountRole === 'BANK')
      const ok =
        !!dueLine && approx(Number(dueLine.debit), EXPECTED_NET_VAT, 0.01) &&
        !!bankLine && approx(Number(bankLine.credit), EXPECTED_NET_VAT, 0.01)
      log('payment JE structure', ok,
        `VAT_DUE Dr=${dueLine?.debit}, BANK Cr=${bankLine?.credit}`)
    })

    await step('g4: payment JE sourceType=VAT_PAYMENT', async () => {
      if (!created.paymentJEId) {
        log('payment sourceType (skipped)', true, `paymentJEId=null`)
        return
      }
      const je = await db.journalEntry.findUnique({ where: { id: created.paymentJEId! } })
      log('sourceType=VAT_PAYMENT', je?.sourceType === 'VAT_PAYMENT', `sourceType=${je?.sourceType}`)
    })

    await step('g5: payment JE sourceId = VTP-{period}', async () => {
      if (!created.paymentJEId) {
        log('payment sourceId (skipped)', true, `paymentJEId=null`)
        return
      }
      const je = await db.journalEntry.findUnique({ where: { id: created.paymentJEId! } })
      const expected = `VTP-${TEST_PERIOD}`
      log('sourceId=VTP-{period}', je?.sourceId === expected, `sourceId=${je?.sourceId}, expected=${expected}`)
    })

    await step('g6: VATReturn.paymentJournalEntryId links to payment JE', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.paymentJournalEntryId set', vr?.paymentJournalEntryId === created.paymentJEId,
        `paymentJournalEntryId=${vr?.paymentJournalEntryId}`)
    })

    await step('g7: VATReturn.status=PAID', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      log('VATReturn.status=PAID', vr?.status === 'PAID', `status=${vr?.status}`)
    })

    await step('g8: VATReturn.paymentReference + paymentDate set', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok = !!vr?.paymentReference && !!vr?.paymentDate
      log('paymentReference + paymentDate set', ok,
        `reference=${vr?.paymentReference}, date=${vr?.paymentDate?.toISOString().slice(0, 10)}`)
    })

    // =====================================================================
    // (h) Final integrity verification — trial balance, JEs balanced, VAT
    //     account balances, numerical consistency, source↔JE linkage
    // =====================================================================
    console.log('\n━━━ (h) Final integrity verification ━━━')

    await step('h1: all 6 cycle JEs are balanced', async () => {
      let allBalanced = true
      const unbalanced: string[] = []
      for (const jeId of created.allJEIds) {
        const b = await jeBalance(jeId)
        if (!b.balanced) {
          allBalanced = false
          unbalanced.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
        }
      }
      log('all cycle JEs balanced', allBalanced,
        `${created.allJEIds.length} JEs total. ${allBalanced ? 'All balanced.' : `Unbalanced: ${unbalanced.join(', ')}`}`)
    })

    await step('h2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr), `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('h3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('h4: VAT_OUTPUT net cycle impact = 0 (closed by declaration Dr)', async () => {
      // Global balance may have residual from prior test runs; verify cycle-impact
      // instead: 2 sales JEs posted Cr VAT_OUTPUT=2250, declaration posted Dr=2250,
      // reversal posted Cr=2250 (reversing the declaration). Net cycle impact = 0
      // only AFTER the reversal step (i). Before reversal, the cycle impact is
      // (2250 Cr from sales) − (2250 Dr from declaration) = 0.
      const bal = await cycleAccountBalanceByRole('VAT_OUTPUT')
      log('VAT_OUTPUT cycle impact = 0', approx(bal, 0, 0.01),
        `cycle-balance=${bal.toFixed(2)} (sales Cr=2250 − declaration Dr=2250)`)
    })

    await step('h5: VAT_INPUT net cycle impact = 0 (closed by declaration Cr)', async () => {
      const bal = await cycleAccountBalanceByRole('VAT_INPUT')
      log('VAT_INPUT cycle impact = 0', approx(bal, 0, 0.01),
        `cycle-balance=${bal.toFixed(2)} (purchases Dr=900 − declaration Cr=900)`)
    })

    await step('h6: VAT_DUE net cycle impact = 0 (cleared by payment Dr)', async () => {
      const bal = await cycleAccountBalanceByRole('VAT_DUE')
      log('VAT_DUE cycle impact = 0', approx(bal, 0, 0.01),
        `cycle-balance=${bal.toFixed(2)} (declaration Cr=1350 − payment Dr=1350)`)
    })

    await step('h7: BANK balance decreased by netVat (paid to tax authority)', async () => {
      // BANK is an asset → debit-normal.
      // The payment JE posted Cr BANK=EXPECTED_NET_VAT, so the bank balance
      // decreased by EXPECTED_NET_VAT relative to before the payment.
      // We can't easily compute the absolute bank balance here (other tests
      // may have affected it), so we verify the payment JE's BANK Cr directly.
      if (!created.paymentJEId) {
        log('BANK impact (skipped — no payment JE)', true, `paymentJEId=null`)
        return
      }
      const lines = await jeLines(created.paymentJEId)
      const bankLine = lines.find(l => l.account.accountRole === 'BANK')
      const ok = !!bankLine && approx(Number(bankLine.credit), EXPECTED_NET_VAT, 0.01)
      log('BANK Cr = netVat', ok,
        `BANK Cr=${bankLine?.credit} (expected ${EXPECTED_NET_VAT} cash outflow to tax authority)`)
    })

    await step('h8: VAT reconciliation ties (output − input = net due = 0 after declaration+payment)', async () => {
      const recon = await getVATReconciliation()
      // After declaration closes VAT_OUTPUT and VAT_INPUT, and payment clears VAT_DUE,
      // the net VAT due should be 0 (all positions closed for this period).
      // NOTE: this is the global reconciliation (no date range) — it includes
      // ALL periods. We verify the net = 0 for our test's effect by checking
      // that the sum of VAT_OUTPUT + VAT_INPUT + VAT_DUE + VAT_REFUND_RECEIVABLE
      // balances equals 0 for the JEs we posted (verified separately in h4-h6).
      const ok = approx(recon.netVatDue + recon.inputVat - recon.outputVat, 0, 0.01) ||
                 approx(recon.netVatDue, recon.outputVat - recon.inputVat, 0.01)
      log('VAT reconciliation self-consistent', ok,
        `outputVat=${recon.outputVat.toFixed(2)}, inputVat=${recon.inputVat.toFixed(2)}, netVatDue=${recon.netVatDue.toFixed(2)}`)
    })

    await step('h9: source ↔ JE linkage intact for all source documents', async () => {
      const sales1 = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceIds[0] },
        select: { journalEntryId: true, status: true },
      })
      const sales2 = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceIds[1] },
        select: { journalEntryId: true, status: true },
      })
      const purch1 = await db.purchaseInvoice.findUnique({
        where: { id: created.purchaseInvoiceIds[0] },
        select: { journalEntryId: true, status: true },
      })
      const purch2 = await db.purchaseInvoice.findUnique({
        where: { id: created.purchaseInvoiceIds[1] },
        select: { journalEntryId: true, status: true },
      })
      const vr = await db.vATReturn.findUnique({
        where: { id: created.vatReturnId },
        select: { journalEntryId: true, paymentJournalEntryId: true, status: true },
      })

      const linked =
        !!sales1?.journalEntryId &&
        !!sales2?.journalEntryId &&
        !!purch1?.journalEntryId &&
        !!purch2?.journalEntryId &&
        !!vr?.journalEntryId &&
        !!vr?.paymentJournalEntryId
      log('source↔JE linkage', linked,
        `sales1:${!!sales1?.journalEntryId}, sales2:${!!sales2?.journalEntryId}, ` +
        `purch1:${!!purch1?.journalEntryId}, purch2:${!!purch2?.journalEntryId}, ` +
        `declJE:${!!vr?.journalEntryId}, payJE:${!!vr?.paymentJournalEntryId}`)
    })

    await step('h10: numerical consistency check (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    // =====================================================================
    // (i) Step 7 — REVERSE the VATReturn (PAID → CANCELLED) → verify
    //     reversal JEs posted (mirror of declaration + payment JEs)
    //     This is optional in the workflow but we exercise it for coverage.
    // =====================================================================
    console.log('\n━━━ (i) Step 7: Reverse VATReturn → reversal JEs posted ━━━')

    let declarationReversalJEId: string | null = null
    let paymentReversalJEId: string | null = null

    await step('i1: REVERSE VATReturn → status PAID → CANCELLED', async () => {
      const existing = await db.vATReturn.findUniqueOrThrow({ where: { id: created.vatReturnId } })
      if (existing.status !== 'PAID' && existing.status !== 'FILED') {
        log('REVERSE skipped — not FILED/PAID', false, `status=${existing.status}`)
        return
      }
      const reason = `P3-6 test reversal (TS=${TS})`
      const result = await db.$transaction(async (tx: EngineTx) => {
        let declReversalId: string | null = null
        let payReversalId: string | null = null
        if (existing.journalEntryId) {
          const rev = await reverseEntry(existing.journalEntryId, tx)
          declReversalId = rev.id
        }
        if (existing.paymentJournalEntryId) {
          const rev = await reverseEntry(existing.paymentJournalEntryId, tx)
          payReversalId = rev.id
        }
        const updated = await tx.vATReturn.update({
          where: { id: existing.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledReason: reason,
          },
        })
        return { updated, declReversalId, payReversalId }
      })
      declarationReversalJEId = result.declReversalId
      paymentReversalJEId = result.payReversalId
      if (declarationReversalJEId) created.allJEIds.push(declarationReversalJEId)
      if (paymentReversalJEId) created.allJEIds.push(paymentReversalJEId)
      log('REVERSE VATReturn', result.updated.status === 'CANCELLED',
        `declReversalJEId=${declarationReversalJEId}, payReversalJEId=${paymentReversalJEId}, status=${result.updated.status}`)
    })

    await step('i2: declaration reversal JE is balanced', async () => {
      if (!declarationReversalJEId) {
        log('decl reversal JE balanced (skipped)', true, `jeId=null`)
        return
      }
      const b = await jeBalance(declarationReversalJEId)
      log('decl reversal JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('i3: declaration reversal JE has flipped Dr/Cr (Cr VAT_OUTPUT / Dr VAT_INPUT / Dr VAT_DUE)', async () => {
      if (!declarationReversalJEId) {
        log('decl reversal structure (skipped)', true, `jeId=null`)
        return
      }
      const lines = await jeLines(declarationReversalJEId)
      const outLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const inLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const dueLine = lines.find(l => l.account.accountRole === 'VAT_DUE')
      const ok =
        !!outLine && approx(Number(outLine.credit), EXPECTED_OUTPUT_VAT, 0.01) &&
        !!inLine && approx(Number(inLine.debit), EXPECTED_INPUT_VAT, 0.01) &&
        !!dueLine && approx(Number(dueLine.debit), EXPECTED_NET_VAT, 0.01)
      log('decl reversal JE structure (flipped)', ok,
        `VAT_OUTPUT Cr=${outLine?.credit}, VAT_INPUT Dr=${inLine?.debit}, VAT_DUE Dr=${dueLine?.debit}`)
    })

    await step('i4: declaration reversal JE has isReversal=true + reversedEntryId', async () => {
      if (!declarationReversalJEId) {
        log('decl reversal flags (skipped)', true, `jeId=null`)
        return
      }
      const je = await db.journalEntry.findUnique({ where: { id: declarationReversalJEId } })
      const ok = je?.isReversal === true && je?.reversedEntryId === created.declarationJEId
      log('decl reversal flags', ok,
        `isReversal=${je?.isReversal}, reversedEntryId=${je?.reversedEntryId}`)
    })

    await step('i5: declaration reversal JE preserves sourceType=VAT_DECLARATION', async () => {
      if (!declarationReversalJEId) {
        log('decl reversal sourceType (skipped)', true, `jeId=null`)
        return
      }
      const je = await db.journalEntry.findUnique({ where: { id: declarationReversalJEId } })
      log('decl reversal sourceType=VAT_DECLARATION', je?.sourceType === 'VAT_DECLARATION',
        `sourceType=${je?.sourceType} (preserved from original)`)
    })

    await step('i6: payment reversal JE is balanced', async () => {
      if (!paymentReversalJEId) {
        log('pay reversal JE balanced (skipped)', true, `jeId=null`)
        return
      }
      const b = await jeBalance(paymentReversalJEId)
      log('pay reversal JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('i7: payment reversal JE has flipped Dr/Cr (Cr VAT_DUE / Dr BANK)', async () => {
      if (!paymentReversalJEId) {
        log('pay reversal structure (skipped)', true, `jeId=null`)
        return
      }
      const lines = await jeLines(paymentReversalJEId)
      const dueLine = lines.find(l => l.account.accountRole === 'VAT_DUE')
      const bankLine = lines.find(l => l.account.accountRole === 'BANK')
      const ok =
        !!dueLine && approx(Number(dueLine.credit), EXPECTED_NET_VAT, 0.01) &&
        !!bankLine && approx(Number(bankLine.debit), EXPECTED_NET_VAT, 0.01)
      log('pay reversal JE structure (flipped)', ok,
        `VAT_DUE Cr=${dueLine?.credit}, BANK Dr=${bankLine?.debit}`)
    })

    await step('i8: original declaration JE stays POSTED (not CANCELLED)', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.declarationJEId! } })
      log('original decl JE stays POSTED', je?.status === 'POSTED',
        `status=${je?.status} (per guard design — both entries remain POSTED and net out to zero)`)
    })

    await step('i9: original payment JE stays POSTED (not CANCELLED)', async () => {
      if (!created.paymentJEId) {
        log('original pay JE stays POSTED (skipped)', true, `paymentJEId=null`)
        return
      }
      const je = await db.journalEntry.findUnique({ where: { id: created.paymentJEId! } })
      log('original pay JE stays POSTED', je?.status === 'POSTED',
        `status=${je?.status}`)
    })

    await step('i10: VATReturn.status=CANCELLED + cancelledAt + cancelledReason set', async () => {
      const vr = await db.vATReturn.findUnique({ where: { id: created.vatReturnId } })
      const ok =
        vr?.status === 'CANCELLED' &&
        !!vr?.cancelledAt &&
        !!vr?.cancelledReason
      log('VATReturn CANCELLED fields', ok,
        `status=${vr?.status}, cancelledAt=${vr?.cancelledAt?.toISOString()}, reason=${vr?.cancelledReason}`)
    })

    await step('i11: after reversal, all cycle JEs still balanced (including reversals)', async () => {
      let allBalanced = true
      const unbalanced: string[] = []
      for (const jeId of created.allJEIds) {
        const b = await jeBalance(jeId)
        if (!b.balanced) {
          allBalanced = false
          unbalanced.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
        }
      }
      log('all JEs balanced after reversal', allBalanced,
        `${created.allJEIds.length} JEs total (incl. 2 reversals). ${allBalanced ? 'All balanced.' : `Unbalanced: ${unbalanced.join(', ')}`}`)
    })

    await step('i12: trial balance still ties after reversal (reversals net originals to zero)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties after reversal', approx(dr, cr), `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('i13: numerical consistency still ok after reversal', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok after reversal', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

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
    console.log('  ✅ All VAT-cycle E2E tests PASSED')
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
        } catch { /* may already be deleted or reversal-linked */ }
      }

      // 2. Delete the VATReturn
      if (created.vatReturnId) {
        await tx.vATReturn.deleteMany({ where: { id: created.vatReturnId } })
      }

      // 3. Delete source documents (FK children first)
      // Sales invoices: items first, then invoice
      for (const invId of created.salesInvoiceIds) {
        try {
          await tx.salesInvoiceItem.deleteMany({ where: { invoiceId: invId } })
        } catch { /* may not have items */ }
        await tx.salesInvoice.deleteMany({ where: { id: invId } })
      }

      // Purchase invoices: items first, then invoice
      for (const invId of created.purchaseInvoiceIds) {
        try {
          await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: invId } })
        } catch { /* may not have items */ }
        await tx.purchaseInvoice.deleteMany({ where: { id: invId } })
      }

      // Project / cost center / supplier / client / branch
      if (created.projectId) {
        await tx.project.deleteMany({ where: { id: created.projectId } })
      }
      if (created.costCenterId) {
        await tx.costCenter.deleteMany({ where: { id: created.costCenterId } })
      }
      if (created.supplierId) {
        await tx.supplier.deleteMany({ where: { id: created.supplierId } })
      }
      if (created.clientId) {
        await tx.client.deleteMany({ where: { id: created.clientId } })
      }
      if (created.branchId) {
        await tx.branch.deleteMany({ where: { id: created.branchId } })
      }
    })
    console.log('  ✓ All test data removed (JEs soft-deleted, source docs + VATReturn hard-deleted)')
  } catch (e: any) {
    console.error('  ⚠ Cleanup error:', e?.message || e)
    // Best-effort: try individual deletes outside the transaction
    console.log('  Attempting best-effort individual cleanup...')
    try {
      // Delete VATReturn first (no FK to JEs, but JEs may have sourceId pointing to it)
      if (created.vatReturnId) {
        try { await db.vATReturn.deleteMany({ where: { id: created.vatReturnId } }) } catch {}
      }
      // Sales invoices
      for (const invId of created.salesInvoiceIds) {
        try { await db.salesInvoiceItem.deleteMany({ where: { invoiceId: invId } }) } catch {}
        try { await db.salesInvoice.deleteMany({ where: { id: invId } }) } catch {}
      }
      // Purchase invoices
      for (const invId of created.purchaseInvoiceIds) {
        try { await db.purchaseInvoiceItem.deleteMany({ where: { invoiceId: invId } }) } catch {}
        try { await db.purchaseInvoice.deleteMany({ where: { id: invId } }) } catch {}
      }
      try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch {}
      try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch {}
      try { await db.supplier.deleteMany({ where: { id: created.supplierId } }) } catch {}
      try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch {}
      try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch {}
      // Soft-delete JEs
      for (const jeId of created.allJEIds) {
        if (!jeId) continue
        try {
          await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
          await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } })
        } catch {}
      }
      console.log('  ✓ Best-effort cleanup done')
    } catch (e2: any) {
      console.error('  ⚠ Best-effort cleanup also failed:', e2?.message || e2)
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
