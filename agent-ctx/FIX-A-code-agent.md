# FIX-A — Code Agent Work Record

**Task ID**: FIX-A
**Agent**: Code Agent (HR Duplication + Print XSS + Rental Data)
**Date**: 2025 (per system clock)
**Project**: Binaa-System ERP at `/home/z/my-project/download/Binaa-System`

## Scope

3 CRITICAL bugs flagged by AUDIT-1 and AUDIT-2:

1. **HR Duplication** (AUDIT-2 Part A) — salaries + payroll-runs both post
   salary accrual JEs → double-counting.
2. **Print Template XSS** (AUDIT-1) — 16 modular templates don't use
   `escapeHtml` → 80 injection sites.
3. **Rental Invoice Data** (AUDIT-1 D3) — `/api/print?type=rental-invoice`
   never populates rental-specific fields → template's `hasRentalData`
   check fails → entire Rental Data section hidden.

## Changes Applied (23 files, ~470 lines)

### Task 1 — HR Duplication Fix (Option A from audit)

| File | Change |
|------|--------|
| `src/app/api/salaries/route.ts` | Removed `createSalaryAccrualJournalEntry` call from POST approve flow. Kept helper EXPORTED (e2e test imports it directly). Kept EquipmentCost creation (independent of GL). Added explanatory comment. |
| `src/app/api/salaries/[id]/route.ts` | Removed `createSalaryAccrualJournalEntry` import + call from PUT approve flow. Kept EquipmentCost. Added top-of-file + inline comments. |

**Production behavior after fix**: `salaries` screen no longer posts accrual
JEs. `payroll-runs` approval is the SINGLE source of truth for salary
accruals (Dr PAYROLL_EXPENSE + Dr GOSI_EXPENSE / Cr SALARIES_PAYABLE +
Cr GOSI_PAYABLE + Cr EMPLOYEE_ADVANCE for deductions).

### Task 2 — Print Template XSS Fix (escapeHtml across 16 templates + 2 shared)

All 16 modular templates now `import { escapeHtml } from '@/lib/escape-html'`
and wrap user-controlled string interpolations with `escapeHtml()`. The 2
shared files (`sections.ts`, `headers-footers.ts`) were also hardened as
defense-in-depth (they're called by every template with user data).

**Files changed**:
- invoices/: RentalInvoice.ts, ServiceInvoice.ts, SupplierInvoice.ts
- projects/: ProgressClaim.ts
- procurement/: PurchaseOrder.ts, DeliveryOrder.ts
- operations/: Timesheet.ts
- accounting/: JournalEntry.ts, TrialBalance.ts, GeneralLedger.ts, IncomeStatement.ts, BalanceSheet.ts
- tax/: VatReturn.ts
- financial/: PaymentVoucher.ts, RentalContract.ts, SalarySlip.ts
- reports/: GenericTable.ts, ProjectReport.ts
- shared/: sections.ts, headers-footers.ts

**Special case — RentalInvoice getExtraScripts**: The `invNo` was
interpolated raw into a JS string literal (`'${invNo}.'`). Fixed via
`var invNo = ${JSON.stringify(invNo)};` — JSON.stringify safely escapes
quotes/backslashes/control chars per ECMA-262 §9.8.1.

**Fields NOT escaped** (system-generated/numeric, confirmed safe): dates
(formatDate/formatDeliveryMonth), amounts (fmtMoney/fmtPrint/toFixed),
entryNo (JE-NNNNNN), loop counters, account codes (system), VAT rates
(computed), CSS class names, internal cuid IDs.

### Task 3 — Rental Invoice Data Fix

`src/app/api/print/route.ts` rental-invoice case now:
1. Includes the linked `timesheet` with its own `rental`, `deliveryOrder`,
   and `equipment` relations.
2. Populates 12 rental-specific fields on the print data object:
   - From cached SalesInvoice columns: `equipmentName`, `operatingHours`,
     `hourlyRate`, `deliveryMonth`, `contractNo`, `salesOrderNo`,
     `paymentTerms`.
   - From live Timesheet → Rental/DeliveryOrder/Equipment chain:
     `equipmentCode`, `purchaseOrderNo`, `deliveryOrderNo`, `workLocation`.
   - Synthesized: `timesheetNo` = `TS-{year}-{MM}-{shortId}` (Timesheet
     model has no `code` column).

The `hasRentalData` check now passes for every rental invoice created via
the timesheet-invoice flow. The "⚙ بيانات التأجير / Rental Data" section
now renders with all 9 fields populated.

## Verification Results

| Test | Result |
|------|--------|
| `bun run lint` | ✅ CLEAN (no errors, no warnings) |
| `bun run test:accounting` | ✅ 21/21 PASSED |
| `bun scripts/e2e-payroll-cycle.ts` | ✅ 55/55 PASSED |
| `bun scripts/e2e-production-acceptance.ts` | ✅ 70/70 PASSED |

All 4 verification gates green. The HR duplication fix did NOT break the
payroll cycle (the e2e test calls `createSalaryAccrualJournalEntry`
directly to verify the accounting model — the API change is transparent
to the test).

## Notes for Future Agents

1. `createSalaryAccrualJournalEntry` is now a "test-only" export —
   production code no longer calls it from API routes. Do NOT remove it
   without updating `scripts/e2e-payroll-cycle.ts` first.
2. The EquipmentCost creation in `salaries/[id]/route.ts` approve flow
   was intentionally KEPT. It's a project cost tracking record, NOT a JE.
   Removing it would create a gap (no project cost tracking when using
   salaries screen — payroll-runs doesn't create EquipmentCost either).
3. `shared/sections.ts` `termsSection` now escapes the terms content.
   If you want to support rich-text terms (HTML formatting), you'll need
   a sanitization library (e.g. DOMPurify) instead of escapeHtml. For
   now, terms are treated as plain text — HTML tags are shown literally.
4. The `timesheetNo` format `TS-{year}-{MM}-{shortId}` is a synthetic
   display ID — the Timesheet model has no `code` column. If you add a
   `code` column later, update the rental-invoice case in
   `src/app/api/print/route.ts` to use it.
5. The `invNo` JSON.stringify pattern in RentalInvoice getExtraScripts is
   the correct way to embed user-controlled strings in JS string context.
   `escapeHtml` is WRONG for JS context (it converts `'` to `&#x27;`
   which is not a valid JS escape). Use JSON.stringify for any JS string
   interpolation of user data.

## Files Needing Follow-up (out of scope for FIX-A)

Per AUDIT-2 Part B (Settings field audit) — 12 settings issues remain:
- S1 (HIGH): `defaultVatRate` only honored by 1 of 9 invoice-creation
  endpoints. The other 8 hardcode `0.15`.
- S2 (HIGH): `invoiceShowBankDetails` toggle ignored — bank details
  always print.
- S3 (HIGH): `stampPosition` ignored in print output.
- S4 (HIGH): `invoicePrimaryColor` partial CSS coverage.
- S5-S12 (MEDIUM/LOW): various dead settings.

See `/home/z/my-project/worklog.md` AUDIT-2 Part B for the full list.

Per AUDIT-2 Part A.4 — advances settlement (Dr SALARIES_PAYABLE /
Cr EMPLOYEE_ADVANCE) posts without verifying a salary exists. Related
integrity issue, NOT a duplication bug. Not fixed here.
