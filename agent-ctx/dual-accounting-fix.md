# Dual Accounting System Fix - Work Record

## Task: Fix dual accounting system in Binaa ERP

## Summary
Fixed the competing account code systems between `auto-journal.ts` and `engine.ts` by:
1. Updating all account codes in `auto-journal.ts` to match SOCPA-compliant codes from `engine.ts`
2. Adding deprecation comments to all functions in `auto-journal.ts`
3. Adding `payLater` support to `autoEntryExpense()` in `engine.ts`
4. Refactoring `autoEntrySalary()` in `engine.ts` to support accrual-based accounting
5. Fixing wrong account code `1121` in `salary-payments/route.ts` and migrating to use `autoEntrySalary()`

## Files Modified

### 1. `src/lib/auto-journal.ts`
- **Header**: Added comprehensive deprecation notice with migration guide and account code mapping table
- **`createSalesInvoiceJournalEntry()`**: Added `@deprecated` JSDoc, updated codes: `1101→1210`, `4102→6210`, `4101→6110`, `2102→3110`
- **`createPurchaseInvoiceJournalEntry()`**: Added `@deprecated` JSDoc, updated codes: `5101→7110`, `5102→7210`, `1104→3120`, `2101→3210`
- **`createClientPaymentJournalEntry()`**: Added `@deprecated` JSDoc, updated codes: `1102→1110/1120` (with BANK detection), `1101→1210`
- **`createSupplierPaymentJournalEntry()`**: Added `@deprecated` JSDoc, updated codes: `2101→3210`, `1102→1110/1120` (with paidFrom BANK detection)
- **`createExpenseJournalEntry()`**: Added `@deprecated` JSDoc, replaced simple project-based cost mapping with full category-based mapping consistent with engine.ts, updated codes: `5101→7110`, `5102→7210`, `1104→3120`, `1102→1110/1120/1130` (with payFrom support)

### 2. `src/lib/accounting/engine.ts`
- **`autoEntryExpense()`**: Added `payLater?: boolean` parameter. When `payLater=true`, credits Suppliers Payable (3210) instead of Cash/Bank. Updated docstring to document both modes.
- **`autoEntrySalary()`**: Complete refactor to support three modes:
  - **Accrual mode** (`accrualOnly: true`): Dr Salaries & Wages (8110), Dr GOSI Expense (8210), Cr Salaries Payable (3310), Cr GOSI Payable (3830)
  - **Payment mode** (`accrualOnly: false`): Dr Salaries Payable (3310), Cr Cash/Bank (1110/1120)
  - **Full combined mode** (default, backward compatible): Original behavior preserved

### 3. `src/app/api/salary-payments/route.ts`
- Changed import from `createJournalEntry` to `autoEntrySalary` from engine.ts
- Fixed wrong account code `1121` → now uses `autoEntrySalary` which correctly uses `1120` for BANK
- Both create and update paths now use `autoEntrySalary({ accrualOnly: false })` for the payment step

## Account Code Mapping Applied (old → SOCPA)
| Old Code | Old Name | New Code | New Name |
|----------|----------|----------|----------|
| 1101 | Clients | 1210 | Clients Receivable |
| 1102 | Treasury | 1110/1120/1130 | Cash/Bank/Petty Cash (contextual) |
| 1104 | Input VAT | 3120 | Input VAT |
| 2101 | Suppliers | 3210 | Suppliers Payable |
| 2102 | Output VAT | 3110 | Output VAT |
| 4101 | Project Revenue | 6110 | Construction Revenue |
| 4102 | Rental Revenue | 6210 | Rental Revenue |
| 5101 | Project Cost | 7110 | Project Costs |
| 5102 | Rental Cost | 7210 | Rental Costs |

## Issues Found & Fixed
1. **`1121` account code in salary-payments route**: This code doesn't exist in the SOCPA chart of accounts. Fixed by migrating to `autoEntrySalary()` which correctly uses `1120` for bank payments.
2. **auto-journal.ts expense function**: Was only using project-based cost codes (5101/5102). Updated to use category-based mapping identical to engine.ts for consistency.
3. **auto-journal.ts client/supplier payments**: Always used code `1102` (Treasury) regardless of payment method. Updated to detect BANK/PANK/PETTY_CASH and use appropriate account codes.

## Verification
- `bun run lint` passed with no errors
- No remaining references to old account codes (1101, 1102, 1104, 2101, 2102, 4101, 4102, 5101, 5102) in source
- No remaining references to wrong code `1121`
- Dev server running without errors
