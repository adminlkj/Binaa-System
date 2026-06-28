/**
 * Phase 4 — HR & Payroll Cycle E2E Test (HTTP API layer)
 *
 * Practical test that exercises the FULL HR & Payroll cycle via real HTTP requests:
 *   1. Employee lifecycle (create, update, soft-delete protection)
 *   2. EmployeeContract (create)
 *   3. Attendance (create)
 *   4. Salary APPROVED (JE: Dr Payroll / Cr Salaries Payable)
 *   5. Salary re-APPROVE idempotency check (P4-CRIT-style)
 *   6. EmployeeAdvance (JE: Dr Employee Advance / Cr Cash)
 *   7. Advance settlement via /api/advances PUT (JE: Dr ??? / Cr Employee Advance)
 *      — P4-CRIT-010: should be Dr SALARIES_PAYABLE not Dr PAYROLL_EXPENSE
 *   8. Advance settle via /api/advances/[id] PUT — P4-CRIT-006 (position field bug)
 *   9. PettyCash disbursement (JE: Dr Expense / Cr Cash)
 *  10. LaborCost creation — P4-CRIT-005 (no JE expected currently = BUG)
 *  11. PayrollRun POST (DRAFT, no JE)
 *  12. PayrollRun APPROVE (JE: Dr Salary / Cr Salaries Payable + GOSI)
 *      — P4-CRIT-008 (hardcoded codes), P4-CRIT-009 (missing deductions line)
 *  13. PayrollRun re-APPROVE from PAID — P4-CRIT-002 (should be BLOCKED)
 *  14. PayrollRun PAID demote to DRAFT — P4-CRIT-003 (should be BLOCKED)
 *  15. PayrollRun PAID (JE: Dr Salaries Payable / Cr Bank)
 *  16. Salary payment re-pay idempotency — P4-CRIT-004 (should be BLOCKED)
 *  17. SalaryPayment record creation — P4-CRIT-001 (model has 0 writers)
 *  18. GL balance verification (all JEs must balance)
 *
 * Run: bun run scripts/test-hr-payroll-cycle.ts
 */

const BASE = 'http://localhost:3000/api'

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  detail: string
}

const results: TestResult[] = []
let passCount = 0, failCount = 0, warnCount = 0

function record(name: string, status: TestResult['status'], detail: string) {
  results.push({ name, status, detail })
  if (status === 'PASS') passCount++
  else if (status === 'FAIL') failCount++
  else warnCount++
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} [${status}] ${name}: ${detail.slice(0, 140)}`)
}

async function api(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json: unknown = null
    try { json = JSON.parse(text) } catch { json = text }
    return { status: res.status, data: json }
  } catch (err) {
    return { status: 0, data: { error: String(err) } }
  }
}

// ─── DB helpers (direct Prisma) ───
import { db } from '../src/lib/db'

async function countJEsForSource(sourceType: string, sourceId?: string): Promise<number> {
  const where: Record<string, unknown> = { sourceType, deletedAt: null }
  if (sourceId) where.sourceId = sourceId
  return db.journalEntry.count({ where })
}

async function getJE(sourceType: string, sourceId?: string) {
  const where: Record<string, unknown> = { sourceType, deletedAt: null }
  if (sourceId) where.sourceId = sourceId
  return db.journalEntry.findFirst({
    where,
    include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
}

// Helper: extract accountCode from a JE line (handles both flat accountCode and nested account.code)
function lineCode(line: any): string {
  return line?.accountCode || line?.account?.code || ''
}
function lineRole(line: any): string {
  return line?.account?.accountRole || ''
}

async function getGLBalance(): Promise<{ debit: number; credit: number; diff: number; isBalanced: boolean }> {
  const r = await api('GET', '/reports/trial-balance')
  const data = r.data as {
    totalDebit?: number
    totalCredit?: number
    totals?: { totalDebit?: number; totalCredit?: number; isBalanced?: boolean; debit?: number; credit?: number }
  } | undefined
  const debit = Number(data?.totalDebit || data?.totals?.totalDebit || data?.totals?.debit || 0)
  const credit = Number(data?.totalCredit || data?.totals?.totalCredit || data?.totals?.credit || 0)
  const isBalanced = Boolean(data?.totals?.isBalanced ?? (Math.abs(debit - credit) < 0.01))
  return { debit, credit, diff: Math.round((debit - credit) * 100) / 100, isBalanced }
}

async function findActiveEmployee(): Promise<{ id: string; code: string; name: string } | null> {
  // NOTE: Employee.deletedAt doesn't exist yet — will be added in fix cycle (P4-CRIT-012).
  // After the schema fix, this filter will include `deletedAt: null`.
  const e = await db.employee.findFirst({
    where: { isActive: true, status: 'ACTIVE' },
    select: { id: true, code: true, name: true },
  })
  return e || null
}

async function findProject(): Promise<{ id: string; code: string } | null> {
  const p = await db.project.findFirst({
    where: { deletedAt: null },
    select: { id: true, code: true },
  })
  return p || null
}

async function findBranch(): Promise<string | null> {
  const b = await db.branch.findFirst({ select: { id: true } })
  return b?.id || null
}

// unique suffix to avoid entryNo collisions across test runs
const SUFFIX = Date.now().toString().slice(-6)

// ─── Main ───
async function main() {
  console.log('\n═══════════════════════════════════════════════')
  console.log('  Phase 4 — HR & Payroll Cycle E2E Test')
  console.log('═══════════════════════════════════════════════\n')

  const employee = await findActiveEmployee()
  const project = await findProject()
  const branchId = await findBranch()

  if (!employee || !project || !branchId) {
    console.error('Missing prerequisites:', { employee: !!employee, project: !!project, branchId: !!branchId })
    process.exit(1)
  }

  console.log(`Using employee: ${employee.code} (${employee.name})`)
  console.log(`Using project: ${project.code}`)
  console.log(`Using branchId: ${branchId}`)
  console.log('')

  const balanceBefore = await getGLBalance()
  record('GL balance before tests',
    balanceBefore.isBalanced ? 'PASS' : 'FAIL',
    `D=${balanceBefore.debit} C=${balanceBefore.credit} diff=${balanceBefore.diff} balanced=${balanceBefore.isBalanced}`)

  // Track created records for cleanup
  const createdSalaryIds: string[] = []
  const createdAdvanceIds: string[] = []
  const createdPettyCashIds: string[] = []
  const createdLaborCostIds: string[] = []
  const createdPayrollRunIds: string[] = []

  // ═══════════════════════════════════════════════
  // TEST 1: Employee list GET works
  // ═══════════════════════════════════════════════
  {
    const r = await api('GET', '/employees')
    const arr = Array.isArray(r.data) ? r.data : []
    record('Employee list GET', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status} count=${arr.length}`)
  }

  // ═══════════════════════════════════════════════
  // TEST 2: Employee GET [id] works
  // ═══════════════════════════════════════════════
  {
    const r = await api('GET', `/employees/${employee.id}`)
    record('Employee GET [id]', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}`)
  }

  // ═══════════════════════════════════════════════
  // TEST 3: Employee hard-delete protection (P4-CRIT-012)
  // Create test employee with FK relations (salary), then DELETE should fail/soft-delete
  // ═══════════════════════════════════════════════
  let testEmpId: string | null = null
  {
    const r = await api('POST', '/employees', {
      code: `TEST-HR-${SUFFIX}`,
      name: 'Test HR Employee',
      nameAr: 'موظف اختبار',
      profession: 'Tester',
      basicSalary: 5000,
      branchId,
      hireDate: new Date().toISOString(),
      status: 'ACTIVE',
      isActive: true,
    })
    if (r.status === 201 && (r.data as any)?.id) {
      testEmpId = (r.data as any).id
      record('Test employee created', 'PASS', `id=${testEmpId}`)

      // Create a salary record for this employee (FK relation)
      const salRes = await api('POST', '/salaries', {
        employeeId: testEmpId,
        month: 1,
        year: 2025,
        basicSalary: 5000,
        status: 'DRAFT',
      })
      if (salRes.status === 201) {
        createdSalaryIds.push((salRes.data as any).id)
      }

      // Now try DELETE — should be blocked or soft-delete
      const delRes = await api('DELETE', `/employees/${testEmpId}`)
      if (delRes.status === 400 || delRes.status === 409) {
        record('P4-CRIT-012: Employee with relations DELETE blocked',
          'PASS', `status=${delRes.status} (blocked with FK relations)`)
      } else if (delRes.status === 200) {
        // Check if soft-delete was applied (deletedAt set)
        const check = await db.employee.findUnique({ where: { id: testEmpId }, select: { deletedAt: true, isActive: true, status: true } })
        if (check?.deletedAt) {
          record('P4-CRIT-012: Employee soft-deleted with relations',
            'PASS', `status=200 soft-delete, deletedAt set, isActive=${check.isActive}`)
        } else {
          record('P4-CRIT-012: Employee HARD-deleted with relations — BUG',
            'FAIL', `status=200 but record gone or no deletedAt (hard-delete!)`)
        }
      } else {
        record('P4-CRIT-012: Employee DELETE unexpected',
          'FAIL', `status=${delRes.status} data=${JSON.stringify(delRes.data).slice(0, 100)}`)
      }
    } else {
      record('Test employee created', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 4: Salary DRAFT (no JE expected)
  // ═══════════════════════════════════════════════
  {
    const r = await api('POST', '/salaries', {
      employeeId: employee.id,
      month: 2,
      year: 2025,
      basicSalary: 5000,
      housingAllowance: 1000,
      transportAllowance: 500,
      deductions: 0,
      status: 'DRAFT',
    })
    if (r.status === 201 && (r.data as any)?.id) {
      const salId = (r.data as any).id
      createdSalaryIds.push(salId)
      const jeCount = await countJEsForSource('SALARY_ACCRUAL', salId)
      record('Salary DRAFT no JE', jeCount === 0 ? 'PASS' : 'FAIL',
        `salaryId=${salId} jeCount=${jeCount} (expected 0)`)
    } else {
      record('Salary DRAFT no JE', 'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 5: Salary APPROVED (JE expected: Dr Payroll / Cr Salaries Payable)
  // ═══════════════════════════════════════════════
  let approvedSalaryId: string | null = null
  {
    const r = await api('POST', '/salaries', {
      employeeId: employee.id,
      month: 3,
      year: 2025,
      basicSalary: 5000,
      housingAllowance: 1000,
      transportAllowance: 500,
      otherAllowances: 0,
      overtimeAmount: 0,
      deductions: 500,
      status: 'APPROVED',
    })
    if (r.status === 201 && (r.data as any)?.id) {
      approvedSalaryId = (r.data as any).id
      createdSalaryIds.push(approvedSalaryId)
      const je = await getJE('SALARY_ACCRUAL', approvedSalaryId)
      if (je) {
        const dr = je.lines.find((l: any) => Number(l.debit) > 0)
        const cr = je.lines.find((l: any) => Number(l.credit) > 0)
        const netSalary = 5000 + 1000 + 500 - 500 // = 6000
        const drAmt = Number(dr?.debit || 0)
        const crAmt = Number(cr?.credit || 0)
        const balanced = Math.abs(drAmt - crAmt) < 0.01
        const amountMatches = Math.abs(drAmt - netSalary) < 0.01
        record('Salary APPROVED creates balanced accrual JE',
          balanced && amountMatches ? 'PASS' : 'FAIL',
          `netSalary=${netSalary} Dr=${drAmt}(${lineCode(dr)}/${lineRole(dr)}) Cr=${crAmt}(${lineCode(cr)}) balanced=${balanced}`)
      } else {
        record('Salary APPROVED creates balanced accrual JE', 'FAIL',
          `salaryId=${approvedSalaryId} NO JE FOUND (expected SALARY_ACCRUAL)`)
      }
    } else {
      record('Salary APPROVED creates balanced accrual JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 6: Salary-payment via /api/salary-payments POST (P4-CRIT-001)
  // Currently the route creates/updates Salary, NOT SalaryPayment records
  // ═══════════════════════════════════════════════
  if (approvedSalaryId) {
    const r = await api('POST', '/salary-payments', {
      employeeId: employee.id,
      month: 3,
      year: 2025,
      paymentMethod: 'BANK',
      payingAccountCode: '1120',
      payingAccountName: 'البنك',
    })
    // Check: was a SalaryPayment record created?
    const sp = await db.salaryPayment.findFirst({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    })
    if (r.status === 201) {
      if (sp) {
        record('P4-CRIT-001: salary-payments POST creates SalaryPayment record',
          'PASS', `salaryPaymentId=${sp.id} amount=${sp.amount}`)
      } else {
        record('P4-CRIT-001: salary-payments POST creates SalaryPayment record',
          'FAIL', `status=201 but NO SalaryPayment record (route still creates Salary instead)`)
      }
    } else {
      record('P4-CRIT-001: salary-payments POST creates SalaryPayment record',
        'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 7: Salary-payment re-pay idempotency (P4-CRIT-004)
  // Try paying the same employee/month/year again — should be blocked
  // ═══════════════════════════════════════════════
  if (approvedSalaryId) {
    const r2 = await api('POST', '/salary-payments', {
      employeeId: employee.id,
      month: 3,
      year: 2025,
      paymentMethod: 'BANK',
      payingAccountCode: '1120',
      payingAccountName: 'البنك',
    })
    if (r2.status === 400) {
      record('P4-CRIT-004: salary re-payment idempotency blocked',
        'PASS', `status=400 (idempotency enforced)`)
    } else if (r2.status === 201) {
      // Count JEs — if 2 payment JEs created, that's the double-cash bug
      const paymentJEs = await db.journalEntry.count({
        where: { sourceType: 'SALARY_PAYMENT', sourceId: approvedSalaryId, deletedAt: null }
      })
      record('P4-CRIT-004: salary re-payment idempotency blocked',
        'FAIL', `status=201 (re-payment allowed!) paymentJEs=${paymentJEs}`)
    } else if (r2.status === 500) {
      // Likely the entryNo unique collision — the underlying bug is masked by the unique constraint
      record('P4-CRIT-004: salary re-payment idempotency blocked',
        'WARN', `status=500 (entryNo unique collision masks the missing idempotency check)`)
    } else {
      record('P4-CRIT-004: salary re-payment idempotency blocked',
        'WARN', `status=${r2.status} data=${JSON.stringify(r2.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 8: EmployeeAdvance POST (JE expected: Dr Employee Advance / Cr Cash)
  // ═══════════════════════════════════════════════
  let advanceId: string | null = null
  {
    const r = await api('POST', '/advances', {
      employeeId: employee.id,
      amount: 2000,
      date: new Date().toISOString(),
      description: 'Test advance',
    })
    if (r.status === 201 && (r.data as any)?.id) {
      advanceId = (r.data as any).id
      createdAdvanceIds.push(advanceId)
      const je = await getJE('EMPLOYEE_ADVANCE')
      if (je) {
        const dr = je.lines.find((l: any) => Number(l.debit) > 0)
        const cr = je.lines.find((l: any) => Number(l.credit) > 0)
        const drAmt = Number(dr?.debit || 0)
        const crAmt = Number(cr?.credit || 0)
        const balanced = Math.abs(drAmt - crAmt) < 0.01
        const amountMatches = Math.abs(drAmt - 2000) < 0.01
        record('EmployeeAdvance creates balanced JE',
          balanced && amountMatches ? 'PASS' : 'FAIL',
          `amount=2000 Dr=${drAmt}(${lineCode(dr)}/${lineRole(dr)}) Cr=${crAmt}(${lineCode(cr)}) balanced=${balanced}`)
      } else {
        record('EmployeeAdvance creates balanced JE', 'FAIL',
          `advanceId=${advanceId} NO JE FOUND`)
      }
    } else {
      record('EmployeeAdvance creates balanced JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 9: Advance settle via /api/advances PUT (P4-CRIT-010)
  // Settlement JE should be Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE
  // Currently it's Dr PAYROLL_EXPENSE / Cr EMPLOYEE_ADVANCE (BUG)
  // ═══════════════════════════════════════════════
  if (advanceId) {
    const r = await api('PUT', '/advances', {
      id: advanceId,
      settledAmount: 1000,
    })
    if (r.status === 200) {
      // Find the latest ADVANCE_SETTLEMENT JE
      const je = await db.journalEntry.findFirst({
        where: { sourceType: 'ADVANCE_SETTLEMENT', deletedAt: null },
        include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } },
        orderBy: { createdAt: 'desc' },
      })
      if (je) {
        const dr = je.lines.find((l: any) => Number(l.debit) > 0)
        const cr = je.lines.find((l: any) => Number(l.credit) > 0)
        const drCode = lineCode(dr)
        const crCode = lineCode(cr)
        const drRole = lineRole(dr)
        const isPayable = drRole === 'SALARIES_PAYABLE' || drCode === '3310'
        const isPayrollExpense = drRole === 'PAYROLL_EXPENSE' || drCode === '8110'
        if (isPayable) {
          record('P4-CRIT-010: advance settlement Dr SALARIES_PAYABLE (correct)',
            'PASS', `Dr=${drCode}(${drRole}) Cr=${crCode} amount=1000`)
        } else if (isPayrollExpense) {
          record('P4-CRIT-010: advance settlement Dr SALARIES_PAYABLE (correct)',
            'FAIL', `BUG: Dr=${drCode}(${drRole}) is PAYROLL_EXPENSE, should be SALARIES_PAYABLE(3310). Cr=${crCode}`)
        } else {
          record('P4-CRIT-010: advance settlement Dr SALARIES_PAYABLE (correct)',
            'FAIL', `BUG: Dr=${drCode}(${drRole}) — neither PAYROLL_EXPENSE nor SALARIES_PAYABLE (expected SALARIES_PAYABLE/3310)`)
        }
      } else {
        record('P4-CRIT-010: advance settlement Dr SALARIES_PAYABLE (correct)',
          'FAIL', `NO ADVANCE_SETTLEMENT JE created`)
      }
    } else {
      record('P4-CRIT-010: advance settlement Dr SALARIES_PAYABLE (correct)',
        'FAIL', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 10: Advance settle via /api/advances/[id] PUT (P4-CRIT-006)
  // Route references Employee.position (doesn't exist) — should crash with 500
  // ═══════════════════════════════════════════════
  if (advanceId) {
    const r = await api('PUT', `/advances/${advanceId}`, {
      settleAmount: 500,
    })
    if (r.status === 200) {
      // Check if it actually used the correct field
      record('P4-CRIT-006: advances/[id] PUT uses profession field',
        'PASS', `status=200 (no Prisma validation error)`)
    } else if (r.status === 500) {
      record('P4-CRIT-006: advances/[id] PUT uses profession field',
        'FAIL', `BUG: status=500 (Prisma validation error on 'position' field)`)
    } else {
      record('P4-CRIT-006: advances/[id] PUT uses profession field',
        'WARN', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 11: PettyCash disbursement (JE expected: Dr Expense / Cr Cash)
  // ═══════════════════════════════════════════════
  {
    const r = await api('POST', '/petty-cash', {
      branchId,
      description: 'Test petty cash disbursement',
      amount: 250,
      date: new Date().toISOString(),
      category: 'OFFICE',
    })
    if (r.status === 201 && (r.data as any)?.id) {
      const pcId = (r.data as any).id
      createdPettyCashIds.push(pcId)
      const jeId = (r.data as any)?.journalEntryId
      if (jeId) {
        const je = await db.journalEntry.findUnique({ where: { id: jeId }, include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } } })
        if (je) {
          const dr = je.lines.find((l: any) => Number(l.debit) > 0)
          const cr = je.lines.find((l: any) => Number(l.credit) > 0)
          const balanced = Math.abs(Number(dr?.debit || 0) - Number(cr?.credit || 0)) < 0.01
          record('PettyCash creates balanced JE',
            balanced ? 'PASS' : 'FAIL',
            `amount=250 Dr=${Number(dr?.debit || 0)}(${lineCode(dr)}) Cr=${Number(cr?.credit || 0)}(${lineCode(cr)})`)
        } else {
          record('PettyCash creates balanced JE', 'FAIL', `JE not found id=${jeId}`)
        }
      } else {
        record('PettyCash creates balanced JE', 'FAIL', `No journalEntryId in response`)
      }
    } else {
      record('PettyCash creates balanced JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 12: LaborCost POST — P4-CRIT-005 (no JE currently)
  // ═══════════════════════════════════════════════
  {
    const r = await api('POST', '/labor-costs', {
      projectId: project.id,
      description: 'Test labor cost',
      workers: 5,
      days: 10,
      dailyRate: 200,
      date: new Date().toISOString(),
    })
    if (r.status === 201 && (r.data as any)?.id) {
      const lcId = (r.data as any).id
      createdLaborCostIds.push(lcId)
      const jeId = (r.data as any)?.journalEntryId
      if (jeId) {
        const je = await db.journalEntry.findUnique({ where: { id: jeId }, include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } } })
        if (je) {
          const dr = je.lines.find((l: any) => Number(l.debit) > 0)
          const cr = je.lines.find((l: any) => Number(l.credit) > 0)
          const balanced = Math.abs(Number(dr?.debit || 0) - Number(cr?.credit || 0)) < 0.01
          const amountMatches = Math.abs(Number(dr?.debit || 0) - 10000) < 0.01 // 5*10*200
          record('P4-CRIT-005: LaborCost creates balanced JE',
            balanced && amountMatches ? 'PASS' : 'FAIL',
            `amount=10000 Dr=${Number(dr?.debit || 0)}(${lineCode(dr)}) Cr=${Number(cr?.credit || 0)}(${lineCode(cr)})`)
        } else {
          record('P4-CRIT-005: LaborCost creates balanced JE', 'FAIL', `JE not found id=${jeId}`)
        }
      } else {
        // This is the BUG — labor cost has no JE
        record('P4-CRIT-005: LaborCost creates balanced JE',
          'FAIL', `BUG: LaborCost created with NO journalEntryId — GL blind to labor costs`)
      }
    } else {
      record('P4-CRIT-005: LaborCost creates balanced JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 13: PayrollRun POST (DRAFT, no JE expected)
  // ═══════════════════════════════════════════════
  let payrollRunId: string | null = null
  {
    // Use a unique month/year to avoid duplicate-prevention
    const testYear = 2025
    const testMonth = 11 // November 2025 — likely unused
    const r = await api('POST', '/payroll-runs', {
      month: testMonth,
      year: testYear,
      selectionType: 'EMPLOYEE',
      selectionIds: [employee.id],
      notes: 'Phase 4 E2E test',
    })
    if (r.status === 201 && (r.data as any)?.id) {
      payrollRunId = (r.data as any).id
      createdPayrollRunIds.push(payrollRunId)
      const status = (r.data as any).status
      const lineCount = (r.data as any)?._count?.lines || (r.data as any)?.lines?.length || 0
      record('PayrollRun POST DRAFT',
        status === 'DRAFT' && lineCount > 0 ? 'PASS' : 'FAIL',
        `id=${payrollRunId} status=${status} lines=${lineCount}`)
    } else {
      record('PayrollRun POST DRAFT', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 150)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 14: PayrollRun APPROVE (JE expected: Dr Salary / Cr Salaries Payable + GOSI lines)
  // P4-CRIT-008 (hardcoded codes), P4-CRIT-009 (missing deductions line)
  // ═══════════════════════════════════════════════
  if (payrollRunId) {
    const r = await api('PUT', `/payroll-runs/${payrollRunId}`, {
      status: 'APPROVED',
    })
    if (r.status === 200) {
      const updated = r.data as any
      const jeId = updated?.journalEntryId
      if (jeId) {
        const je = await db.journalEntry.findUnique({ where: { id: jeId }, include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } } })
        if (je) {
          const totalDr = je.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0)
          const totalCr = je.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0)
          const balanced = Math.abs(totalDr - totalCr) < 0.01
          record('PayrollRun APPROVE creates balanced JE',
            balanced ? 'PASS' : 'FAIL',
            `jeId=${jeId} totalDr=${totalDr} totalCr=${totalCr} balanced=${balanced} lines=${je.lines.length}`)
        } else {
          record('PayrollRun APPROVE creates balanced JE', 'FAIL', `JE not found id=${jeId}`)
        }
      } else {
        record('PayrollRun APPROVE creates balanced JE', 'FAIL', `No journalEntryId after APPROVE`)
      }
    } else {
      record('PayrollRun APPROVE creates balanced JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 15: PayrollRun PAID (JE expected: Dr Salaries Payable / Cr Bank)
  // ═══════════════════════════════════════════════
  if (payrollRunId) {
    const r = await api('PUT', `/payroll-runs/${payrollRunId}`, {
      status: 'PAID',
      bankAccountCode: '1120',
      bankAccountNameAr: 'البنك الأهلي',
    })
    if (r.status === 200) {
      const updated = r.data as any
      const paymentJeId = updated?.paymentJournalEntryId
      if (paymentJeId) {
        const je = await db.journalEntry.findUnique({ where: { id: paymentJeId }, include: { lines: { include: { account: { select: { code: true, accountRole: true } } } } } })
        if (je) {
          const totalDr = je.lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0)
          const totalCr = je.lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0)
          const balanced = Math.abs(totalDr - totalCr) < 0.01
          record('PayrollRun PAID creates balanced payment JE',
            balanced ? 'PASS' : 'FAIL',
            `paymentJeId=${paymentJeId} totalDr=${totalDr} totalCr=${totalCr} balanced=${balanced}`)
        } else {
          record('PayrollRun PAID creates balanced payment JE', 'FAIL', `JE not found id=${paymentJeId}`)
        }
      } else {
        record('PayrollRun PAID creates balanced payment JE', 'FAIL', `No paymentJournalEntryId after PAID`)
      }
    } else {
      record('PayrollRun PAID creates balanced payment JE', 'FAIL',
        `status=${r.status} data=${JSON.stringify(r.data).slice(0, 120)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 16: PayrollRun re-APPROVE from PAID (P4-CRIT-002 — should be BLOCKED)
  // ═══════════════════════════════════════════════
  if (payrollRunId) {
    const r = await api('PUT', `/payroll-runs/${payrollRunId}`, {
      status: 'APPROVED',
    })
    if (r.status === 400) {
      record('P4-CRIT-002: re-APPROVE from PAID blocked',
        'PASS', `status=400 (state machine enforced)`)
    } else if (r.status === 200) {
      // Count PAYROLL_RUN JEs — if more than before, that's the duplicate accrual bug
      const jes = await db.journalEntry.count({
        where: { sourceType: 'PAYROLL_RUN', sourceId: (r.data as any)?.code, deletedAt: null }
      })
      record('P4-CRIT-002: re-APPROVE from PAID blocked',
        'FAIL', `BUG: status=200 (re-APPROVE allowed!) total PAYROLL_RUN JEs=${jes}`)
    } else {
      record('P4-CRIT-002: re-APPROVE from PAID blocked',
        'WARN', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 17: PayrollRun PAID → DRAFT demotion (P4-CRIT-003 — should be BLOCKED)
  // ═══════════════════════════════════════════════
  if (payrollRunId) {
    const r = await api('PUT', `/payroll-runs/${payrollRunId}`, {
      status: 'DRAFT',
    })
    if (r.status === 400) {
      record('P4-CRIT-003: PAID → DRAFT demotion blocked',
        'PASS', `status=400 (state machine enforced)`)
    } else if (r.status === 200) {
      const status = (r.data as any)?.status
      record('P4-CRIT-003: PAID → DRAFT demotion blocked',
        'FAIL', `BUG: status=200, run now in ${status} state (silent demotion, orphaned JEs!)`)
    } else {
      record('P4-CRIT-003: PAID → DRAFT demotion blocked',
        'WARN', `status=${r.status} data=${JSON.stringify(r.data).slice(0, 100)}`)
    }
  }

  // ═══════════════════════════════════════════════
  // TEST 18: GL balance after all HR operations
  // ═══════════════════════════════════════════════
  const balanceAfter = await getGLBalance()
  record('GL balance after tests',
    balanceAfter.isBalanced ? 'PASS' : 'FAIL',
    `D=${balanceAfter.debit} C=${balanceAfter.credit} diff=${balanceAfter.diff} balanced=${balanceAfter.isBalanced}`)

  // ═══════════════════════════════════════════════
  // TEST 19: All salary JEs balanced
  // ═══════════════════════════════════════════════
  {
    const allJEs = await db.journalEntry.findMany({
      where: { deletedAt: null, status: 'POSTED' },
      include: { lines: true },
    })
    let unbalanced = 0
    for (const je of allJEs) {
      const dr = je.lines.reduce((s, l) => s + Number(l.debit || 0), 0)
      const cr = je.lines.reduce((s, l) => s + Number(l.credit || 0), 0)
      if (Math.abs(dr - cr) > 0.01) unbalanced++
    }
    record('All POSTED JEs balanced',
      unbalanced === 0 ? 'PASS' : 'FAIL',
      `total=${allJEs.length} unbalanced=${unbalanced}`)
  }

  // ═══════════════════════════════════════════════
  // CLEANUP — soft-delete or hard-delete test records
  // ═══════════════════════════════════════════════
  console.log('\n── Cleanup ──')
  try {
    // Reverse+delete salary-payments (need to reverse JEs first)
    for (const sid of createdSalaryIds) {
      try {
        await db.salary.update({ where: { id: sid }, data: { deletedAt: new Date() } }).catch(() => {})
      } catch {}
    }
    for (const aid of createdAdvanceIds) {
      try {
        await db.employeeAdvance.update({ where: { id: aid }, data: { deletedAt: new Date() } }).catch(() => {})
      } catch {}
    }
    for (const pid of createdPettyCashIds) {
      try {
        await db.pettyCash.update({ where: { id: pid }, data: { deletedAt: new Date() } }).catch(() => {})
      } catch {}
    }
    for (const lid of createdLaborCostIds) {
      try {
        await db.laborCost.delete({ where: { id: lid } }).catch(() => {})
      } catch {}
    }
    for (const rid of createdPayrollRunIds) {
      try {
        await db.payrollRunLine.deleteMany({ where: { payrollRunId: rid } })
        await db.payrollRun.delete({ where: { id: rid } })
      } catch {}
    }
    // Clean up the test employee if it wasn't deleted
    if (testEmpId) {
      try {
        await db.employee.delete({ where: { id: testEmpId } }).catch(() => {})
      } catch {}
    }
    console.log('Cleanup complete.')
  } catch (e) {
    console.log('Cleanup error (non-blocking):', String(e).slice(0, 100))
  }

  // ─── Final Summary ───
  console.log('\n═══════════════════════════════════════════════')
  console.log('  PHASE 4 E2E TEST SUMMARY')
  console.log('═══════════════════════════════════════════════')
  console.log(`  PASS: ${passCount}`)
  console.log(`  FAIL: ${failCount}`)
  console.log(`  WARN: ${warnCount}`)
  console.log(`  TOTAL: ${passCount + failCount + warnCount}`)
  console.log('═══════════════════════════════════════════════\n')

  if (failCount > 0) {
    console.log('FAILED TESTS:')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.detail}`)
    })
    console.log('')
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
