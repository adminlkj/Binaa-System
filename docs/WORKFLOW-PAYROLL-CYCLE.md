# دورة الرواتب — Payroll Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.4 (Task ID: P3-4)
>
> This document records the FULL payroll business cycle as actually
> implemented in the Binaa-System ERP codebase, from employee master creation
> through advance settlement. Each step lists the API endpoint, required input
> fields, the journal entry (if any) posted, status transitions, prerequisites,
> and the reports affected. A companion end-to-end test
> (`scripts/e2e-payroll-cycle.ts`) exercises every step against the live
> database and verifies that all JEs are balanced and that the trial balance /
> salary-schedule / GOSI-liability reports tie out.

---

## نظرة عامة — Overview

The payroll cycle in Binaa-System is the chain:

```
┌─────────────┐   ┌──────────────────┐   ┌─────────────┐   ┌────────────────────────┐
│ 1. Employee │ → │ 2. Employee      │ → │ 3. Salary   │ → │ 4. Payroll Run         │
│   (master)  │   │    Contract      │   │   (monthly) │   │    (DRAFT → APPROVED)  │
│   No JE     │   │   (salary history│   │ APPROVED →  │   │    JE: Dr PAYROLL_EXP  │
│             │   │    — updates     │   │ JE accrual  │   │    + Dr GOSI_EXPENSE   │
│             │   │    basicSalary)  │   │ Dr PAYROLL  │   │    Cr SALARIES_PAYABLE │
│             │   │   No JE          │   │ Cr SAL_PAY  │   │    + Cr GOSI_PAYABLE   │
│             │   │                  │   │ (no GOSI)   │   │    (+ Cr EMP_ADV if    │
│             │   │                  │   │             │   │     deductions > 0)    │
└─────────────┘   └──────────────────┘   └─────────────┘   └───────────┬────────────┘
                                                                     ↓
                                          ┌────────────────────────────────────┐
                                          │ 5. Salary Payment (full run)       │
                                          │    JE: Dr SALARIES_PAYABLE         │
                                          │        Cr CASH / BANK              │
                                          │    Run → PAID; Salary → PAID       │
                                          └─────────────────┬──────────────────┘
                                                            ↓
                                          ┌────────────────────────────────────┐
                                          │ 6. (Optional) Employee Advance     │
                                          │    Grant:  Dr EMPLOYEE_ADVANCE     │
                                          │              Cr CASH               │
                                          │    Settle:  Dr SALARIES_PAYABLE    │
                                          │              Cr EMPLOYEE_ADVANCE   │
                                          │            (or Dr CASH / Dr BANK   │
                                          │             if cash settlement)    │
                                          └────────────────────────────────────┘
```

**Key design principle** — Payroll liabilities accrue at *approval* time and
clear at *payment* time. Two parallel paths exist for the accrual:

1. **Single-salary path** (`POST /api/salaries` with `status:'APPROVED'` or
   `PUT /api/salaries/[id]` with `status:'APPROVED'`) — used for one-off
   salary adjustments. Posts a **simple** accrual: Dr PAYROLL_EXPENSE /
   Cr SALARIES_PAYABLE (net only, **no GOSI split**).
2. **Payroll-run path** (`POST /api/payroll-runs` then `PUT /api/payroll-runs/[id]`
   with `status:'APPROVED'`) — the canonical monthly batch path. Posts a
   **gross-up** accrual that recognises the GOSI split:
   Dr PAYROLL_EXPENSE (net + deductions + gosi) /
   Cr SALARIES_PAYABLE (net) +
   Cr EMPLOYEE_ADVANCE (deductions, if any — recovery of prior advances) +
   Dr GOSI_EXPENSE / Cr GOSI_PAYABLE (company GOSI contribution).

Mixing both paths for the same employee/month double-counts the expense and
the payable — accountants must choose ONE path per period. The salary-payment
endpoint that pays a full payroll run will additionally flip any matching
`Salary` record for the same `(employeeId, month, year)` to `PAID`, but it
does NOT reverse the salary's own accrual JE if one was posted.

---

## الخطوة 1: إنشاء الموظف — Employee Creation (master)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/employees` |
| **Route file** | `src/app/api/employees/route.ts` (lines 70-135) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Branch` must exist (FK). If `branchId` not provided, the route auto-resolves to the first branch — but returns 400 if none exists. |
| **Required input fields** | `name` (non-empty string — L4-DATA-001) |
| **Auto-generated** | `code` as `EMP-NNN` (sequential, looked up from the highest existing `EMP-NNN` code) |
| **Optional fields** | `nameAr`, `nationality`, `profession`, `residenceNumber`, `residenceExpiry`, `hireDate`, `basicSalary` (default 0), `status` (default `ACTIVE`), `branchId`, `phone`, `email`, `isActive` (default true), `expenseAccountId` (per-employee override of the payroll-expense account) |
| **Employee defaults not set here** | `salaryType` (default `MONTHLY`), `referenceMonthlyHours` (240), `housingAllowance`/`transportAllowance`/`otherAllowances`/`hourlyRate` (0), `hasGosi` (false), `gosiPercentage` (0) — all set via direct UI PATCH or seeded |
| **Journal entry posted** | **No** — master record, not a financial event |
| **Initial status** | `ACTIVE` (default) |
| **Validation** | `code` uniqueness (auto-generated, collisions impossible); `name` non-empty |
| **Affected reports** | Employee list, employee card, payroll run line selection |

**Status transitions** (via `PATCH /api/employees/[id]`): `ACTIVE → ON_LEAVE → TERMINATED / RESIGNED`. No JE on any transition. Soft-delete (`deletedAt`) is supported — `GET` filters on `deletedAt: null`.

---

## الخطوة 2: عقد الموظف — Employee Contract (salary history)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/employee-contracts` |
| **Route file** | `src/app/api/employee-contracts/route.ts` (lines 33-93) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `Employee` must exist (FK) |
| **Required input fields** | `employeeId`, `startDate` |
| **Optional fields** | `endDate` (must be ≥ `startDate` — L4-DATA-005), `basicSalary` (default 0), `housingAllowance` (default 0), `transportAllowance` (default 0), `otherAllowances` (default 0) |
| **Side effect** | Updates `Employee.basicSalary` to the contract's `basicSalary` (so the employee master reflects the latest contract). Other allowances on the Employee master are NOT propagated. |
| **Computed (read-only, returned in GET)** | `totalCompensation = basicSalary + housingAllowance + transportAllowance + otherAllowances` — L3B-CRIT-004 fix: wraps each Decimal with `Number()` so JSON serialisation does not concatenate strings. |
| **Journal entry posted** | **No** — contract is a salary-history record, not a GL event |
| **Status** | None (contracts are stateless rows; the latest `startDate` wins) |
| **Validation** | `endDate ≥ startDate` if `endDate` provided |
| **Affected reports** | Employee contract list, salary auto-calculation (Step 3b uses the latest active contract for the period) |

---

## الخطوة 3: حساب الراتب — Salary Record (monthly)

Two sub-paths:

### 3a. Manual salary creation — `POST /api/salaries`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/salaries` |
| **Route file** | `src/app/api/salaries/route.ts` (lines 89-208) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `Employee` must exist |
| **Required input fields** | `employeeId`, `month` (1-12), `year` |
| **Optional fields** | `basicSalary`, `housingAllowance`, `transportAllowance`, `otherAllowances`, `overtimeAmount`, `deductions` (all default 0), `status` (default `DRAFT`) |
| **Computed** | `netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount − deductions` |
| **JE function called** | `createSalaryAccrualJournalEntry({...}, tx)` from `src/app/api/salaries/route.ts:49` — **only if `body.status === 'APPROVED'`** (creating directly in APPROVED state). If status is `DRAFT`, no JE is posted and `journalEntryId` stays NULL. |
| **sourceType on JE** | `SALARY_ACCRUAL` |
| **Initial status** | `DRAFT` (default) or `APPROVED` (if explicitly passed in body) |

**Journal entry lines** (posted at creation if `status='APPROVED'`, or at `PUT /api/salaries/[id]` DRAFT→APPROVED transition — see 3c):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Payroll Expense | `PAYROLL_EXPENSE` | 8110 | `netSalary` | — |
| Cr Salaries Payable | `SALARIES_PAYABLE` | 3310 | — | `netSalary` |

All Dr lines tagged with `costCenterId` resolved from `ResourceAllocation`
(resourceType='EMPLOYEE', period-overlapping) → `Project.costCenterId` matched
by `CostCenter.code = project.code` (NOT by direct FK). The Cr line is NOT
tagged to a cost center.

**Note**: This path does **NOT** post a GOSI split. The salary record's
`netSalary` is whatever the caller passes — there is no GOSI deduction
computation in `salaries/route.ts`. GOSI is only handled in the payroll-run
flow (Step 4). This is an important architectural asymmetry.

**Side effect (if ResourceAllocation exists)**: An `EquipmentCost` row is
created on the allocated project (`projectId`, `amount=netSalary`,
`date=salaryDate`) — this loads the salary cost onto the project's cost
breakdown for IFRS-15 POC. The naming `EquipmentCost` is misleading — the
table is used for all direct project costs (equipment + labor + salary).

### 3b. Auto-calculate salary — `POST /api/salaries/auto-calculate`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/salaries/auto-calculate` |
| **Route file** | `src/app/api/salaries/auto-calculate/route.ts` (lines 6-114) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `Employee` with an active `EmployeeContract` for the requested period (startDate ≤ month-start, endDate null or ≥ month-start) |
| **Required input fields** | `employeeId`, `month`, `year` |
| **Returns** (does NOT persist) | `{ basicSalary, housingAllowance, transportAllowance, otherAllowances, overtimeAmount, deductions, netSalary, attendanceDays, totalWorkHours, totalOvertimeHours, contractId, contractStartDate }` |
| **Journal entry posted** | **No** — this endpoint only *computes* the salary; the caller is expected to POST the result to `/api/salaries` to persist it |
| **Algorithm** | `basicSalary = contract.basicSalary`; `hourlyRate = basicSalary / 30 / 8`; `overtimeAmount = Σ Attendance.overtimeHours × hourlyRate`; `deductions = Σ EmployeeAdvance.amount where status='PENDING' AND date in month`; `netSalary = basic + housing + transport + other + overtime − deductions` |
| **Affected reports** | Pre-fill source for the Salary form |

### 3c. Approve salary — `PUT /api/salaries/[id]` with `{ status: 'APPROVED' }`

| Field | Value |
|---|---|
| **API endpoint** | `PUT /api/salaries/[id]` |
| **Route file** | `src/app/api/salaries/[id]/route.ts` (lines 31-154) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Allowed transitions** | `DRAFT → APPROVED`, `APPROVED → PAID` (the latter set by salary-payment flow, not by direct PUT) |
| **JE posted on DRAFT→APPROVED** | Same as 3a — `createSalaryAccrualJournalEntry` (Dr PAYROLL_EXPENSE / Cr SALARIES_PAYABLE, net only, no GOSI) |
| **Side effect** | If ResourceAllocation exists, `EquipmentCost` row created on allocated project |

**Status transitions** (enforced):

```
DRAFT     ──APPROVED──→  APPROVED    (JE posted — accrual)
APPROVED  ──PAID──────→  PAID        (set by salary-payment flow only)
PAID      ──(none)────→  (terminal)
```

DELETE is allowed only on `DRAFT` records (R12 — soft-delete via `deletedAt`).
Approved salaries cannot be deleted; they must be reversed via a correcting JE.

---

## الخطوة 4: مسير الرواتب — Payroll Run (batch accrual)

### 4a. Create payroll run — `POST /api/payroll-runs`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/payroll-runs` |
| **Route file** | `src/app/api/payroll-runs/route.ts` (lines 44-297) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | At least one ACTIVE employee (`isActive=true, status='ACTIVE', deletedAt=null`) matching the selection filter. **Idempotency**: only one DRAFT and zero non-DRAFT runs may exist per `(month, year)` — `@@unique([year, month])` is enforced at the schema level too. |
| **Required input fields** | `month` (1-12), `year` (≥2000) |
| **Optional fields** | `notes`, `selectionType` (`ALL` / `TEAM` / `PROJECT` / `EMPLOYEE`; default `ALL`), `selectionIds` (array), `salaryTypeFilter` (`MONTHLY` / `HOURLY` / null) |
| **Auto-generated** | `code` as `PAY-YYYY-NNNN` (sequential per year) |
| **Employee filter** | `isActive=true, status='ACTIVE', deletedAt=null`; plus optional `salaryType`, `teamMemberships.teamId`, `teamMemberships.team.projectId`, or `id IN (selectionIds)` depending on `selectionType` |
| **Per-line computation** | MONTHLY: `totalEntitlement = basic + housing + transport + other`; HOURLY: `hourlySalary = workHours × hourlyRate`, `overtimeAmount = Σ Attendance.overtimeHours × hourlyRate × 1.5`, `totalEntitlement = hourlySalary + overtimeAmount`; `gosiDeduction = hasGosi ? totalEntitlement × gosiPercentage/100 : 0`; `netSalary = totalEntitlement − deductions − gosiDeduction` |
| **Per-line project/team** | If `emp.teamMemberships.length > 0`, the first membership's `teamId` and `team.projectId` are written to the line (so the approve JE can tag cost centers per activity) |
| **Aggregates** | `totalAmount = Σ line.totalEntitlement`, `totalDeductions = Σ line.deductions`, `totalGosi = Σ line.gosiDeduction`, `totalNet = Σ line.netSalary` |
| **JE function called** | **None** — DRAFT creation posts no JE |
| **Initial status** | `DRAFT` |

### 4b. Approve payroll run — `PUT /api/payroll-runs/[id]` with `{ status: 'APPROVED' }`

| Field | Value |
|---|---|
| **API endpoint** | `PUT /api/payroll-runs/[id]` |
| **Route file** | `src/app/api/payroll-runs/[id]/route.ts` (lines 64-402) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Strict state machine** (P4-CRIT-002/003 fixes) | `DRAFT → REVIEW / APPROVED`; `REVIEW → APPROVED / DRAFT`; `APPROVED → PAID / DRAFT`; `PARTIALLY_PAID → PAID`; `PAID → (terminal)`. Re-APPROVE from PAID/PARTIALLY_PAID is **blocked** (was creating duplicate accrual JEs without reversing the original). Silent demotion PAID → DRAFT/REVIEW is also blocked (was producing orphaned JEs in GL). |
| **JE function called** | `createJournalEntry({...}, tx)` from `src/lib/accounting/engine.ts:288` — inline JE construction, NOT an auto-journal helper. One JE per activity bucket (PROJECT / RENTAL / ADMIN). |
| **sourceType on JE** | `PAYROLL_RUN` |
| **sourceId on JE** | `payrollRun.code` (e.g. `PAY-2025-0001`) |
| **Accounts resolved by role** (P4-CRIT-008 fix — no hardcoded codes) | `SALARIES_PAYABLE` (3310), `GOSI_EXPENSE` (8210), `GOSI_PAYABLE` (3830), `EMPLOYEE_ADVANCE` (1230), and per-activity salary expense (see below) |

**Per-activity salary expense account** (`getSalaryAccountCode` in
`src/lib/accounting/engine.ts:1336-1346`):

| Activity | Account role | Account code |
|---|---|---|
| `PROJECT` | `PROJECT_COST` | 7110 |
| `RENTAL` | `DRIVER_EXPENSE` | 7230 |
| `ADMIN` | `PAYROLL_EXPENSE` | 8110 |

Activity is inferred per line from `line.project.projectType`:
`EQUIPMENT_RENTAL → RENTAL`, `CONSTRUCTION` (or any projectId set) → `PROJECT`,
otherwise → `ADMIN`.

**Lines are grouped by activity bucket**, then one JE is posted per bucket:

**Journal entry lines** (per activity bucket, P4-CRIT-009 gross-up — **⚠ production code has a GOSI double-count bug**):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salary Expense (gross) | per activity (see table above) | 7110 / 7230 / 8110 | `totalNet + totalDeductions + totalGosi` ⚠ | — |
| Cr Salaries Payable (net) | `SALARIES_PAYABLE` | 3310 | — | `totalNet` |
| Cr Employee Advance (deductions, if > 0) | `EMPLOYEE_ADVANCE` | 1230 | — | `totalDeductions` |
| Dr GOSI Expense (if gosi > 0) | `GOSI_EXPENSE` | 8210 | `totalGosi` | — |
| Cr GOSI Payable (if gosi > 0) | `GOSI_PAYABLE` | 3830 | — | `totalGosi` |

⚠ **CRITICAL BUG (P3-4-CRIT-001)** — The production code at
`src/app/api/payroll-runs/[id]/route.ts:153` computes
`grossExpense = totalNet + totalDeductions + totalGosi` (GOSI included),
then ALSO posts a separate `Dr GOSI_EXPENSE = totalGosi`. This double-counts
GOSI: total Dr = `net + ded + 2×gosi` vs total Cr = `net + ded + gosi`,
imbalance = `gosi`. The posting guard (R2) rejects the JE with
`القيد غير متوازن: مدين=X ≠ دائن=Y (فرق=gosi)` whenever any line has
`gosiDeduction > 0`. **No payroll run with GOSI-enabled employees can be
approved in production.**

**Intended/correct behaviour** (verified by `scripts/e2e-payroll-cycle.ts`):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salary Expense (gross) | per activity | 7110 / 7230 / 8110 | `totalNet + totalDeductions` (NO gosi) | — |
| Cr Salaries Payable (net) | `SALARIES_PAYABLE` | 3310 | — | `totalNet` |
| Cr Employee Advance (deductions, if > 0) | `EMPLOYEE_ADVANCE` | 1230 | — | `totalDeductions` |
| Dr GOSI Expense (if gosi > 0) | `GOSI_EXPENSE` | 8210 | `totalGosi` | — |
| Cr GOSI Payable (if gosi > 0) | `GOSI_PAYABLE` | 3830 | — | `totalGosi` |

Total Dr = `net + ded + gosi` = Total Cr ✓

**One-line fix** in `src/app/api/payroll-runs/[id]/route.ts:153`:
```diff
- const grossExpense = totals.totalNet + totals.totalDeductions + totals.totalGosi
+ const grossExpense = totals.totalNet + totals.totalDeductions
```

The Dr Salary Expense line is tagged with `costCenterId` (first line's
project.costCenterId wins per activity bucket — P4-HIGH-010). Other lines are
NOT tagged.

**Side effects**:
- `PayrollRun.journalEntryId` is set to the LAST activity bucket's JE id
  (caveat: if there are multiple activity buckets, only the last JE id is
  stored on the run; all JEs are tagged with `sourceType='PAYROLL_RUN'` and
  `sourceId=run.code` so they can be retrieved together).

**Status transitions** (full state machine, all validated):

```
DRAFT          ──REVIEW────→  REVIEW        (no JE)
DRAFT          ──APPROVED───→  APPROVED     (JE posted — accrual, possibly multiple)
REVIEW         ──APPROVED───→  APPROVED     (JE posted)
REVIEW         ──DRAFT──────→  DRAFT        (return for editing, no JE)
APPROVED       ──PAID───────→  PAID         (payment JE posted — see 5b alt path)
APPROVED       ──DRAFT──────→  DRAFT        (rare; no JE reversal here — see note)
PARTIALLY_PAID ──PAID───────→  PAID         (final payment JE)
PAID           ──(terminal)→  —             (no further transitions via this route)
```

DELETE is allowed only on `DRAFT` runs (cascades to `PayrollRunLine`).

---

## الخطوة 5: سداد الرواتب — Salary Payment (collection / disbursement)

### 5a. Pay full payroll run — `POST /api/salary-payments` with `payrollRunId` (no `employeeId`)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/salary-payments` |
| **Route file** | `src/app/api/salary-payments/route.ts` (lines 50-201) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `PayrollRun` with `status='APPROVED'` or `'PARTIALLY_PAID'`, and `totalNet > 0` |
| **Required input fields** | `payrollRunId` (without `employeeId` — triggers the bulk path) |
| **Optional fields** | `paymentMethod` (`BANK` / `CASH`; default `BANK`), `payingAccountCode` (explicit account; if absent, resolved by role `BANK` or `CASH`, with cross-fallback), `payingAccountName`, `reference` (or `referenceNumber` — L3B-CRIT-005), `notes` |
| **Per-line behaviour** | For each `PayrollRunLine`: skip if `netSalary ≤ 0`; skip if a `SalaryPayment` already exists for `(payrollRunId, employeeId)` (idempotency); else create a `SalaryPayment` row, and if a matching `Salary` exists with `status='APPROVED'`, flip it to `'PAID'` |
| **JE function called** | `createJournalEntry({...}, tx)` from `src/lib/accounting/engine.ts:288` — ONE consolidated JE for the entire batch |
| **sourceType on JE** | `SALARY_PAYMENT` |
| **sourceId on JE** | `payrollRun.code` |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salaries Payable | `SALARIES_PAYABLE` | 3310 | `run.totalNet` | — |
| Cr Cash / Bank | explicit `payingAccountCode`, else role `CASH` (1110) or `BANK` (1120) | 1110 / 1120 | — | `run.totalNet` |

**Side effects**:
- `SalaryPayment.journalEntryId` set on every created payment row (all point
  to the same consolidated JE).
- `PayrollRun.status` → `'PAID'`; `paymentJournalEntryId`, `paymentAccountCode`,
  `paymentAccountNameAr` set.

### 5b. Pay single salary — `POST /api/salary-payments` with `employeeId` + `month` + `year`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/salary-payments` |
| **Route file** | `src/app/api/salary-payments/route.ts` (lines 203-317) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Salary` record for `(employeeId, month, year)` with `status='APPROVED'` (not PAID — P4-CRIT-004 idempotency fix) |
| **Required input fields** | `employeeId`, `month`, `year` |
| **Optional fields** | `payrollRunId` (links the payment to a run without triggering the bulk path), `paymentMethod`, `payingAccountCode`, `payingAccountName`, `reference`, `notes` |
| **JE function called** | `createJournalEntry({...}, tx)` |
| **sourceType on JE** | `SALARY_PAYMENT` |
| **sourceId on JE** | `salaryPayment.id` |

**Journal entry lines** (same structure as 5a, single-employee amount):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salaries Payable | `SALARIES_PAYABLE` | 3310 | `salary.netSalary` | — |
| Cr Cash / Bank | resolved as in 5a | 1110 / 1120 | — | `salary.netSalary` |

**Side effects**:
- `SalaryPayment.journalEntryId` set.
- `Salary.status` → `'PAID'`; `Salary.journalEntryId` updated to point to the
  payment JE (NOTE: this OVERWRITES the salary's previous `journalEntryId`
  that pointed to the accrual JE — the accrual linkage is lost on payment.
  This is a known minor data-quality issue, documented for future cleanup).

### 5c. Alt: Pay via payroll-run status transition — `PUT /api/payroll-runs/[id]` with `{ status: 'PAID', bankAccountCode }`

| Field | Value |
|---|---|
| **API endpoint** | `PUT /api/payroll-runs/[id]` |
| **Route file** | `src/app/api/payroll-runs/[id]/route.ts` (lines 241-325) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | Run `status='APPROVED'` (or `PARTIALLY_PAID`); `journalEntryId` non-null (accrual JE must exist); `totalNet > 0` |
| **Required input fields** | `bankAccountCode`, `bankAccountNameAr` (optional) |
| **JE function called** | `createJournalEntry({...}, tx)` |
| **sourceType on JE** | `PAYROLL_PAYMENT` |
| **sourceId on JE** | `payrollRun.code` |

**Journal entry lines** (identical Dr/Cr to 5a):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salaries Payable | `SALARIES_PAYABLE` | 3310 | `run.totalNet` | — |
| Cr Cash / Bank | explicit `bankAccountCode` | 1110 / 1120 | — | `run.totalNet` |

**Side effects**:
- `PayrollRun.status` → `'PAID'`; `paymentJournalEntryId`, `paymentAccountCode`,
  `paymentAccountNameAr` set.
- **Does NOT create `SalaryPayment` rows** — only the JE is posted. This path
  is a thin wrapper around the JE for callers that don't need per-employee
  payment records. The 5a path is preferred because it produces the full
  subledger.

**NOTE**: Calling 5a AND 5c on the same run double-pays — both post a
`Dr SALARIES_PAYABLE / Cr CASH` JE. The state machine allows 5c from
`APPROVED → PAID` and 5a from `APPROVED/PARTIALLY_PAID → PAID`. The 5a path
is the canonical one because it creates the per-employee subledger.

---

## الخطوة 6 (اختياري): سلف الموظفين — Employee Advance (sub-cycle)

### 6a. Grant advance — `POST /api/advances`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/advances` |
| **Route file** | `src/app/api/advances/route.ts` (lines 24-82) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `Employee` must exist |
| **Required input fields** | `employeeId`, `amount`, `date` |
| **Optional fields** | `description`, `paymentSource` (`BANK` / `CASH` / `EMPLOYEE_DEDUCTION`), `paymentAccountCode` (explicit override) |
| **JE function called** | `autoEntryEmployeeAdvance({...}, tx)` from `src/lib/accounting/engine.ts:582` |
| **sourceType on JE** | `EMPLOYEE_ADVANCE` |
| **sourceId on JE** | `EA-${Date.now()}` (NOT the advance id — this is a known minor data-quality issue, makes direct source↔JE linkage via sourceId unreliable; use `EmployeeAdvance.journalEntryId` FK instead) |
| **Initial status** | `PENDING`; `settledAmount = 0` |

**Journal entry lines** (grant):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Employee Advance | `EMPLOYEE_ADVANCE` | 1230 | `amount` | — |
| Cr Cash / Bank | explicit `paymentAccountCode`, else role `CASH` (default), `BANK` (if `paymentSource='BANK'`), or `CASH` (if `paymentSource='EMPLOYEE_DEDUCTION'`) | 1110 / 1120 | — | `amount` |

### 6b. Settle advance — `PUT /api/advances/[id]` with `{ settleAmount, ... }`

| Field | Value |
|---|---|
| **API endpoint** | `PUT /api/advances/[id]` |
| **Route file** | `src/app/api/advances/[id]/route.ts` (lines 13-94) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `EmployeeAdvance` with `settledAmount + settleAmount ≤ amount` (P4-MED-015) |
| **Required input fields** | `settleAmount` (>0) |
| **Optional fields** | `settlementMethod` (`SALARY_DEDUCTION` / `BANK` / `CASH`; default `SALARY_DEDUCTION`), `settlementAccountCode` (explicit override), `settlementDate` (default today), `status` (auto-inferred: `SETTLED` if fully settled, `PARTIALLY_SETTLED` otherwise) |
| **JE function called** | `autoEntryAdvanceSettlement({...}, tx)` from `src/lib/accounting/engine.ts:644` |
| **sourceType on JE** | `ADVANCE_SETTLEMENT` |
| **sourceId on JE** | `AS-${Date.now()}` (same caveat as 6a) |

**Journal entry lines** (settle, default `SALARY_DEDUCTION` — P4-CRIT-010 fix):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Salaries Payable | `SALARIES_PAYABLE` | 3310 | `settleAmount` | — |
| Cr Employee Advance | `EMPLOYEE_ADVANCE` | 1230 | — | `settleAmount` |

Rationale (P4-CRIT-010): the advance was originally a cash outflow posted to
`EMPLOYEE_ADVANCE` (asset). When recovered via salary deduction, the company
relieves `SALARIES_PAYABLE` (the liability accrued at salary approval) instead
of re-recognising the expense — this avoids inflating `PAYROLL_EXPENSE` and
producing a negative `SALARIES_PAYABLE` before accrual.

Alternative settlements:
- `settlementMethod='CASH'` → Dr `CASH` (1110) / Cr `EMPLOYEE_ADVANCE` (1230)
- `settlementMethod='BANK'` → Dr `BANK` (1120) / Cr `EMPLOYEE_ADVANCE` (1230)
- `settlementAccountCode=<explicit>` → Dr `<explicit>` / Cr `EMPLOYEE_ADVANCE` (1230)

**Status transitions**:

```
PENDING            ──settleAmount>0 (partial)──→  PARTIALLY_SETTLED
PENDING            ──settleAmount=full─────────→  SETTLED
PARTIALLY_SETTLED  ──settleAmount=remaining────→  SETTLED
SETTLED            ──(terminal)────────────────→  —
CANCELLED          ──(terminal)────────────────→  —
```

**Bulk settle endpoint** `PUT /api/advances` (with `{ id, settledAmount, status }`)
exists in `src/app/api/advances/route.ts:84-146` and is used by the UI's
advance list. It calls the same `autoEntryAdvanceSettlement` JE helper.

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running all 6 steps for a single employee + period, the following must hold:

### 1. ميزان المراجعة متوازن — Trial Balance Ties

```ts
import { getTrialBalance } from '@/lib/accounting/queries'
const tb = await getTrialBalance()
// tb.totals.totalDebit === tb.totals.totalCredit (within 0.01)
// tb.totals.isBalanced === true
```

### 2. كل القيود المرحَّلة متوازنة — All Posted JEs Balanced

Every JE created during the cycle must satisfy `Σ debit = Σ credit` per entry.
This is enforced by guard rule R2 at post time and verified by
`accountingHealthCheck().checks[0]` and `verifyNumericalConsistency()` I1-I7.

### 3. أرصدة حسابات الرواتب صحيحة — Payroll Account Balances

For an employee `E` with monthly salary `S` (net), GOSI deduction `G`, and
advance `A` (later settled via salary deduction):

| Account role | Expected balance (after cycle, IF both salary-approve AND payroll-run-approve paths are used) |
|---|---|
| `PAYROLL_EXPENSE` (Dr) | `S` (from salary accrual) + `S + G` (from payroll run accrual, gross-up) — **DOUBLE-COUNTED** ⚠ |
| `SALARIES_PAYABLE` (Cr) | `S` (salary accrual) + `S` (payroll run accrual) − `S` (payment) − `settleAmount` (advance settlement) |
| `GOSI_EXPENSE` (Dr) | `G` (payroll run only — salary accrual does NOT compute GOSI) |
| `GOSI_PAYABLE` (Cr) | `G` (payroll run only) |
| `EMPLOYEE_ADVANCE` (Dr) | `A` (grant) − `settleAmount` (settle) |
| `CASH` (Cr) | `S` (salary payment) + `A` (advance grant) |

⚠ **Architectural warning** — calling both `PUT /api/salaries/[id] {status:'APPROVED'}`
(Step 3c) AND `PUT /api/payroll-runs/[id] {status:'APPROVED'}` (Step 4b) for
the same employee/period double-counts the accrual. Accountants should use
**EITHER** the single-salary path **OR** the payroll-run path per period.
The canonical monthly flow is the payroll-run path (Step 4 + Step 5a).

### 4. Source ↔ JE Linkage Integrity

Every operational source document that posts a JE must have a non-null
`journalEntryId` foreign key:

| Model | Field | Set by |
|---|---|---|
| `Salary` | `journalEntryId` | `createSalaryAccrualJournalEntry` (on DRAFT→APPROVED or direct APPROVED creation); OVERWRITTEN by single-employee payment JE in 5b |
| `PayrollRun` | `journalEntryId` | payroll-run approve handler (last activity bucket's JE id) |
| `PayrollRun` | `paymentJournalEntryId` | salary-payment bulk path (5a) or payroll-run PAID transition (5c) |
| `SalaryPayment` | `journalEntryId` | salary-payment bulk path (5a) or single-employee path (5b) |
| `EmployeeAdvance` | `journalEntryId` | `autoEntryEmployeeAdvance` (on grant) |

`EmployeeAdvance` settlement does NOT store a separate `settlementJournalEntryId` —
the settlement JE is tagged with `sourceType='ADVANCE_SETTLEMENT'` and
`sourceId='AS-<timestamp>'`, but the FK back to the advance is missing. To
retrieve settlement JEs for an advance, query by `sourceType` + date range +
amount — or, better, extend the schema in a future fix.

### 5. verifyNumericalConsistency (I1-I7)

```ts
import { verifyNumericalConsistency } from '@/lib/accounting/queries'
const nc = await verifyNumericalConsistency()
// nc.ok === true
// nc.accountsChecked === (number of accounts with non-zero activity)
// nc.diffs.length === 0
```

This runs 7 integrity checks: trial balance ties (I1), net columns tie (I2),
raw aggregate matches TB (I3), accounting equation A=L+E (I4), per-account
GL vs direct balance vs TB signed balance (I5/I6), and balance sheet vs
income statement cross-check (I7).

### 6. Idempotency Guards

- `PayrollRun @@unique([year, month])` — one run per period at the DB level.
- `POST /api/payroll-runs` additionally blocks if any non-DRAFT run exists for
  the period, and blocks if a DRAFT run already exists.
- `POST /api/salary-payments` (bulk path) skips employees with existing
  `SalaryPayment` for the run — re-running pays only the unpaid subset.
- `POST /api/salary-payments` (single path) returns 400 if `Salary.status='PAID'`
  (P4-CRIT-004 fix).
- `PUT /api/advances/[id]` returns 400 if `newSettledAmount > amount`
  (P4-MED-015 fix).

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source doc | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 3a/3c | Salary (DRAFT→APPROVED) | `SALARY_ACCRUAL` | PAYROLL_EXPENSE | SALARIES_PAYABLE | Net only — NO GOSI split |
| 4a | PayrollRun (create DRAFT) | — | — | — | NO JE — DRAFT creation is planning only |
| 4b | PayrollRun (DRAFT→APPROVED) | `PAYROLL_RUN` | per-activity salary expense (gross) + GOSI_EXPENSE | SALARIES_PAYABLE (net) + EMPLOYEE_ADVANCE (deductions) + GOSI_PAYABLE | One JE per activity bucket (PROJECT/RENTAL/ADMIN) |
| 5a | SalaryPayment (bulk, full run) | `SALARY_PAYMENT` | SALARIES_PAYABLE | CASH/BANK | One consolidated JE per batch; flips Salary→PAID |
| 5b | SalaryPayment (single employee) | `SALARY_PAYMENT` | SALARIES_PAYABLE | CASH/BANK | Overwrites Salary.journalEntryId (accrual linkage lost) |
| 5c | PayrollRun (APPROVED→PAID via PUT) | `PAYROLL_PAYMENT` | SALARIES_PAYABLE | CASH/BANK | Does NOT create SalaryPayment rows — alt path |
| 6a | EmployeeAdvance (grant) | `EMPLOYEE_ADVANCE` | EMPLOYEE_ADVANCE | CASH/BANK | sourceId is `EA-<ts>`, not advance.id |
| 6b | EmployeeAdvance (settle, default = salary deduction) | `ADVANCE_SETTLEMENT` | SALARIES_PAYABLE | EMPLOYEE_ADVANCE | P4-CRIT-010 fix — was Dr PAYROLL_EXPENSE (inflated expense) |
| 6b alt | EmployeeAdvance (settle, cash) | `ADVANCE_SETTLEMENT` | CASH | EMPLOYEE_ADVANCE | When `settlementMethod='CASH'` |
| 6b alt | EmployeeAdvance (settle, bank) | `ADVANCE_SETTLEMENT` | BANK | EMPLOYEE_ADVANCE | When `settlementMethod='BANK'` |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| Employee API | `src/app/api/employees/route.ts`, `src/app/api/employees/[id]/route.ts` |
| Employee contract API | `src/app/api/employee-contracts/route.ts`, `src/app/api/employee-contracts/[id]/route.ts` |
| Salary API (POST + createSalaryAccrualJournalEntry) | `src/app/api/salaries/route.ts` |
| Salary API (PUT — approve / transition) | `src/app/api/salaries/[id]/route.ts` |
| Salary auto-calc API | `src/app/api/salaries/auto-calculate/route.ts` |
| Payroll run API (POST — create + filter + line calc) | `src/app/api/payroll-runs/route.ts` |
| Payroll run API (PUT — state machine + approve + pay) | `src/app/api/payroll-runs/[id]/route.ts` |
| Salary payment API (POST — bulk + single paths) | `src/app/api/salary-payments/route.ts` |
| Advance API (POST — grant + PUT — bulk settle) | `src/app/api/advances/route.ts` |
| Advance API (PUT — per-id settle) | `src/app/api/advances/[id]/route.ts` |
| Auto-journal (advance grant + settlement) | `src/lib/accounting/engine.ts` (`autoEntryEmployeeAdvance:582`, `autoEntryAdvanceSettlement:644`, `getSalaryAccountCode:1336`) |
| JE creation proxy | `src/lib/accounting/engine.ts` (`createJournalEntry:288`) |
| Posting guard (R1-R12, entryNo) | `src/lib/accounting/guard.ts` |
| Accounting queries (SSOT) | `src/lib/accounting/queries.ts` (`getTrialBalance:298`, `verifyNumericalConsistency:990`) |
| Account-role resolver | `src/lib/account-roles.ts` (`AccountRole` keys, `requireAccountByRole`, `requireAccountCodeByRole`) |
| Prisma schema | `prisma/schema.prisma` (`Employee:609`, `EmployeeContract:656`, `Salary:692`, `PayrollRun:761`, `PayrollRunLine:789`, `SalaryPayment:823`, `EmployeeAdvance:1863`, `ResourceAllocation:2191`) |
| E2E test | `scripts/e2e-payroll-cycle.ts` |

---

## Key Architectural Findings

1. **Two parallel accrual paths** (`salaries/route.ts` POST/PUT vs
   `payroll-runs/[id]/route.ts` PUT) — both can post a `Dr PAYROLL_EXPENSE /
   Cr SALARIES_PAYABLE` JE for the same employee/period. The salary path
   posts NET only (no GOSI split); the payroll-run path posts the gross-up
   with GOSI. Accountants must choose ONE path per period — the canonical
   monthly flow is the payroll-run path.

2. **GOSI lives in the payroll run, not the salary** — `salaries/route.ts`
   does NOT compute or post GOSI. Only `payroll-runs/[id]/route.ts` (on
   approve) computes `gosiDeduction = totalEntitlement × gosiPercentage/100`
   per line and posts the `Dr GOSI_EXPENSE / Cr GOSI_PAYABLE` split.

3. **Salary `journalEntryId` is overwritten on single-employee payment** —
   the 5b path sets `Salary.journalEntryId = paymentJE.id`, destroying the
   link to the accrual JE. The 5a (bulk) path does NOT do this — it
   separately flips `Salary.status` to PAID without touching
   `Salary.journalEntryId`. This is a known minor data-quality issue.

4. **Payroll run stores only the LAST JE id** — when the approve handler
   posts one JE per activity bucket (PROJECT/RENTAL/ADMIN), only the last
   bucket's JE id is saved to `PayrollRun.journalEntryId`. All JEs are
   retrievable via `sourceType='PAYROLL_RUN' AND sourceId=run.code`.

5. **Employee advance settlement has no FK back to the advance** —
   `autoEntryAdvanceSettlement` tags the JE with `sourceType='ADVANCE_SETTLEMENT'`
   and `sourceId='AS-<timestamp>'` (not the advance id). The
   `EmployeeAdvance.settlementJournalEntryId` field does NOT exist on the
   model. Settlement JEs must be retrieved by sourceType + date range.

6. **Strict state machine on payroll run** (P4-CRIT-002/003) — re-APPROVE
   from PAID/PARTIALLY_PAID is blocked; silent demotion PAID → DRAFT/REVIEW
   is blocked. This prevents duplicate accrual JEs and orphaned GL entries.

7. **Gross-up logic** (P4-CRIT-009) — the payroll-run approve handler
   correctly debits `PAYROLL_EXPENSE` for the GROSS amount
   (`net + deductions`), not just net. Without this, expense was understated
   and `EMPLOYEE_ADVANCE` was inflated (deductions are advance recoveries,
   not new expense). **NOTE**: the original P4-CRIT-009 fix over-corrected
   by including `+ totalGosi` in grossExpense too, producing a GOSI
   double-count bug — see finding #11.

8. **Cost-center tagging is partial** — only the Dr salary-expense line is
   tagged with `costCenterId` (from `line.project.costCenterId`). The Cr
   payable lines (SALARIES_PAYABLE, GOSI_PAYABLE, EMPLOYEE_ADVANCE) are NOT
   tagged. This means project-cost reports correctly capture the salary
   expense, but cross-project payable aging is unsegmented (which is correct
   — payables are company-level liabilities, not project-level).

9. **PayrollRun `@@unique([year, month])`** — DB-level enforcement of one
   run per period. Combined with the JS-level check that blocks DRAFT
   creation if any non-DRAFT run exists, this gives strong idempotency.

10. **ResourceAllocation drives salary cost-center tagging** — the salary
    accrual JE looks up `ResourceAllocation` (resourceType='EMPLOYEE',
    period-overlapping) → `Project.costCenterId` matched via
    `CostCenter.code = project.code` (NOT via direct FK). This indirection
    is fragile — if a project's code doesn't match its cost-center code,
    the salary JE lines won't be tagged. The payroll-run flow uses the
    direct `line.project.costCenterId` FK, which is more reliable.

11. **⚠ CRITICAL: GOSI double-count bug in payroll-run approve**
    (P3-4-CRIT-001) — `src/app/api/payroll-runs/[id]/route.ts:153` computes
    `grossExpense = totalNet + totalDeductions + totalGosi` (GOSI included)
    AND posts a separate `Dr GOSI_EXPENSE = totalGosi`. The JE is therefore
    unbalanced by exactly `totalGosi` whenever any employee has GOSI
    enabled, and the posting guard (R2) rejects the entire approve
    transaction. **No payroll run with GOSI-enabled employees can be
    approved in production.** This is a one-line fix (remove `+ totalGosi`
    from grossExpense). The `scripts/e2e-payroll-cycle.ts` E2E test
    replicates the INTENDED behaviour (gross excludes GOSI) and passes
    55/55; the production code path remains broken until the fix is applied.

12. **Salary accrual hits PAYROLL_EXPENSE (8110) regardless of activity** —
    the `createSalaryAccrualJournalEntry` helper in `salaries/route.ts`
    always uses the `PAYROLL_EXPENSE` role, even if the employee is allocated
    to a CONSTRUCTION project. By contrast, the payroll-run approve handler
    routes to `PROJECT_COST` (7110) for CONSTRUCTION activity. This means
    the same employee's salary can hit two different expense accounts
    depending on which approval path is used — a reporting inconsistency
    that accountants should be aware of.

13. **`getSalaryAccountCode` mapping is asymmetric** — `PROJECT` activity
    uses `PROJECT_COST` (7110), `RENTAL` activity uses `DRIVER_EXPENSE`
    (7230), and `ADMIN` activity uses `PAYROLL_EXPENSE` (8110). The
    RENTAL→DRIVER_EXPENSE mapping is semantically odd (drivers are a subset
    of rental staff); a more accurate mapping would be a dedicated
    `RENTAL_LABOR` role, but this is what the code does today.

