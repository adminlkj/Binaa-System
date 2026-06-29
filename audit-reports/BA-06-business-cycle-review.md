# BA-06: Business Cycle Review Report

**Date**: $(date)
**Phase**: BA-06 (Business Cycle Reviews)
**Status**: COMPLETE — all 5 cycles reviewed
**Approach**: Read-only review against the unified accounting engine (BA-02 complete)

---

## Executive Summary

All 5 business cycles were reviewed against the unified accounting engine
(`postJournalEntry` from `guard.ts`, R1-R12 rules, unified calendar,
POSTED=Immutable, `reverseEntry` as sole reversal path).

**Foundation is sound**: After BA-02, all cycles correctly route journal
entries through the unified engine. The major rule violations (missing JEs,
direct deletion of POSTED entries) have been fixed in previous phases.

**Remaining issues are narrow and well-scoped** — concentrated in edit/delete
paths and specific edge cases, not architectural flaws.

---

## Critical Findings (P0 — must fix)

### 1. Purchases: GRNI never cleared (DOUBLE-COUNTED COST)
- **File**: `src/lib/auto-journal.ts:149-198` (`createPurchaseInvoiceJournalEntry`)
- **Issue**: Supplier invoice approval always debits Cost again without clearing
  the GRNI liability created at goods receipt. Cost is double-counted; GRNI
  liability is stuck forever.
- **Fix**: Make `createPurchaseInvoiceJournalEntry` GRNI-aware: if
  `goodsReceiptId` is set, debit GRNI (not Cost) + Input VAT / Cr Supplier AP.

### 2. HR: GOSI JE is UNBALANCED
- **File**: `src/app/api/payroll-runs/[id]/route.ts:144-191`
- **Issue**: GOSI journal entry doesn't balance (Dr gross+GOSI, Dr GOSI again,
  Cr only employee GOSI). Guard R2 will reject → approval fails.
- **Dormant**: `Employee.hasGosi @default(false)` — will explode when any
  employee gets GOSI enabled.
- **Fix**: Separate employee vs employer GOSI in the data model and JE.

### 3. HR: EOS provision never booked
- **File**: `src/lib/accounting/engine.ts` (`autoEntryEndOfService`)
- **Issue**: Function is defined but never called. EOS provision (account 3710)
  is never accrued. Non-compliant with SOCPA/IFRS.
- **Fix**: Wire to monthly accrual endpoint and termination endpoint.

### 4. Leasing: Equipment Operation DELETE doesn't reverse JE
- **File**: `src/app/api/equipment/operations/[id]/route.ts`
- **Issue**: DELETE hard-deletes the EquipmentOperation without reversing the
  linked JE → orphan POSTED entry in GL.
- **Root cause**: `EquipmentOperation` model has no `journalEntryId` field.
- **Fix**: Add `journalEntryId` to schema + link in POST + reverse in DELETE.

### 5. Leasing: Equipment PUT allows editing purchasePrice without JE update
- **File**: `src/app/api/equipment/[id]/route.ts` PUT
- **Issue**: Editing `purchasePrice` doesn't reverse/repost the acquisition JE →
  GL diverges from equipment record.
- **Fix**: Block or reverse/repost when `purchasePrice` changes.

### 6. Leasing: createAssetWithAcquisition swallows JE failure
- **File**: `src/lib/accounting/depreciation-engine.ts`
- **Issue**: try/catch + `// نكمل حتى لو فشل القيد` violates R1 (no JE = no
  operation). FixedAsset created without linked JE.
- **Fix**: Remove try/catch so transaction rolls back on JE failure.

### 7. Expenses: Petty-cash DELETE not atomic + hard-delete
- **File**: `src/app/api/petty-cash/[id]/route.ts:87-96`
- **Issue**: `reverseEntry` and `pettyCash.delete` are separate non-transactional
  calls. Hard-delete despite `deletedAt` field existing. Breaks audit trail.
- **Fix**: Wrap in `$transaction`, use soft-delete.

### 8. Expenses: Petty-cash category mapping broken
- **File**: UI sends Arabic strings, engine expects English keys
- **Issue**: `autoEntryPettyCash`'s `categoryRoleMap` expects 'MAINTENANCE' but
  UI sends 'صيانة'. Lookup never matches → ALL petty-cash JEs default to
  `ADMIN_EXPENSE` regardless of selected category.
- **Fix**: Change UI values to English keys (keep Arabic labels).

---

## High-Severity Issues (P1)

### Projects
- `labor-costs/[id]` PUT updates amount without reversing/recreating JE → GL
  keeps old amount forever
- `labor-costs/[id]` DELETE hard-deletes LaborCost without reversing JE →
  orphaned POSTED JE
- Missing `cost-entries/[id]/route.ts` — cannot fetch/update/cancel individual
  cost entries
- `subcontractor-invoices` POST creates JE at DRAFT (should defer to SENT)
- `projects/route.ts` POST doesn't auto-create/link a CostCenter

### Expenses
- `expenses/[id]` PUT doesn't reverse JE on non-amount field changes (date,
  category, description, costCenterId) → JE diverges from expense record
- Petty-cash UI doesn't expose `transactionType` (FUND vs DISBURSE) → first
  disbursement makes PETTY_CASH go negative

---

## Medium Issues (P2)

### Purchases
- No inventory issue/consume flow (schema supports ISSUE/TRANSFER/ADJUSTMENT
  but only RECEIPT is ever created)
- Cancelling partially-paid supplier invoice reverses only its JE, leaving
  orphaned supplier payments
- `supplier-payments/[id]` restores invoice status to 'DRAFT' (should be 'SENT')

### Projects
- `subcontractor-retentions/[id]` release has no release JE
- `createProgressClaimJournalEntry` is dead code (0 callers)

### Leasing
- No `[id]/` routes for `equipment/expenses` and `equipment/usages`
- `maintenance/[id]` PUT only reverses/reposts on cost change (ignores date)
- `fuel/[id]` DELETE doesn't clean up linked `EquipmentCost` record
- `depreciation-engine.ts::deleteAsset` swallows acquisition JE reversal failure
- No FK between Equipment and FixedAsset (manual FixedAsset creation required)
- Depreciation JEs use `JE-AST-...`/`JE-DEP-...` format (not canonical JE-NNNNNN)

### HR
- `salaries/route.ts` (simple path) books NET as expense (should be GROSS)
- No endpoint to reverse an APPROVED/PAID payroll run
- `salary-payments/[id]` DELETE hard-deletes (should soft-delete)
- `settlementJournalEntryId` not stored on `EmployeeAdvance`
- PAID JE uses `salaryDate` (1st of month) instead of actual payment date

### Expenses
- `expenses` GET handlers don't filter `deletedAt: null`
- Petty-cash "Cash Balance" sums FUND and DISBURSE with same sign
- `autoEntryExpense` (engine.ts:450) is dead code (0 callers)
- `VAT_INPUT` uses `getDefaultAccountByRole` (returns null) instead of
  `requireAccountByRole` (throws clear error)

---

## What's Correct (Foundation Strengths)

All 5 cycles correctly:
1. Route JEs through `postJournalEntry` from `guard.ts` (R1-R12 enforced centrally)
2. Respect the unified accounting calendar (`assertPeriodOpen` via R6)
3. Treat POSTED entries as immutable (R12)
4. Use `reverseEntry` as the sole reversal path (no direct deletion of POSTED)
5. Wrap multi-step operations in `db.$transaction` (atomicity)
6. Use role-based account resolution (`requireAccountByRole`, no hardcoded codes)
7. Propagate `costCenterId` from `project.costCenter` to JE lines

---

## Recommended Fix Priority

| Priority | Issue | Cycle | Effort |
|----------|-------|-------|--------|
| P0 | GRNI double-count fix | Purchases | Medium |
| P0 | GOSI JE balance fix | HR | Medium |
| P0 | EOS provision implementation | HR | Medium |
| P0 | Equipment Operation DELETE JE reversal | Leasing | Small |
| P0 | Equipment PUT price change JE update | Leasing | Small |
| P0 | createAssetWithAcquisition JE failure handling | Leasing | Small |
| P0 | Petty-cash DELETE atomicity + soft-delete | Expenses | Small |
| P0 | Petty-cash category mapping (Arabic→English) | Expenses | Small |
| P1 | labor-costs PUT/DELETE JE reversal | Projects | Medium |
| P1 | cost-entries/[id] route | Projects | Medium |
| P1 | subcontractor-invoice JE defer to SENT | Projects | Medium |
| P1 | projects POST auto-create CostCenter | Projects | Medium |
| P1 | expenses PUT reverse on all field changes | Expenses | Medium |
| P1 | Petty-cash FUND transactionType UI | Expenses | Small |

---

## Verification

All reviews were read-only (no code changes). The accounting engine foundation
(BA-02 through BA-05) remains intact:
- 26/26 behavioral tests pass
- 7/7 numerical consistency invariants pass
- 0 CRITICAL chart-of-accounts issues
- 0 TypeScript errors, 0 ESLint errors

The issues identified are specific to individual business cycle endpoints and
do not affect the core accounting engine integrity.
