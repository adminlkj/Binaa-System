# P3-6 — VAT Cycle Documenter & E2E Tester

**Task ID**: P3-6
**Agent**: P3.6 — VAT Cycle Documenter & E2E Tester
**Phase**: 3 (Workflow Integrity) — Cycle 6 (VAT)
**Project**: Binaa-System ERP (`/home/z/my-project/download/Binaa-System`)
**Status**: ✅ COMPLETE — 74/74 E2E assertions pass, lint clean, no regression

---

## Summary

Documented the full VAT (ضريبة القيمة المضافة) business cycle end-to-end
and wrote a 74-assertion E2E test (`scripts/e2e-vat-cycle.ts`) that
exercises the cycle from operational VAT posting (sales/purchase invoices)
through quarterly calculation, return creation (DRAFT), filing (FILED),
payment (PAID), and reversal (CANCELLED) — verifying that all 8 JEs
(6 originals + 2 reversals) are balanced, the trial balance ties, VAT
account positions net to zero, and numerical consistency (I1-I7) holds.

The companion documentation (`docs/WORKFLOW-VAT-CYCLE.md`) follows the
same format as the construction/rental/purchase/payroll/fixed-assets
cycle docs and records every API endpoint, JE structure, status
transition, safety guard, and architectural finding.

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| E2E test | `bun scripts/e2e-vat-cycle.ts` | ✅ 74 passed, 0 failed |
| ESLint | `bun run lint` | ✅ Clean (0 errors, 0 warnings) |
| Regression — Construction | `bun scripts/e2e-construction-cycle.ts` | ✅ 59/59 passed |
| Regression — Fixed Assets | `bun scripts/e2e-fixed-assets-cycle.ts` | ✅ 40/40 passed |
| Cleanup verification | post-test query | ✅ 0 VATReturns/Invoices/JEs/Projects/Branches for 2099-Q4 |

---

## Files Created (2)

1. **`docs/WORKFLOW-VAT-CYCLE.md`** (~600 lines) — full documentation following the same format as the construction-cycle / rental-cycle / purchase-cycle / payroll-cycle / fixed-assets-cycle docs:
   - Overview with ASCII flow diagram showing the cycle (operational VAT → calculation → return creation → filing → payment → optional reversal).
   - "SSOT (P1-1-FIX)" section documenting the GL-primary inversion: `outputVat`/`inputVat` from `JournalLine` on VAT_OUTPUT/VAT_INPUT roles; `totalSales` from REVENUE; `totalPurchases` from EXPENSE; tolerance tightened from 0.5 SAR to 0.01 SAR.
   - Step 1 (Output VAT): explains that output VAT is the aggregate of all `Cr VAT_OUTPUT` lines from operational source documents — primarily sales invoices (DRAFT→SENT transition posts `Dr CUSTOMER_AR / Cr REVENUE + Cr VAT_OUTPUT`).
   - Step 2 (Input VAT): explains the three contributors (purchase invoices, subcontractor invoices, expenses with VAT) — each posts `Dr <expense role> + Dr VAT_INPUT / Cr <AP role or CASH>`.
   - Step 3 (VAT Calculation): documents `calculateVatForQuarter(year, quarter, tx)` in `src/lib/vat-calc.ts:183-462`. Explains the GL-derived totals (primary), the operational breakdown (supplementary, ZATCA display only), `classifyVatCategory(0.15 → STANDARD, 0 → ZERO, else → EXEMPT)`, `getVatGlBalance` (which excludes VAT_DECLARATION/VAT_PAYMENT sourceTypes so the cross-check reads operational VAT only), and the `glMatch`/`glDiff*` fields.
   - Step 4 (VAT Return Creation): documents `POST /api/vat` (`vat/route.ts:100-207`). Creates `VATReturn` with `status=DRAFT`. Freezes GL-derived totals as canonical (outputVat, inputVat, netVat, totalSales, totalPurchases). Stores per-invoice breakdown + IDs for ZATCA audit. NO JE POSTED at this stage.
   - Step 5 (VAT Filing): documents `PATCH /api/vat {action:'FILE'}` (`vat/route.ts:234-269`). Status DRAFT→FILED. Posts declaration JE via `autoEntryVATDeclaration` (engine.ts:1255-1297): `Dr VAT_OUTPUT (close) / Cr VAT_INPUT (close) / Cr VAT_DUE (net payable)` OR `Dr VAT_REFUND_RECEIVABLE` if netVat<0. sourceType=`VAT_DECLARATION`, sourceId=`VAT-{period}`. **JE dated to period-end** (last day of the quarter) via `getPeriodEndDate(year, quarter)`.
   - Step 6 (VAT Payment): documents `PATCH /api/vat {action:'PAY'}` (`vat/route.ts:271-314`). Status FILED→PAID. Posts payment JE via `autoEntryVATPayment` (engine.ts:1304-1325): `Dr VAT_DUE / Cr BANK`. sourceType=`VAT_PAYMENT`, sourceId=`VTP-{period}`. **Skipped if netVat ≤ 0** (refund scenarios).
   - Step 7 (VAT Reversal): documents `PATCH /api/vat {action:'REVERSE'}` (`vat/route.ts:316-354`). Status FILED/PAID→CANCELLED. Reverses BOTH the declaration JE and the payment JE (if any) via `reverseEntry` (engine.ts:276-279 → guard.ts:340-416). Original JEs stay POSTED (per guard design — no `REVERSED` status enum value); reversal JEs carry `isReversal=true`, `reversedEntryId=originalId`. Allows creating a new VATReturn for the same period (marked `isAmendment=true`).
   - VAT Return Lifecycle States section with ASCII state diagram (DRAFT → FILED → PAID → CANCELLED; no AMENDED status — that's a flag on the new return, not a status).
   - Cycle Completion Verification section (V1-V7): trial balance ties, all JEs balanced, VAT account positions net to zero after declaration+payment, return freezes GL-derived totals, operational↔GL match (glMatch=true), source↔JE linkage intact, numerical consistency (I1-I7).
   - Journal Entry Summary table.
   - File Map.
   - 15 Key Architectural Findings including:
     1. SSOT (P1-1 fix) — `calculateVatForQuarter` reads financial totals from JournalLine on POSTED JEs, not from operational tables.
     2. Tolerance tightened to 1 halala (0.01 SAR) in `vat-calc.ts:431` and `vat/[id]/route.ts:68`.
     3. Period-end dating — declaration JE dated to last day of the quarter.
     4. Declaration JE excludes itself from GL cross-check (filters out VAT_DECLARATION/VAT_PAYMENT sourceTypes, JE-VAT-/JE-VTP- prefixes, and reversal JEs with "VAT" in description).
     5. Three cases for netVat sign (payable/refund/zero).
     6. **No `TAX_AUTHORITY_PAYABLE` role exists** — the codebase uses `VAT_DUE` (3130) for payables and `VAT_REFUND_RECEIVABLE` (1410) for refund receivables. The task brief mentioned this role but it does not exist.
     7. Payment JE skipped for refunds (netVat ≤ 0).
     8. Reversal is non-destructive — original stays POSTED; mirror JE carries isReversal/reversedEntryId.
     9. Reversal JE preserves the original sourceType (VAT_DECLARATION / VAT_PAYMENT) — distinguished by isReversal flag.
     10. VAT_DUE is a transient account (zero balance except between FILE and PAY).
     11. Idempotency via state machine, not DB constraint (JS-level check for one active return per period — allows multiple CANCELLED for audit history).
     12. Idempotency via guard — `reverseEntry` throws `ALREADY_REVERSED` on second call.
     13. Amendment chain (isAmendment + amendedFromId links cancelled → new return).
     14. **No `AMENDED` status enum** — only DRAFT/FILED/PAID/CANCELLED. Task brief mentioned AMENDED — this does not exist; `isAmendment` is a boolean flag on the new return.
     15. Legacy `JE-VAT-` / `JE-VTP-` prefix filter in `getVatGlBalance` is redundant defense-in-depth (post-P1-4, all JEs use unified JE-NNNNNN format).

2. **`scripts/e2e-vat-cycle.ts`** (~880 lines) — 74-assertion E2E test mirroring the construction/rental/payroll/fixed-assets cycle test pattern (results array + `log()` + `step()` + cleanup-in-finally + per-role balance helpers):
   - (a) Setup: Branch, Client, Supplier, CostCenter, Project (anchor for cost center). Uses prefix `P3VAT` and TS timestamp for uniqueness. Test period = 2099-Q4 (Oct-Dec 2099) to avoid collision with real data.
   - (b) Step 1: Create 2 sales invoices (subtotal=10,000+5,000, vatRate=0.15 → outputVat=1,500+750=2,250) via `createSalesInvoiceJournalEntry` (auto-journal.ts:26). Verify each JE: balanced, correct accounts (CUSTOMER_AR/PROJECT_REVENUE/VAT_OUTPUT), correct amounts, sourceType=SALES_INVOICE.
   - (c) Step 2: Create 2 purchase invoices (subtotal=4,000+2,000, vatRate=0.15 → inputVat=600+300=900; categories CONSUMABLES→PROJECT_COST and OFFICE→ADMIN_EXPENSE) via `createPurchaseInvoiceJournalEntry` (auto-journal.ts:149). Verify each JE: balanced, correct accounts (PROJECT_COST or ADMIN_EXPENSE / VAT_INPUT / SUPPLIER_AP), correct amounts, sourceType=PURCHASE_INVOICE.
   - (d) Step 3: Call `calculateVatForQuarter(2099, 4)` and verify the GL-derived totals match expected: outputVat=2,250, inputVat=900, netVat=1,350, totalSales=15,000 (REVENUE), totalPurchases=6,000 (EXPENSE). Verify `glMatch=true`, `glDiffOutput<0.01`, `glDiffInput<0.01` (tolerance tightened from 0.5 in P1-1). Verify category breakdown classifies all 15,000 sales + 6,000 purchases as STANDARD-rated (15%).
   - (e) Step 4: Replicate `POST /api/vat` logic — check for existing active return, look up cancelled-previous, create `VATReturn` with `status=DRAFT` and the GL-derived totals frozen as canonical. Verify: outputVat=2,250 frozen, inputVat=900 frozen, netVat=1,350 frozen, totalSales=15,000 frozen, totalPurchases=6,000 frozen, glMatch=true frozen, source invoice IDs stored (2 sales + 2 purchase IDs), `journalEntryId=null` (no JE at creation — freezing is not a financial event).
   - (f) Step 5: Replicate `PATCH /api/vat {action:'FILE'}` — call `autoEntryVATDeclaration({period, outputVat, inputVat, netVat, date: periodEnd})` inside `db.$transaction`, then update VATReturn to `status=FILED`, `filedDate=now`, `journalEntryId=je.id`. Verify declaration JE: balanced (Dr=2,250=Cr), correct structure (Dr VAT_OUTPUT=2,250, Cr VAT_INPUT=900, Cr VAT_DUE=1,350), sourceType=VAT_DECLARATION, sourceId=`VAT-2099-Q4`, JE date=2099-12-31 (period-end). Verify VATReturn.journalEntryId set + status=FILED.
   - (g) Step 6: Replicate `PATCH /api/vat {action:'PAY'}` — call `autoEntryVATPayment({period, amount: netVat, date, reference})`, update VATReturn to `status=PAID`, `paymentDate`, `paymentReference`, `paymentJournalEntryId`. Verify payment JE: balanced (Dr=1,350=Cr), correct structure (Dr VAT_DUE=1,350, Cr BANK=1,350), sourceType=VAT_PAYMENT, sourceId=`VTP-2099-Q4`. Verify VATReturn.paymentJournalEntryId set + status=PAID + paymentReference + paymentDate set.
   - (h) Final integrity verification:
     - h1: all 6 cycle JEs (2 sales + 2 purchase + 1 declaration + 1 payment) balanced.
     - h2-h3: trial balance ties (Dr=Cr=54,350 — small absolute number because the cycle is symmetric), isBalanced=true.
     - h4-h6: VAT_OUTPUT / VAT_INPUT / VAT_DUE **cycle impact** (scoped to only the JEs created in this test) = 0 each — proving the declaration closes the operational VAT positions and the payment clears the payable. (Used `cycleAccountBalanceByRole` helper scoped to `created.allJEIds` because the global DB has residual data from prior test runs that prevented absolute-balance checks.)
     - h7: BANK Cr on payment JE = 1,350 (cash outflow to tax authority).
     - h8: `getVATReconciliation` self-consistent.
     - h9: source↔JE linkage intact (all 4 invoices + declaration JE + payment JE linked).
     - h10: `verifyNumericalConsistency` ok=true (I1-I7), 12 accounts checked, 0 diffs.
   - (i) Step 7: Replicate `PATCH /api/vat {action:'REVERSE'}` — call `reverseEntry` on both the declaration JE and the payment JE inside `db.$transaction`, update VATReturn to `status=CANCELLED`, `cancelledAt`, `cancelledReason`. Verify:
     - Declaration reversal JE: balanced, flipped structure (Cr VAT_OUTPUT=2,250, Dr VAT_INPUT=900, Dr VAT_DUE=1,350), `isReversal=true`, `reversedEntryId=original.id`, sourceType preserved as VAT_DECLARATION.
     - Payment reversal JE: balanced, flipped structure (Cr VAT_DUE=1,350, Dr BANK=1,350).
     - Original declaration + payment JEs stay POSTED (per guard design — both entries remain POSTED and net out to zero in the trial balance; there is no `REVERSED` status enum value).
     - VATReturn.status=CANCELLED + cancelledAt + cancelledReason set.
     - All 8 JEs (6 originals + 2 reversals) still balanced.
     - Trial balance still ties (Dr=Cr=57,950 — symmetric increase from reversal JEs).
     - `verifyNumericalConsistency` still ok=true.
   - Cleanup in `finally` block: soft-deletes all 8 JEs, hard-deletes VATReturn + 2 sales invoices (with items) + 2 purchase invoices (with items) + Project + CostCenter + Supplier + Client + Branch in reverse FK order. Best-effort fallback outside the transaction if the main cleanup fails.

### Key Numbers Verified End-to-End

- Sales invoice #1 JE: Dr=CUSTOMER_AR 11,500 / Cr=PROJECT_REVENUE 10,000 + Cr=VAT_OUTPUT 1,500
- Sales invoice #2 JE: Dr=CUSTOMER_AR 5,750 / Cr=PROJECT_REVENUE 5,000 + Cr=VAT_OUTPUT 750
- Purchase invoice #1 JE: Dr=PROJECT_COST 4,000 + Dr=VAT_INPUT 600 / Cr=SUPPLIER_AP 4,600
- Purchase invoice #2 JE: Dr=ADMIN_EXPENSE 2,000 + Dr=VAT_INPUT 300 / Cr=SUPPLIER_AP 2,300
- `calculateVatForQuarter(2099, 4)`:
  - outputVat = 2,250 (GL-derived from VAT_OUTPUT credits)
  - inputVat = 900 (GL-derived from VAT_INPUT debits)
  - netVat = 1,350
  - totalSales = 15,000 (REVENUE credits − debits)
  - totalPurchases = 6,000 (EXPENSE debits − credits)
  - glMatch = true (glDiffOutput = 0, glDiffInput = 0; tolerance 0.01 SAR)
- Declaration JE: Dr=VAT_OUTPUT 2,250 / Cr=VAT_INPUT 900 / Cr=VAT_DUE 1,350 (sourceType=VAT_DECLARATION, sourceId=VAT-2099-Q4, date=2099-12-31)
- Payment JE: Dr=VAT_DUE 1,350 / Cr=BANK 1,350 (sourceType=VAT_PAYMENT, sourceId=VTP-2099-Q4)
- Declaration reversal JE: Cr=VAT_OUTPUT 2,250 / Dr=VAT_INPUT 900 / Dr=VAT_DUE 1,350 (isReversal=true, reversedEntryId=declaration.id, sourceType preserved as VAT_DECLARATION)
- Payment reversal JE: Cr=VAT_DUE 1,350 / Dr=BANK 1,350
- Cycle impact on VAT_OUTPUT = 0 (sales Cr 2,250 − declaration Dr 2,250)
- Cycle impact on VAT_INPUT = 0 (purchases Dr 900 − declaration Cr 900)
- Cycle impact on VAT_DUE = 0 (declaration Cr 1,350 − payment Dr 1,350)
- Trial balance: Dr=Cr=54,350 (before reversal) / Dr=Cr=57,950 (after reversal) — symmetric increase
- 8 cycle JEs all balanced ✓
- verifyNumericalConsistency (I1-I7) ok=true, 12 accounts checked, 0 diffs ✓ (verified both before and after reversal)

### Key Architectural Findings (Documented in WORKFLOW-VAT-CYCLE.md)

- **VAT calculation is GL-primary (P1-1 fix)**: `calculateVatForQuarter` reads `outputVat` from `JournalLine` on VAT_OUTPUT role accounts (credits − debits), `inputVat` from VAT_INPUT role accounts (debits − credits), `totalSales` from REVENUE-type accounts (credits − debits), `totalPurchases` from EXPENSE-type accounts (debits − credits). The per-invoice operational breakdown is supplementary ZATCA display only.
- **Tolerance is 0.01 SAR (1 halala)**, tightened from 0.5 SAR in P1-1. Matches SOCPA/ZATCA standards in `src/lib/safe-money.ts:TOLERANCE`.
- **Declaration JE is dated to period-end** (last day of the quarter) via `getPeriodEndDate(year, quarter)` — ensures the closing entry lands in the correct fiscal period for verification.
- **`getVatGlBalance` excludes itself**: filters out VAT_DECLARATION/VAT_PAYMENT sourceTypes, JE-VAT-/JE-VTP- prefixes, and reversal JEs with "VAT" in description. Critical for the cross-check to read operational VAT only.
- **No `TAX_AUTHORITY_PAYABLE` role exists** — the codebase uses `VAT_DUE` (code 3130) for payables and `VAT_REFUND_RECEIVABLE` (code 1410) for refund receivables. The task brief mentioned this role but it does not exist in `src/lib/account-roles.ts`.
- **No `AMENDED` status enum** — `VATReturnStatus` has only DRAFT/FILED/PAID/CANCELLED. The task brief mentioned AMENDED — this is actually a boolean flag (`isAmendment`) on the new return created after cancellation, not a status. The original cancelled return stays in CANCELLED status.
- **Three cases for netVat sign** in the declaration JE: payable (Cr VAT_DUE), refund (Dr VAT_REFUND_RECEIVABLE), zero (no third line). All three produce a balanced JE.
- **Payment JE is skipped for refunds** (netVat ≤ 0). The status still transitions to PAID. Refunds are handled outside this flow.
- **Reversal is non-destructive**: original JEs stay POSTED; reversal JEs carry `isReversal=true` + `reversedEntryId=originalId`. There is no `REVERSED` status enum value.
- **Reversal JE preserves the original sourceType** (VAT_DECLARATION or VAT_PAYMENT) — distinguished from the original by the `isReversal` flag.
- **Idempotency via state machine, not DB constraint**: the "one active return per period" rule is a JS-level check (`existingActive` in vat/route.ts:119-134), not a DB unique constraint. Allows multiple CANCELLED returns per period for audit history.
- **Idempotency via guard**: `reverseEntry` throws `ALREADY_REVERSED` on second call (guard.ts:372-381). The VAT REVERSE route wraps both reversals in a single transaction.

## Output Files

1. `docs/WORKFLOW-VAT-CYCLE.md` (~600 lines)
2. `scripts/e2e-vat-cycle.ts` (~880 lines)
3. `agent-ctx/P3-6-vat-cycle-documenter.md` (this file)

## Stage Summary

- Phase 3 Cycle 6 (VAT Cycle): **COMPLETE ✅**
- All 6 phase-3 cycles now have full documentation + passing E2E tests:
  - Cycle 1 (Construction): 59/59 ✓
  - Cycle 2 (Rental): 39/39 ✓
  - Cycle 3 (Purchase): 43/43 ✓
  - Cycle 4 (Payroll): 55/55 ✓
  - Cycle 5 (Fixed Assets): 40/40 ✓
  - Cycle 6 (VAT): 74/74 ✓
- **Total: 310 E2E assertions across 6 cycles, all passing.**
- Phase 3 (Workflow Integrity) is now complete. All six core ERP business cycles are documented and tested end-to-end.
