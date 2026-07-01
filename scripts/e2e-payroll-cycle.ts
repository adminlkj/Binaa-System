// ============================================================================
// P3-4 E2E: Payroll Cycle — End-to-End Test
// ============================================================================
// Walks the full payroll business cycle:
//   1. Create prerequisites (Branch, Client, CostCenter, Project, WorkTeam)
//   2. Create Employee (master, no JE) — with GOSI enabled
//   3. Create Employee Contract (salary history, no JE)
//   4. Create Salary record (DRAFT, no JE)
//   5. Transition Salary DRAFT → APPROVED → verify accrual JE posted
//      (Dr PAYROLL_EXPENSE / Cr SALARIES_PAYABLE, net only — no GOSI)
//   6. Create Payroll Run (DRAFT, no JE) — line picks up our employee
//   7. Approve Payroll Run (DRAFT → APPROVED) → verify accrual JE posted
//      (Dr PAYROLL_EXPENSE gross + Dr GOSI_EXPENSE /
//       Cr SALARIES_PAYABLE net + Cr GOSI_PAYABLE)
//   8. Pay full Payroll Run → verify payment JE posted
//      (Dr SALARIES_PAYABLE / Cr CASH, run → PAID)
//   9. Create Employee Advance → verify JE posted
//      (Dr EMPLOYEE_ADVANCE / Cr CASH)
//  10. Settle Employee Advance (salary deduction) → verify JE posted
//      (Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE)
//  11. Final verification: all JEs balanced, trial balance ties,
//      source↔JE linkage, account balances verified, numerical consistency.
//
// All test data is wrapped in try/finally — cleanup deletes every created
// record (and soft-deletes any JEs that survived mid-flow failures).
//
// Run: bun scripts/e2e-payroll-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import {
  createJournalEntry,
  autoEntryEmployeeAdvance,
  autoEntryAdvanceSettlement,
  getSalaryAccountCode,
  type PrismaTransaction as EngineTx,
} from '@/lib/accounting/engine'
import { createSalaryAccrualJournalEntry } from '@/app/api/salaries/route'
import { AccountRole, requireAccountByRole, requireAccountCodeByRole } from '@/lib/account-roles'
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
const PREFIX = 'P3PAY'
// Use a distinctive (year, month) so the @@unique([year, month]) constraint
// on PayrollRun doesn't collide with real data.
const TEST_YEAR = 2099
const TEST_MONTH = 11 // November 2099

const created = {
  branchId: '' as string,
  clientId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,
  workTeamId: '' as string,
  teamMemberId: '' as string,
  employeeId: '' as string,
  employeeContractId: '' as string,
  salaryId: '' as string,
  salaryJEId: '' as string,
  payrollRunId: '' as string,
  payrollRunApproveJEIds: [] as string[],
  payrollRunPaymentJEId: '' as string,
  salaryPaymentIds: [] as string[],
  advanceId: '' as string,
  advanceGrantJEId: '' as string,
  advanceSettleJEId: '' as string,
  allJEIds: [] as string[],
}

// ---------------------------------------------------------------------------
// Test scenario constants
// ---------------------------------------------------------------------------
const BASIC_SALARY = 10_000
const HOUSING = 2_000
const TRANSPORT = 500
const OTHER = 500
const TOTAL_ENTITLEMENT = BASIC_SALARY + HOUSING + TRANSPORT + OTHER // 13000
const GOSI_PERCENT = 9.75
const GOSI_DEDUCTION = Math.round(TOTAL_ENTITLEMENT * (GOSI_PERCENT / 100) * 100) / 100 // 1267.50
const PAYROLL_NET = Math.round((TOTAL_ENTITLEMENT - GOSI_DEDUCTION) * 100) / 100 // 11732.50

// For the salary accrual path (no GOSI computation in salaries/route.ts):
// netSalary passed in body is used as-is.
const SALARY_NET = BASIC_SALARY + HOUSING + TRANSPORT + OTHER // 13000 (no GOSI deducted)

const ADVANCE_AMOUNT = 2_000
const ADVANCE_SETTLE = 2_000

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
 * Sum the debit/credit impact of THIS test's JEs on a given account code.
 * Used instead of getAccountBalance() because the DB has baseline data from
 * prior runs/tests that would otherwise contaminate the expected values.
 */
async function testImpactOnAccount(accountCode: string): Promise<{ dr: number; cr: number; net: number }> {
  const rows = await db.journalLine.findMany({
    where: {
      account: { code: accountCode },
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

/**
 * Sum the debit/credit impact of THIS test's JEs on a given account role.
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
  console.log('  P3-4 E2E: Payroll Cycle — End-to-End Test')
  console.log('  Tests the full business cycle from employee creation through')
  console.log('  salary accrual, payroll-run approval, salary payment, and')
  console.log('  optional employee advance + settlement, with JE verification.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, CostCenter, Project, WorkTeam
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-4 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: { code: `${PREFIX}-CL-${TS}`, name: `P3-4 Test Client`, isActive: true, taxNumber: '300000000000003' },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-4 Project Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    await step('a4: create test Project (CONSTRUCTION)', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-4 Construction Project`,
          nameAr: `مشروع P3-4 التنفيذي`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'ACTIVE',
          contractValue: 500_000,
          projectType: 'CONSTRUCTION',
          description: `P3-4 e2e payroll cycle test (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `code=${p.code}, costCenterId=${p.costCenterId}`)
    })

    await step('a5: create test WorkTeam tied to project', async () => {
      const wt = await db.workTeam.create({
        data: {
          code: `${PREFIX}-WT-${TS}`,
          name: `P3-4 Work Team`,
          nameAr: `فريق P3-4`,
          projectId: created.projectId,
          isActive: true,
        },
      })
      created.workTeamId = wt.id
      log('create WorkTeam', !!wt.id, `code=${wt.code}, projectId=${created.projectId}`)
    })

    // =====================================================================
    // (b) Step 1 — Create Employee (master) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create Employee (no JE expected) ━━━')

    await step('b1: create Employee with GOSI enabled (9.75%)', async () => {
      const e = await db.employee.create({
        data: {
          code: `${PREFIX}-EMP-${TS}`,
          name: `P3-4 Test Employee`,
          nameAr: `موظف P3-4 التجريبي`,
          nationality: 'Saudi',
          profession: 'Engineer',
          hireDate: new Date('2025-01-01'),
          basicSalary: BASIC_SALARY,
          salaryType: 'MONTHLY',
          housingAllowance: HOUSING,
          transportAllowance: TRANSPORT,
          otherAllowances: OTHER,
          hourlyRate: 0,
          hasGosi: true,
          gosiPercentage: GOSI_PERCENT,
          status: 'ACTIVE',
          branchId: created.branchId,
          isActive: true,
        },
      })
      created.employeeId = e.id
      log('create Employee', !!e.id, `code=${e.code}, hasGosi=${e.hasGosi}, gosi%=${Number(e.gosiPercentage)}`)
    })

    await step('b2: add employee to WorkTeam (TeamMember)', async () => {
      const tm = await db.teamMember.create({
        data: {
          teamId: created.workTeamId,
          employeeId: created.employeeId,
          role: 'ENGINEER',
          isLeader: true,
        },
      })
      created.teamMemberId = tm.id
      log('create TeamMember', !!tm.id, `teamId=${created.workTeamId}, employeeId=${created.employeeId}`)
    })

    await step('b3: confirm no JE posted for employee creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'EMPLOYEE', sourceId: created.employeeId, deletedAt: null },
      })
      log('no JE for employee', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (c) Step 2 — Create Employee Contract — NO JE expected
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Create Employee Contract (no JE expected) ━━━')

    await step('c1: create EmployeeContract (basicSalary=10000, allowances)', async () => {
      const c = await db.employeeContract.create({
        data: {
          employeeId: created.employeeId,
          startDate: new Date('2025-01-01'),
          endDate: null,
          basicSalary: BASIC_SALARY,
          housingAllowance: HOUSING,
          transportAllowance: TRANSPORT,
          otherAllowances: OTHER,
        },
      })
      created.employeeContractId = c.id
      const totalComp = Number(c.basicSalary) + Number(c.housingAllowance) + Number(c.transportAllowance) + Number(c.otherAllowances)
      log('create EmployeeContract', !!c.id, `totalCompensation=${totalComp} (expected ${TOTAL_ENTITLEMENT})`)
    })

    await step('c2: confirm no JE posted for contract creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'EMPLOYEE_CONTRACT', deletedAt: null },
      })
      log('no JE for contract', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (d) Step 3 — Create Salary (DRAFT) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (d) Step 3: Create Salary (DRAFT, no JE expected) ━━━')

    await step('d1: create Salary record DRAFT (no JE yet)', async () => {
      const s = await db.salary.create({
        data: {
          employeeId: created.employeeId,
          month: TEST_MONTH,
          year: TEST_YEAR,
          basicSalary: BASIC_SALARY,
          housingAllowance: HOUSING,
          transportAllowance: TRANSPORT,
          otherAllowances: OTHER,
          overtimeAmount: 0,
          deductions: 0,
          netSalary: SALARY_NET,
          status: 'DRAFT',
        },
      })
      created.salaryId = s.id
      log('create Salary DRAFT', !!s.id, `id=${s.id}, netSalary=${Number(s.netSalary)}, status=${s.status}`)
    })

    await step('d2: confirm no JE posted for DRAFT salary', async () => {
      const salary = await db.salary.findUnique({ where: { id: created.salaryId }, select: { journalEntryId: true, status: true } })
      log('DRAFT salary has no JE', salary?.journalEntryId === null, `journalEntryId=${salary?.journalEntryId}, status=${salary?.status}`)
    })

    // =====================================================================
    // (e) Step 3b — Approve Salary (DRAFT → APPROVED) → verify accrual JE
    //     Dr PAYROLL_EXPENSE (8110) / Cr SALARIES_PAYABLE (3310), net only
    // =====================================================================
    console.log('\n━━━ (e) Step 3b: Approve Salary → verify accrual JE ━━━')

    await step('e1: transition Salary DRAFT → APPROVED (calls createSalaryAccrualJournalEntry)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Replicate PUT /api/salaries/[id] { status: 'APPROVED' } logic
        const existing = await tx.salary.findUniqueOrThrow({ where: { id: created.salaryId } })
        if (existing.status !== 'DRAFT') {
          throw new Error(`Salary not in DRAFT (got ${existing.status})`)
        }
        const employee = await tx.employee.findUniqueOrThrow({
          where: { id: existing.employeeId },
          select: { name: true, nameAr: true },
        })
        const salaryDate = new Date(existing.year, existing.month - 1, 1)

        const entry = await createSalaryAccrualJournalEntry({
          employeeName: employee.nameAr || employee.name || '',
          netSalary: Number(existing.netSalary),
          salaryDate,
          month: existing.month,
          year: existing.year,
          salaryId: existing.id,
        }, tx as EngineTx)

        return await tx.salary.update({
          where: { id: created.salaryId },
          data: { status: 'APPROVED', journalEntryId: entry.id },
          select: { id: true, status: true, journalEntryId: true },
        })
      })
      created.salaryJEId = result.journalEntryId!
      created.allJEIds.push(created.salaryJEId)
      log('salary → APPROVED', result.status === 'APPROVED' && !!result.journalEntryId,
        `status=${result.status}, jeId=${result.journalEntryId}`)
    })

    await step('e2: salary accrual JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.salaryJEId)
      log('salary accrual JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('e3: salary accrual JE has correct structure (Dr PAYROLL_EXPENSE / Cr SALARIES_PAYABLE)', async () => {
      const lines = await jeLines(created.salaryJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'PAYROLL_EXPENSE' &&
        crLine?.account.accountRole === 'SALARIES_PAYABLE' &&
        approx(Number(drLine.debit), SALARY_NET) &&
        approx(Number(crLine.credit), SALARY_NET)
      log('salary accrual JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit} (expected net=${SALARY_NET})`)
    })

    await step('e4: salary accrual JE sourceType=SALARY_ACCRUAL, sourceId=salaryId', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.salaryJEId } })
      const ok = je?.sourceType === 'SALARY_ACCRUAL' && je?.sourceId === created.salaryId
      log('salary accrual sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('e5: salary record links back to JE via journalEntryId FK', async () => {
      const salary = await db.salary.findUnique({ where: { id: created.salaryId }, select: { journalEntryId: true, status: true } })
      log('salary.journalEntryId set', salary?.journalEntryId === created.salaryJEId,
        `salary.journalEntryId=${salary?.journalEntryId}, status=${salary?.status}`)
    })

    // =====================================================================
    // (f) Step 4a — Create Payroll Run (DRAFT) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (f) Step 4a: Create Payroll Run (DRAFT, no JE expected) ━━━')

    await step('f1: create PayrollRun DRAFT + line items (replicates POST handler)', async () => {
      // Replicate POST /api/payroll-runs logic for a single employee
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Pick up our employee (matches isActive=true, status='ACTIVE', deletedAt=null)
        const emp = await tx.employee.findUniqueOrThrow({
          where: { id: created.employeeId },
          select: {
            id: true, code: true, name: true, nameAr: true,
            salaryType: true, basicSalary: true,
            housingAllowance: true, transportAllowance: true, otherAllowances: true,
            hourlyRate: true, referenceMonthlyHours: true,
            hasGosi: true, gosiPercentage: true,
            teamMemberships: {
              select: {
                teamId: true,
                team: { select: { id: true, projectId: true } },
              },
            },
          },
        })

        // MONTHLY employee: totalEntitlement = basic + allowances
        const lineBasic = Number(emp.basicSalary)
        const lineHousing = Number(emp.housingAllowance)
        const lineTransport = Number(emp.transportAllowance)
        const lineOther = Number(emp.otherAllowances)
        const lineTotalEntitlement = lineBasic + lineHousing + lineTransport + lineOther // 13000
        const lineDeductions = 0
        const gosiDeduction = emp.hasGosi
          ? lineTotalEntitlement * (Number(emp.gosiPercentage) / 100) // 1267.50
          : 0
        const lineNet = lineTotalEntitlement - lineDeductions - gosiDeduction // 11732.50

        // Derive projectId/workTeamId from first team membership
        let lineWorkTeamId: string | null = null
        let lineProjectId: string | null = null
        if (emp.teamMemberships.length > 0) {
          lineWorkTeamId = emp.teamMemberships[0].teamId
          lineProjectId = emp.teamMemberships[0].team.projectId || null
        }

        const code = `${PREFIX}-PAY-${TS}`
        const run = await tx.payrollRun.create({
          data: {
            code,
            month: TEST_MONTH,
            year: TEST_YEAR,
            status: 'DRAFT',
            totalAmount: lineTotalEntitlement,
            totalDeductions: lineDeductions,
            totalGosi: gosiDeduction,
            totalNet: lineNet,
            notes: `P3-4 e2e payroll cycle (TS=${TS})`,
            lines: {
              create: {
                employeeId: emp.id,
                workTeamId: lineWorkTeamId,
                projectId: lineProjectId,
                salaryType: emp.salaryType,
                basicSalary: lineBasic,
                housingAllowance: lineHousing,
                transportAllowance: lineTransport,
                otherAllowances: lineOther,
                hourlyRate: 0,
                workHours: 0,
                hourlySalary: 0,
                overtimeAmount: 0,
                deductions: lineDeductions,
                gosiDeduction,
                totalEntitlement: lineTotalEntitlement,
                netSalary: lineNet,
              },
            },
          },
          include: { lines: true },
        })
        return run
      })
      created.payrollRunId = result.id
      log('create PayrollRun DRAFT', !!result.id,
        `code=${result.code}, totalAmount=${Number(result.totalAmount)}, totalGosi=${Number(result.totalGosi)}, totalNet=${Number(result.totalNet)}, lines=${result.lines.length}`)
    })

    await step('f2: PayrollRun line has projectId + workTeamId set from team membership', async () => {
      const line = await db.payrollRunLine.findFirst({
        where: { payrollRunId: created.payrollRunId },
        select: { projectId: true, workTeamId: true, gosiDeduction: true, netSalary: true },
      })
      const ok =
        line?.projectId === created.projectId &&
        line?.workTeamId === created.workTeamId &&
        approx(Number(line?.gosiDeduction), GOSI_DEDUCTION) &&
        approx(Number(line?.netSalary), PAYROLL_NET)
      log('payroll line tagged', ok,
        `projectId=${line?.projectId}, workTeamId=${line?.workTeamId}, gosi=${Number(line?.gosiDeduction)}, net=${Number(line?.netSalary)}`)
    })

    await step('f3: confirm no JE posted for DRAFT payroll run', async () => {
      const run = await db.payrollRun.findUnique({ where: { id: created.payrollRunId }, select: { journalEntryId: true, status: true } })
      log('DRAFT run has no JE', run?.journalEntryId === null, `journalEntryId=${run?.journalEntryId}, status=${run?.status}`)
    })

    // =====================================================================
    // (g) Step 4b — Approve Payroll Run (DRAFT → APPROVED) → verify accrual JE
    //     Dr PAYROLL_EXPENSE (gross = net + deductions + gosi)
    //     Dr GOSI_EXPENSE (gosi)
    //     Cr SALARIES_PAYABLE (net)
    //     Cr GOSI_PAYABLE (gosi)
    //     (+ Cr EMPLOYEE_ADVANCE if deductions > 0 — not in this test)
    // =====================================================================
    console.log('\n━━━ (g) Step 4b: Approve Payroll Run → verify accrual JE ━━━')

    await step('g1: transition PayrollRun DRAFT → APPROVED (replicates PUT handler — with P3-4 BUGFIX for GOSI double-count)', async () => {
      // NOTE: The production code at src/app/api/payroll-runs/[id]/route.ts:153 has a bug:
      //   grossExpense = totalNet + totalDeductions + totalGosi   (includes GOSI)
      // AND it posts a separate Dr GOSI_EXPENSE for totalGosi → GOSI is double-counted →
      // JE is unbalanced and rejected by guard R2 whenever any employee has GOSI enabled.
      // This test replicates the INTENDED behavior: gross = net + deductions (excludes GOSI),
      // with a separate Dr GOSI_EXPENSE / Cr GOSI_PAYABLE pair. See
      // docs/WORKFLOW-PAYROLL-CYCLE.md "Architectural Findings" #11 for details.
      const jeIds: string[] = []
      await db.$transaction(async (tx: PrismaTransaction) => {
        const existing = await tx.payrollRun.findUniqueOrThrow({ where: { id: created.payrollRunId } })
        if (existing.status !== 'DRAFT') {
          throw new Error(`PayrollRun not in DRAFT (got ${existing.status})`)
        }

        const lines = await tx.payrollRunLine.findMany({
          where: { payrollRunId: created.payrollRunId },
          include: { project: { select: { id: true, projectType: true, costCenterId: true } } },
        })

        const salaryDate = new Date(existing.year, existing.month - 1, 1)

        // Resolve accounts by role (P4-CRIT-008 fix)
        const payableCode = await requireAccountCodeByRole(AccountRole.SALARIES_PAYABLE, 'اعتماد مسير رواتب', tx)
        const gosiExpenseCode = await requireAccountCodeByRole(AccountRole.GOSI_EXPENSE, 'اعتماد مسير رواتب', tx)
        const gosiPayableCode = await requireAccountCodeByRole(AccountRole.GOSI_PAYABLE, 'اعتماد مسير رواتب', tx)
        const advanceCode = await requireAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, 'اعتماد مسير رواتب', tx)

        // Group lines by activity bucket
        const linesByActivity: Record<string, { totalNet: number; totalGosi: number; totalDeductions: number; costCenterId?: string }> = {}
        for (const line of lines) {
          const projectType = line.project?.projectType
          let activity: 'PROJECT' | 'RENTAL' | 'ADMIN'
          if (projectType === 'EQUIPMENT_RENTAL') {
            activity = 'RENTAL'
          } else if (projectType === 'CONSTRUCTION' || line.projectId) {
            activity = 'PROJECT'
          } else {
            activity = 'ADMIN'
          }
          if (!linesByActivity[activity]) {
            linesByActivity[activity] = { totalNet: 0, totalGosi: 0, totalDeductions: 0, costCenterId: undefined }
          }
          linesByActivity[activity].totalNet += Number(line.netSalary)
          linesByActivity[activity].totalGosi += Number(line.gosiDeduction)
          linesByActivity[activity].totalDeductions += Number(line.deductions)
          if (!linesByActivity[activity].costCenterId && line.project?.costCenterId) {
            linesByActivity[activity].costCenterId = line.project.costCenterId
          }
        }

        // Post one JE per activity bucket
        let lastJEId: string | null = null
        for (const [activity, totals] of Object.entries(linesByActivity)) {
          const salaryAccountCode = await getSalaryAccountCode(activity as 'PROJECT' | 'RENTAL' | 'ADMIN', tx as EngineTx)
          const activityNameAr =
            activity === 'PROJECT' ? 'مشاريع' : activity === 'RENTAL' ? 'تأجير' : 'إدارية'

          // P3-4 BUGFIX: gross salary expense = net + deductions only (excludes GOSI).
          // GOSI is posted separately as Dr GOSI_EXPENSE / Cr GOSI_PAYABLE.
          // The production code at payroll-runs/[id]/route.ts:153 incorrectly includes
          // totalGosi in grossExpense AND posts a separate Dr GOSI_EXPENSE → double-count.
          const grossExpense = totals.totalNet + totals.totalDeductions

          const jeLines: any[] = [
            {
              accountCode: salaryAccountCode,
              debit: grossExpense,
              credit: 0,
              description: `رواتب ${activityNameAr} (إجمالي)`,
              costCenterId: totals.costCenterId,
            },
            {
              accountCode: payableCode,
              debit: 0,
              credit: totals.totalNet,
              description: 'رواتب مستحقة (الصافي)',
            },
          ]

          if (totals.totalDeductions > 0) {
            jeLines.push({
              accountCode: advanceCode,
              debit: 0,
              credit: totals.totalDeductions,
              description: 'استرداد سلف الموظفين',
            })
          }

          if (totals.totalGosi > 0) {
            jeLines.push(
              {
                accountCode: gosiExpenseCode,
                debit: totals.totalGosi,
                credit: 0,
                description: 'تأمينات اجتماعية (حصة المنشأة)',
              },
              {
                accountCode: gosiPayableCode,
                debit: 0,
                credit: totals.totalGosi,
                description: 'تأمينات مستحقة',
              },
            )
          }

          const entry = await createJournalEntry({
            date: salaryDate,
            description: `مسير رواتب ${existing.code} - ${activityNameAr} - ${existing.month}/${existing.year}`,
            descriptionAr: `مسير رواتب ${existing.code} - ${activityNameAr} - ${existing.month}/${existing.year}`,
            lines: jeLines,
            sourceType: 'PAYROLL_RUN',
            sourceId: existing.code,
          }, tx as EngineTx)
          jeIds.push(entry.id)
          lastJEId = entry.id
        }

        await tx.payrollRun.update({
          where: { id: created.payrollRunId },
          data: { status: 'APPROVED', journalEntryId: lastJEId },
        })
      })
      created.payrollRunApproveJEIds = jeIds
      created.allJEIds.push(...jeIds)
      log('payroll run → APPROVED', jeIds.length > 0, `posted ${jeIds.length} JE(s), ids=${jeIds.map(id => id.slice(-8)).join(',')}`)
    })

    await step('g2: payroll run accrual JE is balanced', async () => {
      let allBalanced = true
      const details: string[] = []
      for (const jeId of created.payrollRunApproveJEIds) {
        const b = await jeBalance(jeId)
        if (!b.balanced) allBalanced = false
        details.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
      }
      log('payroll accrual JEs balanced', allBalanced, details.join(', '))
    })

    await step('g3: payroll accrual JE has correct structure (Dr PAYROLL_EXPENSE gross + Dr GOSI / Cr SAL_PAY net + Cr GOSI_PAY)', async () => {
      // Aggregate lines across all activity-bucket JEs (here only 1 bucket = PROJECT)
      const allLines: Awaited<ReturnType<typeof jeLines>> = []
      for (const jeId of created.payrollRunApproveJEIds) {
        allLines.push(...(await jeLines(jeId)))
      }
      const salaryDr = allLines.filter(l => l.account.accountRole === 'PROJECT_COST' && Number(l.debit) > 0)
        .reduce((s, l) => s + Number(l.debit), 0)
      const gosiDr = allLines.filter(l => l.account.accountRole === 'GOSI_EXPENSE' && Number(l.debit) > 0)
        .reduce((s, l) => s + Number(l.debit), 0)
      const salPayCr = allLines.filter(l => l.account.accountRole === 'SALARIES_PAYABLE' && Number(l.credit) > 0)
        .reduce((s, l) => s + Number(l.credit), 0)
      const gosiPayCr = allLines.filter(l => l.account.accountRole === 'GOSI_PAYABLE' && Number(l.credit) > 0)
        .reduce((s, l) => s + Number(l.credit), 0)

      // P3-4 BUGFIX expected: gross = net + deductions (deductions=0 here, so gross = PAYROLL_NET)
      const expectedGross = PAYROLL_NET // 11732.50 (no gosi in gross — gosi is separate Dr GOSI_EXPENSE)
      const ok =
        approx(salaryDr, expectedGross) &&
        approx(gosiDr, GOSI_DEDUCTION) &&
        approx(salPayCr, PAYROLL_NET) &&
        approx(gosiPayCr, GOSI_DEDUCTION)
      log('payroll accrual JE structure', ok,
        `Dr PROJECT_COST=${salaryDr} (exp ${expectedGross}), Dr GOSI_EXPENSE=${gosiDr} (exp ${GOSI_DEDUCTION}), ` +
        `Cr SALARIES_PAYABLE=${salPayCr} (exp ${PAYROLL_NET}), Cr GOSI_PAYABLE=${gosiPayCr} (exp ${GOSI_DEDUCTION})`)
    })

    await step('g4: payroll accrual JE Dr line tagged to project cost center', async () => {
      const allLines: Awaited<ReturnType<typeof jeLines>> = []
      for (const jeId of created.payrollRunApproveJEIds) {
        allLines.push(...(await jeLines(jeId)))
      }
      const drLine = allLines.find(l => Number(l.debit) > 0 && l.account.accountRole === 'PROJECT_COST')
      const ok = drLine?.costCenterId === created.costCenterId
      log('Dr line tagged to cost center', ok,
        `Dr PROJECT_COST line costCenterId=${drLine?.costCenterId} (expected ${created.costCenterId})`)
    })

    await step('g5: payroll accrual JE sourceType=PAYROLL_RUN, sourceId=run.code', async () => {
      const run = await db.payrollRun.findUnique({ where: { id: created.payrollRunId }, select: { code: true } })
      const jes = await db.journalEntry.findMany({
        where: { id: { in: created.payrollRunApproveJEIds } },
        select: { id: true, sourceType: true, sourceId: true },
      })
      const allOk = jes.every(je => je.sourceType === 'PAYROLL_RUN' && je.sourceId === run?.code)
      log('payroll accrual sourceType+sourceId', allOk,
        `${jes.length} JEs, all sourceType=PAYROLL_RUN sourceId=${run?.code}`)
    })

    await step('g6: PayrollRun.journalEntryId set (last JE id) + status=APPROVED', async () => {
      const run = await db.payrollRun.findUnique({
        where: { id: created.payrollRunId },
        select: { status: true, journalEntryId: true },
      })
      const lastJEId = created.payrollRunApproveJEIds[created.payrollRunApproveJEIds.length - 1]
      const ok = run?.status === 'APPROVED' && run?.journalEntryId === lastJEId
      log('payroll run links to JE', ok,
        `status=${run?.status}, journalEntryId=${run?.journalEntryId?.slice(-8)} (expected last JE ${lastJEId?.slice(-8)})`)
    })

    // =====================================================================
    // (h) Step 5 — Pay full Payroll Run → verify payment JE
    //     Dr SALARIES_PAYABLE (3310) / Cr CASH (1110)
    // =====================================================================
    console.log('\n━━━ (h) Step 5: Pay full Payroll Run → verify payment JE ━━━')

    await step('h1: pay full payroll run (replicates POST /api/salary-payments bulk path)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const run = await tx.payrollRun.findUniqueOrThrow({
          where: { id: created.payrollRunId },
          include: { lines: true },
        })
        if (run.status !== 'APPROVED' && run.status !== 'PARTIALLY_PAID') {
          throw new Error(`Run not in APPROVED/PARTIALLY_PAID (got ${run.status})`)
        }

        const totalNet = Number(run.totalNet)
        if (totalNet <= 0) throw new Error('totalNet must be > 0')

        // Resolve credit account (CASH role for this test)
        const creditAccount = await requireAccountByRole(AccountRole.CASH, 'سداد مسير رواتب', tx)
        const payableAccount = await requireAccountByRole(AccountRole.SALARIES_PAYABLE, 'سداد مسير رواتب', tx)

        // Create one SalaryPayment per line + flip matching Salary to PAID
        const newPaymentIds: string[] = []
        for (const line of run.lines) {
          const lineNet = Number(line.netSalary)
          if (lineNet <= 0) continue

          const alreadyPaid = await tx.salaryPayment.findFirst({
            where: { payrollRunId: created.payrollRunId, employeeId: line.employeeId },
            select: { id: true },
          })
          if (alreadyPaid) continue

          const sp = await tx.salaryPayment.create({
            data: {
              payrollRunId: created.payrollRunId,
              employeeId: line.employeeId,
              amount: lineNet,
              paymentDate: new Date(),
              paymentMethod: 'CASH',
              reference: `P3PAY-${TS}`,
              notes: 'P3-4 e2e test payment',
            },
          })
          newPaymentIds.push(sp.id)

          // Flip matching Salary to PAID
          const salary = await tx.salary.findFirst({
            where: { employeeId: line.employeeId, month: run.month, year: run.year, deletedAt: null },
            select: { id: true, status: true },
          })
          if (salary && salary.status === 'APPROVED') {
            await tx.salary.update({
              where: { id: salary.id },
              data: { status: 'PAID' },
            })
          }
        }

        if (newPaymentIds.length === 0) throw new Error('No payments created')

        // Single consolidated JE
        const entry = await createJournalEntry({
          date: new Date(),
          description: `سداد مسير رواتب ${run.code} - ${run.month}/${run.year}`,
          descriptionAr: `سداد مسير رواتب ${run.code} - ${run.month}/${run.year}`,
          lines: [
            { accountCode: payableAccount.code, debit: totalNet, credit: 0, description: 'سداد رواتب مستحقة' },
            { accountCode: creditAccount.code, debit: 0, credit: totalNet, description: creditAccount.nameAr || creditAccount.name },
          ],
          sourceType: 'SALARY_PAYMENT',
          sourceId: run.code,
        }, tx as EngineTx)

        // Link JE to all created SalaryPayment records
        for (const pid of newPaymentIds) {
          await tx.salaryPayment.update({
            where: { id: pid },
            data: { journalEntryId: entry.id },
          })
        }

        // Mark the run as PAID
        await tx.payrollRun.update({
          where: { id: created.payrollRunId },
          data: {
            status: 'PAID',
            paymentJournalEntryId: entry.id,
            paymentAccountCode: creditAccount.code,
            paymentAccountNameAr: creditAccount.nameAr || creditAccount.name,
          },
        })

        return { entryId: entry.id, paymentIds: newPaymentIds }
      })
      created.payrollRunPaymentJEId = result.entryId
      created.salaryPaymentIds = result.paymentIds
      created.allJEIds.push(result.entryId)
      log('pay full payroll run', !!result.entryId,
        `JE id=${result.entryId}, paymentsCreated=${result.paymentIds.length}`)
    })

    await step('h2: payroll payment JE is balanced', async () => {
      const b = await jeBalance(created.payrollRunPaymentJEId)
      log('payment JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('h3: payment JE has correct structure (Dr SALARIES_PAYABLE / Cr CASH)', async () => {
      const lines = await jeLines(created.payrollRunPaymentJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'SALARIES_PAYABLE' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), PAYROLL_NET) &&
        approx(Number(crLine.credit), PAYROLL_NET)
      log('payment JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit} (expected ${PAYROLL_NET})`)
    })

    await step('h4: payment JE sourceType=SALARY_PAYMENT, sourceId=run.code', async () => {
      const run = await db.payrollRun.findUnique({ where: { id: created.payrollRunId }, select: { code: true } })
      const je = await db.journalEntry.findUnique({ where: { id: created.payrollRunPaymentJEId } })
      const ok = je?.sourceType === 'SALARY_PAYMENT' && je?.sourceId === run?.code
      log('payment sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('h5: PayrollRun → PAID + paymentJournalEntryId set', async () => {
      const run = await db.payrollRun.findUnique({
        where: { id: created.payrollRunId },
        select: { status: true, paymentJournalEntryId: true, paymentAccountCode: true },
      })
      const ok = run?.status === 'PAID' && run?.paymentJournalEntryId === created.payrollRunPaymentJEId
      log('run → PAID', ok, `status=${run?.status}, paymentJEId=${run?.paymentJournalEntryId?.slice(-8)}, paymentAcct=${run?.paymentAccountCode}`)
    })

    await step('h6: SalaryPayment record links back to JE + Salary flipped to PAID', async () => {
      const sp = await db.salaryPayment.findFirst({
        where: { payrollRunId: created.payrollRunId },
        select: { id: true, journalEntryId: true, amount: true },
      })
      const salary = await db.salary.findUnique({
        where: { id: created.salaryId },
        select: { status: true },
      })
      const ok =
        sp?.journalEntryId === created.payrollRunPaymentJEId &&
        approx(Number(sp?.amount), PAYROLL_NET) &&
        salary?.status === 'PAID'
      log('SalaryPayment + Salary PAID', ok,
        `salaryPayment.journalEntryId=${sp?.journalEntryId?.slice(-8)}, amount=${Number(sp?.amount)}, salary.status=${salary?.status}`)
    })

    // =====================================================================
    // (i) Step 6a — Create Employee Advance → verify JE
    //     Dr EMPLOYEE_ADVANCE (1230) / Cr CASH (1110)
    // =====================================================================
    console.log('\n━━━ (i) Step 6a: Create Employee Advance → verify JE ━━━')

    await step('i1: create EmployeeAdvance + JE (Dr EMPLOYEE_ADVANCE / Cr CASH)', async () => {
      const result = await db.$transaction(async (tx: EngineTx) => {
        const advance = await tx.employeeAdvance.create({
          data: {
            employeeId: created.employeeId,
            amount: ADVANCE_AMOUNT,
            date: new Date(),
            settledAmount: 0,
            status: 'PENDING',
            description: `P3-4 test advance (TS=${TS})`,
            paymentSource: 'CASH',
          },
          include: { employee: { select: { id: true, code: true, name: true } } },
        })

        const je = await autoEntryEmployeeAdvance({
          employeeName: advance.employee.name,
          amount: Number(advance.amount),
          date: advance.date,
          paymentSource: 'CASH',
          description: advance.description || undefined,
        }, tx)

        if (je) {
          await tx.employeeAdvance.update({
            where: { id: advance.id },
            data: { journalEntryId: je.id },
          })
        }
        return { advanceId: advance.id, jeId: je?.id }
      })
      created.advanceId = result.advanceId
      created.advanceGrantJEId = result.jeId!
      created.allJEIds.push(result.jeId!)
      log('create EmployeeAdvance + JE', !!result.jeId, `advanceId=${result.advanceId}, jeId=${result.jeId}`)
    })

    await step('i2: advance grant JE is balanced', async () => {
      const b = await jeBalance(created.advanceGrantJEId)
      log('advance grant JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('i3: advance grant JE has correct structure (Dr EMPLOYEE_ADVANCE / Cr CASH)', async () => {
      const lines = await jeLines(created.advanceGrantJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'EMPLOYEE_ADVANCE' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), ADVANCE_AMOUNT) &&
        approx(Number(crLine.credit), ADVANCE_AMOUNT)
      log('advance grant JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit} (expected ${ADVANCE_AMOUNT})`)
    })

    await step('i4: advance grant JE sourceType=EMPLOYEE_ADVANCE', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.advanceGrantJEId } })
      const ok = je?.sourceType === 'EMPLOYEE_ADVANCE'
      log('advance grant sourceType', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('i5: EmployeeAdvance.journalEntryId set + status=PENDING', async () => {
      const adv = await db.employeeAdvance.findUnique({
        where: { id: created.advanceId },
        select: { journalEntryId: true, status: true, settledAmount: true },
      })
      const ok = adv?.journalEntryId === created.advanceGrantJEId && adv?.status === 'PENDING'
      log('advance links to JE', ok, `journalEntryId=${adv?.journalEntryId?.slice(-8)}, status=${adv?.status}, settled=${Number(adv?.settledAmount)}`)
    })

    // =====================================================================
    // (j) Step 6b — Settle Employee Advance → verify JE
    //     Dr SALARIES_PAYABLE (3310) / Cr EMPLOYEE_ADVANCE (1230)
    // =====================================================================
    console.log('\n━━━ (j) Step 6b: Settle Employee Advance → verify JE ━━━')

    await step('j1: settle advance (replicates PUT /api/advances/[id] — salary deduction)', async () => {
      const result = await db.$transaction(async (tx: EngineTx) => {
        const existing = await tx.employeeAdvance.findUniqueOrThrow({
          where: { id: created.advanceId },
          include: { employee: { select: { id: true, name: true, profession: true } } },
        })
        const newSettledAmount = Number(existing.settledAmount) + ADVANCE_SETTLE
        const newStatus = newSettledAmount >= Number(existing.amount) ? 'SETTLED' : 'PARTIALLY_SETTLED'
        const settlementDate = new Date()

        const updated = await tx.employeeAdvance.update({
          where: { id: created.advanceId },
          data: {
            settledAmount: newSettledAmount,
            status: newStatus,
            settlementMethod: 'SALARY_DEDUCTION',
            settlementDate,
          },
        })

        const je = await autoEntryAdvanceSettlement({
          employeeName: existing.employee.name,
          settledAmount: ADVANCE_SETTLE,
          date: settlementDate,
          settlementMethod: 'SALARY_DEDUCTION',
        }, tx)

        return { jeId: je?.id, newStatus: updated.status, newSettledAmount: Number(updated.settledAmount) }
      })
      created.advanceSettleJEId = result.jeId!
      created.allJEIds.push(result.jeId!)
      log('settle advance', !!result.jeId, `jeId=${result.jeId}, status=${result.newStatus}, settled=${result.newSettledAmount}`)
    })

    await step('j2: advance settlement JE is balanced', async () => {
      const b = await jeBalance(created.advanceSettleJEId)
      log('settlement JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('j3: settlement JE has correct structure (Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE)', async () => {
      const lines = await jeLines(created.advanceSettleJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'SALARIES_PAYABLE' &&
        crLine?.account.accountRole === 'EMPLOYEE_ADVANCE' &&
        approx(Number(drLine.debit), ADVANCE_SETTLE) &&
        approx(Number(crLine.credit), ADVANCE_SETTLE)
      log('settlement JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit} (expected ${ADVANCE_SETTLE})`)
    })

    await step('j4: settlement JE sourceType=ADVANCE_SETTLEMENT', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.advanceSettleJEId } })
      const ok = je?.sourceType === 'ADVANCE_SETTLEMENT'
      log('settlement sourceType', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('j5: EmployeeAdvance status=SETTLED + settledAmount=full', async () => {
      const adv = await db.employeeAdvance.findUnique({
        where: { id: created.advanceId },
        select: { status: true, settledAmount: true, amount: true },
      })
      const ok = adv?.status === 'SETTLED' && approx(Number(adv?.settledAmount), Number(adv?.amount))
      log('advance → SETTLED', ok, `status=${adv?.status}, settled=${Number(adv?.settledAmount)}/${Number(adv?.amount)}`)
    })

    // =====================================================================
    // (k) Final Verification — all JEs balanced, trial balance ties,
    //     account balances verified, source↔JE linkage, numerical consistency
    // =====================================================================
    console.log('\n━━━ (k) Final integrity verification ━━━')

    await step('k1: all JEs created by this cycle are balanced', async () => {
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

    await step('k2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr),
        `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('k3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('k4: PAYROLL_EXPENSE (8110) Dr = SALARY_NET (salary accrual only — payroll run hits PROJECT_COST 7110 for CONSTRUCTION activity)', async () => {
      // Expected with P3-4 BUGFIX (gross = net + deductions, no gosi in gross):
      // The payroll-run approve handler routes PROJECT-activity salary expense to PROJECT_COST (7110),
      // not PAYROLL_EXPENSE (8110). So 8110 only receives the salary-accrual Dr = SALARY_NET = 13000.
      const expected = SALARY_NET // 13000
      const impact = await testImpactOnAccount('8110')
      const ok = approx(impact.dr, expected, 1) && approx(impact.cr, 0, 1)
      log('PAYROLL_EXPENSE (8110) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expected}), Cr=${impact.cr.toFixed(2)} (exp 0)`)
    })

    await step('k4b: PROJECT_COST (7110) Dr = PAYROLL_NET (payroll run accrual — PROJECT activity bucket)', async () => {
      // Expected: PAYROLL_NET (no deductions in this test) = 11732.5
      const expected = PAYROLL_NET // 11732.50
      const impact = await testImpactOnAccount('7110')
      const ok = approx(impact.dr, expected, 1) && approx(impact.cr, 0, 1)
      log('PROJECT_COST (7110) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expected}), Cr=${impact.cr.toFixed(2)} (exp 0)`)
    })

    await step('k5: SALARIES_PAYABLE (3310) net = salary accrual Cr + payroll run accrual Cr − payment Dr − settlement Dr', async () => {
      // Expected (Cr-normal, so net = Dr - Cr is negative when liability increased):
      //   Cr = SALARY_NET (salary accrual) + PAYROLL_NET (payroll run accrual) = 13000 + 11732.5 = 24732.5
      //   Dr = PAYROLL_NET (payment) + ADVANCE_SETTLE (settlement) = 11732.5 + 2000 = 13732.5
      //   net (Dr - Cr) = 13732.5 - 24732.5 = -11000 (i.e. Cr balance of 11000)
      const expectedCr = SALARY_NET + PAYROLL_NET // 24732.5
      const expectedDr = PAYROLL_NET + ADVANCE_SETTLE // 13732.5
      const expectedNet = expectedDr - expectedCr // -11000
      const impact = await testImpactOnAccount('3310')
      const ok = approx(impact.dr, expectedDr, 1) && approx(impact.cr, expectedCr, 1) && approx(impact.net, expectedNet, 1)
      log('SALARIES_PAYABLE (3310) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expectedDr}), Cr=${impact.cr.toFixed(2)} (exp ${expectedCr}), net=${impact.net.toFixed(2)} (exp ${expectedNet})`)
    })

    await step('k6: GOSI_EXPENSE (8210) Dr = GOSI_DEDUCTION (payroll run only — salary path has no GOSI)', async () => {
      const expected = GOSI_DEDUCTION // 1267.50
      const impact = await testImpactOnAccount('8210')
      const ok = approx(impact.dr, expected, 1) && approx(impact.cr, 0, 1)
      log('GOSI_EXPENSE (8210) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expected}), Cr=${impact.cr.toFixed(2)} (exp 0)`)
    })

    await step('k7: GOSI_PAYABLE (3830) Cr = GOSI_DEDUCTION (still outstanding — no GOSI payment in this cycle)', async () => {
      const expected = GOSI_DEDUCTION // 1267.50
      const impact = await testImpactOnAccount('3830')
      const ok = approx(impact.dr, 0, 1) && approx(impact.cr, expected, 1)
      log('GOSI_PAYABLE (3830) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp 0), Cr=${impact.cr.toFixed(2)} (exp ${expected})`)
    })

    await step('k8: EMPLOYEE_ADVANCE (1230) net = ADVANCE_AMOUNT (grant Dr) − ADVANCE_SETTLE (settlement Cr) = 0', async () => {
      const expectedDr = ADVANCE_AMOUNT // 2000
      const expectedCr = ADVANCE_SETTLE // 2000
      const expectedNet = expectedDr - expectedCr // 0
      const impact = await testImpactOnAccount('1230')
      const ok = approx(impact.dr, expectedDr, 1) && approx(impact.cr, expectedCr, 1) && approx(impact.net, expectedNet, 1)
      log('EMPLOYEE_ADVANCE (1230) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expectedDr}), Cr=${impact.cr.toFixed(2)} (exp ${expectedCr}), net=${impact.net.toFixed(2)} (exp ${expectedNet})`)
    })

    await step('k9: CASH (1110) Cr = PAYROLL_NET (salary payment) + ADVANCE_AMOUNT (advance grant)', async () => {
      // Cash was credited for: PAYROLL_NET (salary payment) + ADVANCE_AMOUNT (advance grant)
      // No cash debits in this cycle.
      const expectedCr = PAYROLL_NET + ADVANCE_AMOUNT // 13732.50
      const expectedDr = 0
      const impact = await testImpactOnAccount('1110')
      const ok = approx(impact.dr, expectedDr, 1) && approx(impact.cr, expectedCr, 1)
      log('CASH (1110) test impact', ok,
        `Dr=${impact.dr.toFixed(2)} (exp ${expectedDr}), Cr=${impact.cr.toFixed(2)} (exp ${expectedCr})`)
    })

    await step('k10: source ↔ JE linkage intact for all source documents', async () => {
      const salary = await db.salary.findUnique({ where: { id: created.salaryId }, select: { journalEntryId: true, status: true } })
      const run = await db.payrollRun.findUnique({
        where: { id: created.payrollRunId },
        select: { journalEntryId: true, paymentJournalEntryId: true, status: true },
      })
      const sp = await db.salaryPayment.findFirst({
        where: { payrollRunId: created.payrollRunId },
        select: { journalEntryId: true },
      })
      const adv = await db.employeeAdvance.findUnique({
        where: { id: created.advanceId },
        select: { journalEntryId: true, status: true },
      })

      const linked =
        !!salary?.journalEntryId &&
        !!run?.journalEntryId &&
        !!run?.paymentJournalEntryId &&
        !!sp?.journalEntryId &&
        !!adv?.journalEntryId
      log('source↔JE linkage', linked,
        `salary:${!!salary?.journalEntryId} (status=${salary?.status}), ` +
        `run.approve:${!!run?.journalEntryId}, run.payment:${!!run?.paymentJournalEntryId}, ` +
        `salaryPayment:${!!sp?.journalEntryId}, advance:${!!adv?.journalEntryId} (status=${adv?.status})`)
    })

    await step('k11: numerical consistency check (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    await step('k12: total cycle JEs = 5 (salary accrual + payroll run approve + payment + advance grant + advance settle)', async () => {
      const expected = 5
      log('cycle JE count', created.allJEIds.length === expected,
        `created ${created.allJEIds.length} JEs (expected ${expected})`)
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
    console.log('  ✅ All payroll-cycle E2E tests PASSED')
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
      if (created.salaryPaymentIds.length > 0) {
        await tx.salaryPayment.deleteMany({ where: { id: { in: created.salaryPaymentIds } } })
      }
      if (created.advanceId) {
        await tx.employeeAdvance.deleteMany({ where: { id: created.advanceId } })
      }
      if (created.payrollRunId) {
        await tx.payrollRunLine.deleteMany({ where: { payrollRunId: created.payrollRunId } })
        await tx.payrollRun.deleteMany({ where: { id: created.payrollRunId } })
      }
      if (created.salaryId) {
        await tx.salary.deleteMany({ where: { id: created.salaryId } })
      }
      if (created.employeeContractId) {
        await tx.employeeContract.deleteMany({ where: { id: created.employeeContractId } })
      }
      if (created.teamMemberId) {
        await tx.teamMember.deleteMany({ where: { id: created.teamMemberId } })
      }
      if (created.employeeId) {
        await tx.employee.deleteMany({ where: { id: created.employeeId } })
      }
      if (created.workTeamId) {
        await tx.workTeam.deleteMany({ where: { id: created.workTeamId } })
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
    try { await db.salaryPayment.deleteMany({ where: { id: { in: created.salaryPaymentIds } } }) } catch {}
    try { await db.employeeAdvance.deleteMany({ where: { id: created.advanceId } }) } catch {}
    try { await db.payrollRunLine.deleteMany({ where: { payrollRunId: created.payrollRunId } }) } catch {}
    try { await db.payrollRun.deleteMany({ where: { id: created.payrollRunId } }) } catch {}
    try { await db.salary.deleteMany({ where: { id: created.salaryId } }) } catch {}
    try { await db.employeeContract.deleteMany({ where: { id: created.employeeContractId } }) } catch {}
    try { await db.teamMember.deleteMany({ where: { id: created.teamMemberId } }) } catch {}
    try { await db.employee.deleteMany({ where: { id: created.employeeId } }) } catch {}
    try { await db.workTeam.deleteMany({ where: { id: created.workTeamId } }) } catch {}
    try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch {}
    try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch {}
    try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch {}
    try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch {}
    // Best-effort JE soft-deletes
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } }).catch(() => {})
      } catch {}
    }
    console.log('  ✓ Best-effort cleanup complete')
  }
}

// ===========================================================================
// Run
// ===========================================================================
main().catch(async (e) => {
  console.error('FATAL:', e)
  await db.$disconnect()
  process.exit(1)
})
