# P3-7 — Closing Cycle Documenter (Work Record)

## Task

Phase 3 — Workflow Integrity — FINAL cycle. Document and test the accounting
CLOSING cycle end-to-end:

```
Monthly Period Close → Fiscal Year Close (revenue/expense → retained earnings)
                    → New Year Open (re-open for corrections)
```

## Source Files Read

- `src/lib/accounting/closing-engine.ts` (508 lines) — `closeFiscalYear`,
  `reopenFiscalYear`, `previewFiscalYearClose`. Confirmed P1-4 fix: both
  functions refuse to run without a `tx` parameter.
- `src/lib/accounting/accounting-calendar.ts` (487 lines) — `closePeriod`,
  `reopenPeriod`, `lockPeriod`, `assertPeriodOpen` (R6 SSOT).
- `src/app/api/period-closing/route.ts` (249 lines) — monthly close/reopen API.
- `src/app/api/fiscal-years/route.ts` (193 lines) — FY list + create (12 periods).
- `src/app/api/fiscal-years/[id]/close/route.ts` (61 lines) — thin wrapper,
  wraps in `db.$transaction` (P1-4 fix at route level).
- `src/app/api/fiscal-years/[id]/reopen/route.ts` (50 lines) — thin wrapper,
  wraps in `db.$transaction` (P1-4 fix at route level).
- `src/app/api/fiscal-years/[id]/closing-preview/route.ts` (35 lines).
- `src/app/api/fiscal-years/[id]/periods/[periodId]/route.ts` (45 lines) —
  period status toggle.
- `src/lib/accounting/guard.ts` (689 lines) — `postJournalEntry`,
  `reverseJournalEntry`, R1-R12 guards.
- `src/lib/accounting/queries.ts` — `getBalanceByType`,
  `getAccountBalancesByType`, `getTrialBalance`.
- `src/lib/account-roles.ts` — `AccountRole.RETAINED_EARNINGS` = code 5200,
  type EQUITY.
- `prisma/schema.prisma` — FiscalYear, FiscalPeriod, PeriodClosing,
  JournalEntry, JournalLine.

## Key Findings

1. **Atomicity (P1-4 fix)**: The closing engine refuses to run without a `tx`
   parameter. The API routes wrap the engine call in
   `db.$transaction(async (tx) => ...)`. On any failure, all writes roll back.

2. **Closing JE bypasses R6**: `skipPeriodGuard: true` is passed to
   `postJournalEntry` for the closing JE. This is correct — the closing JE is
   dated `fy.endDate` and by that point the periods are typically CLOSED.

3. **Idempotency unique index**: The DB has a partial unique index
   `JournalEntry_source_isReversal_unique ON (sourceType, sourceId) WHERE
   isReversal=0 AND sourceId IS NOT NULL AND deletedAt IS NULL`. The closing
   engine uses `sourceId = FY-CLOSE-${fy.name}`, so re-closing without
   soft-deleting the original (which the engine does NOT do — both stay POSTED
   for audit) would violate the index. This is by design: prevents accidental
   double-close.

4. **Closing JE structure**: Dr each REVENUE account (to zero credit balance),
   Cr each EXPENSE account (to zero debit balance), Cr/Dr RETAINED_EARNINGS
   for net income/loss. Balanced by construction. `sourceType=YEAR_END_CLOSING`.

5. **Reversal JE on reopen**: `isReversal=true`, `reversedEntryId=closingJE.id`,
   dated `new Date()` (today — outside the closed year's range). Original
   closing JE stays POSTED. Both net to zero in all-time GL view.

6. **All-time vs year-range balances**: After reopen, all-time balances are
   restored (reversal cancels closing JE), but year-range balances stay zeroed
   (reversal is outside range). This is correct: closed year's "as-closed"
   view shows zero; all-time view shows restored operational balances.

7. **R6 enforcement**: Operational JEs are blocked from posting to closed
   periods (`PERIOD_CLOSED` error from `assertPeriodOpen`). Only system
   entries (closing JE, reversal JE) bypass via `skipPeriodGuard: true`.

8. **Monthly close is asymmetric**: Monthly period close does NOT create a JE
   (pure status flag). Year-end close DOES create a closing JE. This is
   correct: monthly close has no GL impact to reverse.

9. **PeriodClosing is audit-only**: The guard (R6) consults
   `FiscalPeriod.status`, NOT `PeriodClosing`. The latter is a read-only
   audit log of past close/reopen actions.

## Deliverables

1. **`docs/WORKFLOW-CLOSING-CYCLE.md`** (~520 lines) — full documentation
   following the construction-cycle format. Includes:
   - Overview diagram of the 4-step cycle.
   - Step-by-step tables (API endpoint, route file, authz, prerequisites,
     required input, JE posted, status transitions, affected reports).
   - Closing JE structure table (Dr Revenue, Cr Expense, Cr/Dr RE).
   - Engine algorithm pseudocode for close + reopen.
   - Cycle Completion Verification (8 invariants).
   - JE Summary table.
   - File Map.
   - Design Notes (atomicity, R6 bypass, reversal non-destructiveness,
     retained earnings by role, PeriodClosing as audit-only).

2. **`scripts/e2e-closing-cycle.ts`** (~750 lines) — E2E test with **47
   assertions, all passing**. Test structure:
   - (a) Step 4: Create FY 2099 with 12 OPEN periods.
   - (b) Step 2: Post 3 operational JEs (revenue 10k + expenses 5.5k).
   - (c) Step 1: Close January 2099 → verify R6 blocks posting (PERIOD_CLOSED).
   - (d) Step 2: Close fiscal year → verify closing JE structure, FY CLOSED,
     all 12 periods CLOSED, 2099-range balances zeroed, RE increased by
     netIncome, closing JE bypassed R6, TB ties.
   - (e) Step 3: Reopen fiscal year → verify reversal JE (isReversal=true,
     flipped lines), FY OPEN, all 12 periods OPEN, all-time balances restored,
     TB ties.
   - (f) Final verification: all JEs balanced, FY linkage cleared, idempotency
     index blocks re-close, engine guards (NOT_APPROVED, CLOSE_NO_TX,
     REOPEN_NO_TX, YEAR_ALREADY_CLOSED, YEAR_NOT_CLOSED), preview uses 2099
     range, final TB ties.
   - Cleanup: reopens year if CLOSED, soft-deletes all 7 JEs, hard-deletes
     FiscalYear (cascades to 12 periods), cleans up PeriodClosing audit rows.

## Test Results

```
═══════════════════════════════════════════════════════════════
  P3-7 E2E: Accounting Closing Cycle — End-to-End Test
  Tests the full cycle: monthly close → year close → reopen.
═══════════════════════════════════════════════════════════════
  ✓ 47/47 assertions passed
  ✅ All closing-cycle E2E tests PASSED
═══════════════════════════════════════════════════════════════
```

## Lint Result

`bun run lint` — clean, no errors.

## Phase 3 Final Summary

All 7 phase-3 cycles now have full documentation + passing E2E tests:

| Cycle | Document | E2E Test | Assertions |
|---|---|---|---|
| 1. Construction | WORKFLOW-CONSTRUCTION-CYCLE.md | e2e-construction-cycle.ts | 59/59 ✓ |
| 2. Rental | WORKFLOW-RENTAL-CYCLE.md | e2e-rental-cycle.ts | 39/39 ✓ |
| 3. Purchase | WORKFLOW-PURCHASE-CYCLE.md | e2e-purchase-cycle.ts | 43/43 ✓ |
| 4. Payroll | WORKFLOW-PAYROLL-CYCLE.md | e2e-payroll-cycle.ts | 55/55 ✓ |
| 5. Fixed Assets | WORKFLOW-FIXED-ASSETS-CYCLE.md | e2e-fixed-assets-cycle.ts | 40/40 ✓ |
| 6. VAT | WORKFLOW-VAT-CYCLE.md | e2e-vat-cycle.ts | 74/74 ✓ |
| 7. Closing | WORKFLOW-CLOSING-CYCLE.md | e2e-closing-cycle.ts | 47/47 ✓ |

**Total: 357 E2E assertions across 7 cycles, all passing.**

Phase 3 (Workflow Integrity) is now **FULLY complete**.
