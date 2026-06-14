# Task 2: Comprehensive Chart of Accounts Update + Auto-Entry Functions + Accounting Mapping Matrix

## Agent: Main (subagent)
## Date: 2024-01-09

## Summary
Updated `/home/z/my-project/src/lib/accounting/engine.ts` with a completely revised chart of accounts, updated auto-entry functions, new payroll/cost allocation functions, and an accounting mapping matrix.

## Key Changes

### 1. Chart of Accounts Template
- **1120 البنوك**: Changed from posting account to parent (allowPosting: false), added 4 bank sub-accounts (1121-1124)
- **1200 الذمم المدينة**: Major restructure with renamed/repurposed/renumbered accounts (1210-1290)
- **1300 المخزون**: Restructured with renamed and repurposed accounts
- **1600 أصول العقود**: Expanded with 4 new accounts (1630-1651)
- **3100 الضرائب**: Expanded with 2 new accounts (3140-3150)
- **7100 تكلفة العقود**: Major restructure with simplified names and repurposed accounts, plus 2 new (7190, 7195)
- **7200 تكاليف المعدات**: Expanded with 4 new accounts (7260-7290)
- **8100 مصروفات إدارية**: Expanded salary accounts (8110-8130), renumbered 8140-8190

### 2. Auto-Entry Function Updates
All functions updated with new account codes and activityType awareness where applicable.

### 3. New Auto-Entry Functions
- `autoEntryPayrollApproval`: For payroll run approval
- `autoEntryPayrollPayment`: For salary payment disbursement
- `autoEntryProjectCostAllocation`: For loading costs to projects

### 4. Accounting Mapping Matrix
- `ACCOUNTING_MAPPING` constant with 16 operation mappings
- `getSalaryAccountCode()` helper
- `getClientReceivableAccountCode()` helper
- `getFuelAccountCode()` helper
- `resolveExpenseAccount()` helper
- `AccountingMappingKey` type

## Verification
- Lint: 0 errors (2 pre-existing warnings only)
- Dev server compiles successfully
