// ============================================================================
// P3-1 E2E: Construction Project Cycle — End-to-End Test
// ============================================================================
// Walks the full construction project business cycle:
//   1. Create prerequisites (Branch, Client, Subcontractor, CostCenter)
//   2. Create Project (PLANNING → ACTIVE)
//   3. Create Contract (DRAFT → ACTIVE)
//   4. Create BOQ items (4 items)
//   5. Create Expense → verify JE posted
//   6. Create Labor Cost → verify JE posted
//   7. Create Subcontractor Invoice → verify JE posted
//   8. Create Progress Claim (DRAFT) → verify status
//   9. Transition claim DRAFT → SUBMITTED → APPROVED → verify no JE (by design)
//  10. Create Sales Invoice from claim (DRAFT) → verify no JE yet
//  11. Transition invoice DRAFT → SENT → verify JE posted
//  12. Create Client Payment → verify JE posted + invoice becomes PAID
//  13. Run IFRS 15 Revenue Recognition → verify JE posted
//  14. Final verification: trial balance ties, all JEs balanced, project
//      profitability report reflects costs/revenue, source↔JE linkage intact.
//
// All test data is wrapped in try/finally — cleanup deletes every created
// record (and reverses any JEs that survived mid-flow failures).
//
// Run: bun scripts/e2e-construction-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import { getNextEntryNo } from '@/lib/accounting/guard'
import {
  createExpenseJournalEntry,
  createSalesInvoiceJournalEntry,
  createClientPaymentJournalEntry,
} from '@/lib/auto-journal'
import {
  autoEntryLaborCost,
  autoEntrySubcontractorInvoice,
  type PrismaTransaction as EngineTx,
} from '@/lib/accounting/engine'
import { autoEntryIFRS15Revenue } from '@/lib/accounting/ifrs15'
import {
  getTrialBalance,
  getProjectCostBreakdown,
  getProjectBalances,
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
const PREFIX = 'P3CON'

const created = {
  branchId: '' as string,
  clientId: '' as string,
  subcontractorId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,
  contractId: '' as string,
  boqItemIds: [] as string[],
  expenseId: '' as string,
  expenseJEId: '' as string,
  laborCostId: '' as string,
  laborCostJEId: '' as string,
  subInvoiceId: '' as string,
  subInvoiceJEId: '' as string,
  progressClaimId: '' as string,
  salesInvoiceId: '' as string,
  salesInvoiceJEId: '' as string,
  clientPaymentId: '' as string,
  clientPaymentJEId: '' as string,
  ifrs15JEId: '' as string | null,
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
  console.log('  P3-1 E2E: Construction Project Cycle — End-to-End Test')
  console.log('  Tests the full business cycle from project creation through')
  console.log('  IFRS-15 revenue recognition, with JE verification at each step.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, Subcontractor, CostCenter
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-1 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: { code: `${PREFIX}-CL-${TS}`, name: `P3-1 Test Client`, isActive: true, taxNumber: '300000000000003' },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test Subcontractor', async () => {
      const s = await db.subcontractor.create({
        data: { code: `${PREFIX}-SC-${TS}`, name: `P3-1 Test Subcontractor`, isActive: true, taxNumber: '300000000000004' },
      })
      created.subcontractorId = s.id
      log('create Subcontractor', !!s.id, `code=${s.code}`)
    })

    await step('a4: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-1 Project Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    // =====================================================================
    // (b) Step 1 — Create Project (PLANNING) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create Project (no JE expected) ━━━')

    await step('b1: create project PLANNING with contractValue=1,000,000', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-1 Construction Project`,
          nameAr: `مشروع P3-1 التنفيذي`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'PLANNING',
          contractValue: 1_000_000,
          projectType: 'CONSTRUCTION',
          estimatedTotalCost: 800_000, // for IFRS-15 POC
          description: `P3-1 e2e construction cycle test (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `id=${p.id}, code=${p.code}, status=${p.status}, costCenterId=${p.costCenterId}`)
    })

    await step('b2: transition project PLANNING → ACTIVE', async () => {
      const p = await db.project.update({ where: { id: created.projectId }, data: { status: 'ACTIVE' } })
      log('project → ACTIVE', p.status === 'ACTIVE', `status=${p.status}`)
    })

    await step('b3: confirm no JE posted for project creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'PROJECT', sourceId: created.projectId, deletedAt: null },
      })
      log('no JE for project', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (c) Step 2 — Create Contract (DRAFT → ACTIVE) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Create Contract (no JE expected) ━━━')

    await step('c1: create contract DRAFT with value=1,000,000, vatRate=0.15', async () => {
      const value = 1_000_000
      const vatRate = 0.15
      const vatAmount = Math.round(value * vatRate * 100) / 100
      const totalValue = Math.round((value + vatAmount) * 100) / 100
      const c = await db.contract.create({
        data: {
          projectId: created.projectId,
          contractNo: `${PREFIX}-CTR-${TS}`,
          date: new Date('2025-01-05'),
          value,
          vatRate,
          vatAmount,
          totalValue,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-12-31'),
          status: 'DRAFT',
          contractType: 'PROJECT',
          clientId: created.clientId,
          billingMethod: 'PROGRESS_CLAIMS',
          projectLocation: 'Test Site',
        },
      })
      created.contractId = c.id
      log('create Contract', !!c.id, `contractNo=${c.contractNo}, value=${c.value}, status=${c.status}`)
    })

    await step('c2: transition contract DRAFT → ACTIVE', async () => {
      const c = await db.contract.update({ where: { id: created.contractId }, data: { status: 'ACTIVE' } })
      log('contract → ACTIVE', c.status === 'ACTIVE', `status=${c.status}`)
    })

    await step('c3: confirm no JE posted for contract creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'CONTRACT', sourceId: created.contractId, deletedAt: null },
      })
      log('no JE for contract', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (d) Step 3 — Create BOQ items (planning) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (d) Step 3: Create BOQ items (no JE expected) ━━━')

    await step('d1: create 4 BOQ items totaling 1,000,000', async () => {
      const items = [
        { code: 'EX-001', description: 'أعمال الحفر', unit: 'م³', quantity: 5000, unitPrice: 30, category: 'EARTHWORK' },
        { code: 'CO-001', description: 'خرسانة مسلحة', unit: 'م³', quantity: 1000, unitPrice: 500, category: 'CONCRETE' },
        { code: 'EL-001', description: 'أعمال كهربائية', unit: 'نقطة', quantity: 500, unitPrice: 200, category: 'ELECTRICAL' },
        { code: 'FN-001', description: 'تشطيبات', unit: 'م²', quantity: 2500, unitPrice: 100, category: 'FINISHES' },
      ]
      let total = 0
      for (const it of items) {
        const created_item = await db.bOQItem.create({
          data: {
            projectId: created.projectId,
            code: it.code,
            description: it.description,
            unit: it.unit,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.quantity * it.unitPrice,
            category: it.category,
          },
        })
        created.boqItemIds.push(created_item.id)
        total += it.quantity * it.unitPrice
      }
      log('create 4 BOQ items', approx(total, 1_000_000), `total=${total} (expected 1,000,000)`)
    })

    await step('d2: confirm no JE posted for BOQ', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'BOQ', sourceId: { in: created.boqItemIds }, deletedAt: null },
      })
      log('no JE for BOQ', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (e) Step 4a — Create Expense (PROJECT) → verify JE posted
    //     Dr PROJECT_COST (7110) + Dr VAT_INPUT (3120) / Cr CASH (1110)
    //     amount=10,000, vatRate=0.15 → vatAmount=1,500, total=11,500
    // =====================================================================
    console.log('\n━━━ (e) Step 4a: Create Expense → verify JE ━━━')

    const EXPENSE_AMOUNT = 10_000
    const EXPENSE_VAT = Math.round(EXPENSE_AMOUNT * 0.15 * 100) / 100 // 1500
    const EXPENSE_TOTAL = EXPENSE_AMOUNT + EXPENSE_VAT                  // 11500

    await step('e1: create Expense + JE (Dr PROJECT_COST + VAT_INPUT / Cr CASH)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const expense = await tx.expense.create({
          data: {
            projectId: created.projectId,
            costCenterId: created.costCenterId,
            expenseType: 'PROJECT',
            activityType: 'EXECUTION',
            category: 'CONSUMABLES',
            description: 'P3-1 test expense: concrete materials',
            amount: EXPENSE_AMOUNT,
            vatRate: 0.15,
            vatAmount: EXPENSE_VAT,
            totalAmount: EXPENSE_TOTAL,
            date: new Date('2025-02-01'),
            reference: 'P3-1-EXP-001',
            payFrom: 'TREASURY',
          },
        })
        created.expenseId = expense.id

        await createExpenseJournalEntry(expense.id, tx)

        return await tx.expense.findUniqueOrThrow({
          where: { id: expense.id },
          select: { id: true, journalEntryId: true },
        })
      })
      created.expenseJEId = result.journalEntryId!
      created.allJEIds.push(created.expenseJEId)
      log('create Expense + JE', !!created.expenseJEId, `expenseId=${created.expenseId}, jeId=${created.expenseJEId}`)
    })

    await step('e2: expense JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.expenseJEId)
      log('expense JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('e3: expense JE has correct accounts (PROJECT_COST/VAT_INPUT/CASH)', async () => {
      const lines = await jeLines(created.expenseJEId)
      const roles = lines.map(l => l.account.accountRole).sort()
      const hasPROJECT_COST = roles.includes('PROJECT_COST')
      const hasVAT_INPUT = roles.includes('VAT_INPUT')
      const hasCASH = roles.includes('CASH')
      log('expense JE accounts', hasPROJECT_COST && hasVAT_INPUT && hasCASH,
        `roles=[${roles.join(',')}]`)
    })

    await step('e4: expense JE sourceType=EXPENSE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.expenseJEId } })
      log('sourceType=EXPENSE', je?.sourceType === 'EXPENSE', `sourceType=${je?.sourceType}`)
    })

    await step('e5: expense JE lines tagged to project cost center', async () => {
      const lines = await db.journalLine.findMany({
        where: { journalEntryId: created.expenseJEId, deletedAt: null },
        select: { costCenterId: true },
      })
      const allTagged = lines.every(l => l.costCenterId === created.costCenterId)
      log('all lines tagged', allTagged, `${lines.length} lines, all point to CC=${created.costCenterId}`)
    })

    // =====================================================================
    // (f) Step 4b — Create Labor Cost → verify JE posted
    //     Dr LABOR_COST (7120) / Cr CASH (1110)
    //     5 workers × 10 days × 200 = 10,000
    // =====================================================================
    console.log('\n━━━ (f) Step 4b: Create Labor Cost → verify JE ━━━')

    const LABOR_WORKERS = 5
    const LABOR_DAYS = 10
    const LABOR_RATE = 200
    const LABOR_TOTAL = LABOR_WORKERS * LABOR_DAYS * LABOR_RATE // 10000

    await step('f1: create LaborCost + JE (Dr LABOR_COST / Cr CASH)', async () => {
      const result = await db.$transaction(async (tx: EngineTx) => {
        const project = await tx.project.findUnique({
          where: { id: created.projectId },
          select: { id: true, code: true, costCenterId: true },
        })
        const laborCost = await tx.laborCost.create({
          data: {
            projectId: created.projectId,
            description: 'P3-1 test labor: concrete pouring crew',
            workers: LABOR_WORKERS,
            days: LABOR_DAYS,
            dailyRate: LABOR_RATE,
            totalAmount: LABOR_TOTAL,
            date: new Date('2025-02-05'),
            paymentSource: 'CASH',
          },
        })
        created.laborCostId = laborCost.id

        const je = await autoEntryLaborCost({
          description: laborCost.description,
          amount: Number(laborCost.totalAmount),
          date: laborCost.date,
          costCenterId: project?.costCenterId || undefined,
          paymentSource: 'CASH',
        }, tx)

        if (je) {
          await tx.laborCost.update({
            where: { id: laborCost.id },
            data: { journalEntryId: je.id },
          })
        }
        return await tx.laborCost.findUniqueOrThrow({
          where: { id: laborCost.id },
          select: { id: true, journalEntryId: true },
        })
      })
      created.laborCostJEId = result.journalEntryId!
      created.allJEIds.push(created.laborCostJEId)
      log('create LaborCost + JE', !!created.laborCostJEId, `laborCostId=${created.laborCostId}, jeId=${created.laborCostJEId}`)
    })

    await step('f2: labor cost JE is balanced', async () => {
      const b = await jeBalance(created.laborCostJEId)
      log('labor JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('f3: labor cost JE has LABOR_COST Dr + CASH Cr, amount=10000', async () => {
      const lines = await jeLines(created.laborCostJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'LABOR_COST' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), LABOR_TOTAL) &&
        approx(Number(crLine.credit), LABOR_TOTAL)
      log('labor JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('f4: labor cost JE sourceType=LABOR_COST', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.laborCostJEId } })
      log('sourceType=LABOR_COST', je?.sourceType === 'LABOR_COST', `sourceType=${je?.sourceType}`)
    })

    // =====================================================================
    // (g) Step 4c — Create Subcontractor Invoice → verify JE posted
    //     Dr SUBCONTRACTOR_COST (7130) + Dr VAT_INPUT (3120) / Cr SUBCONTRACTOR_AP (3220)
    //     amount=50,000, vatRate=0.15 → vat=7,500, total=57,500
    // =====================================================================
    console.log('\n━━━ (g) Step 4c: Create Subcontractor Invoice → verify JE ━━━')

    const SUB_AMOUNT = 50_000
    const SUB_VAT = Math.round(SUB_AMOUNT * 0.15 * 100) / 100 // 7500
    const SUB_TOTAL = SUB_AMOUNT + SUB_VAT                     // 57500

    await step('g1: create SubcontractorInvoice + JE', async () => {
      const result = await db.$transaction(async (tx: EngineTx) => {
        const project = await tx.project.findUnique({
          where: { id: created.projectId },
          select: { costCenterId: true },
        })
        const invoice = await tx.subcontractorInvoice.create({
          data: {
            subcontractorId: created.subcontractorId,
            projectId: created.projectId,
            invoiceNo: `${PREFIX}-SUB-${TS}`,
            date: new Date('2025-02-10'),
            amount: SUB_AMOUNT,
            vatRate: 0.15,
            vatAmount: SUB_VAT,
            totalAmount: SUB_TOTAL,
            paidAmount: 0,
            status: 'SENT',
            description: 'P3-1 test subcontractor invoice: MEP works',
          },
        })
        created.subInvoiceId = invoice.id

        const je = await autoEntrySubcontractorInvoice({
          invoiceNo: invoice.invoiceNo,
          subcontractorName: 'P3-1 Test Subcontractor',
          amount: SUB_AMOUNT,
          vatRate: 0.15,
          vatAmount: SUB_VAT,
          totalAmount: SUB_TOTAL,
          date: invoice.date,
          costCenterId: project?.costCenterId || undefined,
        }, tx)

        await tx.subcontractorInvoice.update({
          where: { id: invoice.id },
          data: { journalEntryId: je.id },
        })
        return await tx.subcontractorInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          select: { id: true, journalEntryId: true, status: true },
        })
      })
      created.subInvoiceJEId = result.journalEntryId!
      created.allJEIds.push(created.subInvoiceJEId)
      log('create SubInvoice + JE', !!created.subInvoiceJEId,
        `invoiceId=${created.subInvoiceId}, jeId=${created.subInvoiceJEId}, status=${result.status}`)
    })

    await step('g2: subcontractor invoice JE is balanced', async () => {
      const b = await jeBalance(created.subInvoiceJEId)
      log('subInv JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('g3: subcontractor invoice JE has correct accounts + amounts', async () => {
      const lines = await jeLines(created.subInvoiceJEId)
      const costLine = lines.find(l => l.account.accountRole === 'SUBCONTRACTOR_COST')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const apLine = lines.find(l => l.account.accountRole === 'SUBCONTRACTOR_AP')
      const ok =
        !!costLine && approx(Number(costLine.debit), SUB_AMOUNT) &&
        !!vatLine && approx(Number(vatLine.debit), SUB_VAT) &&
        !!apLine && approx(Number(apLine.credit), SUB_TOTAL)
      log('subInv JE structure', ok,
        `cost=${costLine?.debit}, vat=${vatLine?.debit}, ap=${apLine?.credit}`)
    })

    await step('g4: subcontractor invoice JE sourceType=SUBCONTRACTOR_INVOICE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.subInvoiceJEId } })
      log('sourceType=SUBCONTRACTOR_INVOICE', je?.sourceType === 'SUBCONTRACTOR_INVOICE', `sourceType=${je?.sourceType}`)
    })

    // =====================================================================
    // (h) Step 5 — Create Progress Claim (DRAFT) → verify NO JE
    //     amount=200,000 (20% of 1,000,000 contract value)
    // =====================================================================
    console.log('\n━━━ (h) Step 5: Create Progress Claim (DRAFT, no JE) ━━━')

    const CLAIM_AMOUNT = 200_000
    const CLAIM_PERCENTAGE = 20
    const CLAIM_VAT = Math.round(CLAIM_AMOUNT * 0.15 * 100) / 100 // 30000
    const CLAIM_TOTAL = CLAIM_AMOUNT + CLAIM_VAT                   // 230000

    await step('h1: create ProgressClaim DRAFT', async () => {
      const claim = await db.progressClaim.create({
        data: {
          projectId: created.projectId,
          contractId: created.contractId,
          claimNo: `${PREFIX}-PCL-${TS}`,
          date: new Date('2025-03-01'),
          percentage: CLAIM_PERCENTAGE,
          amount: CLAIM_AMOUNT,
          vatRate: 0.15,
          vatAmount: CLAIM_VAT,
          totalAmount: CLAIM_TOTAL,
          status: 'DRAFT',
          invoiced: false,
        },
      })
      created.progressClaimId = claim.id
      log('create Claim DRAFT', claim.status === 'DRAFT', `claimNo=${claim.claimNo}, amount=${claim.amount}, status=${claim.status}`)
    })

    await step('h2: confirm no JE posted for claim creation (by design)', async () => {
      const claim = await db.progressClaim.findUnique({
        where: { id: created.progressClaimId },
        select: { journalEntryId: true },
      })
      log('claim journalEntryId is null', claim?.journalEntryId === null, `journalEntryId=${claim?.journalEntryId}`)
    })

    // =====================================================================
    // (i) Step 5b — Transition claim DRAFT → SUBMITTED → APPROVED → NO JE
    // =====================================================================
    console.log('\n━━━ (i) Step 5b: Transition claim DRAFT → SUBMITTED → APPROVED ━━━')

    await step('i1: transition claim DRAFT → SUBMITTED', async () => {
      const c = await db.progressClaim.update({
        where: { id: created.progressClaimId },
        data: { status: 'SUBMITTED' },
      })
      log('claim → SUBMITTED', c.status === 'SUBMITTED', `status=${c.status}`)
    })

    await step('i2: transition claim SUBMITTED → APPROVED (sets approvedDate)', async () => {
      const c = await db.progressClaim.update({
        where: { id: created.progressClaimId },
        data: { status: 'APPROVED', approvedDate: new Date() },
      })
      log('claim → APPROVED', c.status === 'APPROVED', `status=${c.status}, approvedDate=${c.approvedDate?.toISOString()}`)
    })

    await step('i3: confirm still no JE after APPROVED (revenue recognized at invoicing)', async () => {
      const claim = await db.progressClaim.findUnique({
        where: { id: created.progressClaimId },
        select: { journalEntryId: true },
      })
      log('claim journalEntryId still null', claim?.journalEntryId === null, `journalEntryId=${claim?.journalEntryId}`)
    })

    // =====================================================================
    // (j) Step 6 — Create Sales Invoice from claim (DRAFT) → verify no JE yet
    //     Then transition DRAFT → SENT → verify JE posted
    // =====================================================================
    console.log('\n━━━ (j) Step 6: Create Sales Invoice from claim, then DRAFT → SENT ━━━')

    await step('j1: create SalesInvoice from claim (DRAFT, no JE yet)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Generate PCL-YYYY-NNNN invoice number (mirrors route logic)
        const prefix = 'PCL'
        const year = new Date().getFullYear()
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
            contractId: created.contractId,
            date: new Date('2025-03-05'),
            dueDate: new Date('2025-04-05'),
            subtotal: CLAIM_AMOUNT,
            discountRate: 0,
            discountAmount: 0,
            netAmount: CLAIM_AMOUNT,
            vatRate: 0.15,
            vatAmount: CLAIM_VAT,
            totalAmount: CLAIM_TOTAL,
            paidAmount: 0,
            status: 'DRAFT',
            invoiceType: 'PROGRESS_CLAIM',
            sourceType: 'EXTRACT',
            progressClaimId: created.progressClaimId,
            contractNo: `${PREFIX}-CTR-${TS}`,
            notes: `P3-1 invoice from claim ${PREFIX}-PCL-${TS}`,
          },
        })

        // Mark claim as invoiced (mirror of route logic)
        await tx.progressClaim.update({
          where: { id: created.progressClaimId },
          data: { invoiced: true },
        })
        return invoice
      })
      created.salesInvoiceId = result.id
      log('create SalesInvoice DRAFT', result.status === 'DRAFT',
        `invoiceNo=${result.invoiceNo}, total=${result.totalAmount}, status=${result.status}`)
    })

    await step('j2: confirm DRAFT invoice has no JE yet (P6-CRIT-002 fix)', async () => {
      const inv = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceId },
        select: { journalEntryId: true },
      })
      log('DRAFT invoice journalEntryId is null', inv?.journalEntryId === null, `journalEntryId=${inv?.journalEntryId}`)
    })

    await step('j3: transition invoice DRAFT → SENT → JE posted', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        await createSalesInvoiceJournalEntry(created.salesInvoiceId, tx)
        const refreshed = await tx.salesInvoice.findUnique({
          where: { id: created.salesInvoiceId },
          select: { journalEntryId: true },
        })
        await tx.salesInvoice.update({
          where: { id: created.salesInvoiceId },
          data: { status: 'SENT' },
        })
        return refreshed
      })
      created.salesInvoiceJEId = result.journalEntryId!
      created.allJEIds.push(created.salesInvoiceJEId)
      log('SENT invoice has JE', !!created.salesInvoiceJEId, `jeId=${created.salesInvoiceJEId}`)
    })

    await step('j4: sales invoice JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.salesInvoiceJEId)
      log('salesInv JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('j5: sales invoice JE has correct accounts + amounts', async () => {
      const lines = await jeLines(created.salesInvoiceJEId)
      const arLine = lines.find(l => l.account.accountRole === 'CUSTOMER_AR')
      const revLine = lines.find(l => l.account.accountRole === 'PROJECT_REVENUE')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const ok =
        !!arLine && approx(Number(arLine.debit), CLAIM_TOTAL) &&
        !!revLine && approx(Number(revLine.credit), CLAIM_AMOUNT) &&
        !!vatLine && approx(Number(vatLine.credit), CLAIM_VAT)
      log('salesInv JE structure', ok,
        `AR Dr=${arLine?.debit}, Rev Cr=${revLine?.credit}, VAT Cr=${vatLine?.credit}`)
    })

    await step('j6: sales invoice JE sourceType=SALES_INVOICE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.salesInvoiceJEId } })
      log('sourceType=SALES_INVOICE', je?.sourceType === 'SALES_INVOICE', `sourceType=${je?.sourceType}`)
    })

    await step('j7: claim marked invoiced=true', async () => {
      const c = await db.progressClaim.findUnique({
        where: { id: created.progressClaimId },
        select: { invoiced: true },
      })
      log('claim.invoiced=true', c?.invoiced === true, `invoiced=${c?.invoiced}`)
    })

    // =====================================================================
    // (k) Step 7 — Create Client Payment → verify JE + invoice becomes PAID
    //     amount=CLAIM_TOTAL (full payment) → invoice status: SENT → PAID
    // =====================================================================
    console.log('\n━━━ (k) Step 7: Create Client Payment → verify JE + PAID ━━━')

    await step('k1: create ClientPayment + JE (Dr CASH / Cr CUSTOMER_AR)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const payment = await tx.clientPayment.create({
          data: {
            clientId: created.clientId,
            invoiceId: created.salesInvoiceId,
            amount: CLAIM_TOTAL,
            date: new Date('2025-03-15'),
            receivedIn: 'TREASURY',
            reference: 'P3-1-PAY-001',
            notes: 'P3-1 full payment for progress claim invoice',
          },
        })
        created.clientPaymentId = payment.id

        await createClientPaymentJournalEntry(payment.id, tx)

        // Update invoice paidAmount + status (mirror of route logic)
        const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: created.salesInvoiceId } })
        const newPaid = toNumber(invoice.paidAmount) + CLAIM_TOTAL
        const newStatus = newPaid >= toNumber(invoice.totalAmount) - 0.01 ? 'PAID' : 'PARTIALLY_PAID'
        await tx.salesInvoice.update({
          where: { id: created.salesInvoiceId },
          data: { paidAmount: newPaid, status: newStatus },
        })
        return await tx.clientPayment.findUniqueOrThrow({
          where: { id: payment.id },
          select: { id: true, journalEntryId: true },
        })
      })
      created.clientPaymentJEId = result.journalEntryId!
      created.allJEIds.push(created.clientPaymentJEId)
      log('create ClientPayment + JE', !!created.clientPaymentJEId,
        `paymentId=${created.clientPaymentId}, jeId=${created.clientPaymentJEId}`)
    })

    await step('k2: client payment JE is balanced', async () => {
      const b = await jeBalance(created.clientPaymentJEId)
      log('payment JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('k3: client payment JE has CASH Dr + CUSTOMER_AR Cr', async () => {
      const lines = await jeLines(created.clientPaymentJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'CASH' &&
        crLine?.account.accountRole === 'CUSTOMER_AR' &&
        approx(Number(drLine.debit), CLAIM_TOTAL) &&
        approx(Number(crLine.credit), CLAIM_TOTAL)
      log('payment JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('k4: invoice status=PAID after full payment', async () => {
      const inv = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceId },
        select: { status: true, paidAmount: true, totalAmount: true },
      })
      log('invoice → PAID', inv?.status === 'PAID',
        `status=${inv?.status}, paid=${inv?.paidAmount}, total=${inv?.totalAmount}`)
    })

    await step('k5: client payment JE sourceType=CLIENT_PAYMENT', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.clientPaymentJEId } })
      log('sourceType=CLIENT_PAYMENT', je?.sourceType === 'CLIENT_PAYMENT', `sourceType=${je?.sourceType}`)
    })

    // =====================================================================
    // (l) Step 8 — IFRS 15 Revenue Recognition → verify JE posted
    //     actual costs posted = EXPENSE_AMOUNT(10000) + LABOR_TOTAL(10000)
    //                         + SUB_AMOUNT(50000) = 70,000
    //     estimatedTotalCost = 800,000
    //     POC = 70,000 / 800,000 = 8.75%
    //     revenueToDate = 8.75% × 1,000,000 = 87,500
    //     previouslyRecognized = 0 (first run)
    //     periodRevenue = 87,500
    //     JE: Dr CONTRACT_ASSET 87,500 / Cr UNBILLED_REVENUE 87,500
    // =====================================================================
    console.log('\n━━━ (l) Step 8: IFRS 15 Revenue Recognition ━━━')

    const TOTAL_COST = EXPENSE_AMOUNT + LABOR_TOTAL + SUB_AMOUNT // 70000
    const ESTIMATED_COST = 800_000
    const EXPECTED_POC = TOTAL_COST / ESTIMATED_COST              // 0.0875
    const EXPECTED_REV_TO_DATE = EXPECTED_POC * 1_000_000         // 87500

    await step('l1: run IFRS 15 recognition → JE posted', async () => {
      const result = await autoEntryIFRS15Revenue(created.projectId, new Date('2025-03-31'))
      created.ifrs15JEId = result.journalEntryId
      if (result.journalEntryId) created.allJEIds.push(result.journalEntryId)
      log('IFRS15 JE posted', !!result.journalEntryId,
        `jeId=${result.journalEntryId}, periodRevenue=${result.periodRevenue.toFixed(2)}, POC=${(result.percentComplete * 100).toFixed(2)}%`)
    })

    await step('l2: IFRS15 periodRevenue matches expected (~87,500)', async () => {
      const result = await autoEntryIFRS15Revenue(created.projectId, new Date('2025-03-31'))
      // result.periodRevenue should be 0 on second run (idempotent) — but we already
      // captured the first-run value in step l1; here we just check the JE amount.
      const lines = await jeLines(created.ifrs15JEId!)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const amount = drLine ? Number(drLine.debit) : 0
      log('IFRS15 amount matches expected', approx(amount, EXPECTED_REV_TO_DATE, 1),
        `actual=${amount.toFixed(2)}, expected=${EXPECTED_REV_TO_DATE.toFixed(2)}`)
    })

    await step('l3: IFRS15 JE is balanced', async () => {
      const b = await jeBalance(created.ifrs15JEId!)
      log('IFRS15 JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('l4: IFRS15 JE has CONTRACT_ASSET Dr + UNBILLED_REVENUE Cr', async () => {
      const lines = await jeLines(created.ifrs15JEId!)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'CONTRACT_ASSET' &&
        crLine?.account.accountRole === 'UNBILLED_REVENUE'
      log('IFRS15 JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('l5: IFRS15 JE sourceType=IFRS15_REVENUE, sourceId=projectId', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.ifrs15JEId! } })
      const ok = je?.sourceType === 'IFRS15_REVENUE' && je?.sourceId === created.projectId
      log('IFRS15 sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('l6: IFRS15 is idempotent — re-running yields periodRevenue=0', async () => {
      const second = await autoEntryIFRS15Revenue(created.projectId, new Date('2025-03-31'))
      log('second run periodRevenue=0', second.journalEntryId === null && second.periodRevenue === 0,
        `jeId=${second.journalEntryId}, periodRevenue=${second.periodRevenue.toFixed(2)}`)
    })

    // =====================================================================
    // (m) Final Verification — Trial balance, all JEs balanced, project reports
    // =====================================================================
    console.log('\n━━━ (m) Final integrity verification ━━━')

    await step('m1: all JEs created by this cycle are balanced', async () => {
      let allBalanced = true
      const unbalanced: string[] = []
      for (const jeId of created.allJEIds) {
        const b = await jeBalance(jeId)
        if (!b.balanced) {
          allBalanced = false
          unbalanced.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
        }
      }
      log('all cycle JEs balanced', allBalanced, `${created.allJEIds.length} JEs total. ${allBalanced ? 'All balanced.' : `Unbalanced: ${unbalanced.join(', ')}`}`)
    })

    await step('m2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr), `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('m3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('m4: project cost breakdown = sum of expense+labor+subInvoice', async () => {
      const breakdown = await getProjectCostBreakdown(created.projectId)
      const expectedCost = EXPENSE_AMOUNT + LABOR_TOTAL + SUB_AMOUNT // 70000
      const ok = approx(breakdown.total, expectedCost, 1)
      log('project cost breakdown matches', ok,
        `total=${breakdown.total.toFixed(2)}, expected=${expectedCost.toFixed(2)}, costCenterId=${breakdown.costCenterId}`)
    })

    await step('m5: project cost breakdown by role has correct amounts', async () => {
      const breakdown = await getProjectCostBreakdown(created.projectId)
      const projectCost = breakdown.byRole.get('PROJECT_COST') || 0
      const laborCost = breakdown.byRole.get('LABOR_COST') || 0
      const subCost = breakdown.byRole.get('SUBCONTRACTOR_COST') || 0
      const ok =
        approx(projectCost, EXPENSE_AMOUNT, 1) &&
        approx(laborCost, LABOR_TOTAL, 1) &&
        approx(subCost, SUB_AMOUNT, 1)
      log('cost breakdown by role', ok,
        `PROJECT_COST=${projectCost.toFixed(2)} (exp ${EXPENSE_AMOUNT}), ` +
        `LABOR_COST=${laborCost.toFixed(2)} (exp ${LABOR_TOTAL}), ` +
        `SUBCONTRACTOR_COST=${subCost.toFixed(2)} (exp ${SUB_AMOUNT})`)
    })

    await step('m6: project balances (cost-center-tagged) reflect sales revenue + costs', async () => {
      const map = await getProjectBalances([created.projectId])
      const bal = map.get(created.projectId)
      // getProjectBalances filters by costCenterId. Sales-invoice JE lines ARE
      // tagged to project.costCenter (P6-HIGH-001 fix), so revenue from the
      // sales invoice (CLAIM_AMOUNT = 200,000) shows up.
      // IFRS-15 JE lines are NOT tagged to a cost center (they're project-level
      // via sourceId=projectId, not cost-center-level) — that revenue is verified
      // separately in step m6b via the IFRS15_REVENUE sourceType filter.
      const expectedRevenue = CLAIM_AMOUNT // 200000 (sales invoice netAmount)
      const expectedCosts = EXPENSE_AMOUNT + LABOR_TOTAL + SUB_AMOUNT // 70000
      const ok =
        !!bal &&
        approx(bal.revenue, expectedRevenue, 1) &&
        approx(bal.costs, expectedCosts, 1) &&
        bal.costCenterId === created.costCenterId
      log('project balances tie to GL', ok,
        `revenue=${bal?.revenue.toFixed(2)} (exp ${expectedRevenue} from sales-invoice), ` +
        `costs=${bal?.costs.toFixed(2)} (exp ${expectedCosts})`)
    })

    await step('m6b: IFRS-15 revenue recognized via sourceId (project-level, not cost-center)', async () => {
      // IFRS-15 JEs are tagged by sourceId=projectId (not costCenterId).
      // Verify by querying JournalLine where journalEntry.sourceType='IFRS15_REVENUE'
      // AND journalEntry.sourceId=projectId.
      const lines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            sourceType: 'IFRS15_REVENUE',
            sourceId: created.projectId,
          },
        },
        select: { credit: true, debit: true, account: { select: { code: true, accountRole: true } } },
      })
      const unbilledRevCredit = lines
        .filter(l => l.account.accountRole === 'UNBILLED_REVENUE')
        .reduce((s, l) => s + Number(l.credit), 0)
      const contractAssetDebit = lines
        .filter(l => l.account.accountRole === 'CONTRACT_ASSET')
        .reduce((s, l) => s + Number(l.debit), 0)
      const ok =
        approx(unbilledRevCredit, EXPECTED_REV_TO_DATE, 1) &&
        approx(contractAssetDebit, EXPECTED_REV_TO_DATE, 1)
      log('IFRS-15 revenue via sourceId', ok,
        `UNBILLED_REVENUE Cr=${unbilledRevCredit.toFixed(2)}, CONTRACT_ASSET Dr=${contractAssetDebit.toFixed(2)}, ` +
        `expected=${EXPECTED_REV_TO_DATE.toFixed(2)} (project-level recognition, separate from cost-center-tagged revenue)`)
    })

    await step('m6c: total project revenue (cost-center + IFRS-15) = invoice + IFRS-15', async () => {
      const map = await getProjectBalances([created.projectId])
      const bal = map.get(created.projectId)
      const costCenterRevenue = bal?.revenue || 0
      // Add IFRS-15 revenue (project-level via sourceId)
      const ifrsLines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            sourceType: 'IFRS15_REVENUE',
            sourceId: created.projectId,
          },
          account: { accountRole: 'UNBILLED_REVENUE' },
        },
        select: { credit: true },
      })
      const ifrsRevenue = ifrsLines.reduce((s, l) => s + Number(l.credit), 0)
      const totalRevenue = costCenterRevenue + ifrsRevenue
      const expectedTotal = CLAIM_AMOUNT + EXPECTED_REV_TO_DATE // 200000 + 87500 = 287500
      const ok = approx(totalRevenue, expectedTotal, 1)
      log('total project revenue', ok,
        `costCenter=${costCenterRevenue.toFixed(2)} + IFRS15=${ifrsRevenue.toFixed(2)} = ${totalRevenue.toFixed(2)} ` +
        `(expected ${expectedTotal.toFixed(2)})`)
    })

    await step('m7: source ↔ JE linkage intact for all source documents', async () => {
      const expense = await db.expense.findUnique({ where: { id: created.expenseId }, select: { journalEntryId: true } })
      const labor = await db.laborCost.findUnique({ where: { id: created.laborCostId }, select: { journalEntryId: true } })
      const subInv = await db.subcontractorInvoice.findUnique({ where: { id: created.subInvoiceId }, select: { journalEntryId: true } })
      const salesInv = await db.salesInvoice.findUnique({ where: { id: created.salesInvoiceId }, select: { journalEntryId: true } })
      const payment = await db.clientPayment.findUnique({ where: { id: created.clientPaymentId }, select: { journalEntryId: true } })
      const claim = await db.progressClaim.findUnique({ where: { id: created.progressClaimId }, select: { journalEntryId: true } })

      const linked =
        !!expense?.journalEntryId &&
        !!labor?.journalEntryId &&
        !!subInv?.journalEntryId &&
        !!salesInv?.journalEntryId &&
        !!payment?.journalEntryId
      // claim must be NULL by design
      const claimNull = claim?.journalEntryId === null
      log('source↔JE linkage', linked && claimNull,
        `expense:${!!expense?.journalEntryId}, labor:${!!labor?.journalEntryId}, ` +
        `subInv:${!!subInv?.journalEntryId}, salesInv:${!!salesInv?.journalEntryId}, ` +
        `payment:${!!payment?.journalEntryId}, claim:null=${claimNull}`)
    })

    await step('m8: numerical consistency check (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    await step('m9: IFRS15 POC matches expected cost-to-cost ratio', async () => {
      // Recompute POC independently
      const breakdown = await getProjectCostBreakdown(created.projectId)
      const poc = breakdown.total / ESTIMATED_COST
      const ok = approx(poc, EXPECTED_POC, 0.0001)
      log('POC = cost/estimated', ok,
        `actual=${(poc * 100).toFixed(4)}%, expected=${(EXPECTED_POC * 100).toFixed(4)}% ` +
        `(cost=${breakdown.total.toFixed(2)}/estimated=${ESTIMATED_COST})`)
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
    console.log('  ✅ All construction-cycle E2E tests PASSED')
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
      if (created.clientPaymentId) {
        await tx.clientPayment.deleteMany({ where: { id: created.clientPaymentId } })
      }
      if (created.salesInvoiceId) {
        await tx.salesInvoiceItem.deleteMany({ where: { invoiceId: created.salesInvoiceId } })
        await tx.salesInvoice.deleteMany({ where: { id: created.salesInvoiceId } })
      }
      if (created.progressClaimId) {
        await tx.progressClaim.deleteMany({ where: { id: created.progressClaimId } })
      }
      if (created.subInvoiceId) {
        await tx.subcontractorInvoice.deleteMany({ where: { id: created.subInvoiceId } })
      }
      if (created.laborCostId) {
        await tx.laborCost.deleteMany({ where: { id: created.laborCostId } })
      }
      if (created.expenseId) {
        await tx.expense.deleteMany({ where: { id: created.expenseId } })
      }
      if (created.boqItemIds.length > 0) {
        await tx.bOQItem.deleteMany({ where: { id: { in: created.boqItemIds } } })
      }
      if (created.contractId) {
        await tx.contract.deleteMany({ where: { id: created.contractId } })
      }
      if (created.projectId) {
        await tx.project.deleteMany({ where: { id: created.projectId } })
      }
      if (created.costCenterId) {
        await tx.costCenter.deleteMany({ where: { id: created.costCenterId } })
      }
      if (created.subcontractorId) {
        await tx.subcontractor.deleteMany({ where: { id: created.subcontractorId } })
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
    try { await db.clientPayment.deleteMany({ where: { id: created.clientPaymentId } }) } catch {}
    try { await db.salesInvoiceItem.deleteMany({ where: { invoiceId: created.salesInvoiceId } }) } catch {}
    try { await db.salesInvoice.deleteMany({ where: { id: created.salesInvoiceId } }) } catch {}
    try { await db.progressClaim.deleteMany({ where: { id: created.progressClaimId } }) } catch {}
    try { await db.subcontractorInvoice.deleteMany({ where: { id: created.subInvoiceId } }) } catch {}
    try { await db.laborCost.deleteMany({ where: { id: created.laborCostId } }) } catch {}
    try { await db.expense.deleteMany({ where: { id: created.expenseId } }) } catch {}
    try { await db.bOQItem.deleteMany({ where: { id: { in: created.boqItemIds } } }) } catch {}
    try { await db.contract.deleteMany({ where: { id: created.contractId } }) } catch {}
    try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch {}
    try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch {}
    try { await db.subcontractor.deleteMany({ where: { id: created.subcontractorId } }) } catch {}
    try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch {}
    try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch {}
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } })
      } catch {}
    }
    console.log('  ✓ Best-effort cleanup done')
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
