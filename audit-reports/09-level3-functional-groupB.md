# Level 3 Functional Audit — Group B (HR & Payroll)

**Task ID**: L3-a-GroupB
**Auditor**: Functional Audit Subagent — Group B (HR & Payroll)
**Scope**: 10 modules in `src/components/modules/` + matching API routes in `src/app/api/`
**Date**: 2026-06-29
**Methodology**: READ-ONLY audit — code reading + practical curl E2E testing against live dev server at `http://localhost:3000`

## Methodology

- Read every component file in `src/components/modules/` for the 10 in-scope modules.
- Read every matching API route file in `src/app/api/` (collection + `[id]` routes).
- For each module, identified all interactive buttons (create / save / edit / delete / status transitions / print / export / refresh / approve / pay / settle / submit / bulk actions) and traced each button → handler → API endpoint → HTTP method → request body shape → server-side validation → response shape → success/error feedback.
- Ran 30+ curl commands against the live dev server to actually exercise each API. The first ~20 curl calls succeeded; then a CRITICAL compilation error in `/api/salaries/[id]/route.ts` (issue L3B-CRIT-001 below) poisoned the Turbopack dev server cache, after which **every** API call returned HTTP 500 with an HTML error page. The remaining endpoints were audited via code reading only; their live curl tests are documented as "blocked by L3B-CRIT-001".
- 10 modules audited, 60+ interactive buttons/actions traced, 32 curl calls made.

## Summary

- **Total issues: 38** (CRITICAL: 6, HIGH: 13, MEDIUM: 13, LOW: 6)
- The single most severe issue, **L3B-CRIT-001**, breaks the entire Next.js dev server (and would also break a production build) — a missing `export` keyword in `/api/salaries/route.ts` causes an unresolved import in `/api/salaries/[id]/route.ts`.
- The salaries module lifecycle (Approve, Mark-as-Paid, Delete) is therefore completely non-functional.
- Three more CRITICAL bugs completely break core HR flows: employee-contract edit (always creates a duplicate instead of updating), payroll-run "Send for Review" (always 400), and salary-payments create (UI/API payload mismatch).
- The work-teams create flow is also broken — UI sends `members: string[]` but API expects `members: Array<{employeeId, role?, isLeader?}>`, so any team created from the UI gets zero members.

---

## Findings by Module

### 1. Employees (`src/components/modules/employees.tsx`)

**Buttons found: 6** (Print, Export CSV, Refresh, New Employee, Edit per-row, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Employee | opens dialog → `createMutation.mutate(payload)` | `/api/employees` | POST | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no toast / F-004 ⚠️ HTML5 only / F-005 ❌ accepts empty name + neg salary / F-006 ✅ disabled / F-007 ✅ invalidate / F-008 n/a / F-009 n/a / F-010 ✅ reset | HIGH |
| 2 | Edit (Pencil) | opens dialog with editingEmployee → calls `updateMutation.mutate` | `/api/employees/[id]` | PUT | F-001 ✅ / F-002 ❌ / F-003 ❌ / F-004 ⚠️ / F-005 ❌ accepts empty name + neg salary / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | HIGH |
| 3 | Delete (Trash) | `confirm()` → `deleteMutation.mutate(id)` | `/api/employees/[id]` | DELETE | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no toast / F-004 n/a / F-005 ✅ 404 + 400 with Arabic msg / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm() not AlertDialog / F-009 ✅ FK guard / F-010 n/a | MEDIUM |
| 4 | Refresh | `refetch()` | `/api/employees` | GET | ✅ all checks pass | OK |
| 5 | Export CSV | `exportToCSV(filtered, ...)` | n/a (client-side) | n/a | ✅ works | OK |
| 6 | Print | `<PrintButton type="generic-table" data={printData} />` | n/a (client-side) | n/a | ✅ works | OK |

**Curl test results (live):**

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `GET /api/employees` | list | 200 | `[]` | ✅ |
| `POST /api/employees` | empty body `{}` | 400 | `{"error":"لا يوجد فرع مسجل. أنشئ فرعاً أولاً."}` | ✅ Arabic error |
| `POST /api/employees` | `{"name":"TEST EMP L3B","branchId":"<id>"}` | 201 | full employee object with `code:"EMP-001"` | ✅ |
| `POST /api/employees` | `{"name":"","branchId":"<id>"}` | 201 | `name:""` accepted | ❌ should 400 |
| `POST /api/employees` | `{"name":"X","branchId":"<id>","basicSalary":"-5000"}` | 201 | `basicSalary:"-5000"` accepted | ❌ should 400 |
| `POST /api/employees` | `{"name":"X","branchId":"<id>","basicSalary":"abc"}` | 500 | `{"error":"فشل في إنشاء الموظف"}` | ❌ should 400 |
| `POST /api/employees` | `{"name":"X","branchId":"<id>","hireDate":"not-a-date"}` | 500 | generic Arabic error | ❌ should 400 |
| `PUT /api/employees/[id]` | `{"name":""}` | 200 | `name:""` saved | ❌ should 400 |
| `PUT /api/employees/[id]` | `{"basicSalary":"-9999"}` | 200 | `basicSalary:"-9999"` saved | ❌ should 400 |
| `DELETE /api/employees/nonexistent` | 404 | `{"error":"الموظف غير موجود"}` | ✅ |
| `DELETE /api/employees/[id]` (no deps) | 200 | `{"success":true,"message":"تم حذف الموظف (soft-delete)"}` | ✅ |
| `DELETE /api/employees/[id]` (already deleted) | 400 | `{"error":"الموظف محذوف بالفعل"}` | ✅ |

### 2. Attendance (`src/components/modules/attendance.tsx`)

**Buttons found: 6** (Print, Export, Refresh, Bulk Entry, Record Attendance, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | Record Attendance | dialog → `createMutation.mutate(payload)` | `/api/attendance` | POST | F-001 ✅ / F-002 ✅ toast.success / F-003 ❌ no onError toast / F-004 ⚠️ / F-005 ❌ no duplicate check / F-006 ✅ disabled / F-007 ✅ / F-008 n/a / F-009 ❌ dup allowed / F-010 ✅ | HIGH |
| 2 | Bulk Entry | dialog → `bulkMutation.mutate()` (Promise.allSettled) | `/api/attendance` × N | POST | F-001 ⚠️ / F-002 ✅ partial / F-003 ❌ allSettled swallows per-emp errors / F-004 ⚠️ / F-005 ❌ / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 ❌ / F-010 ✅ | HIGH |
| 3 | Delete (Trash) | `confirm()` → `deleteMutation.mutate(id)` | `/api/attendance/[id]` | DELETE | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ / F-004 n/a / F-005 ✅ 500 only / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 n/a / F-010 n/a | MEDIUM |
| 4 | Refresh | `refetch()` | `/api/attendance` | GET | ✅ | OK |
| 5 | Export CSV | client-side | n/a | n/a | ✅ | OK |
| 6 | Print | client-side | n/a | n/a | ✅ | OK |

**Curl test results (live):**

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `POST /api/attendance` | `{"date":"2026-06-15"}` (no emp) | 500 | `{"error":"فشل في إنشاء سجل الحضور"}` | ❌ should 400 |
| `POST /api/attendance` | `{"employeeId":"<id>"}` (no date) | 400 | `{"error":"تاريخ الحضور مطلوب"}` | ✅ |
| `POST /api/attendance` | `{"employeeId":"nonexistent","date":"2026-06-15"}` | 500 | generic Arabic error | ❌ should 400 (FK violation reported as 500) |
| `POST /api/attendance` | valid `{"employeeId":"<id>","date":"2026-06-15","checkIn":"08:00","checkOut":"17:00"}` | 201 | full record with `workHours:"9"` | ✅ auto-calc |
| `POST /api/attendance` | same employee+date (duplicate) | 201 | second record created | ❌ no dup prevention |

### 3. Employee Contracts (`src/components/modules/employee-contracts.tsx`)

**Buttons found: 5** (Print, Export, Refresh, New Contract, Edit per-row, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Contract | dialog → `createMutation.mutate(payload)` | `/api/employee-contracts` | POST | F-001 ✅ / F-002 ✅ toast / F-003 ❌ no onError / F-004 ⚠️ / F-005 ❌ neg salary accepted / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 ❌ no overlap check / F-010 ✅ | HIGH |
| 2 | Edit (Pencil) | opens dialog → `createMutation.mutate(payload)` — **always calls POST, not PUT!** | `/api/employee-contracts` (POST, not PUT!) | POST | F-001 ❌ **WRONG METHOD** — should PUT to `/api/employee-contracts/[id]` but calls POST /collection → creates duplicate | **CRITICAL** |
| 3 | Delete (Trash) | `confirm()` → `deleteMutation.mutate(id)` | `/api/employee-contracts/[id]` | DELETE | F-001 ✅ / F-002 ✅ toast / F-003 ❌ / F-004 n/a / F-005 ✅ 404 + 400 / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ✅ / F-010 n/a | MEDIUM |
| 4 | Refresh | `refetch()` | `/api/employee-contracts` | GET | ✅ | OK |
| 5 | Export CSV | client-side | n/a | n/a | ✅ | OK |
| 6 | Print | client-side | n/a | n/a | ✅ | OK |

**CRITICAL BUG — `totalCompensation` is computed by string concatenation, not numeric addition.** All 4 places that compute `totalCompensation` (GET /api/employee-contracts, POST /api/employee-contracts, GET /api/employee-contracts/[id], PUT /api/employee-contracts/[id]) use:
```ts
totalCompensation: (c.basicSalary ?? 0) + (c.housingAllowance ?? 0) + (c.transportAllowance ?? 0) + (c.otherAllowances ?? 0)
```
but the underlying Prisma columns are `Decimal`. After JSON serialization each field is a string like `"5000"`, and `string + string` is concatenation, not addition. Verified live:
- `basicSalary:"5000" + housingAllowance:"1000" + transportAllowance:"0" + otherAllowance:"0"` → `totalCompensation:"5000100000"` (string of 10 chars) instead of `6000` (number).

This bug also propagates into the UI's "Total Monthly Compensation" summary card and into the CSV/print exports.

**Curl test results (live):**

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `POST /api/employee-contracts` | `{"startDate":"...","basicSalary":"5000"}` (no emp) | 500 | raw Prisma error dump | ❌ should 400 |
| `POST /api/employee-contracts` | `{"employeeId":"<id>","basicSalary":"5000"}` (no start) | 500 | raw Prisma error dump | ❌ should 400 |
| `POST /api/employee-contracts` | valid + `basicSalary:"5000", housingAllowance:"1000"` | 201 | `totalCompensation:"5000100000"` | ❌ **string concat bug** |
| `POST /api/employee-contracts` | `basicSalary:"-1000"` | 201 | `totalCompensation:"-1000000"` accepted | ❌ should 400 |
| `POST /api/employee-contracts` | `startDate:"2026-06-01", endDate:"2026-01-01"` (end before start) | 201 | accepted | ❌ no date-range validation |
| `POST /api/employee-contracts` | overlapping period (employee already has active contract) | 201 | accepted | ❌ no overlap check |

### 4. Payroll Runs (`src/components/modules/payroll-runs.tsx`)

**Buttons found: 8** (Print, Export, Refresh, New Statement, View per-row, Delete per-row (DRAFT only), Send for Review, Approve & Post, Pay Salaries)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Statement | dialog → `createMutation.mutate(payload)` | `/api/payroll-runs` | POST | F-001 ✅ / F-002 ❌ no toast / F-003 ✅ inline error paragraph / F-004 ⚠️ / F-005 ✅ Arabic 400s / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 ✅ dup period blocked / F-010 ✅ | MEDIUM |
| 2 | View (Eye) | `setSelectedRunId(run.id)` → fetches detail | `/api/payroll-runs/[id]` | GET | ✅ | OK |
| 3 | Delete (DRAFT only) | `confirm()` → `deleteMutation.mutate(id)` | `/api/payroll-runs/[id]` | DELETE | F-001 ✅ / F-002 ❌ / F-003 ✅ (error.message extracted) / F-004 n/a / F-005 ✅ 404 + 400 (non-DRAFT blocked) / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ✅ DRAFT-only / F-010 n/a | MEDIUM |
| 4 | Send for Review | `statusMutation.mutate({status:'REVIEW'})` | `/api/payroll-runs/[id]` | PUT `{status:'REVIEW'}` | F-001 ✅ calls right endpoint / F-002 ❌ no toast / F-003 ❌ **API always returns 400 "invalid transition DRAFT → REVIEW"** — see CRIT-003 / F-004 n/a / F-005 ❌ bug / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 n/a | **CRITICAL** |
| 5 | Approve & Post | `confirm()` → `statusMutation.mutate({status:'APPROVED'})` | `/api/payroll-runs/[id]` | PUT `{status:'APPROVED'}` | F-001 ✅ / F-002 ❌ no toast / F-003 ⚠️ error shown only in APPROVED-state card / F-004 n/a / F-005 ✅ / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ✅ state-machine enforced / F-010 n/a | MEDIUM |
| 6 | Pay Salaries | validates bank account → `confirm()` → `statusMutation.mutate({status:'PAID', bankAccountCode, bankAccountNameAr})` | `/api/payroll-runs/[id]` | PUT | F-001 ✅ / F-002 ❌ / F-003 ✅ toast.error if no bank acct / F-004 ✅ client-side check / F-005 ✅ 400s with Arabic / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ✅ state machine + journalEntryId required / F-010 n/a | MEDIUM |
| 7 | Refresh / Print / Export | client-side or GET refetch | n/a | n/a | ✅ | OK |

**CRITICAL BUG — DRAFT → REVIEW state transition is broken.** The state machine in `VALID_TRANSITIONS` declares `DRAFT: ['REVIEW', 'APPROVED']`, but the PUT handler only has explicit branches for `newStatus === 'APPROVED'` and `newStatus === 'PAID'`. The catch-all block at the end:
```ts
if (newStatus && newStatus !== existing.status) {
  return NextResponse.json({ error: `انتقال حالة غير صالح: ${existing.status} → ${newStatus}` }, { status: 400 })
}
```
fires for `DRAFT → REVIEW` even though it's allowed by the state machine. Verified live — every "Send for Review" click returns 400. The UI's statusMutation has no `onError`, so the user sees the button briefly load, then nothing — silent failure.

**Curl test results (live):**

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `POST /api/payroll-runs` | `{"month":13,...}` | 400 | `{"error":"شهر غير صالح"}` | ✅ |
| `POST /api/payroll-runs` | `{"month":6,"year":1999,...}` | 400 | `{"error":"سنة غير صالحة"}` | ✅ |
| `POST /api/payroll-runs` | valid ALL | 201 | full run with lines | ✅ |
| `POST /api/payroll-runs` | same period (dup) | 400 | `{"error":"يوجد مسير رواتب مسودة للفترة 7/2026 (PAY-2026-0001)..."}` | ✅ dup blocked |
| `PUT /api/payroll-runs/[id]` | `{"status":"PAID"}` from DRAFT | 400 | `انتقال حالة غير صالح: DRAFT → PAID. الحالات المسموح بها من DRAFT: [REVIEW, APPROVED]` | ✅ |
| `PUT /api/payroll-runs/[id]` | `{"status":"REVIEW"}` from DRAFT | 400 | `انتقال حالة غير صالح: DRAFT → REVIEW` (no allowed-list in message) | ❌ **state machine says allowed but handler has no branch** |
| `PUT /api/payroll-runs/[id]` | `{"status":"APPROVED"}` from DRAFT | 200 | status:APPROVED, journalEntryId set | ✅ accrual JE created |
| `PUT /api/payroll-runs/[id]` | `{"status":"DRAFT"}` from APPROVED | 400 | blocked | ✅ |
| `PUT /api/payroll-runs/[id]` | `{"status":"PAID"}` no bankAccountCode | 400 | `يجب تحديد الحساب البنكي/النقدي للدفع` | ✅ |
| `DELETE /api/payroll-runs/nonexistent` | 404 | `مسير الرواتب غير موجود` | ✅ |

### 5. Salaries (`src/components/modules/salaries.tsx`)

**Buttons found: 6** (Print, Export, Refresh, Prepare Salary, Approve per-row, Mark-as-Paid per-row, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | Prepare Salary | dialog → `createMutation.mutate(payload)` | `/api/salaries` | POST | F-001 ✅ / F-002 ✅ toast.success (with projectCost branch) / F-003 ❌ no onError / F-004 ⚠️ / F-005 ❌ neg deductions accepted / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | HIGH |
| 2 | Auto-Calculate (inside dialog) | `autoCalcMutation.mutate({employeeId,month,year})` | `/api/salaries/auto-calculate` | POST | F-001 ✅ / F-002 ✅ toast / F-003 ✅ toast.error / F-004 ✅ / F-005 ✅ 400 + 404 / F-006 ✅ / F-007 n/a / F-008 n/a / F-009 n/a / F-010 ✅ | OK |
| 3 | Approve (CheckCircle) | `confirm()` → `approveMutation.mutate({id, status:'APPROVED'})` | `/api/salaries/[id]` | PUT | F-001 ✅ / F-002 ✅ toast / F-003 ❌ no onError / F-004 n/a / F-005 ❌ **endpoint returns 500 HTML — broken import** | **CRITICAL** |
| 4 | Mark as Paid (Banknote) | `approveMutation.mutate({id, status:'PAID'})` — no confirm! | `/api/salaries/[id]` | PUT | F-001 ✅ / F-002 ✅ / F-003 ❌ / F-004 n/a / F-005 ❌ **same broken endpoint** / F-008 ❌ **no confirm dialog for irreversible action** | **CRITICAL** |
| 5 | Delete (Trash, DRAFT only) | `confirm()` → `deleteMutation.mutate(id)` | `/api/salaries/[id]` | DELETE | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 n/a / F-005 ❌ **endpoint returns 500 HTML** | **CRITICAL** |
| 6 | Refresh / Print / Export | client-side | n/a | n/a | ✅ | OK |

**CRITICAL BUG — `/api/salaries/[id]/route.ts` line 2 imports a non-exported function:**
```ts
import { createSalaryAccrualJournalEntry } from '../route'
```
but `/api/salaries/route.ts` declares the function as `async function createSalaryAccrualJournalEntry(...)` (NO `export` keyword). Turbopack fails to compile this module, and in dev mode the compilation error is served back to **every** subsequent request — verified: `GET /api/employees` and `GET /api/salary-payments` both return HTTP 500 with the same HTML error page. In a production `next build` this would be a hard build failure (TS2305 / module resolution error).

Knock-on consequences:
- The "Approve" button on a salary record returns 500 HTML — UI's mutation throws but has no `onError`, so the user sees nothing.
- The "Mark as Paid" button — same.
- The "Delete" button — same.
- All other API endpoints in the application become unreachable until the dev server is restarted AND the broken import is fixed.

**Additional salaries bugs (visible from code reading, blocked from live test by CRIT-001):**
- `GET /api/salaries` does NOT filter by `deletedAt: null`. After `DELETE` soft-deletes a salary, it still appears in the list.
- `GET /api/salaries` includes only `{id, code, name, nameAr}` for the employee, but the UI reads `s.employee.expenseAccount.code` — always renders "—" in the "Expense Acct" column.
- `POST /api/salaries` accepts negative `deductions` (verified live: `deductions:"-500"` → `netSalary:"5500"`, accepted).
- `POST /api/salaries` with missing `employeeId` or missing `month`/`year` returns 500 with raw Prisma error dump instead of 400 with Arabic message.

**Curl test results (live, before the dev server was poisoned):**

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `POST /api/salaries` | missing employeeId | 500 | raw Prisma error dump (multi-line) | ❌ should 400 |
| `POST /api/salaries` | missing month/year | 500 | raw Prisma error dump | ❌ should 400 |
| `POST /api/salaries` | `deductions:"-500"` | 201 | `netSalary:"5500"` accepted | ❌ should 400 |
| `POST /api/salaries` | valid DRAFT | 201 | full record | ✅ |
| `GET /api/salaries?employeeId=<id>` | list | 200 | 2 records, employee object has only `{id,code,name,nameAr}` — no `expenseAccount` | ❌ UI column always shows "—" |

### 6. Salary Payments (`src/components/modules/salary-payments.tsx`)

**Buttons found: 4** (Print, Export, Refresh, New Payment, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Payment | dialog → `createMutation.mutate({payrollRunId, paymentMethod, amount, referenceNumber, paymentDate, notes})` | `/api/salary-payments` | POST | F-001 ❌ **field mismatch** — see CRIT-005 / F-002 ✅ toast / F-003 ✅ toast + inline / F-004 ✅ / F-005 ❌ API requires different fields / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | **CRITICAL** |
| 2 | Delete (Trash, only if no JE) | `confirm()` → `deleteMutation.mutate(id)` | `/api/salary-payments/[id]` | DELETE | F-001 ✅ / F-002 ✅ toast / F-003 ✅ toast.error / F-004 n/a / F-005 ✅ 404 + 400 / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ✅ PAID-run guard / F-010 n/a | MEDIUM |
| 3 | Refresh / Print / Export | client-side or GET refetch | n/a | n/a | ✅ | OK |

**CRITICAL BUG — UI/API payload mismatch.** The UI's `CreatePaymentDialog` sends:
```ts
{ payrollRunId, paymentMethod, amount, referenceNumber, paymentDate, notes }
```
but the API's `POST /api/salary-payments` handler expects:
```ts
{ employeeId (required), month (required), year (required), paymentMethod, reference (not referenceNumber), payingAccountCode, payingAccountName, notes }
```
The API's first validation is `if (!employeeId) return 400 'رقم الموظف مطلوب'`. The UI never sends `employeeId`, so every payment attempt from the UI fails with that 400. Worse, the API:
- Ignores `body.amount` — uses `Number(existingSalary.netSalary)` instead.
- Ignores `body.paymentDate` — uses `new Date()`.
- Reads `body.reference` — UI sends `body.referenceNumber` (so reference is always `null`).
- Requires a pre-existing APPROVED `Salary` record for `(employeeId, month, year)` — the UI design (payroll-run-based payment) doesn't fit this model.

The UI design is "pay a payroll run", but the API is "pay an individual employee's salary". The two cannot work together.

Live curl test was blocked by L3B-CRIT-001 (dev server poisoned), but the mismatch is unambiguous from code reading.

### 7. Advances (`src/components/modules/advances.tsx`)

**Buttons found: 4** (Print, Refresh, New Advance, Settle per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Advance | dialog → `createMutation.mutate({employeeId, amount, date, description})` | `/api/advances` | POST | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 ⚠️ / F-005 ❌ no validation (500 on bad input) / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | HIGH |
| 2 | Settle | dialog → `settleMutation.mutate({id, settleAmount})` | `/api/advances/[id]` | PUT | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 ✅ min/max HTML5 / F-005 ✅ 400s / F-006 ✅ / F-007 ✅ / F-008 ❌ **no confirm before settling** / F-009 ✅ over-settle blocked / F-010 ✅ | MEDIUM |
| 3 | Refresh / Print | client-side or GET refetch | n/a | n/a | ✅ | OK |

**Note**: `PUT /api/advances` (top-level, not `[id]`) is dead code — it expects `body.settledAmount` but the UI sends `body.settleAmount`. The UI correctly calls `PUT /api/advances/[id]` instead, which reads `body.settleAmount` correctly. The top-level PUT should be removed.

**Curl tests blocked by L3B-CRIT-001.** Code-reading findings:
- `POST /api/advances` does NOT validate `employeeId` presence (relies on Prisma FK error → 500).
- `POST /api/advances` does NOT validate `date` presence (`new Date(undefined)` → Invalid Date → Prisma error → 500).
- `POST /api/advances` does NOT validate `amount > 0` (`parseFloat("-5") || 0` = `-5`, accepted).
- No client-side toast feedback for either create or settle.

### 8. Timesheets (`src/components/modules/timesheets.tsx`)

**Note**: This module is for **equipment** timesheets (rental billing). It calls `/api/equipment/timesheets`, NOT the legacy `/api/timesheets` route.

**Buttons found: 6** (Refresh, New Timesheet, View per-row, Print per-row, Delete per-row, Submit (DRAFT→SUBMITTED), Approve (SUBMITTED→APPROVED))

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Timesheet (Create) | page → `createMutation.mutate({rentalId, contractId, projectId, equipmentId, month, year, operatingHours, notes})` | `/api/equipment/timesheets` | POST | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 ✅ / F-005 ✅ 400 + 404 / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | MEDIUM |
| 2 | Submit (DRAFT→SUBMITTED) | `statusMutation.mutate({id, status:'SUBMITTED'})` | `/api/equipment/timesheets/[id]` | PUT | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 n/a / F-005 ? / F-006 ✅ / F-007 ✅ / F-008 ❌ **no confirm before status change** / F-009 ? / F-010 n/a | MEDIUM |
| 3 | Approve (SUBMITTED→APPROVED) | `statusMutation.mutate({id, status:'APPROVED'})` | `/api/equipment/timesheets/[id]` | PUT | F-001 ✅ / F-002 ❌ / F-003 ❌ / F-004 n/a / F-005 ? / F-006 ✅ / F-007 ✅ / F-008 ❌ no confirm / F-009 ? / F-010 n/a | MEDIUM |
| 4 | Delete (Trash, DRAFT only) | opens AlertDialog → `deleteMutation.mutate(id)` | `/api/equipment/timesheets/[id]` | DELETE | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 n/a / F-005 ? / F-006 ✅ / F-007 ✅ / F-008 ✅ **AlertDialog** / F-009 ? / F-010 n/a | OK (best-in-class for this group) |
| 5 | View (Eye) | `setViewState({type:'detail', timesheetId})` | `/api/equipment/timesheets` (already fetched) | n/a | ✅ | OK |
| 6 | Refresh / Print per-row | client-side | n/a | n/a | ✅ | OK |

**Note**: This is the **only** module in Group B that uses `AlertDialog` instead of native `confirm()` for its destructive action. The other 9 modules all use `confirm()` (L1-HIGH-004 deferred to L3, still not addressed in this group).

Curl tests blocked by L3B-CRIT-001.

### 9. Work Teams (`src/components/modules/work-teams.tsx`)

**Buttons found: 5** (Print, Export, Refresh, New Team, Edit per-row, Delete per-row, Expand members)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Team | dialog → `createMutation.mutate({name, nameAr, specialty, projectId, members: form.memberIds})` | `/api/work-teams` | POST | F-001 ❌ **members shape mismatch** — UI sends `string[]`, API expects `{employeeId,role?,isLeader?}[]` → see CRIT-006 / F-002 ❌ no toast / F-003 ❌ no onError / F-004 ✅ / F-005 ❌ API accesses `m.employeeId` on a string → undefined → Prisma error 500 / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | **CRITICAL** |
| 2 | Edit (Pencil) | opens dialog → inline `fetch().then().then()` (NOT via mutation) | `/api/work-teams/[id]` | PUT `{name, nameAr, specialty, projectId, addMembers: string[], removeMembers: string[]}` | F-001 ❌ **addMembers shape mismatch** — UI sends `string[]`, API expects `{employeeId,role?,isLeader?}[]` → same bug as New Team / F-002 ❌ / F-003 ❌ / F-004 ✅ / F-005 ❌ / F-006 ❌ **isSaving only tracks createMutation, NOT the inline edit fetch** → user can double-click submit / F-007 ✅ / F-008 n/a / F-009 n/a / F-010 ✅ | **CRITICAL** |
| 3 | Delete (Trash) | `confirm()` → `deleteMutation.mutate(id)` | `/api/work-teams/[id]` | DELETE | F-001 ✅ / F-002 ❌ no toast / F-003 ❌ no onError / F-004 n/a / F-005 ✅ 500 only / F-006 ✅ / F-007 ✅ / F-008 ⚠️ native confirm / F-009 ❌ **hard delete, no FK guard** — members cascade-deleted silently / F-010 n/a | MEDIUM |
| 4 | Refresh / Print / Export / Expand | client-side | n/a | n/a | ✅ | OK |

**CRITICAL BUG — `members` payload shape mismatch.** The UI's `handleSubmit` does:
```ts
const payload = { ..., members: form.memberIds }   // string[]
```
and the API's POST handler does:
```ts
const membersData = body.members.map((m: { employeeId: string; role?: string; isLeader?: boolean }) => ({
  employeeId: m.employeeId,    // ← m is a string, so m.employeeId is undefined
  role: m.role || null,
  isLeader: m.isLeader || false,
}))
```
Result: every member of a newly created team has `employeeId: undefined`, causing Prisma to throw a FK constraint violation (HTTP 500). The team record itself may be created (without members), but the members list will always be empty in the DB. The UI then shows "0 members" for every team created from the UI.

The same bug applies to the edit flow's `addMembers` field — UI sends `string[]`, API expects `{employeeId,...}[]`.

Curl tests blocked by L3B-CRIT-001.

### 10. Labor Costs (`src/components/modules/labor.tsx`)

**Buttons found: 5** (Print, Export, Refresh, New Labor Cost, Edit per-row, Delete per-row)

| # | Button | Handler | API | Method | F-001..F-010 verdict | Severity |
|---|--------|---------|-----|--------|----------------------|----------|
| 1 | New Labor Cost | dialog → `saveMutation.mutate({projectId, description, workers, days, dailyRate, date})` | `/api/labor-costs` | POST | F-001 ✅ / F-002 ✅ toast / F-003 ✅ toast.error / F-004 ⚠️ HTML5 only / F-005 ✅ 400 missing + 400 NaN / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 ❌ no neg-value check / F-010 ✅ | MEDIUM |
| 2 | Edit (Pencil) | opens dialog → `saveMutation.mutate({...,id: editItem.id})` | `/api/labor-costs/[id]` | PUT | F-001 ✅ / F-002 ✅ / F-003 ✅ / F-004 ⚠️ / F-005 ❌ no validation / F-006 ✅ / F-007 ✅ / F-008 n/a / F-009 ❌ **PUT does NOT reverse or update the linked JE when totalAmount changes** → GL out of sync / F-010 ✅ | HIGH |
| 3 | Delete (Trash) | opens AlertDialog → `deleteMutation.mutate(id)` | `/api/labor-costs/[id]` | DELETE | F-001 ✅ / F-002 ✅ / F-003 ✅ / F-004 n/a / F-005 ✅ 404 / F-006 ✅ / F-007 ✅ / F-008 ✅ AlertDialog / F-009 ❌ **hard delete + no JE reversal** → orphaned JE in GL / F-010 n/a | HIGH |
| 4 | Refresh / Print / Export | client-side or GET refetch | n/a | n/a | ✅ | OK |

**Accounting-integrity bugs:**
- `PUT /api/labor-costs/[id]` recalculates `totalAmount` if `workers/days/dailyRate` change, but does NOT call `reverseEntry()` on the old JE nor create a new one. The GL retains the original amount forever — labor expense understated/overstated.
- `DELETE /api/labor-costs/[id]` calls `db.laborCost.delete()` (hard delete) but does NOT call `reverseEntry(existing.journalEntryId)`. The auto-created JE from POST remains in the GL forever — labor expense inflated.
- Compare with `DELETE /api/salary-payments/[id]` which correctly reverses the linked JE — labor-costs should follow the same pattern.

**Curl tests blocked by L3B-CRIT-001.**

---

## Consolidated Issues

### CRITICAL

- **L3B-CRIT-001** (`src/app/api/salaries/[id]/route.ts:2`): Broken import — `import { createSalaryAccrualJournalEntry } from '../route'` references a function that is NOT exported from `src/app/api/salaries/route.ts` (line 45 declares `async function` without `export`). Turbopack fails to compile this module; in dev mode the error poisons the dev server cache and **every** API endpoint returns HTTP 500 with an HTML error page. In a production `next build` this is a hard build failure. Knocks out the entire salaries lifecycle (Approve, Mark-as-Paid, Delete) AND every other API route in the app. | **How to verify**: `curl -s http://localhost:3000/api/salaries/some-id` → returns HTML 500 with `"Export createSalaryAccrualJournalEntry doesn't exist in target module"`. Then `curl -s http://localhost:3000/api/employees` → also returns the same HTML 500. Fix: add `export` to line 45 of `src/app/api/salaries/route.ts`.

- **L3B-CRIT-002** (`src/components/modules/employee-contracts.tsx:106-117`): The "Edit Contract" dialog always calls `createMutation.mutate(payload)` which POSTs to `/api/employee-contracts` (the collection route), even when `isEdit === true`. There is no `updateMutation` defined. Every "Edit → Update" click creates a NEW contract record (duplicate) instead of updating the existing one. The PUT endpoint `/api/employee-contracts/[id]` exists in the API but is never called from the UI. | **How to verify**: open the employee-contracts page, click the pencil on an existing contract, change basicSalary, click "Update" → a new row appears in the table; the original is unchanged. Repeat → duplicates accumulate.

- **L3B-CRIT-003** (`src/app/api/payroll-runs/[id]/route.ts:324-329`): The `DRAFT → REVIEW` state transition is declared as allowed in `VALID_TRANSITIONS` (line 21: `DRAFT: ['REVIEW', 'APPROVED']`) but the PUT handler has no branch that actually performs it. The catch-all at line 324 returns 400 "انتقال حالة غير صالح: DRAFT → REVIEW" (without listing the allowed set, unlike the earlier validation message). The UI's "Send for Review" button therefore always fails silently (statusMutation has no onError). | **How to verify**: create a payroll run, then `curl -X PUT http://localhost:3000/api/payroll-runs/<id> -H 'Content-Type: application/json' -d '{"status":"REVIEW"}'` → 400 with `انتقال حالة غير صالح: DRAFT → REVIEW`. Note: the message LACKS the "الحالات المسموح بها" suffix that the earlier validation message includes, proving it comes from the catch-all path.

- **L3B-CRIT-004** (`src/app/api/employee-contracts/route.ts:17-20` and 3 more sites): `totalCompensation` is computed by `(c.basicSalary ?? 0) + (c.housingAllowance ?? 0) + (c.transportAllowance ?? 0) + (c.otherAllowances ?? 0)`. Because the Prisma columns are `Decimal`, after JSON serialization each value is a string, and `string + string` is concatenation, not addition. Verified live: `basicSalary:"5000" + housingAllowance:"1000" + transportAllowance:"0" + otherAllowance:"0"` → `totalCompensation:"5000100000"` instead of `6000`. Affects: GET `/api/employee-contracts`, POST `/api/employee-contracts`, GET `/api/employee-contracts/[id]`, PUT `/api/employee-contracts/[id]`. The UI's "Total Monthly Compensation" summary card, the table's "Total" column, and CSV/print exports all show garbage values. | **How to verify**: `curl -s -X POST http://localhost:3000/api/employee-contracts -H 'Content-Type: application/json' -d '{"employeeId":"<id>","startDate":"2026-03-01","basicSalary":"5000","housingAllowance":"1000"}' | python3 -m json.tool` → `totalCompensation` is `"5000100000"`. Fix: wrap each field with `Number(...)`, e.g. `Number(c.basicSalary ?? 0) + Number(c.housingAllowance ?? 0) + ...`.

- **L3B-CRIT-005** (`src/components/modules/salary-payments.tsx:178-186` vs `src/app/api/salary-payments/route.ts:46-65`): UI/API payload mismatch. UI sends `{payrollRunId, paymentMethod, amount, referenceNumber, paymentDate, notes}` but API requires `{employeeId, month, year, paymentMethod, reference, payingAccountCode, payingAccountName, notes}`. API returns 400 "رقم الموظف مطلوب" on every UI-initiated payment. The API also ignores `body.amount`, `body.paymentDate`, and `body.referenceNumber` (reads `body.reference` instead). The UI's "pay a payroll run" model and the API's "pay an individual employee salary" model are fundamentally incompatible. | **How to verify** (after fixing CRIT-001): open salary-payments module, click "New Payment", select an APPROVED payroll run, click "Pay" → toast.error "رقم الموظف مطلوب" appears. Fix: align UI and API on a single payload shape — either change the UI to send `employeeId/month/year` per employee, or change the API to accept `payrollRunId/amount` and pay all line-items of the run.

- **L3B-CRIT-006** (`src/components/modules/work-teams.tsx:101,109` vs `src/app/api/work-teams/route.ts:52-58`): UI sends `members: string[]` (array of employee IDs) but API expects `members: Array<{employeeId, role?, isLeader?}>`. When the API runs `body.members.map(m => ({employeeId: m.employeeId, ...}))`, `m` is a string so `m.employeeId` is `undefined`, and Prisma throws a FK constraint violation. The team record itself may be created (without members), so the UI shows "0 members" for every team created from the dialog. Same bug in the edit flow's `addMembers` field (`src/components/modules/work-teams.tsx:105` vs `src/app/api/work-teams/[id]/route.ts:54-71`). | **How to verify** (after fixing CRIT-001): open work-teams module, click "New Team", fill name + check 2 employees, click "Create" → team is created with 0 members. Fix: either change UI to send `members: form.memberIds.map(id => ({employeeId: id}))` or change API to accept `string[]` directly.

### HIGH

- **L3B-HIGH-001** (`src/components/modules/employees.tsx:109-116,239-242`): Both `createMutation` and `updateMutation` lack `onSuccess` toast and `onError` toast. Silent success + silent failure. The user clicks "Create" or "Update", the dialog closes (on success) or stays open with no feedback (on error). | **How to verify**: create an employee with a non-existent `expenseAccountId` → API 500s → UI shows nothing.

- **L3B-HIGH-002** (`src/app/api/employees/route.ts:66-123`): POST accepts empty `name` (verified: `{"name":"","branchId":"<id>"}` → 201), negative `basicSalary` (verified: `"-5000"` → 201), and returns 500 with generic Arabic error for non-numeric `basicSalary` and for unparseable `hireDate` (should be 400 with specific Arabic message). Same issues in PUT `/api/employees/[id]` (verified: `{"name":""}` → 200, `{"basicSalary":"-9999"}` → 200).

- **L3B-HIGH-003** (`src/app/api/attendance/route.ts:34-109`): No duplicate-prevention — same `employeeId + date` can be POSTed twice and both records are created (verified live). Also, missing `employeeId` returns 500 with generic Arabic error (should be 400), and invalid `employeeId` (FK violation) returns 500 (should be 400 with specific message).

- **L3B-HIGH-004** (`src/components/modules/attendance.tsx:206-230`): Bulk attendance uses `Promise.allSettled(...)` and then unconditionally calls `toast.success("Bulk attendance recorded")` in `onSuccess`, even if some employees failed (e.g. duplicate, FK error). No `onError` per-employee. The user sees "success" but some records may be missing.

- **L3B-HIGH-005** (`src/app/api/salaries/route.ts:20-27`): GET does NOT filter by `deletedAt: null`. The DELETE endpoint (line 169-173) soft-deletes via `deletedAt: new Date()`, but the GET still returns soft-deleted records. The UI list shows deleted salaries as if they were active. (Blocked from live test by CRIT-001, but unambiguous from code.)

- **L3B-HIGH-006** (`src/app/api/salaries/route.ts:22-24`): GET includes only `{id, code, name, nameAr}` for the employee, but the UI (`src/components/modules/salaries.tsx:466-469`) reads `s.employee.expenseAccount.code` and `s.employee.expenseAccount.nameAr || name`. The "Expense Acct" column in the salaries table always renders "—" for every row. The `Employee` interface declares `expenseAccount` as a field but the API never returns it.

- **L3B-HIGH-007** (`src/app/api/salaries/route.ts:85-100`): POST accepts negative `deductions` (verified live: `deductions:"-500"` → `netSalary:"5500"`, accepted). Should reject with 400. Same likely issue for negative `basicSalary`, `housingAllowance`, etc.

- **L3B-HIGH-008** (`src/app/api/labor-costs/[id]/route.ts:26-67`): PUT recalculates `totalAmount` when `workers/days/dailyRate` change but does NOT reverse or update the linked journal entry. The GL retains the original amount forever. Accounting integrity violated. Compare with `DELETE /api/salary-payments/[id]` which correctly calls `reverseEntry()`.

- **L3B-HIGH-009** (`src/app/api/labor-costs/[id]/route.ts:69-87`): DELETE hard-deletes the labor cost record but does NOT call `reverseEntry(existing.journalEntryId)`. The auto-created JE from POST (`autoEntryLaborCost`) remains in the GL forever. Orphaned JE → labor expense inflated. Should soft-delete + reverseEntry.

- **L3B-HIGH-010** (`src/app/api/employee-contracts/route.ts:28-63`): POST accepts negative `basicSalary` (verified: `"-1000"` → 201), accepts `endDate` before `startDate` (verified: `startDate:"2026-06-01", endDate:"2026-01-01"` → 201), and does NOT prevent overlapping contracts for the same employee (verified: 2 contracts with overlapping dates both created). Missing `employeeId` returns 500 with raw Prisma dump (should be 400).

- **L3B-HIGH-011** (`src/components/modules/work-teams.tsx:107-112`): Edit-mode save is performed via inline `fetch().then().then()` instead of via a `useMutation`, so the `isSaving` flag (line 125: `const isSaving = createMutation.isPending`) is always `false` during edit save. The submit button is NOT disabled during edit save → user can double-click → multiple PUT requests → race condition. Also no toast feedback for edit save (success or error).

- **L3B-HIGH-012** (`src/components/modules/advances.tsx:82-87, 151-156`): Both `createMutation` and `settleMutation` lack `onSuccess` toast and `onError` toast. Silent success + silent failure. The settle action is irreversible (creates a settlement JE) but has no confirmation dialog either.

- **L3B-HIGH-013** (multiple files): The following modules still use native `confirm()` for destructive actions instead of `AlertDialog`: `employees.tsx:339`, `attendance.tsx:513`, `employee-contracts.tsx:371`, `payroll-runs.tsx:505,519,981`, `salaries.tsx:481,487`, `salary-payments.tsx:620`, `advances.tsx` (no confirm for settle), `work-teams.tsx:315`. This was deferred from L1-HIGH-004 to L3 and is still not addressed. Only `timesheets.tsx` and `labor.tsx` use `AlertDialog`. Native `confirm()` blocks the JS thread, has non-localized buttons in some browsers, and cannot be styled.

### MEDIUM

- **L3B-MED-001** (`src/app/api/advances/route.ts:71-126`): Top-level PUT `/api/advances` is dead code — it reads `body.settledAmount` but the UI sends `body.settleAmount`. The UI correctly calls `/api/advances/[id]` instead. The top-level PUT should be removed to avoid confusion. (The [id] PUT at `src/app/api/advances/[id]/route.ts:9-75` correctly reads `body.settleAmount`.)

- **L3B-MED-002** (`src/app/api/advances/route.ts:20-69`): POST does NOT validate `employeeId` presence (relies on Prisma FK error → 500), does NOT validate `date` presence (`new Date(undefined)` → Invalid Date → Prisma error → 500), does NOT validate `amount > 0` (`parseFloat("-5") || 0` = `-5`, accepted). All should return 400 with specific Arabic messages.

- **L3B-MED-003** (`src/components/modules/attendance.tsx:339-341`): `deleteMutation` lacks `onSuccess` and `onError` toasts. Silent success + silent failure on delete.

- **L3B-MED-004** (`src/components/modules/payroll-runs.tsx:175-180, 397-408, 809-812`): `createMutation`, `statusMutation`, and `deleteMutation` all lack `onSuccess` and `onError` toasts. Approve, Pay, Send-for-Review, Delete — all silent. The only feedback is the inline error paragraph inside the APPROVED-state payment card (line 636-638), which is invisible in DRAFT/REVIEW/PAID states.

- **L3B-MED-005** (`src/components/modules/salaries.tsx:294-300, 302-305`): `approveMutation` and `deleteMutation` — `approveMutation` has `onSuccess` toast but no `onError`. `deleteMutation` has neither. Given that both endpoints are broken by CRIT-001, the user gets zero feedback on any of these actions.

- **L3B-MED-006** (`src/components/modules/salaries.tsx:484`): The "Mark as Paid" button (`approveMutation.mutate({id, status:'PAID'})`) has NO confirmation dialog. This is an irreversible action that creates a payment JE. Should at least have `confirm()`.

- **L3B-MED-007** (`src/components/modules/timesheets.tsx:166-177, 417-427`): `createMutation`, `statusMutation`, `deleteMutation` — none have `onSuccess` or `onError` toasts. Silent success + silent failure across the entire module.

- **L3B-MED-008** (`src/components/modules/timesheets.tsx:552, 557`): "Submit" (DRAFT→SUBMITTED) and "Approve" (SUBMITTED→APPROVED) buttons have NO confirmation dialog. These are workflow-irreversible actions (once approved, a timesheet can be invoiced). Should at least have `confirm()`.

- **L3B-MED-009** (`src/components/modules/work-teams.tsx:90-93, 203-206`): `createMutation` and `deleteMutation` lack `onSuccess` and `onError` toasts. Combined with CRIT-006 (members shape mismatch), the user clicks "Create" → silent 500 → no feedback.

- **L3B-MED-010** (`src/app/api/work-teams/[id]/route.ts:101-111`): DELETE hard-deletes the team and cascade-deletes members. No soft-delete, no FK guard (e.g. "cannot delete team with active allocations"). No `onError` toast in the UI either.

- **L3B-MED-011** (`src/app/api/employees/route.ts:76-82`): The auto-generated employee code `EMP-XXX` is based on `findFirst({orderBy: {code: 'desc'}})` and a regex `EMP-(\d+)`. If any code doesn't match the regex (e.g. a manually-created `EMP-LEGACY-1`), the regex returns null and `nextNum` stays at 1, causing a unique-constraint violation on the next create. Should use `max()` aggregation or a sequence table.

- **L3B-MED-012** (`src/app/api/employee-contracts/route.ts:32-45`): POST updates `employee.basicSalary` to match the new contract's `basicSalary`. This means creating a contract in the past (e.g. `startDate: 2024-01-01`) immediately overwrites the employee's current `basicSalary` to the historical value. Should only update if the new contract is the latest (by `startDate`).

- **L3B-MED-013** (`src/components/modules/salary-payments.tsx:619-626`): The delete (Trash) button is only shown when `!p.journalEntryId` (no JE linked). But the API's POST always creates a JE and links it, so once a payment exists, it can never be deleted from the UI. The user has no way to undo a mistakenly-recorded payment via the UI. The API endpoint `/api/salary-payments/[id]` DELETE does support deletion with JE reversal — the UI just doesn't expose it.

### LOW

- **L3B-LOW-001** (`src/components/modules/advances.tsx:222-228`): `useQuery({queryKey: ['employees'], ...})` conflicts with the employees module's `['employees']` key — both fetch the same endpoint but the advances module fetches ALL employees (not just active), causing the employees list to briefly show inactive employees if both modules are mounted. Should use `['employees-list']` like other modules.

- **L3B-LOW-002** (`src/components/modules/attendance.tsx:333-336`): `useQuery({queryKey: ['employees-list'], queryFn: () => fetch('/api/employees?activeOnly=true')})` — but `/api/employees` route checks `searchParams.get('active') === 'true'`, NOT `activeOnly`. The query param is silently ignored and ALL employees (including terminated) are returned. Fix: use `?active=true`.

- **L3B-LOW-003** (`src/components/modules/employee-contracts.tsx:202-205`): Same `?activeOnly=true` typo as L3B-LOW-002 — should be `?active=true`.

- **L3B-LOW-004** (`src/components/modules/salaries.tsx:289-292`): Same `?activeOnly=true` typo.

- **L3B-LOW-005** (`src/components/modules/work-teams.tsx:198-201`): Same `?activeOnly=true` typo.

- **L3B-LOW-006** (`src/app/api/salaries/auto-calculate/route.ts:67-77`): `pendingAdvances` is filtered by `date: { gte: startDate, lt: endDate }` — i.e. only advances created in the same month as the salary are deducted. But an advance created in January should still be deducted from February's salary if unpaid. Should filter by `status: 'PENDING'` only, regardless of date.

---

## Curl Test Results (Consolidated)

32 curl calls made against `http://localhost:3000`. The first ~20 succeeded (employees, attendance, employee-contracts, payroll-runs, salaries POST/GET). After the salaries `[id]` route was first hit (triggering compile of the broken import), the dev server cache was poisoned and all subsequent calls returned HTTP 500 with HTML — including calls to endpoints that had previously worked (e.g. `GET /api/employees`). The remaining endpoints (advances, salary-payments, work-teams, labor-costs, timesheets) were audited via code reading only.

| Endpoint | Test | Status | Response excerpt | Verdict |
|----------|------|--------|------------------|---------|
| `GET /api/employees` | list | 200 | `[]` | ✅ |
| `POST /api/employees` | `{}` empty body | 400 | `{"error":"لا يوجد فرع مسجل. أنشئ فرعاً أولاً."}` | ✅ |
| `POST /api/employees` | `{"name":"TEST EMP L3B","branchId":"<id>"}` | 201 | `code:"EMP-001"` | ✅ |
| `POST /api/employees` | `{"name":"","branchId":"<id>"}` empty name | 201 | `name:""` | ❌ should 400 |
| `POST /api/employees` | `basicSalary:"-5000"` | 201 | `basicSalary:"-5000"` | ❌ should 400 |
| `POST /api/employees` | `basicSalary:"abc"` | 500 | generic Arabic | ❌ should 400 |
| `POST /api/employees` | `hireDate:"not-a-date"` | 500 | generic Arabic | ❌ should 400 |
| `PUT /api/employees/[id]` | `{"name":""}` | 200 | `name:""` saved | ❌ should 400 |
| `PUT /api/employees/[id]` | `{"basicSalary":"-9999"}` | 200 | `basicSalary:"-9999"` saved | ❌ should 400 |
| `DELETE /api/employees/nonexistent` | 404 | `الموظف غير موجود` | ✅ |
| `DELETE /api/employees/[id]` (no deps) | 200 | `تم حذف الموظف (soft-delete)` | ✅ |
| `DELETE /api/employees/[id]` (already deleted) | 400 | `الموظف محذوف بالفعل` | ✅ |
| `POST /api/attendance` | missing employeeId | 500 | generic Arabic | ❌ should 400 |
| `POST /api/attendance` | missing date | 400 | `تاريخ الحضور مطلوب` | ✅ |
| `POST /api/attendance` | invalid employeeId (FK) | 500 | generic Arabic | ❌ should 400 |
| `POST /api/attendance` | valid | 201 | `workHours:"9"` auto-calc | ✅ |
| `POST /api/attendance` | same employee+date (dup) | 201 | second record created | ❌ no dup prevention |
| `POST /api/employee-contracts` | missing employeeId | 500 | raw Prisma dump | ❌ should 400 |
| `POST /api/employee-contracts` | missing startDate | 500 | raw Prisma dump | ❌ should 400 |
| `POST /api/employee-contracts` | valid + `basicSalary:"5000", housingAllowance:"1000"` | 201 | `totalCompensation:"5000100000"` | ❌ **string concat bug** |
| `POST /api/employee-contracts` | `basicSalary:"-1000"` | 201 | accepted | ❌ should 400 |
| `POST /api/employee-contracts` | endDate before startDate | 201 | accepted | ❌ no date-range check |
| `POST /api/employee-contracts` | overlapping period | 201 | accepted | ❌ no overlap check |
| `POST /api/payroll-runs` | `month:13` | 400 | `شهر غير صالح` | ✅ |
| `POST /api/payroll-runs` | `year:1999` | 400 | `سنة غير صالحة` | ✅ |
| `POST /api/payroll-runs` | valid ALL | 201 | full run with lines | ✅ |
| `POST /api/payroll-runs` | duplicate period | 400 | `يوجد مسير رواتب مسودة للفترة...` | ✅ dup blocked |
| `PUT /api/payroll-runs/[id]` | `DRAFT → PAID` (invalid) | 400 | `انتقال حالة غير صالح: DRAFT → PAID. الحالات المسموح بها من DRAFT: [REVIEW, APPROVED]` | ✅ |
| `PUT /api/payroll-runs/[id]` | `DRAFT → REVIEW` (should be valid) | 400 | `انتقال حالة غير صالح: DRAFT → REVIEW` (no allowed-list) | ❌ **CRIT-003** |
| `PUT /api/payroll-runs/[id]` | `DRAFT → APPROVED` | 200 | status:APPROVED, journalEntryId set | ✅ |
| `PUT /api/payroll-runs/[id]` | `APPROVED → DRAFT` (should be blocked) | 400 | blocked | ✅ |
| `PUT /api/payroll-runs/[id]` | `APPROVED → PAID` no bankAccountCode | 400 | `يجب تحديد الحساب البنكي/النقدي للدفع` | ✅ |
| `DELETE /api/payroll-runs/nonexistent` | 404 | `مسير الرواتب غير موجود` | ✅ |
| `POST /api/salaries` | missing employeeId | 500 | raw Prisma dump (multi-line) | ❌ should 400 |
| `POST /api/salaries` | missing month/year | 500 | raw Prisma dump | ❌ should 400 |
| `POST /api/salaries` | `deductions:"-500"` | 201 | `netSalary:"5500"` | ❌ should 400 |
| `POST /api/salaries` | valid DRAFT | 201 | full record | ✅ |
| `GET /api/salaries?employeeId=<id>` | list | 200 | 2 records, employee has no `expenseAccount` | ❌ UI col always "—" |
| `GET /api/salaries/<id>` (any) | 500 HTML | compile error `createSalaryAccrualJournalEntry doesn't exist` | ❌ **CRIT-001** |
| `GET /api/employees` (after CRIT-001 triggered) | 500 HTML | same compile error | ❌ dev server poisoned |
| `GET /api/salary-payments` (after CRIT-001) | 500 HTML | same compile error | ❌ dev server poisoned |
| All subsequent endpoints | 500 HTML | same compile error | ❌ blocked by CRIT-001 |

---

## Did NOT modify any files (READ-ONLY). Report + worklog append only.
