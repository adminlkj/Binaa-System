# Phase 4 Audit — HR & Payroll Cycle

**Auditor:** HR & Payroll Cycle Deep Auditor (Task 4-a, READ-ONLY)
**Scope:** Employee, EmployeeContract, Attendance, Salary, WorkTeam, TeamMember, PayrollRun, PayrollRunLine, SalaryPayment, EmployeeAdvance, LaborCost, PettyCash, Timesheet — all API routes + accounting integration + UI data-fetching correctness.
**Method:** Static code analysis + schema review + JE-flow tracing + cross-reference with `src/lib/accounting/{engine,guard,period-guard}.ts`, `src/lib/account-roles.ts`, `src/lib/auto-journal.ts`. Cross-checked with prior phase reports (01-accounting-engine, 02-projects-cycle, 03-equipment-rental-cycle) to avoid duplicating already-fixed issues.
**Note:** No source files modified — read-only audit. Phase 1 fixes (salary accrual/payment, double-cancellation, period guard at JE level) are explicitly excluded from new issues and listed under "Verified Working".

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 12 |
| HIGH | 16 |
| MEDIUM | 16 |
| LOW | 6 |
| **Total** | **50** |

- **Files audited:** 11 schema models + 25 API route files (11 entities × ~2 routes) + 11 UI components + 5 lib files cross-referenced (`engine.ts`, `guard.ts`, `period-guard.ts`, `account-roles.ts`, `auto-journal.ts`) + `salaries/auto-calculate/route.ts`.
- **Top architectural finding:** `SalaryPayment` model has **zero writers** anywhere in the codebase — the entire salary-payment subledger is permanently empty. The route named `/api/salary-payments` actually creates `Salary` records, while the UI sends `payrollRunId+amount` (which the API rejects because it expects `employeeId+month+year`). The model, the route, and the UI are three disconnected data shapes.
- **Top accounting-integrity finding:** PayrollRun state machine allows re-APPROVE from PAID/PARTIALLY_PAID (creates a duplicate accrual JE without reversing the old one) AND allows silent demotion PAID → DRAFT/REVIEW via the catch-all update (orphaned JEs in GL forever).
- **Top missing-JE finding:** LaborCost has no journal entry creation at all — GL is blind to all project labor costs. (Mirror of P3-CRIT-005 which was fixed for equipment usages but never extended to labor.)
- **Top validation finding:** `advances/[id]/route.ts:31` references `position: true` on Employee, but Employee has `profession` (no `position` field) → every settle attempt crashes with Prisma validation error.

---

## Issue Catalog

### P4-CRIT-001: SalaryPayment model has ZERO writers — entire salary-payment subledger is empty
- **Severity:** CRITICAL
- **Location:** `src/app/api/salary-payments/route.ts` (entire file); `src/app/api/salary-payments/[id]/route.ts:11,31,34`; `prisma/schema.prisma:703-722` (model definition)
- **Description:** The `SalaryPayment` model exists in schema with fields `payrollRunId, employeeId, amount, paymentDate, paymentMethod, reference, journalEntryId`. But:
  - `grep -rn "db.salaryPayment\." src/` → only 3 matches, all in `[id]/route.ts` (DELETE handler): `findUnique`, `delete`, `aggregate`. **Zero `create` calls.**
  - The POST handler at `/api/salary-payments/route.ts` creates a **`Salary` record** (lines 124-159 and 202-224), NOT a `SalaryPayment` record. It updates `Salary.status` to `PAID` and stores `journalEntryId` on the `Salary`.
  - The GET handler at `/api/salary-payments/route.ts` calls `db.salary.findMany` (line 20), NOT `db.salaryPayment.findMany`.
  - The DELETE handler at `/api/salary-payments/[id]/route.ts:11` queries `db.salaryPayment.findUnique` — but no SalaryPayment records ever exist, so this handler is unreachable in practice.
- **Impact:**
  - **Accounting integrity:** `PayrollRun.salaryPayments` relation is always empty. The dashboard's "total remaining" calculation (`eligiblePayrollRuns.reduce(... salaryPayments.reduce ...)` in `salary-payments.tsx:411-414`) always returns the full `totalNet` for every approved run.
  - **Reconciliation impossible:** Cannot audit which employee was paid how much, when, via which bank, with which reference number.
  - **Multiple payments not tracked:** A single Salary → PAID can be re-POSTed to create another payment JE (see P4-CRIT-004 below).
  - **DELETE handler is dead code:** references SalaryPayment that's never created.
- **Evidence:**
  ```
  $ grep -rn "db.salaryPayment\." src/
  src/app/api/salary-payments/[id]/route.ts:11:    const existing = await db.salaryPayment.findUnique({
  src/app/api/salary-payments/[id]/route.ts:31:    await db.salaryPayment.delete({ where: { id } })
  src/app/api/salary-payments/[id]/route.ts:34:    const paidResult = await db.salaryPayment.aggregate({
  # ZERO create calls anywhere
  ```
- **Suggested Fix:** Refactor `/api/salary-payments` POST to actually create `SalaryPayment` records:
  - Validate `payrollRunId` exists and is APPROVED/PARTIALLY_PAID.
  - Create `SalaryPayment` record (employeeId optional — could be a bulk payment to the run).
  - Create payment JE Dr SALARIES_PAYABLE / Cr Cash for `amount`.
  - Update `PayrollRun.paidAmount` (or compute from `salaryPayments` aggregate) and flip status to PAID when fully paid.
  - Get handler should query `db.salaryPayment.findMany` (not `db.salary.findMany`).
  - DELETE handler should reverse the JE (R12) and decrement `PayrollRun.paidAmount`.

### P4-CRIT-002: PayrollRun re-APPROVE from PAID/PARTIALLY_PAID creates duplicate accrual JE
- **Severity:** CRITICAL
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:61-174`
- **Description:** The APPROVED branch is guarded by `if (newStatus === 'APPROVED' && existing.status !== 'APPROVED')` (line 61). This means:
  - **DRAFT → APPROVED**: creates accrual JE ✅ (intended).
  - **REVIEW → APPROVED**: creates accrual JE ✅ (intended).
  - **PARTIALLY_PAID → APPROVED**: creates accrual JE ❌ — but a previous accrual JE already exists (created when the run was first approved), and the previous payment JE also exists. The new accrual JE is created WITHOUT reversing the old one.
  - **PAID → APPROVED**: same — creates a SECOND accrual JE while the original remains POSTED.
  - Line 147 overwrites `journalEntryId = entry.id` (in the loop, last one wins), losing the link to the original JE without reversing it.
- **Impact:** R1 violated (silent duplicate JE). GL double-counts salary expense + GOSI expense. Trial balance inflates both Payroll Expense (8110/7120/7210) and Salaries Payable (3310). Auditor cannot reconcile PayrollRun to GL.
- **Evidence:** Code flow for `PUT /api/payroll-runs/[id]` with `{status:'APPROVED'}` on a PAID run:
  1. `existing.status === 'PAID'`, `newStatus === 'APPROVED'` → `existing.status !== 'APPROVED'` is TRUE → block fires.
  2. Loop over `linesByActivity` → creates new JE per activity, `journalEntryId = entry.id` (overwrites).
  3. `tx.payrollRun.update({ status: 'APPROVED', journalEntryId })` — original `journalEntryId` and `paymentJournalEntryId` are now orphaned in GL.
- **Suggested Fix:** Add a strict state-machine check:
  ```ts
  const validTransitions: Record<PayrollRunStatus, PayrollRunStatus[]> = {
    DRAFT: ['REVIEW', 'APPROVED'],
    REVIEW: ['APPROVED', 'DRAFT'],
    APPROVED: ['PAID', 'DRAFT'],
    PARTIALLY_PAID: [],  // no further state changes — only via SalaryPayment lifecycle
    PAID: [],
  }
  if (!validTransitions[existing.status]?.includes(newStatus)) {
    return NextResponse.json({ error: `Invalid transition ${existing.status} → ${newStatus}` }, { status: 400 })
  }
  ```
  If re-approval is genuinely needed (e.g. to correct an amount), require explicit reversal of the old JE first.

### P4-CRIT-003: PayrollRun state machine allows silent demotion PAID → DRAFT/REVIEW (orphaned JEs)
- **Severity:** CRITICAL
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:261-279` (catch-all update)
- **Description:** The catch-all `tx.payrollRun.update` (line 262) fires for ANY status value not handled by the APPROVED/PAID branches. It blindly writes `status: newStatus` with NO validation, NO reversal of existing JEs. So:
  - `PUT {status:'DRAFT'}` on a PAID run → status becomes DRAFT, but `journalEntryId` and `paymentJournalEntryId` remain set, the JEs remain POSTED in GL.
  - `PUT {status:'REVIEW'}` on an APPROVED run → status becomes REVIEW, accrual JE remains POSTED.
- **Impact:** R1/R12 violated. Orphaned JEs in GL forever. PayrollRun appears as DRAFT in UI but GL has both accrual + payment JEs. Auditor cannot reconcile. Severe data integrity issue.
- **Evidence:**
  ```ts
  // Line 261-279 — NO validation, NO reversal
  const payrollRun = await db.payrollRun.update({
    where: { id },
    data: {
      status: newStatus || existing.status,
      notes: body.notes !== undefined ? body.notes : existing.notes,
    },
    ...
  })
  ```
- **Suggested Fix:** Same as P4-CRIT-002 — enforce strict forward-only state machine. If demotion is needed, require explicit reversal of `journalEntryId` and `paymentJournalEntryId` first (via `reverseEntry` in a `$transaction`).

### P4-CRIT-004: salary-payments POST allows infinite re-payment — no idempotency check
- **Severity:** CRITICAL
- **Location:** `src/app/api/salary-payments/route.ts:199-265` (the "existing salary" branch)
- **Description:** When an existing Salary record exists for `(employeeId, month, year)`:
  - The route updates `Salary.status` to `'PAID'` (line 204).
  - Creates a new payment JE Dr SALARIES_PAYABLE / Cr Cash for `salary.netSalary` (lines 234-245).
  - Updates `Salary.journalEntryId` to the new JE id (line 247-249).
  - **NO CHECK** that the salary is not already PAID. So calling POST again on an already-PAID salary creates another payment JE — DOUBLE-CASH-OUT in GL.
  - Also overwrites the original `journalEntryId`, orphaning the original payment JE in GL.
- **Impact:** R1 violated (duplicate payment JE). Cash account (1110/1120) double-debited. Salaries Payable (3310) goes negative. Auditor cannot reconcile.
- **Evidence:**
  ```ts
  // Line 199-204 — NO status check
  } else {
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const salary = await tx.salary.update({
        where: { id: existingSalary.id },
        data: { status: 'PAID' },  // ← blindly overwrites, even if already PAID
        ...
      })
      // ... creates ANOTHER payment JE ...
  ```
  Also the `entryNo: \`JE-SAL-${salary.employee?.code || 'EMP'}-${month}${year}\`` (line 235) is deterministic — re-paying the same employee for the same month collides on `@unique` entryNo and throws a Prisma P2002 error. So the second attempt actually fails with a 500 error, BUT only because of the entryNo collision — not because of an explicit idempotency check. If the user changes anything (different payingAccountCode), the entryNo still collides. So in practice the bug is masked by the entryNo unique constraint, but the underlying logic is still wrong.
- **Suggested Fix:** Add explicit idempotency:
  ```ts
  if (existingSalary.status === 'PAID') {
    return NextResponse.json({ error: 'الراتب مدفوع بالفعل' }, { status: 400 })
  }
  if (existingSalary.status !== 'APPROVED') {
    return NextResponse.json({ error: 'يجب اعتماد الراتب أولاً' }, { status: 400 })
  }
  ```

### P4-CRIT-005: LaborCost has NO journal entry — GL blind to all project labor costs
- **Severity:** CRITICAL
- **Location:** `src/app/api/labor-costs/route.ts:23-62` (POST); `src/app/api/labor-costs/[id]/route.ts:26-67` (PUT); `src/lib/accounting/engine.ts` (no `autoEntryLaborCost` function exists); `prisma/schema.prisma:1369-1388` (LaborCost has no `journalEntryId` field)
- **Description:** The LaborCost POST route creates a DB record with `totalAmount = workers * days * dailyRate` but creates **no journal entry**. The model also has no `journalEntryId` field to link to a JE even if one were created. The PUT route recalculates totalAmount and updates freely with no JE impact. The DELETE route hard-deletes with no JE reversal (vacuously correct since no JE exists).
- **Impact:**
  - R1 violated (silent missing JE) — GL doesn't reflect any project labor cost.
  - Project profitability reports (`/api/reports/project-profitability`) understate project costs.
  - Project WIP reports (which read JournalLine by cost center) miss all direct labor.
  - Cannot reconcile `LaborCost` table to GL.
  - Mirror of P3-CRIT-005 (EquipmentUsage no JE) which was fixed in Phase 3 but never extended to LaborCost.
- **Evidence:**
  ```
  $ grep -rn "autoEntryLaborCost\|autoEntryLabour" src/
  # ZERO matches — function does not exist
  $ grep -rn "laborCost.journalEntryId\|laborCost\.update.*journalEntryId" src/
  # ZERO matches — field doesn't exist on schema
  ```
- **Suggested Fix:**
  1. Add `journalEntryId String?` and `deletedAt DateTime?` to LaborCost schema.
  2. Add `autoEntryLaborCost` in `engine.ts`: Dr PROJECT_COST (with costCenterId from `Project.costCenter`) / Cr CASH (or LABOR_PAYABLE).
  3. Wrap POST/PUT/DELETE in `$transaction` with the JE call.
  4. Add `LABOR_COST` role to `account-roles.ts` (currently missing).

### P4-CRIT-006: advances/[id]/route.ts references non-existent Employee.position field — every settle attempt crashes
- **Severity:** CRITICAL
- **Location:** `src/app/api/advances/[id]/route.ts:31`
- **Description:** Line 31 reads `employee: { select: { id: true, code: true, name: true, position: true } }`. But the Employee model (`schema.prisma:494-537`) has `profession`, NOT `position`. Prisma throws a validation error: `Unknown argument 'position'`. The route returns 500 every time it's called.
- **Impact:** The advances settlement flow from the UI (`advances.tsx:152-153` calls `fetch('/api/advances/${id}', { method:'PUT' })`) ALWAYS fails. Users cannot settle advances via the [id] route. The only working settle path is the bulk PUT at `/api/advances/route.ts:71` which uses a different shape (`{id, settledAmount, status}` in body) — but the UI doesn't call that one.
- **Evidence:**
  ```ts
  // src/app/api/advances/[id]/route.ts:24-33
  const advance = await db.employeeAdvance.update({
    where: { id },
    data: { settledAmount, status: newStatus },
    include: {
      employee: { select: { id: true, code: true, name: true, position: true } },
      //                                                  ^^^^^^^^^^ INVALID FIELD
    },
  })
  ```
  ```
  $ grep -n "position" prisma/schema.prisma | head -5
  # (no matches in Employee model — Employee has 'profession')
  ```
- **Suggested Fix:** Change `position: true` to `profession: true`. Also: this route has no $transaction, no JE creation (the bulk PUT in `advances/route.ts` does create the settlement JE, but this [id] route does not). Recommend deleting this [id]/route.ts entirely (since `advances/route.ts` already has a PUT that handles settlement with JE) and creating a proper [id] route that mirrors the bulk PUT logic.

### P4-CRIT-007: salary-payments/[id]/route.ts DELETE doesn't reverse JE + null-pointer on payrollRun
- **Severity:** CRITICAL
- **Location:** `src/app/api/salary-payments/[id]/route.ts:11-67`
- **Description:** Two distinct bugs:
  1. **Null pointer:** Line 21 reads `if (existing.payrollRun.status === 'PAID')` — but `SalaryPayment.payrollRunId` is `String?` (nullable). If a SalaryPayment was created with `payrollRunId: null` (which the schema allows), `existing.payrollRun` is `null` → `.status` throws TypeError → 500.
  2. **No JE reversal:** Line 31 `db.salaryPayment.delete` hard-deletes the record. The linked `journalEntryId` JE (if any) is NOT reversed via `reverseEntry()`. R12 violated — orphaned JEs in GL.
  3. **Hard-delete, no soft-delete:** SalaryPayment model has no `deletedAt`, but R12 requires reversal not deletion.
  4. **Status demotion not propagated to Salary:** If this DELETE handler ever ran (it can't, because no SalaryPayment records exist — see P4-CRIT-001), it would update `PayrollRun.status` from PAID back to PARTIALLY_PAID/APPROVED, but it would NOT update the related `Salary.status` from PAID back to APPROVED. Inconsistent state.
- **Impact:** R12 violated. Combined with P4-CRIT-001, this route is dead code (no records to delete), but if SalaryPayment creation is ever fixed, this DELETE handler will produce orphaned JEs and inconsistent Salary status.
- **Evidence:**
  ```ts
  // Line 21 — null-pointer when payrollRunId is null
  if (existing.payrollRun.status === 'PAID') {
    return NextResponse.json({ error: '...' }, { status: 400 })
  }
  // Line 31 — hard-delete, no reverseEntry call
  await db.salaryPayment.delete({ where: { id } })
  ```
- **Suggested Fix:**
  1. Guard: `if (existing.payrollRunId && existing.payrollRun?.status === 'PAID') { ... }`.
  2. Reverse JE: `if (existing.journalEntryId) { await reverseEntry(existing.journalEntryId, tx) }` inside a `$transaction`.
  3. Decrement `PayrollRun.paidAmount` (or recompute from aggregate).
  4. Update `Salary.status` back to `APPROVED` if applicable.
  5. Soft-delete instead of hard-delete.

### P4-CRIT-008: PayrollRun JE uses hardcoded account codes '3310','8210','3830' — bypasses role mapping
- **Severity:** CRITICAL
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:113,123,129,208` (4 hardcoded references)
- **Description:** The PayrollRun APPROVED and PAID blocks build JE lines with hardcoded account codes:
  ```ts
  // Line 113-117
  { accountCode: '3310', debit: 0, credit: totals.totalNet, description: 'رواتب مستحقة' }
  // Line 123-127
  { accountCode: '8210', debit: totals.totalGosi, credit: 0, description: 'تأمينات اجتماعية' }
  // Line 129-133
  { accountCode: '3830', debit: 0, credit: totals.totalGosi, description: 'تأمينات مستحقة' }
  // Line 208
  { accountCode: '3310', debit: totalNet, credit: 0, ... }
  ```
  These bypass `requireAccountByRole(AccountRole.SALARIES_PAYABLE, ...)` etc. which is the SOLE pattern used by every other HR route (salaries/route.ts:58, salary-payments/route.ts:166). The role mapping exists (`SALARIES_PAYABLE → 3310`, `GOSI_EXPENSE → 8210`, `GOSI_PAYABLE → 3830`) but is ignored.
- **Impact:** If the accountant remaps `SALARIES_PAYABLE` from 3310 to a different account (e.g. a sub-ledger account 3311), every other route picks up the new mapping but PayrollRun JE keeps posting to 3310. GL becomes inconsistent across salary flows.
- **Evidence:** See code snippets above.
- **Suggested Fix:** Replace hardcoded codes with role lookups:
  ```ts
  const payableCode = (await requireAccountByRole(AccountRole.SALARIES_PAYABLE, 'مسير رواتب', tx)).code
  const gosiExpenseCode = (await requireAccountByRole(AccountRole.GOSI_EXPENSE, 'مسير رواتب', tx)).code
  const gosiPayableCode = (await requireAccountByRole(AccountRole.GOSI_PAYABLE, 'مسير رواتب', tx)).code
  ```
  Better still: extract the whole accrual/payment JE logic into `autoEntryPayrollRunAccrual` and `autoEntryPayrollRunPayment` functions in `engine.ts` (mirror the pattern used for subcontractors in Phase 2).

### P4-CRIT-009: PayrollRun JE creates GOSI lines but IGNORES other deductions (advances, penalties, etc.)
- **Severity:** CRITICAL
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:78-152` (accrual block); `src/app/api/payroll-runs/route.ts:220-247` (line netSalary calculation)
- **Description:** The PayrollRunLine schema has a `deductions Decimal` field. The POST route calculates `netSalary = lineTotalEntitlement - lineDeductions - gosiDeduction` (line 220 of route.ts). The APPROVED block aggregates lines by activity and creates JE lines for:
  - Dr `<salary account>` = `totals.totalNet` (which is net of deductions AND gosi)
  - Dr `8210` GOSI Expense = `totals.totalGosi`
  - Cr `3310` Salaries Payable = `totals.totalNet`
  - Cr `3830` GOSI Payable = `totals.totalGosi`
  The `deductions` amount (which represents advance recoveries, penalties, absent days, etc.) is **completely missing** from the JE. The Dr side sums to `totalNet + totalGosi`, but the gross salary expense should be `totalAmount` (= `totalNet + totalDeductions + totalGosi`). So the GL **understates salary expense** by `totalDeductions`, and the advance asset / penalty revenue is never relieved/recognized.
- **Impact:** R1 violated (incomplete JE — Dr side doesn't capture gross). Salary Expense account balance doesn't match true gross payroll. If deductions are advance recoveries, the Employee Advance asset (1230) is never reduced → asset inflates forever. If deductions are penalties, penalty revenue is never recognized.
- **Evidence:** Schema field `deductions Decimal @default(0)` at `schema.prisma:684`. Route line 92-93 aggregates only `totalNet` and `totalGosi` — `totalDeductions` is computed on the PayrollRun (`route.ts:251 totalDeductions += lineDeductions`) but never used in the JE.
- **Suggested Fix:** Extend the JE to include a deductions line:
  ```ts
  if (totals.totalDeductions > 0) {
    // If deductions are advance recoveries (most common):
    jeLines.push({ accountCode: advanceCode, debit: 0, credit: totals.totalDeductions, description: 'استرداد سلف الموظفين' })
    // OR if mixed: Dr Salary (gross) / Cr Salaries Payable (net) / Cr GOSI Payable / Cr Employee Advance (recovered)
  }
  ```
  Better: add a `deductionType` enum on PayrollRunLine so each deduction type maps to the correct credit account.

### P4-CRIT-010: autoEntryAdvanceSettlement debits PAYROLL_EXPENSE — inflates salary expense
- **Severity:** CRITICAL
- **Location:** `src/lib/accounting/engine.ts:785-806`; called by `src/app/api/advances/route.ts:111-115`
- **Description:** The settlement JE is:
  ```
  Dr PAYROLL_EXPENSE (8110)  settledAmount
  Cr EMPLOYEE_ADVANCE (1230) settledAmount
  ```
  The Dr to PAYROLL_EXPENSE is **wrong**. When an advance is settled (deducted from a future salary), the JE should relieve the advance asset against the salary payable, NOT re-recognize salary expense. The correct entry is:
  ```
  Dr SALARIES_PAYABLE (3310)  settledAmount   [reduces what we owe the employee]
  Cr EMPLOYEE_ADVANCE (1230)  settledAmount   [reduces the advance asset]
  ```
  Or, if settlement happens at the same time as the salary accrual, the net cash paid is reduced: `Dr Salary Expense (gross) / Cr Cash (net) / Cr Employee Advance (settled)`.
- **Impact:** Every advance settlement inflates PAYROLL_EXPENSE by the settled amount. If an employee takes a 5000 advance and it's settled, GL shows 5000 extra in payroll expense that was never actually incurred (the advance was already expensed when given — actually no, the advance was Dr Employee Advance / Cr Cash, so it was NOT expensed yet). So the settlement Dr PAYROLL_EXPENSE is technically recognizing the expense at settlement time, which is acceptable IF the settlement coincides with the salary period. But the route doesn't enforce this timing — settlement can happen any time, including BEFORE the salary accrual is created. In that case, PAYROLL_EXPENSE is debited before the salary is even accrued → negative Salaries Payable temporarily.
- **Evidence:**
  ```ts
  // engine.ts:799-801
  lines: [
    { accountCode: payrollCode, debit: data.settledAmount, credit: 0 },
    { accountCode: advanceCode, debit: 0, credit: data.settledAmount },
  ],
  ```
- **Suggested Fix:** Change the Dr account to `SALARIES_PAYABLE`:
  ```ts
  const payableCode = await getAccountCodeByRole(AccountRole.SALARIES_PAYABLE, tx) || '3310'
  lines: [
    { accountCode: payableCode, debit: data.settledAmount, credit: 0 },
    { accountCode: advanceCode, debit: 0, credit: data.settledAmount },
  ],
  ```
  This properly relieves the payable when the advance is recovered from a future salary.

### P4-CRIT-011: PettyCash POST always creates Dr Expense / Cr Cash — no fund-replenishment flow
- **Severity:** CRITICAL
- **Location:** `src/app/api/petty-cash/route.ts:24-77`; `src/lib/accounting/engine.ts:967-998` (`autoEntryPettyCash`); `src/lib/account-roles.ts` (no `PETTY_CASH` role defined)
- **Description:** PettyCash has two distinct business flows:
  1. **Fund replenishment** (or establishment): Dr PETTY_CASH (1130) / Cr BANK (1120) — moves cash from bank to petty cash box.
  2. **Disbursement**: Dr EXPENSE (8630/etc.) / Cr PETTY_CASH (1130) — pays for a small expense out of petty cash.
  The current implementation ONLY supports disbursement. `autoEntryPettyCash` always creates `Dr <expense> / Cr CASH (1110)`. There's no `transactionType` field on the model or in the API to distinguish the two flows.
  Additionally, the `CASH` role has `defaultCodes: ['1110', '1130']` (line 114 of account-roles.ts) — `getAccountCodeByRole('CASH')` returns the first match by `code: 'asc'`, which is `'1110'` (Treasury), NOT `'1130'` (Petty Cash). So disbursements credit Treasury (1110) instead of Petty Cash (1130) — the petty cash sub-account is never used.
  There is also NO `PETTY_CASH` account role defined in `account-roles.ts` (only `CASH` and `BANK`).
- **Impact:** GL shows all petty cash activity hitting Treasury (1110). The Petty Cash account (1130) is always zero. Fund replenishments are recorded as expenses (Dr Admin Expense / Cr Treasury) — completely wrong. Cannot reconcile petty cash box balance to GL.
- **Evidence:**
  ```ts
  // engine.ts:983-984
  const expenseAccountCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
  const cashCode = await getAccountCodeByRole(AccountRole.CASH, tx) || '1130'
  // ↑ CASH role defaults to ['1110', '1130'] — getAccountCodeByRole returns '1110' (first by asc)
  ```
- **Suggested Fix:**
  1. Add `PETTY_CASH` role to `account-roles.ts` with `defaultCodes: ['1130']`.
  2. Add `transactionType: 'FUND' | 'DISBURSE'` field to PettyCash schema.
  3. In `autoEntryPettyCash`: if `transactionType === 'FUND'`, create Dr PETTY_CASH (1130) / Cr BANK (1120); else Dr EXPENSE / Cr PETTY_CASH (1130).

### P4-CRIT-012: Employee DELETE is hard-delete with no protection — UI button triggers it, crashes on FK restrict
- **Severity:** CRITICAL
- **Location:** `src/app/api/employees/[id]/route.ts:62-71`; `src/components/modules/employees.tsx:239-241,339` (DELETE button)
- **Description:** The DELETE handler calls `db.employee.delete({ where: { id } })` with NO pre-check for related records. The Employee model has `onDelete: Restrict` on 9 relations (advances, contracts, attendance, salaries, teamMemberships, operatorLogs, laborCosts, payrollLines, salaryPayments). So if the employee has ANY of these, Prisma throws a FK constraint error → 500.
  The UI at `employees.tsx:339` has a trash-can button that calls `deleteMutation.mutate(e.id)` with only a `confirm()` prompt — no pre-flight check.
  Also: Employee model has NO `deletedAt` field — soft-delete is not an option without schema change. The intended pattern (per Phase 2 P2-CRIT-009 for Project) is to soft-delete by setting `status='TERMINATED'` + `isActive=false`.
- **Impact:** Hard-delete either succeeds (orphaning related records if FK restrict is somehow bypassed) or crashes with 500. User gets unfriendly error. No audit trail. Phase 2 fixed this exact pattern for Project — Employee should follow suit.
- **Evidence:**
  ```ts
  // employees/[id]/route.ts:62-66
  export async function DELETE(_request: Request, { params }: ...) {
    try {
      const { id } = await params
      await db.employee.delete({ where: { id } })  // ← no pre-check, no soft-delete
      return NextResponse.json({ success: true })
  ```
  ```
  $ grep -n "deletedAt" prisma/schema.prisma | grep -i employee
  # (no matches — Employee has no deletedAt field)
  ```
- **Suggested Fix:**
  1. Add `deletedAt DateTime?` to Employee schema.
  2. Block delete if employee has salaries/advances/attendance (return friendly 400 with counts).
  3. Otherwise soft-delete: `db.employee.update({ where:{id}, data:{ deletedAt: new Date(), isActive: false, status: 'TERMINATED' } })`.
  4. Filter `deletedAt: null` in GET list and GET [id].
  5. Update dashboard employee count queries to filter `deletedAt: null`.

---

### P4-HIGH-001: No HR route calls assertPeriodOpen() — period guard only enforced at JE creation time
- **Severity:** HIGH
- **Location:** All HR routes: `employees/[id]/route.ts`, `employee-contracts/route.ts`, `attendance/route.ts`, `salaries/route.ts`, `salaries/[id]/route.ts`, `payroll-runs/[id]/route.ts`, `salary-payments/route.ts`, `advances/route.ts`, `petty-cash/route.ts`, `labor-costs/route.ts`
- **Description:** `grep -rn "assertPeriodOpen" src/app/api/{employees,employee-contracts,attendance,salaries,payroll-runs,salary-payments,advances,petty-cash,labor-costs,work-teams,timesheets}/` → ZERO matches. The period guard IS enforced inside `postJournalEntry` (via `assertJournalEntryValid` at `guard.ts:245-247`), so any JE creation for a closed period throws mid-transaction. But:
  - There's no PRE-CHECK, so the error surfaces as a 500 mid-transaction (not a friendly 400 before any work begins).
  - Routes that DON'T create JEs (Attendance POST, LaborCost POST, EmployeeContract POST, WorkTeam POST) have NO period check at all — you can backdate attendance to a closed period, which then feeds into hourly PayrollRun calculations.
- **Impact:** R6 enforced inconsistently. Backdated attendance/labor records corrupt historical payroll runs. UX: users get 500 errors instead of "الفترة مغلقة" messages.
- **Suggested Fix:** Add `await assertPeriodOpen(new Date(body.date))` at the top of every HR POST/PUT that accepts a date.

### P4-HIGH-002: salary-payments.tsx UI sends payrollRunId+amount — API expects employeeId+month+year (UI completely broken)
- **Severity:** HIGH
- **Location:** `src/components/modules/salary-payments.tsx:178-186` (UI submit); `src/app/api/salary-payments/route.ts:93-98` (API validation)
- **Description:** The UI's `CreatePaymentDialog` submits:
  ```ts
  { payrollRunId, paymentMethod, amount, referenceNumber, paymentDate, notes }
  ```
  The API's POST handler validates:
  ```ts
  if (!employeeId) return 400 'رقم الموظف مطلوب'
  if (!month || !year) return 400 'الشهر والسنة مطلوبان'
  ```
  The UI never sends `employeeId`, `month`, or `year`. So EVERY create attempt fails with `400 'رقم الموظف مطلوب'`.
- **Impact:** The "Record Salary Payment" feature is 100% broken from the UI. Users cannot record salary payments without using the API directly.
- **Evidence:** See code snippets above.
- **Suggested Fix:** This is a symptom of P4-CRIT-001 (route handles Salary, UI expects SalaryPayment). Fix the route to accept the UI's payload shape (`payrollRunId + amount + paymentMethod + reference + paymentDate`) and create a proper `SalaryPayment` record.

### P4-HIGH-003: salary-payments.tsx UI type expects SalaryPayment fields but API returns Salary records — filter crashes
- **Severity:** HIGH
- **Location:** `src/components/modules/salary-payments.tsx:45-60,393-402`; `src/app/api/salary-payments/route.ts:20-56`
- **Description:** UI `SalaryPayment` interface expects `payrollRun: PayrollRunSummary`, `referenceNumber`, `paymentMethod`, `paymentDate`. The API's GET handler returns `db.salary.findMany` results, which have `basicSalary`, `housingAllowance`, `month`, `year`, `status`, `employeeId` — NONE of the UI-expected fields. The UI's filter at line 398 calls `p.payrollRun.code.toLowerCase()` → `p.payrollRun` is `undefined` → TypeError → the entire list fails to render.
- **Impact:** Salary Payments page either crashes or shows empty list with errors.
- **Evidence:** See code above.
- **Suggested Fix:** Same as P4-CRIT-001 — align API response shape with UI expectations by returning actual `SalaryPayment` records.

### P4-HIGH-004: salaries/[id]/route.ts allows APPROVED→PAID with no JE creation — leaves Salaries Payable hanging
- **Severity:** HIGH
- **Location:** `src/app/api/salaries/[id]/route.ts:131-141` (the catch-all update after the APPROVED branch)
- **Description:** The valid transitions allow `APPROVED → PAID` (line 43). But the only special-cased transition is `DRAFT → APPROVED` (which creates the accrual JE). The `APPROVED → PAID` transition falls through to the catch-all `db.salary.update({ data: { status: 'PAID' } })` with NO payment JE creation.
  This is BY DESIGN — the comment at `salaries/route.ts:40-43` says "The cash credit happens later in salary-payments/route.ts when the salary is actually paid." But this creates a hidden coupling: the Salary status can be flipped to PAID without any payment JE, which leaves `SALARIES_PAYABLE (3310)` as a permanent positive balance.
  There's no validation that a SalaryPayment exists before allowing APPROVED→PAID. The UI at `salaries.tsx` likely has a "Mark as Paid" button that calls this PUT directly.
- **Impact:** GL shows Salaries Payable (3310) balance that never settles. If the user marks a salary PAID without recording a payment, the liability hangs forever. Auditor cannot reconcile.
- **Evidence:**
  ```ts
  // salaries/[id]/route.ts:43-44
  const validTransitions: Record<string, string[]> = {
    DRAFT: ['APPROVED'],
    APPROVED: ['PAID'],   // ← allowed but no JE created
    PAID: [],
  }
  ```
- **Suggested Fix:** Either (a) remove `APPROVED → PAID` from valid transitions (force users through `/api/salary-payments` which creates the payment JE), OR (b) create the payment JE inline when transitioning to PAID (mirror the salaries/route.ts POST pattern).

### P4-HIGH-005: advances/route.ts POST has no validation — amount, employee existence, future date
- **Severity:** HIGH
- **Location:** `src/app/api/advances/route.ts:20-69`
- **Description:** The POST handler:
  - Does NOT validate `amount > 0` (parseFloat fallback to 0, then JE for 0 created).
  - Does NOT validate `employeeId` exists (FK error from Prisma → 500).
  - Does NOT validate `date` is not in the future.
  - Does NOT validate `date` is provided (new Date(undefined) → Invalid Date → JE creation fails).
  - Does NOT check for existing PENDING advance for the same employee (allows stacking unlimited advances).
- **Impact:** Data quality issues. Zero-amount advances create zero-amount JEs (cluttering GL). Invalid dates cause 500s.
- **Suggested Fix:** Add validation block at the top:
  ```ts
  if (!body.employeeId || !body.amount || !body.date) return 400 '...'
  if (parseFloat(body.amount) <= 0) return 400 'المبلغ يجب أن يكون أكبر من صفر'
  const emp = await db.employee.findUnique({ where: { id: body.employeeId } })
  if (!emp) return 404 'الموظف غير موجود'
  ```

### P4-HIGH-006: attendance/route.ts POST has no validation — future date, overlapping entries, employee existence
- **Severity:** HIGH
- **Location:** `src/app/api/attendance/route.ts:34-109`
- **Description:** The POST handler:
  - Does NOT validate `employeeId` exists.
  - Does NOT validate `date` is not in the future.
  - Does NOT check for overlapping attendance records for the same employee on the same day (allows multiple check-ins per day without linking them).
  - Does NOT validate `checkOut > checkIn` (the workHours calculation at line 74-78 handles this by setting workHours=0 if diff <= 0, but doesn't reject the record).
  - Does NOT validate `date` is a valid Date (safeDate handles parsing but returns null, then line 82 returns 400 — this part is OK).
- **Impact:** Duplicate attendance records inflate hourly employee workHours in PayrollRun calculations (PayrollRun POST sums ALL attendance for the month at `payroll-runs/route.ts:192-198`).
- **Suggested Fix:** Add uniqueness check `@@unique([employeeId, date])` to Attendance schema, OR query for existing record before insert and reject/merge.

### P4-HIGH-007: employee-contracts/route.ts POST always overwrites Employee.basicSalary — no latest-contract check
- **Severity:** HIGH
- **Location:** `src/app/api/employee-contracts/route.ts:47-51` (POST); `src/app/api/employee-contracts/[id]/route.ts:67-73` (PUT)
- **Description:** The POST handler unconditionally updates `Employee.basicSalary = body.basicSalary` after creating the contract. If a user adds a backdated contract (e.g. for audit purposes), it overwrites the current basicSalary with the backdated value. The PUT handler does the same. Neither route checks whether the new/updated contract is the latest by `startDate`.
  Also: NO `$transaction` wrapping the contract.create + employee.update (2 separate writes). NO validation `endDate > startDate`. NO validation that employeeId exists.
- **Impact:** Employee basicSalary becomes wrong after adding historical contracts. PayrollRun uses `Employee.basicSalary` for monthly employees (`payroll-runs/route.ts:184`), so wrong basicSalary → wrong payroll.
- **Suggested Fix:** Wrap in `$transaction`. Only update `Employee.basicSalary` if the new contract's `startDate` is >= the latest existing contract's `startDate`. Validate `endDate > startDate` if endDate is provided.

### P4-HIGH-008: PettyCash DELETE is non-atomic — reverseEntry + delete are 2 separate db operations
- **Severity:** HIGH
- **Location:** `src/app/api/petty-cash/[id]/route.ts:72-101`
- **Description:** The DELETE handler:
  1. Line 89: `await reverseEntry(existing.journalEntryId, db)` — uses `db`, not `tx`.
  2. Line 96: `await db.pettyCash.delete({ where: { id } })` — separate operation.
  These are 2 separate writes with NO `$transaction`. If the delete fails (e.g. FK constraint from a future relation), the reversal JE remains in GL but the petty cash record still exists → inconsistent state.
  Also: `reverseEntry` is called with `db` not `tx`, so even if wrapped in a transaction, the reversal wouldn't be part of it.
- **Impact:** Atomicity violation. Orphaned reversal JEs if delete fails.
- **Suggested Fix:**
  ```ts
  await db.$transaction(async (tx) => {
    if (existing.journalEntryId) {
      await reverseEntry(existing.journalEntryId, tx)
    }
    await tx.pettyCash.update({ where: { id }, data: { deletedAt: new Date() } })  // soft-delete
  })
  ```

### P4-HIGH-009: PettyCash hard-deletes record — model has deletedAt but it's unused
- **Severity:** HIGH
- **Location:** `src/app/api/petty-cash/[id]/route.ts:96`
- **Description:** `PettyCash` model has `deletedAt DateTime?` (`schema.prisma:1701`), but the DELETE handler hard-deletes via `db.pettyCash.delete`. The GET handler at `petty-cash/route.ts:10-16` does NOT filter `deletedAt: null`, so even if soft-delete were used, deleted records would still appear.
- **Impact:** Audit trail lost. R12 (no hard-delete of posted entries) technically applies — the reversal JE preserves the GL audit trail, but the petty cash subledger record is gone.
- **Suggested Fix:** Change to `db.pettyCash.update({ data: { deletedAt: new Date() } })` and add `deletedAt: null` filter to GET.

### P4-HIGH-010: PayrollRun JE aggregates lines by activity with NO costCenterId on JournalLine
- **Severity:** HIGH
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:96-152`
- **Description:** The APPROVED block groups lines by activity (PROJECT/RENTAL/ADMIN) and creates ONE JE line per activity. The JE lines have NO `costCenterId` set (lines 105-118 — only `accountCode, debit, credit, description`). So if 5 employees work on 5 different projects, all 5 are summed into one Dr PROJECT_COST line with no cost center breakdown.
  This contrasts with `salaries/route.ts:130-150` which DOES resolve `costCenterId` per employee via `ResourceAllocation` and sets it on the Dr line (line 71).
- **Impact:** Project profitability reports (which aggregate by cost center) cannot attribute payroll costs to specific projects. The Dr PROJECT_COST line lands in a generic cost center (or none), making project-level P&L wrong.
- **Suggested Fix:** Either (a) create one JE per (activity, project) pair with the project's costCenterId, OR (b) create one JE per PayrollRunLine (per-employee) with that line's project costCenterId. Option (b) gives the richest project costing but creates more JEs.

### P4-HIGH-011: salaries/route.ts creates EquipmentCost record for salary project cost — misclassified
- **Severity:** HIGH
- **Location:** `src/app/api/salaries/route.ts:164-175`; `src/app/api/salaries/[id]/route.ts:104-114`
- **Description:** When a salary is approved and the employee has a `ResourceAllocation`, the route creates an `EquipmentCost` record:
  ```ts
  await tx.equipmentCost.create({
    data: {
      projectId: allocation.projectId,
      description: `راتب ${employee.nameAr || employee.name}`,
      amount: netSalary,
      date: salaryDate,
      // ← no costType, no equipmentId, no journalEntryId
    },
  })
  ```
  This is a SALARY cost, not an EQUIPMENT cost. The `EquipmentCost` model is designed for equipment-related project costs (fuel, maintenance, operations). Stuffing salary costs into EquipmentCost:
  - Corrupts equipment profitability reports (equipment ROI includes salary costs that aren't equipment-related).
  - Loses the cost type classification (the `costType` field is left null).
  - The `LaborCost` model exists for exactly this purpose but is never used here.
- **Impact:** Equipment profitability reports overstate equipment costs. Project cost reports double-count (salary already in GL via accrual JE + duplicated in EquipmentCost table).
- **Suggested Fix:** Use `LaborCost` model instead:
  ```ts
  await tx.laborCost.create({
    data: {
      projectId: allocation.projectId,
      employeeId: existing.employeeId,
      description: `راتب ${employee.name} - ${month}/${year}`,
      workers: 1, days: 30, dailyRate: netSalary / 30, totalAmount: netSalary,
      date: salaryDate,
    },
  })
  ```
  Better: link the LaborCost to the salary JE via a `journalEntryId` field (requires schema change, see P4-CRIT-005).

### P4-HIGH-012: Duplicate timesheet routes — /api/timesheets and /api/equipment/timesheets
- **Severity:** HIGH
- **Location:** `src/app/api/timesheets/route.ts:69-140` (POST); `src/app/api/equipment/timesheets/route.ts` (POST — the canonical one fixed in Phase 3)
- **Description:** The legacy `/api/timesheets/route.ts` POST creates a Timesheet record directly with NO validation: no equipment availability check, no overlap check, no rental-contract status check. The canonical `/api/equipment/timesheets/route.ts` was fixed in Phase 3 to include these checks. The legacy route is described in its own comment as "Legacy timesheets route - delegates to /api/equipment/timesheets" but it does NOT delegate — it has its own independent POST implementation.
  Mirror of P3-CRIT-008 (duplicate rental routes) which was fixed in Phase 3.
- **Impact:** Frontend may call either route. Timesheets created via the legacy route bypass all the Phase 3 fixes → can create timesheets for unavailable equipment, overlapping periods, etc.
- **Suggested Fix:** Remove the POST handler from `/api/timesheets/route.ts`, keep only GET (or redirect POST to `/api/equipment/timesheets`).

### P4-HIGH-013: SUBCONTRACTOR_ADVANCE and EMPLOYEE_ADVANCE share the same default account code '1230'
- **Severity:** HIGH
- **Location:** `src/lib/account-roles.ts:141-147` (EMPLOYEE_ADVANCE → ['1230']) and `:442-448` (SUBCONTRACTOR_ADVANCE → ['1230'])
- **Description:** Both roles map to account 1230. So `autoEntryEmployeeAdvance` (Dr 1230 / Cr Cash) and `autoEntrySubcontractorAdvance` (Dr 1230 / Cr Cash) both post to the same GL account. The GL cannot distinguish employee advances from subcontractor advances.
- **Impact:** Subcontractor advance aging reports (which read by account code) include employee advances. Employee advance recovery reports include subcontractor advances. Auditor cannot reconcile either subledger to GL.
- **Suggested Fix:** Assign a separate account code to one of them (e.g. SUBCONTRACTOR_ADVANCE → '1240') and update the chart of accounts template.

### P4-HIGH-014: work-teams/[id]/route.ts PUT member operations not in $transaction
- **Severity:** HIGH
- **Location:** `src/app/api/work-teams/[id]/route.ts:34-99`
- **Description:** The PUT handler:
  1. Line 34: `db.workTeam.update(...)` — team basic info.
  2. Lines 54-71: loop over `body.addMembers`, each calls `db.teamMember.findFirst` then `db.teamMember.create` — N separate writes.
  3. Lines 73-79: loop over `body.removeMembers`, each calls `db.teamMember.deleteMany` — M separate writes.
  4. Line 82: `db.workTeam.findUnique` — re-fetch.
  None of these are wrapped in `$transaction`. If any add/remove fails mid-loop, the team is left in an inconsistent state (some members added, others not).
- **Impact:** Partial member updates. Race conditions on concurrent PUTs.
- **Suggested Fix:** Wrap the entire handler in `db.$transaction(async (tx) => { ... })`.

### P4-HIGH-015: salaries/auto-calculate/route.ts has off-by-one month bug + Decimal arithmetic in reduce
- **Severity:** HIGH
- **Location:** `src/app/api/salaries/auto-calculate/route.ts:18-28,49-58,62-64`
- **Description:** Three bugs:
  1. **Off-by-one in contract lookup:** Line 21 reads `startDate: { lte: new Date(year, month, 1) }` — but `month` is the human month (1-12), and `new Date(year, month, 1)` creates a Date for the FIRST day of NEXT month (JS Date months are 0-indexed). So the contract window is `startDate <= next-month-first-day`, which incorrectly includes contracts starting next month. Should be `new Date(year, month - 1, 1)`.
  2. **Decimal arithmetic in reduce:** Line 50-58: `attendanceRecords.reduce((sum, a) => sum + (a.overtimeHours || 0), 0)`. `a.overtimeHours` is a `Prisma.Decimal` (always truthy, so `|| 0` is a no-op). `sum + Decimal` coerces Decimal to string via `.valueOf()` or `.toString()` → `0 + "5.5"` = `"05.5"` (string concatenation). The subsequent `totalOvertimeHours * hourlyRate * 100` then produces NaN.
  3. **Math.round on Decimal:** Line 64: `Math.round(totalOvertimeHours * hourlyRate * 100)` — `hourlyRate` is `contract.basicSalary / 30 / 8` which is Decimal; `totalOvertimeHours` (from the broken reduce) is string or NaN. Result is NaN.
- **Impact:** Auto-calculated salaries for employees with attendance are wrong (NaN propagates). The frontend likely shows "NaN" or 0.
- **Suggested Fix:** Convert Decimal to number explicitly: `sum + Number(a.overtimeHours || 0)`. Fix the month index: `new Date(year, month - 1, 1)`.

### P4-HIGH-016: attendance/[id]/route.ts has ONLY DELETE — no GET or PUT
- **Severity:** HIGH
- **Location:** `src/app/api/attendance/[id]/route.ts` (entire file, 16 lines)
- **Description:** The [id] route has only a DELETE handler. No GET (cannot fetch a single attendance record for editing). No PUT (cannot correct a check-in/check-out time — must delete and re-create).
- **Impact:** UI cannot edit attendance records. Errors in check-in time require delete + re-create, losing the original audit trail.
- **Suggested Fix:** Add GET and PUT handlers. PUT should validate the same way as POST (date validity, checkOut > checkIn).

---

### P4-MED-001: JS float arithmetic throughout HR routes — Decimal precision lost
- **Severity:** MEDIUM
- **Location:** Pervasive: `employees/route.ts:104` (`parseFloat(body.basicSalary)`), `employee-contracts/route.ts:37-40`, `attendance/route.ts:70,96`, `salaries/route.ts:89-96`, `payroll-runs/route.ts:184-220`, `advances/route.ts:30`, `petty-cash/route.ts:34`, `labor-costs/route.ts:32-40`, `salary-payments/route.ts:117-122,230`
- **Description:** All monetary fields are parsed via `parseFloat()` and stored as JS numbers in the route handler, then passed to Prisma which stores them as Decimal. Intermediate arithmetic (e.g. `basicSalary + housingAllowance + ... - deductions`) is done in JS float, introducing floating-point error. Phase 1 audit (P1 deferred) and Phase 2 (P2-CRIT-008 deferred) already noted this pattern.
- **Impact:** Sub-riyal rounding errors accumulate. For large payroll runs (100+ employees × 12 months), the GL total can drift from the sum of Salary records by a few halalas.
- **Suggested Fix:** Use `new Prisma.Decimal(body.amount)` for storage, and `Decimal.add()/.sub()/.mul()` for arithmetic. Or use the `toNumber()` helper from `@/lib/decimal` consistently.

### P4-MED-002: advances/[id]/route.ts has ONLY PUT — no GET or DELETE
- **Severity:** MEDIUM
- **Location:** `src/app/api/advances/[id]/route.ts` (entire file, 40 lines)
- **Description:** The [id] route has only a PUT handler (settle). No GET (cannot fetch a single advance). No DELETE (cannot cancel an advance — must reverse the JE manually).
- **Impact:** UI cannot display advance details in a dedicated page. Cannot cancel advances (e.g. if created in error).
- **Suggested Fix:** Add GET (return advance with employee + JE info). Add DELETE that reverses the JE via `reverseEntry` in a `$transaction` and soft-deletes.

### P4-MED-003: salary-payments/[id]/route.ts has ONLY DELETE — no GET or PUT
- **Severity:** MEDIUM
- **Location:** `src/app/api/salary-payments/[id]/route.ts` (entire file, 67 lines)
- **Description:** The [id] route has only a DELETE handler. No GET, no PUT.
- **Impact:** Cannot fetch or edit a single salary payment.
- **Suggested Fix:** Add GET and PUT. PUT should only allow editing `reference` / `notes` (not amount — amount changes require reversal + re-creation).

### P4-MED-004: PayrollRun status transitions not strictly enforced — uses `!==` checks with edge cases
- **Severity:** MEDIUM
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:61,177`
- **Description:** The APPROVED branch fires on `newStatus === 'APPROVED' && existing.status !== 'APPROVED'` and the PAID branch on `newStatus === 'PAID' && existing.status !== 'PAID'`. This allows:
  - DRAFT → APPROVED (intended)
  - REVIEW → APPROVED (intended)
  - PARTIALLY_PAID → APPROVED (BUG — see P4-CRIT-002)
  - PAID → APPROVED (BUG — see P4-CRIT-002)
  - DRAFT → PAID (blocked by `!existing.journalEntryId` check — OK)
  - REVIEW → PAID (blocked by `!existing.journalEntryId` — OK)
  - Any → DRAFT or REVIEW via catch-all (BUG — see P4-CRIT-003)
- **Impact:** See CRITICAL issues.
- **Suggested Fix:** Use an explicit `validTransitions` map (as suggested in P4-CRIT-002).

### P4-MED-005: PayrollRun POST code generation (PAY-YYYY-NNNN) has race condition
- **Severity:** MEDIUM
- **Location:** `src/app/api/payroll-runs/route.ts:81-94`
- **Description:** Reads `lastRun.code` then generates next code outside any transaction. Two concurrent POSTs read the same last code → both generate `PAY-2025-0001` → second one fails on `@unique` constraint → 500.
- **Impact:** Intermittent 500 on concurrent payroll run creation.
- **Suggested Fix:** Wrap code generation + create in `$transaction` with retry on P2002 (unique constraint violation).

### P4-MED-006: employees POST code generation (EMP-NNN) has race condition
- **Severity:** MEDIUM
- **Location:** `src/app/api/employees/route.ts:70-82`
- **Description:** Same pattern as P4-MED-005. Reads `lastEmployee.code`, generates `EMP-NNN`, creates — outside transaction.
- **Impact:** Intermittent 500 on concurrent employee creation.
- **Suggested Fix:** Same as P4-MED-005.

### P4-MED-007: work-teams POST code generation (TM-NNN) has race condition
- **Severity:** MEDIUM
- **Location:** `src/app/api/work-teams/route.ts:37-49`
- **Description:** Same pattern. Reads `lastTeam.code`, generates `TM-NNN`, creates — outside transaction.
- **Impact:** Intermittent 500 on concurrent team creation.
- **Suggested Fix:** Same as P4-MED-005.

### P4-MED-008: No autoEntryPayrollRun function — JE created inline in route handler
- **Severity:** MEDIUM
- **Location:** `src/app/api/payroll-runs/[id]/route.ts:96-152` (inline accrual JE); `:197-256` (inline payment JE)
- **Description:** Every other major cash-flow entity (subcontractor invoice, supplier invoice, sales invoice, employee advance, petty cash, salary) has a dedicated `autoEntry*` function in `engine.ts`. PayrollRun does NOT — its JE logic is inlined in the route handler. This:
  - Duplicates the JE logic across the APPROVED and PAID branches.
  - Makes the logic hard to test in isolation.
  - Inconsistent with the established pattern.
  - Hardcodes account codes (P4-CRIT-008).
- **Impact:** Maintenance burden. Inconsistency. Hard to add PayrollRun cancellation/reversal later.
- **Suggested Fix:** Extract `autoEntryPayrollRunAccrual` and `autoEntryPayrollRunPayment` functions in `engine.ts`, mirroring the subcontractor pattern.

### P4-MED-009: No autoEntryLaborCost function — and no LABOR_COST account role
- **Severity:** MEDIUM
- **Location:** `src/lib/accounting/engine.ts` (no function); `src/lib/account-roles.ts` (no `LABOR_COST` role)
- **Description:** As noted in P4-CRIT-005, LaborCost has no JE. The `LABOR_COST` account role is also missing from `account-roles.ts`. The `PROJECT_COST` role exists (defaultCodes `['7110']`) which could be used, but a distinct `LABOR_COST` role (e.g. `['7111']` or `['7250']`) would allow labor costs to be reported separately from equipment project costs.
- **Impact:** Cannot separately report labor vs equipment project costs in GL.
- **Suggested Fix:** Add `LABOR_COST` role to `account-roles.ts` with a distinct default code. Add `autoEntryLaborCost` in `engine.ts`.

### P4-MED-010: PettyCash category accepts any string — only 5 categories mapped
- **Severity:** MEDIUM
- **Location:** `src/lib/accounting/engine.ts:975-982`; `src/components/modules/petty-cash.tsx:47-55`
- **Description:** `autoEntryPettyCash` maps 5 categories (OFFICE, TRANSPORT, HOSPITALITY, MAINTENANCE, OTHER) to expense roles. The UI dropdown offers a fixed list, but the API accepts any string. Any unmapped category defaults to `ADMIN_EXPENSE`. Common construction categories like FUEL, PERMITS, SERVICES, INSURANCE are not mapped (they exist in `ExpenseCategory` enum but not in the petty cash category map).
- **Impact:** Fuel purchased via petty cash is recorded as Admin Expense instead of Fuel Expense. Misleading GL.
- **Suggested Fix:** Align the petty cash category map with `ExpenseCategory` enum, or accept `expenseAccountId` directly on the PettyCash record.

### P4-MED-011: LaborCost model has no journalEntryId field — cannot link to GL even if JE were added
- **Severity:** MEDIUM
- **Location:** `prisma/schema.prisma:1369-1388`
- **Description:** The LaborCost model has no `journalEntryId` field, unlike EquipmentCost (`schema.prisma:1533`) which does. So even after P4-CRIT-005 is fixed (autoEntryLaborCost added), there's no way to store the JE link on the LaborCost record.
- **Impact:** Cannot reverse the JE when the LaborCost is edited/deleted (no `journalEntryId` to pass to `reverseEntry`).
- **Suggested Fix:** Add `journalEntryId String?` and `deletedAt DateTime?` to LaborCost schema.

### P4-MED-012: LaborCost PUT allows editing historical records with no JE reversal
- **Severity:** MEDIUM
- **Location:** `src/app/api/labor-costs/[id]/route.ts:26-67`
- **Description:** The PUT handler updates `workers`, `days`, `dailyRate`, `totalAmount`, `date`, `description` with NO check that the record is in a "draft" state (there's no status field) and NO reversal of any prior JE (because no JE exists — see P4-CRIT-005). Once a JE is added, this route must reverse the old JE and create a new one.
- **Impact:** Historical labor costs can be silently manipulated, corrupting project profitability reports.
- **Suggested Fix:** Once JE is added: wrap PUT in `$transaction`, reverse old JE (if `journalEntryId` exists), create new JE, update `journalEntryId`.

### P4-MED-013: PayrollRun totals computed at POST but not re-validated at APPROVED
- **Severity:** MEDIUM
- **Location:** `src/app/api/payroll-runs/route.ts:165-254` (POST computes totals); `src/app/api/payroll-runs/[id]/route.ts:62-171` (APPROVED trusts stored totals)
- **Description:** The POST route computes `totalAmount, totalDeductions, totalGosi, totalNet` by summing line data. The APPROVED block at `[id]/route.ts:78-94` re-aggregates lines for the JE but uses `Number(line.netSalary)` and `Number(line.gosiDeduction)` directly — it does NOT verify that `sum(lines.netSalary) === PayrollRun.totalNet`. If a PayrollRunLine is edited directly (via DB or future [id] route), the totals drift from the actual lines, and the JE uses the line sums (correct) while the PayrollRun.totalNet field is stale.
- **Impact:** UI shows stale totals. Payment JE (which uses `existing.totalNet` at line 201) may not match the accrual JE (which uses sum of lines).
- **Suggested Fix:** At APPROVED, recompute and update `PayrollRun.totalNet` etc. from the actual lines before creating the JE.

### P4-MED-014: Salary POST doesn't accept projectId — only auto-resolves via ResourceAllocation
- **Severity:** MEDIUM
- **Location:** `src/app/api/salaries/route.ts:100-119`
- **Description:** The Salary model has `projectId String?` (`schema.prisma:578`), but the POST route does NOT accept `body.projectId`. Instead, it auto-resolves the project via `ResourceAllocation` (lines 131-150). If the user wants to override the allocation (e.g. the employee worked on a different project this month), there's no way to do so.
- **Impact:** Inflexible. Salary project cost always follows the allocation, even if the actual work differed.
- **Suggested Fix:** Accept `body.projectId` as an optional override; fall back to ResourceAllocation if not provided.

### P4-MED-015: advances/route.ts PUT settlement doesn't validate settledAmount ≤ remaining
- **Severity:** MEDIUM
- **Location:** `src/app/api/advances/route.ts:91-92`
- **Description:** Line 91: `newSettledAmount = existing.settledAmount + parseFloat(settledAmount)`. No check that `newSettledAmount <= existing.amount`. If a user settles more than the remaining amount, `settledAmount` exceeds `amount`, and the status is set to 'SETTLED' (line 92), but the over-settlement is not flagged.
- **Impact:** Negative remaining balance on advance. GL shows Employee Advance (1230) with negative balance for that employee (which is technically a payable, not an asset).
- **Suggested Fix:** Validate `newSettledAmount <= existing.amount` and return 400 if exceeded.

### P4-MED-016: employee-contracts GET/POST use JS `+` on Prisma.Decimal for totalCompensation
- **Severity:** MEDIUM
- **Location:** `src/app/api/employee-contracts/route.ts:19,56`; `src/app/api/employee-contracts/[id]/route.ts:24-27,77-81`
- **Description:** `(c.basicSalary ?? 0) + (c.housingAllowance ?? 0) + ...` — `c.basicSalary` is a `Prisma.Decimal`. Decimal `+` triggers `.valueOf()` which returns a string. So `Decimal("5000") + Decimal("1000")` becomes `"50001000"` (string concatenation) unless JS coerces both to number first. In practice, `Number(Decimal) + Number(Decimal)` works, but `Decimal + Decimal` may not.
- **Impact:** `totalCompensation` field returned to UI may be a string or NaN.
- **Suggested Fix:** `Number(c.basicSalary ?? 0) + Number(c.housingAllowance ?? 0) + ...` or use `Prisma.Decimal.add()`.

---

### P4-LOW-001: PettyCash POST/PUT error messages say "السلفة" (loan) but entity is petty cash
- **Severity:** LOW
- **Location:** `src/app/api/petty-cash/route.ts:20,75`; `src/app/api/petty-cash/[id]/route.ts:18,24,37,68,81,100`
- **Description:** Arabic error messages use "السلفة النقدية" (cash loan) and "السلفة" (loan) to refer to PettyCash. The correct Arabic term for petty cash is "النثرية" or "المصروفات النثرية". The current labeling confuses petty cash with employee advances (which ARE loans).
- **Impact:** UX confusion.
- **Suggested Fix:** Replace "السلفة النقدية" with "النثرية" throughout.

### P4-LOW-002: salaries GET filter accepts any string for status — no enum validation
- **Severity:** LOW
- **Location:** `src/app/api/salaries/route.ts:18`
- **Description:** `if (status) where.status = status` — accepts any string. If the user passes `?status=FOO`, Prisma throws an enum validation error → 500.
- **Impact:** Unfriendly 500 on invalid status.
- **Suggested Fix:** Validate against `['DRAFT', 'APPROVED', 'PAID']` before applying the filter.

### P4-LOW-003: payroll-runs GET has no pagination — returns all runs
- **Severity:** LOW
- **Location:** `src/app/api/payroll-runs/route.ts:9-38`
- **Description:** The GET handler returns all PayrollRun records with no `take`/`skip`. For a company with 10+ years of monthly payroll runs (120+ records), this is fine, but for 50+ years it would degrade.
- **Impact:** Minor performance concern.
- **Suggested Fix:** Add optional `page`/`pageSize` params (mirror the employees GET pattern).

### P4-LOW-004: TeamMember has no @@unique on (teamId, employeeId) — duplicates possible via POST
- **Severity:** LOW
- **Location:** `prisma/schema.prisma:623-637`; `src/app/api/work-teams/route.ts:52-58`
- **Description:** The POST route at `/api/work-teams/route.ts:52-58` accepts `members: [{employeeId, role, isLeader}]` and creates them via nested `members: { create: membersData }`. There's no deduplication — if the same `employeeId` appears twice in the array, two TeamMember records are created. The schema has no `@@unique([teamId, employeeId])` constraint.
  The PUT at `[id]/route.ts:54-70` DOES check for existing membership before adding, but the POST does not.
- **Impact:** Duplicate team members. PayrollRun line generation (`payroll-runs/route.ts:107`) uses `teamMemberships.team.id` — duplicates could create duplicate payroll lines for the same employee.
- **Suggested Fix:** Add `@@unique([teamId, employeeId])` to TeamMember schema. Deduplicate `membersData` in POST before create.

### P4-LOW-005: advances GET has no pagination or filtering — returns all advances
- **Severity:** LOW
- **Location:** `src/app/api/advances/route.ts:5-18`
- **Description:** Returns all EmployeeAdvance records with no filtering by employee, status, or date range, and no pagination.
- **Impact:** Performance degradation as advance history grows.
- **Suggested Fix:** Add `?employeeId=`, `?status=`, `?dateFrom=`, `?dateTo=`, `?page=` params.

### P4-LOW-006: attendance POST workHours rounding uses Math.round to 2 decimals — may lose precision
- **Severity:** LOW
- **Location:** `src/app/api/attendance/route.ts:77`
- **Description:** `workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100` — rounds to 2 decimal places. For an 8.333-hour shift, this becomes 8.33. The lost 0.003 hours compounds over a month for hourly employees.
- **Impact:** Minor rounding drift in hourly payroll.
- **Suggested Fix:** Use `Prisma.Decimal` and round to 4 decimals, or store raw minutes and compute hours at payroll time.

---

## Dead Code / Unused

1. **`autoEntrySalary`** (`src/lib/accounting/engine.ts:1011-1048`) — 0 callers. The function comment says "Salary Payment: Dr Salaries / Dr GOSI / Cr Cash / Cr GOSI Payable" but the actual salary flow uses inline `createSalaryAccrualJournalEntry` (in `salaries/route.ts`) + inline payment JE (in `salary-payments/route.ts`). The function is dead.

2. **`autoEntryGOSI`** (`src/lib/accounting/engine.ts:1055-1078`) — 0 callers. Was intended for standalone GOSI remittance JEs but never wired up. GOSI is currently handled inline in the PayrollRun APPROVED JE.

3. **`autoEntryEndOfService`** (`src/lib/accounting/engine.ts:1276+`) — 0 callers. End-of-service benefit accrual is not implemented anywhere in the codebase. The `EOS_PROVISION` role exists in `account-roles.ts:58,254` but is never used.

4. **`autoEntryExpense`** (`src/lib/accounting/engine.ts:634-695`) — 0 callers. Phase 1 audit (P1-HIGH) noted this duplicates `createExpenseJournalEntry` in `auto-journal.ts`. The expenses route uses the auto-journal version. This engine.ts version is dead.

5. **`autoEntryZakat`** (`src/lib/accounting/engine.ts:1249+`) — likely 0 callers (not verified but no HR route references it).

6. **`SalaryPayment` model** (`prisma/schema.prisma:703-722`) — 0 writers. See P4-CRIT-001. The entire model is dead until the route is fixed.

7. **`salary-payments/[id]/route.ts` DELETE handler** (`src/app/api/salary-payments/[id]/route.ts:4-67`) — references `db.salaryPayment` which has zero records. Dead code until P4-CRIT-001 is fixed.

8. **`/api/timesheets/route.ts` POST** — duplicate of `/api/equipment/timesheets/route.ts` POST. See P4-HIGH-012. The legacy route's POST should be removed.

9. **`/api/timesheets/[id]/route.ts`** — duplicate of `/api/equipment/timesheets/[id]/route.ts`. Should be removed (or kept as a thin GET proxy).

10. **`EOS_PROVISION` account role** (`src/lib/account-roles.ts:58,254`) — defined but never queried by any `getAccountCodeByRole` call. Dead until end-of-service accrual is implemented.

11. **`advances/[id]/route.ts` PUT** — duplicate of the bulk PUT in `advances/route.ts`. Two competing implementations of advance settlement with different bugs. One should be removed.

---

## Verified Working (do NOT break these in fix phase)

These items were verified as correctly implemented during this audit. They represent Phase 1 fixes that remain intact and should be preserved.

1. **`salaries/route.ts` POST with `status:'APPROVED'`** — creates Dr PAYROLL_EXPENSE / Cr SALARIES_PAYABLE accrual JE inside `$transaction`. R1 enforced (JE failure rolls back the salary record). Uses `requireAccountByRole` (no hardcoded codes). Sets `costCenterId` on the Dr line via ResourceAllocation lookup. ✅

2. **`salaries/[id]/route.ts` PUT (DRAFT→APPROVED)** — creates accrual JE in `$transaction`. R1 enforced. State transition validated via `validTransitions` map. ✅

3. **`salaries/[id]/route.ts` DELETE** — soft-delete via `deletedAt: new Date()` (R12 compliant). Blocks deletion of APPROVED/PAID records with friendly 400. ✅

4. **`salary-payments/route.ts` POST** — creates Dr SALARIES_PAYABLE / Cr Cash payment JE in `$transaction`. R1 enforced (no try/catch swallowing — the prior Phase 1 bug `salary-payments/route.ts:183-185 try/catch` is GONE). Uses `requireAccountByRole` for SALARIES_PAYABLE. ✅ (Note: the route creates the wrong RECORD TYPE — see P4-CRIT-001 — but the JE logic itself is correct.)

5. **`advances/route.ts` POST** — creates Dr EMPLOYEE_ADVANCE / Cr Cash JE via `autoEntryEmployeeAdvance` in `$transaction`. R1 enforced. Stores `journalEntryId` on the advance record. ✅

6. **`advances/route.ts` PUT (settle)** — creates settlement JE via `autoEntryAdvanceSettlement` in `$transaction`. R1 enforced. ✅ (Note: the JE accounting is WRONG — see P4-CRIT-010 — but the atomicity and R1 enforcement are correct.)

7. **`petty-cash/route.ts` POST** — creates Dr Expense / Cr Cash JE via `autoEntryPettyCash` in `$transaction`. R1 enforced. Stores `journalEntryId` on the petty cash record. ✅ (Note: the JE only supports disbursement, not fund replenishment — see P4-CRIT-011.)

8. **`payroll-runs/[id]/route.ts` PUT APPROVED** — creates per-activity accrual JEs (PROJECT/RENTAL/ADMIN) in `$transaction`. R1 enforced. Stores `journalEntryId` on PayrollRun. ✅ (Note: hardcoded account codes — P4-CRIT-008; missing deductions — P4-CRIT-009; no costCenterId — P4-HIGH-010. But the atomicity and R1 are correct.)

9. **`payroll-runs/[id]/route.ts` PUT PAID** — requires `existing.journalEntryId` exists (accrual must precede payment). Requires `body.bankAccountCode`. Requires `totalNet > 0`. Creates Dr SALARIES_PAYABLE / Cr Bank payment JE in `$transaction`. Stores `paymentJournalEntryId`, `paymentAccountCode`, `paymentAccountNameAr`. ✅ (Note: hardcoded '3310' — P4-CRIT-008.)

10. **`payroll-runs/[id]/route.ts` DELETE** — blocks non-DRAFT deletion with friendly 400. Wraps `payrollRunLine.deleteMany` + `payrollRun.delete` in `$transaction`. ✅

11. **`petty-cash/[id]/route.ts` DELETE** — calls `reverseEntry(existing.journalEntryId, db)` before delete (R12 compliant — reversal with swapped D/C, original kept POSTED). ✅ (Note: non-atomic — P4-HIGH-008; hard-delete — P4-HIGH-009. But the reversal mechanism is correct.)

12. **`petty-cash/[id]/route.ts` PUT** — blocks modification of posted entries (`if (existing.journalEntryId) return 400`). ✅

13. **Period guard at JE level** — `assertJournalEntryValid` (`guard.ts:245-247`) calls `assertPeriodOpen(date, client)` for every `postJournalEntry` call, UNLESS `skipPeriodGuard: true` is passed. No HR route passes `skipPeriodGuard`. So R6 IS enforced at the engine level for every JE-creating HR operation. ✅ (Note: no route-level pre-check — P4-HIGH-001 — but the guard is not bypassed.)

14. **`salaries/route.ts` `createSalaryAccrualJournalEntry`** — uses `requireAccountByRole` for both PAYROLL_EXPENSE and SALARIES_PAYABLE (no hardcoded codes). Sets `costCenterId` on the Dr line. Uses deterministic `entryNo: \`JE-SAL-ACCRUE-${salaryId}\``. ✅

15. **`payroll-runs/route.ts` POST duplicate-prevention** — checks for existing non-DRAFT run AND existing DRAFT run for the same (month, year) before creating. Returns friendly 400. ✅

16. **`salaries/[id]/route.ts` state machine** — `validTransitions` map explicitly defines DRAFT→APPROVED, APPROVED→PAID, PAID→[]. Returns friendly 400 on invalid transition. ✅ (Note: APPROVED→PAID creates no JE — P4-HIGH-004 — but the transition validation itself is correct.)

---

## Recommended Fix Order (for Phase 4 fix cycle)

**Cycle 1 (accounting integrity — must fix first):**
1. P4-CRIT-001 (SalaryPayment model zero writers) — refactor route + UI contract.
2. P4-CRIT-002 + P4-CRIT-003 + P4-MED-004 (PayrollRun state machine) — add `validTransitions` map, block demotion, block re-approve.
3. P4-CRIT-005 (LaborCost no JE) — add `autoEntryLaborCost`, `LABOR_COST` role, `journalEntryId` field.
4. P4-CRIT-006 (advances/[id] position field) — fix `position` → `profession`.
5. P4-CRIT-008 (PayrollRun hardcoded codes) — use `requireAccountByRole`.
6. P4-CRIT-009 (PayrollRun missing deductions) — add deductions line to JE.
7. P4-CRIT-010 (advance settlement Dr PAYROLL_EXPENSE) — change to Dr SALARIES_PAYABLE.
8. P4-CRIT-011 (PettyCash no fund flow) — add `transactionType` field + PETTY_CASH role.
9. P4-CRIT-012 (Employee hard-delete) — soft-delete with `deletedAt` + `status=TERMINATED`.

**Cycle 2 (atomicity + UI alignment):**
10. P4-CRIT-004 (salary-payments re-pay) — add idempotency check.
11. P4-CRIT-007 (salary-payments DELETE null-pointer + no reversal) — guard + reverseEntry.
12. P4-HIGH-002 + P4-HIGH-003 (salary-payments UI mismatch) — align UI with fixed API.
13. P4-HIGH-008 (PettyCash DELETE non-atomic) — wrap in $transaction.
14. P4-HIGH-014 (work-teams PUT non-atomic) — wrap in $transaction.
15. P4-HIGH-011 (salaries creates EquipmentCost) — switch to LaborCost.

**Cycle 3 (validation + missing handlers):**
16. P4-HIGH-001 (period guard pre-check) — add `assertPeriodOpen` to all HR POST/PUT.
17. P4-HIGH-004 (APPROVED→PAID no JE) — create payment JE or block transition.
18. P4-HIGH-005 + P4-HIGH-006 + P4-HIGH-007 (validation) — add field validations.
19. P4-HIGH-012 (duplicate timesheet routes) — remove legacy POST.
20. P4-HIGH-013 (SUBCONTRACTOR_ADVANCE shares 1230) — assign separate code.
21. P4-HIGH-015 (auto-calculate off-by-one + Decimal) — fix month index + Number() casts.
22. P4-HIGH-016 + P4-MED-002 + P4-MED-003 (missing [id] handlers) — add GET/PUT.
23. P4-HIGH-009 + P4-HIGH-010 (PettyCash hard-delete + no costCenterId) — soft-delete + cost center.
24. P4-MED-005/006/007 (code generation races) — wrap in $transaction with retry.

**Cycle 4 (polish — defer if low priority):**
25. All MEDIUM and LOW issues.
