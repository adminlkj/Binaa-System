# دورة الإقفال المحاسبي — Accounting Closing Cycle

> **Phase 3 — Workflow Integrity** — Agent P3.7 (Task ID: P3-7)
>
> This document records the FULL accounting closing cycle as actually implemented
> in the Binaa-System ERP codebase: **Monthly Period Close → Fiscal Year Close
> (revenue/expense → retained earnings) → New Year Open (reopen for corrections)**.
>
> Each step lists the API endpoint, required input fields, the journal entry (if
> any) posted, status transitions, prerequisites, and the reports affected. A
> companion end-to-end test (`scripts/e2e-closing-cycle.ts`) exercises every step
> against the live database and verifies that the closing JE zeroes revenue and
> expense accounts, that the reversal JE restores them, and that the trial
> balance ties throughout.

---

## نظرة عامة — Overview

The closing cycle in Binaa-System is the chain:

```
┌──────────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  1. Monthly      │ →  │ 2. Fiscal Year Close │ →  │ 3. Fiscal Year     │
│    Period Close  │    │    (Year-End)        │    │    Reopen          │
│                  │    │                      │    │    (Correction)    │
│  OPEN → CLOSED   │    │  OPEN → CLOSING →    │    │  CLOSED → OPEN     │
│  No JE           │    │       CLOSED         │    │  Reversal JE       │
│  R6 enforced     │    │  Closing JE          │    │  posted            │
│                  │    │  (Dr Rev, Cr Exp,    │    │  All periods       │
│                  │    │   Cr/Dr RE)          │    │  reopened          │
└──────────────────┘    └──────────────────────┘    └────────────────────┘
                                                              ↑
                                                              │
                                       ┌──────────────────────┘
                                       │
                                ┌──────────────────┐
                                │ 4. Fiscal Year   │
                                │    Creation      │
                                │    (New Year)    │
                                │                  │
                                │  12 monthly      │
                                │  periods         │
                                │  Status: OPEN    │
                                └──────────────────┘
```

**Key design principles**:

1. **Single Source of Truth (SSOT)** — the `FiscalPeriod.status` field is the
   only authoritative source of period state. `PeriodClosing` is a read-only
   audit log; it does NOT gate any posting decision.
2. **Atomicity** — every closing/reopen operation is wrapped in `db.$transaction`.
   The P1-4 fix made `closeFiscalYear` and `reopenFiscalYear` reject calls
   without a `tx` parameter (`CLOSE_NO_TX` / `REOPEN_NO_TX` errors). The API
   routes (`/api/fiscal-years/[id]/close` and `/reopen`) wrap the engine call
   in `db.$transaction(async (tx) => ...)` explicitly.
3. **Closing JE bypasses R6** — the closing entry is dated `fy.endDate` (last
   day of the year). By that point, all 12 monthly periods are typically
   CLOSED. The engine passes `skipPeriodGuard: true` so the guard's R6 check
   (`assertPeriodOpen`) is skipped. This is the **only** sanctioned bypass for
   a year-end closing entry.
4. **Reversal is non-destructive** — reopening a year creates a separate
   reversal JE (`isReversal=true`, `reversedEntryId=<closingJE.id>`). Both
   entries stay POSTED and net to zero in the GL. There is no `REVERSED`
   status on `JournalEntry`.
5. **Retained Earnings by role, not code** — the closing engine resolves the
   retained-earnings account by `AccountRole.RETAINED_EARNINGS` (code `5200`,
   type `EQUITY`), never by hardcoded account code.

---

## الخطوة 1: إقفال فترة شهرية — Monthly Period Closing

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/period-closing` |
| **Route file** | `src/app/api/period-closing/route.ts` (lines 23-45 for POST dispatcher; 47-191 for `closePeriod`; 193-249 for `reopenPeriod`) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine helpers** | `closePeriod(periodId, tx, options)` and `reopenPeriod(periodId, tx, options)` in `src/lib/accounting/accounting-calendar.ts` (lines 316-369 and 376-415) |
| **Prerequisites** | A `FiscalYear` covering the period must exist; the period must currently be `OPEN` or `LOCKED` (cannot close an already-CLOSED period) |
| **Required input fields** | `action: 'close'`, `year` (int), `month` (int 1-12), `type: 'MONTHLY'` |
| **Optional fields** | `closedBy`, `notes` |
| **Journal entry posted** | **None for `type='MONTHLY'`** — monthly closing is a status flag only. (A JE is created only for `type='YEARLY'` via this same route, but that path is superseded by the engine-based `POST /api/fiscal-years/[id]/close` — see Step 2.) |
| **Status transition** | `FiscalPeriod.status`: `OPEN` → `CLOSED` (or `LOCKED` → `CLOSED`) |
| **Audit record** | `PeriodClosing` row created/upserted with `type='MONTHLY'`, `status='CLOSED'`, `closedAt=now()` |
| **R6 enforcement** | After closing, any `postJournalEntry` call with a `date` falling inside the closed period will throw `AccountingGuardError(code='PERIOD_CLOSED')` from guard rule R6 (via `assertPeriodOpen`). The ONLY bypass is `skipPeriodGuard: true` (system entries: reversals, year-end closing itself). |
| **Affected reports** | Period-close audit list, JE posting form (period-closed validation), trial balance date filter |

**Engine function signature** (`accounting-calendar.ts:316`):

```ts
export async function closePeriod(
  periodId: string,
  tx?: PrismaTransaction,
  options?: { closedBy?: string; notes?: string; allowDuringClosing?: boolean }
): Promise<void>
```

The `allowDuringClosing: true` flag is reserved for the year-end engine: when
the parent `FiscalYear.status` is `CLOSING` (mid-close) or `CLOSED` (post-close),
the engine needs to close periods without triggering the `FISCAL_YEAR_CLOSED`
guard. Direct API callers do NOT set this flag.

**Reopening a single monthly period** is symmetric:

```ts
export async function reopenPeriod(
  periodId: string,
  tx?: PrismaTransaction,
  options?: { reopenedBy?: string; notes?: string }
): Promise<void>
```

It refuses to reopen a period whose parent `FiscalYear.status === 'CLOSED'`
(must reopen the year first via Step 3).

---

## الخطوة 2: إقفال السنة المالية — Fiscal Year Closing (Year-End)

This is the MAJOR step of the cycle. It zeros all revenue and expense accounts
and transfers the net income/loss to Retained Earnings.

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fiscal-years/[id]/close` |
| **Route file** | `src/app/api/fiscal-years/[id]/close/route.ts` (lines 14-61) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | `closeFiscalYear(fiscalYearId, tx, options)` in `src/lib/accounting/closing-engine.ts` (lines 249-408) |
| **Prerequisites** | FiscalYear must exist with `status='OPEN'` (not `CLOSING`, not `CLOSED`). Caller MUST pass `body.approved=true` (confirmation guard). |
| **Required input fields** | `approved: true` (in JSON body) |
| **Optional fields** | `closedBy` (string, default `'admin'`) |
| **Journal entry posted** | **Yes — single closing JE** with `sourceType='YEAR_END_CLOSING'`, `sourceId='FY-CLOSE-{fy.name}'`, `date=fy.endDate`, `skipPeriodGuard=true` |
| **Status transitions** | `FiscalYear.status`: `OPEN` → `CLOSING` (atomic lock) → `CLOSED` (after JE + period closes); `FiscalPeriod.status`: each of 12 periods → `CLOSED` |
| **Atomicity** | The route wraps the entire operation in `db.$transaction(async (tx) => closeFiscalYear(id, tx, {...}))` (P1-4 fix). On any failure, all writes roll back. |
| **Affected reports** | Fiscal year card (status, totals), trial balance (revenue/expense zeroed), income statement (closed year), balance sheet (retained earnings updated) |

### Closing JE structure

The engine computes balances from the SSOT (`getAccountBalancesByType` in
`queries.ts`) filtered to the FY's date range `[startDate, endDate]`. Only
accounts whose `accountRole` is in the closed-roles list (see below) and whose
range-balance is non-zero (|balance| ≥ 0.01) appear in the closing JE.

**Revenue roles closed** (closing-engine.ts:101-104):
```
PROJECT_REVENUE, RENTAL_REVENUE, SERVICE_REVENUE, UNBILLED_REVENUE,
DELAY_PENALTY_REVENUE, FX_GAIN
```

**Expense roles closed** (closing-engine.ts:106-112):
```
PROJECT_COST, LABOR_COST, SUBCONTRACTOR_COST, FUEL_EXPENSE,
MAINTENANCE_EXPENSE, DRIVER_EXPENSE, TRANSPORT_EXPENSE,
RENTAL_DEPRECIATION, PAYROLL_EXPENSE, GOSI_EXPENSE, ADMIN_EXPENSE,
DEPRECIATION_EXPENSE, ZAKAT_EXPENSE, FX_LOSS
```

**Closing JE lines** (per non-zero account):

| Line | Direction | Account role | Account code | Dr / Cr |
|---|---|---|---|---|
| Dr Revenue (to zero credit balance) | Dr | each REVENUE role above | 6110 / 6210 / 6310 / 6130 / 6900 / 7950 | `= account.rangeBalance` (Dr) |
| Cr Expense (to zero debit balance) | Cr | each EXPENSE role above | 7110 / 7120 / 7130 / 8110 / 8120 / ... | `= account.rangeBalance` (Cr) |
| Cr/Dr Retained Earnings (balancing) | Cr if netIncome > 0 (net profit) else Dr | `RETAINED_EARNINGS` | 5200 | `= \|netIncome\|` |

The JE is balanced by construction: `Σ Dr (revenue + RE-if-loss) = Σ Cr (expense + RE-if-profit)`.

### Engine algorithm (closing-engine.ts:249-408)

```
1. Pre-flight: refuse if no tx (CLOSE_NO_TX), if status=CLOSED
   (YEAR_ALREADY_CLOSED), if status=CLOSING (YEAR_CLOSING), or if
   options.approved !== true (NOT_APPROVED).

2. Atomic lock: UPDATE FiscalYear SET status='CLOSING' WHERE id=? AND
   status='OPEN'. If 0 rows updated → LOCK_FAILED (someone else got there
   first). This prevents concurrent close attempts.

3. Compute balances: previewFiscalYearClose(fiscalYearId, tx) →
   - getAccountBalancesByType(['REVENUE'], range, tx)
   - getAccountBalancesByType(['EXPENSE'], range, tx)
   Filter to roles in REVENUE_ROLES / EXPENSE_ROLES, skip zero balances.

4. Build closing lines:
   - Revenue lines: Dr each revenue account by its range-balance
     (credit-normal → Dr to zero).
   - Expense lines: Cr each expense account by its range-balance
     (debit-normal → Cr to zero).
   - Retained Earnings line: Dr if net loss, Cr if net income
     (net = totalRevenue - totalExpenses).

5. Post closing JE:
   - entryNo = getNextEntryNo(tx)        ← atomic via Sequence table
   - date = fy.endDate
   - sourceType = 'YEAR_END_CLOSING'
   - sourceId = `FY-CLOSE-${fy.name}`
   - skipPeriodGuard = true              ← bypasses R6 (period-closed check)
   - postJournalEntry(input, tx)         ← runs R1-R5, R7-R12 inside tx

6. UPDATE FiscalYear SET
     status = 'CLOSED',
     closingJournalEntryId = closingJE.id,
     retainedEarningsAccountCode = re.code,
     totalRevenue = Σ revenue balances,
     totalExpenses = Σ expense balances,
     netProfit = totalRevenue - totalExpenses,
     closedBy = options.closedBy,
     closedAt = now()

7. For each of the 12 FiscalPeriods:
     closePeriod(period.id, tx, {
       closedBy, notes: 'Auto-closed by year-end closing',
       allowDuringClosing: true   ← year is in CLOSING state at this point
     })
   Failures (already-closed periods) are logged and skipped — the year still
   closes successfully.

8. Return ClosingResult { fiscalYearId, closingJournalEntryId,
   closingJournalEntryNo, totalRevenue, totalExpenses, netIncome,
   periodsClosed }.
```

**Post-close invariant**: querying `getBalanceByType('REVENUE', { from:
fy.startDate, to: fy.endDate })` and `getBalanceByType('EXPENSE', { from:
fy.startDate, to: fy.endDate })` MUST both return ~0.00 (the closing JE is
dated `fy.endDate` so it falls inside the range and nets the operational
balances to zero).

---

## الخطوة 3: إعادة فتح السنة المالية — Fiscal Year Reopen (Correction)

Allows corrections to a closed year (e.g., a late invoice discovered after
year-end). The closing JE is reversed, not deleted — both entries remain POSTED
for audit.

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fiscal-years/[id]/reopen` |
| **Route file** | `src/app/api/fiscal-years/[id]/reopen/route.ts` (lines 10-50) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | `reopenFiscalYear(fiscalYearId, tx, options)` in `src/lib/accounting/closing-engine.ts` (lines 428-507) |
| **Prerequisites** | FiscalYear must exist with `status='CLOSED'` (refuses if `OPEN` or `CLOSING` — `YEAR_NOT_CLOSED` error). |
| **Required input fields** | None (empty body OK) |
| **Optional fields** | `reopenedBy` (default `'admin'`), `reverseClosingJE` (default `true` — set `false` to reopen without reversing the closing JE; rare, admin-only) |
| **Journal entry posted** | **Yes — reversal JE** with `isReversal=true`, `reversedEntryId=closingJE.id`, `sourceType='YEAR_END_CLOSING'` (preserved from original), `date=new Date()` (today — outside the closed year's range) |
| **Status transitions** | `FiscalYear.status`: `CLOSED` → `OPEN`; `FiscalPeriod.status`: each of 12 periods → `OPEN` |
| **Atomicity** | Route wraps in `db.$transaction(async (tx) => reopenFiscalYear(id, tx, {...}))` (P1-4 fix). |
| **Affected reports** | Fiscal year card (status returns to OPEN), trial balance (revenue/expense restored in all-time view), income statement (year is editable again) |

### Engine algorithm (closing-engine.ts:428-507)

```
1. Pre-flight: refuse if no tx (REOPEN_NO_TX) or if status !== 'CLOSED'
   (YEAR_NOT_CLOSED).

2. If reverseClosingJE !== false AND fy.closingJournalEntryId !== null:
     reversal = reverseJournalEntry(fy.closingJournalEntryId, tx,
                                    `إعادة فتح السنة ${fy.name}`)
   - reverseJournalEntry throws ALREADY_REVERSED if a reversal already
     exists (prevents double-reversal).
   - The reversal JE inherits sourceType from the original
     (YEAR_END_CLOSING) but is marked isReversal=true and
     reversedEntryId=closingJE.id at creation time (P1-4c fix — set at
     create, not via post-create update, to satisfy the idempotency
     partial index).
   - The reversal JE's date is `new Date()` (today) — this is OUTSIDE
     the closed year's date range, so the year-range balances stay zeroed
     (the closing JE is still the only entry inside the range touching
     revenue/expense), but ALL-TIME balances are restored because the
     reversal nets the closing JE.

3. UPDATE FiscalYear SET
     status = 'OPEN',
     closingJournalEntryId = null,
     closedBy = null,
     closedAt = null,
     closingNotes = null
   (totalRevenue, totalExpenses, netProfit are NOT cleared — they remain
    as the historical closing snapshot for audit. They will be
    overwritten on the next close.)

4. For each of the 12 FiscalPeriods:
     if period.status !== 'OPEN':
       reopenPeriod(period.id, tx, { reopenedBy })
   reopenPeriod refuses if the parent FiscalYear.status === 'CLOSED',
   but at this point we've already set it to OPEN in step 3, so the
   check passes. Failures are logged and skipped.

5. Return { fiscalYearId, reversalEntryId, reversalEntryNo,
   periodsReopened }.
```

**Post-reopen invariant**: querying all-time balances (no range filter) for
REVENUE and EXPENSE accounts MUST match the pre-close values. (The reversal JE
cancels the closing JE; both remain POSTED and net to zero in the GL.)

**Year-range balances** stay at zero after reopening — the reversal is dated
TODAY, not back-dated into the closed year. This is the correct accounting
treatment: the closed year's books remain "as closed" for historical
reporting; the reversal effect appears in the current period. Accountants
re-running the year-end close after corrections will produce a fresh closing
JE that supersedes the reversed one.

---

## الخطوة 4: إنشاء سنة مالية جديدة — Fiscal Year Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fiscal-years` |
| **Route file** | `src/app/api/fiscal-years/route.ts` (lines 106-193) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | None — but the new year's date range MUST NOT overlap any existing FiscalYear (enforced by the route). |
| **Required input fields** | `startDate`, `endDate` (ISO date strings; `endDate > startDate`) |
| **Optional fields** | `name` (auto-generated from `startDate.getFullYear()` if absent; must be unique) |
| **Journal entry posted** | **No** — pure master-data creation |
| **Initial status** | `FiscalYear.status = 'OPEN'` |
| **Periods created** | Exactly 12 `FiscalPeriod` rows: `periodNo` 1-12, `startDate` = first day of each month, `endDate` = last day of each month, `status = 'OPEN'` |
| **Atomicity** | Route wraps `FiscalYear.create` + `FiscalPeriod.createMany` in `db.$transaction`. |
| **Affected reports** | Fiscal year list, fiscal year selector in JE form |

### Period-creation algorithm (route.ts:160-180)

```js
for (let i = 0; i < 12; i++) {
  const periodStart = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
  const periodEnd = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, 0)
  if (periodStart > endDate) break
  const actualEnd = periodEnd > endDate ? endDate : periodEnd
  periods.push({
    fiscalYearId: fiscalYear.id,
    periodNo: i + 1,
    startDate: periodStart,
    endDate: actualEnd,
    status: 'OPEN',
  })
}
await tx.fiscalPeriod.createMany({ data: periods })
```

> **NOTE**: This route-level loop is duplicated (with minor variations) in
> `accounting-calendar.ts:429-473` (`createFiscalYear` helper). The closing
> engine does NOT use this helper — it relies on the periods already existing.
> The two paths produce equivalent 12-period layouts for any Jan-Dec fiscal
> year. Future consolidation could route POST `/api/fiscal-years` through the
> helper, but that is outside this cycle's scope.

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running all 4 steps for a single test year (e.g., 2099), the following
must hold:

### 1. ميزان المراجعة متوازن — Trial Balance Ties Throughout

```ts
import { getTrialBalance } from '@/lib/accounting/queries'

// At every checkpoint (pre-close, post-close, post-reopen):
const tb = await getTrialBalance()
// tb.totals.totalDebit === tb.totals.totalCredit (within 0.01)
// tb.totals.isBalanced === true
```

The closing JE is balanced by construction (Step 2). The reversal JE is the
mirror of the closing JE (Dr↔Cr swap), so it is also balanced. The trial
balance MUST tie at every checkpoint.

### 2. كل القيود متوازنة — All JEs Balanced

Every JE created during the cycle — the operational JEs, the closing JE, and
the reversal JE — must satisfy `Σ debit = Σ credit`. This is enforced by guard
rule R2 at post time (in `assertJournalEntryValid`) and is invariant thereafter.

### 3. حسابات الإيراد والمصروف تُصفَّر بعد الإقفال — Revenue/Expense Zeroed After Close

```ts
import { getBalanceByType } from '@/lib/accounting/queries'

const range = { from: fy.startDate, to: fy.endDate }
const revenueAfter = await getBalanceByType('REVENUE', range)
const expenseAfter = await getBalanceByType('EXPENSE', range)
// revenueAfter ≈ 0.00 (within 0.01)
// expenseAfter ≈ 0.00 (within 0.01)
```

The closing JE is dated `fy.endDate`, which falls inside the FY range. It Dr's
each revenue account and Cr's each expense account by the exact range-balance,
netting both to zero in the range query.

### 4. الأرصدة الكلية تُستعاد بعد إعادة الفتح — All-Time Balances Restored After Reopen

```ts
// All-time balance (no range filter) — captures closing JE + reversal JE
const revenueReopened = await getBalanceByType('REVENUE')
const expenseReopened = await getBalanceByType('EXPENSE')
// revenueReopened ≈ preCloseRevenueBalance (within 0.01)
// expenseReopened ≈ preCloseExpenseBalance (within 0.01)
```

The reversal JE cancels the closing JE in the all-time view. The operational
balances from the year's revenue/expense JEs are restored.

### 5. R6 يمنع الترحيل في فترة مغلقة — R6 Blocks Posting to Closed Period

```ts
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'

// After closing January 2099:
try {
  await postJournalEntry({
    entryNo: await getNextEntryNo(tx),
    date: new Date('2099-01-15'), // inside closed period
    sourceType: 'MANUAL',
    lines: [
      { accountCode: '1110', debit: 100 },
      { accountCode: '6110', credit: 100 },
    ],
  }, tx)
  // FAIL — should have thrown
} catch (e: any) {
  // PASS — e.code === 'PERIOD_CLOSED'
}
```

The guard's R6 check (`assertPeriodOpen` in `accounting-calendar.ts`) reads
`FiscalPeriod.status` for the date's period and throws `PERIOD_CLOSED` if it is
`CLOSED`. This is the SSOT enforcement: no API can bypass it except via
`skipPeriodGuard: true` (system entries only).

### 6. قيد الإقفال يتجاوز R6 بشكل صحيح — Closing JE Bypasses R6 Correctly

The closing JE itself is dated `fy.endDate` (last day of the year). By that
point, the monthly periods for the year may already be CLOSED. The engine
passes `skipPeriodGuard: true` to `postJournalEntry`, which short-circuits the
R6 check. Without this, the closing JE would fail to post. This is the
**correct accounting treatment** — the closing entry belongs to the year being
closed, not the current period.

### 7. عكس القيد سليم — Reversal JE Integrity

```ts
const reversal = await db.journalEntry.findUnique({
  where: { id: reversalEntryId },
})
// reversal.isReversal === true
// reversal.reversedEntryId === closingJE.id
// reversal.sourceType === 'YEAR_END_CLOSING'  ← preserved from original
// reversal.status === 'POSTED'                ← NOT CANCELLED
// Σ reversal.lines.debit === Σ reversal.lines.credit  ← balanced
// For each line: reversal.debit === original.credit AND
//                reversal.credit === original.debit    ← flipped
```

The original closing JE also stays `POSTED` (not `CANCELLED`). Both entries
remain in the GL for audit and net to zero in any range that includes both.

### 8. روابط السنة ↔ قيد الإقفال ↔ الفترات سليمة — Linkage Integrity

| Field | After close | After reopen |
|---|---|---|
| `FiscalYear.status` | `CLOSED` | `OPEN` |
| `FiscalYear.closingJournalEntryId` | `= closingJE.id` | `null` |
| `FiscalYear.closedAt` | `now()` | `null` |
| `FiscalYear.closedBy` | options.closedBy | `null` |
| `FiscalYear.totalRevenue` | Σ revenue balances | preserved (historical snapshot) |
| `FiscalYear.totalExpenses` | Σ expense balances | preserved |
| `FiscalYear.netProfit` | revenue - expenses | preserved |
| `FiscalPeriod.status` (all 12) | `CLOSED` | `OPEN` |
| `JournalEntry.isReversal` (closing JE) | `false` | `false` (unchanged) |
| `JournalEntry.isReversal` (reversal JE) | n/a | `true` |
| `JournalEntry.reversedEntryId` (reversal JE) | n/a | `= closingJE.id` |

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 1 | Monthly period close | — | — | — | No JE — status flag only |
| 2 | Fiscal year close | `YEAR_END_CLOSING` | each REVENUE account + RETAINED_EARNINGS (if net loss) | each EXPENSE account + RETAINED_EARNINGS (if net income) | skipPeriodGuard=true; dated fy.endDate |
| 3 | Fiscal year reopen | `YEAR_END_CLOSING` (preserved from original) | (flipped from closing JE) | (flipped from closing JE) | isReversal=true; reversedEntryId=closingJE.id; dated today |
| 4 | Fiscal year creation | — | — | — | No JE — master data only |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| Period closing API (monthly + yearly) | `src/app/api/period-closing/route.ts` |
| Fiscal year list/create API | `src/app/api/fiscal-years/route.ts` |
| Fiscal year detail/update/delete API | `src/app/api/fiscal-years/[id]/route.ts` |
| Fiscal year close API | `src/app/api/fiscal-years/[id]/close/route.ts` |
| Fiscal year reopen API | `src/app/api/fiscal-years/[id]/reopen/route.ts` |
| Fiscal year closing-preview API | `src/app/api/fiscal-years/[id]/closing-preview/route.ts` |
| Period status toggle API | `src/app/api/fiscal-years/[id]/periods/[periodId]/route.ts` |
| Closing engine (SSOT) | `src/lib/accounting/closing-engine.ts` |
| Accounting calendar (SSOT for period state) | `src/lib/accounting/accounting-calendar.ts` |
| Posting guard (R1-R12, R6 = period-open) | `src/lib/accounting/guard.ts` |
| Accounting queries (SSOT for balances) | `src/lib/accounting/queries.ts` |
| Account roles (RETAINED_EARNINGS, etc.) | `src/lib/account-roles.ts` |
| Prisma schema (FiscalYear, FiscalPeriod, PeriodClosing, JournalEntry) | `prisma/schema.prisma` |
| E2E test | `scripts/e2e-closing-cycle.ts` |

---

## ملاحظات التصميم — Design Notes

### لماذا الإقفال ذري (P1-4 fix)?

Before P1-4, `closeFiscalYear` accepted `tx = undefined` and operated directly
on `db`. This meant: (a) the closing JE post, (b) the FiscalYear status
update, and (c) the 12 period-close updates were three separate transactions.
If (a) succeeded but (b) failed (e.g., DB connection drop), the system was
left with an orphan closing JE in the GL but the FiscalYear still in `OPEN`
state — and re-running the close would fail because the JE's `sourceId`
conflicted (or, with the unique index in place, would throw
`DUPLICATE_ENTRY_NO`). Worse, if (a) + (b) succeeded but (c) failed, the year
was `CLOSED` but its periods were still `OPEN` — an inconsistent state.

The P1-4 fix: `closeFiscalYear` and `reopenFiscalYear` now REFUSE to run
without a `tx` parameter. The API routes wrap them in
`db.$transaction(async (tx) => ...)`. On any failure, all writes roll back —
the year stays in its pre-close state, no orphan JEs.

### لماذا قيد الإقفال يتجاوز R6?

R6 (`assertPeriodOpen`) is the right guard for **operational** JEs: an
accountant should not post an invoice to a closed period. But the closing JE
itself MUST be posted to the year being closed (dated `fy.endDate`), and by
that point the periods for that year may already be CLOSED (the typical
workflow is: close all 12 monthly periods → then run year-end close). Without
`skipPeriodGuard: true`, the closing JE would be rejected by R6.

The same logic applies to reversal JEs (which reverse closing JEs during
reopening): they are dated TODAY (current period), but the original closing JE
they reverse was dated in a now-closed year. `reverseJournalEntry` passes
`skipPeriodGuard: true` to allow the reversal to post in the current open
period regardless of the original's date.

### لماذا لا يُحدث قيد عكسي في إعادة الفتح الشهري?

Monthly period reopen (Step 1's `reopen` action) does NOT create a reversal
JE — because monthly close does NOT create a closing JE. Monthly close is a
pure status flag (CLOSED). Reopening simply sets the status back to OPEN.

This is asymmetric with year-end close (Step 2), which DOES create a closing
JE and whose reopen (Step 3) DOES create a reversal JE. The asymmetry is
correct: monthly close has no GL impact to reverse; year-end close does.

### لماذا لا يُحذف قيد الإقفال عند إعادة الفتح?

Deleting a POSTED JE is forbidden by the immutability rule (BA-02 Task 4). A
posted JE is a legal accounting record — it MUST remain in the GL for audit.
Instead, reopening creates a separate reversal JE that nets the original to
zero. Both entries stay POSTED and the GL is always reconstructable from the
POSTED entry history.

This mirrors the standard accounting practice: corrections are made by
reversal + new entry, never by editing or deleting the original.

### لماذا التاريخ في قيد العكس هو "اليوم" وليس تاريخ الإقفال?

`reverseJournalEntry` (in `guard.ts:340`) uses `date: new Date()` for the
reversal JE. This is intentional:

- The original closing JE was dated `fy.endDate` (last day of closed year).
- The reversal is posted in the CURRENT open period (today) — which is when
  the accountant actually decided to reopen the year.
- Year-range balances for the closed year stay zeroed (only the closing JE
  is in that range). This preserves the closed year's "as-closed" view for
  historical reporting.
- All-time balances are restored because the reversal JE (in the current
  period) cancels the closing JE.
- If the accountant re-runs year-end close after corrections, a fresh
  closing JE is created (with a new `entryNo`) that supersedes the reversed
  one. The reversal + new-close pair correctly captures the correction
  history in the GL.

### دور PeriodClosing كسجل تدقيق فقط

The `PeriodClosing` model (prisma schema lines 2419-2434) is a READ-ONLY
audit log of past close/reopen actions. It has a `@@unique([year, month, type])`
constraint and is upserted by `closePeriod` / `reopenPeriod` /
`lockPeriod` in `accounting-calendar.ts`. The guard (R6) does NOT consult it
— it consults `FiscalPeriod.status` directly. This means:

- An admin can manually flip `FiscalPeriod.status` (via the period-toggle
  API) without updating `PeriodClosing`. The guard will honor the new status.
- The `PeriodClosing` table may lag behind `FiscalPeriod.status` if a
  background process fails between the two writes.
- Reports that need authoritative period state MUST query `FiscalPeriod`,
  not `PeriodClosing`.

This design separates operational state (`FiscalPeriod`) from audit history
(`PeriodClosing`), following the CQRS-like pattern used elsewhere in the
system.
