# Task: Refactor Financial Reporting to Use Only GL Data

## Agent: Main Agent
## Status: COMPLETED

## Summary
Refactored all 6 financial reporting API routes to use ONLY General Ledger data (journalLine + journalEntry) for financial amounts, replacing hardcoded account codes with role-based lookups and fixing the project statement double-counting bug.

## Files Modified

### 1. `/api/dashboard/route.ts`
- **Removed**: `getAccountBalance()` N+1 calls with hardcoded codes (1210, 3210, 1110, 1120, 1130, 3110, 3120, 3130, etc.)
- **Added**: Role-based account resolution via `getAccountsByRoles()` + single `journalLine.groupBy()` batch query
- **Replaced**: Project profitability from operational tables (expenses, laborCosts, equipmentCosts, purchaseOrders, progressClaims, subcontractorInvoices) → GL-based via costCenterId with REVENUE/EXPENSE accounts
- **Added**: `computeBalanceFromMap()` helper for efficient batch balance computation
- **Added**: `resolveAccountCodes()` helper for dynamic code resolution with fallback defaults

### 2. `/api/reports/route.ts`
- **`projects`**: Replaced operational table sums with `getProjectGLBalances()` 
- **`expenses`**: Kept operational listing + added `glExpenseTotal` from GL for verification
- **`sales`**: Kept operational listing + added `glRevenueTotal` from GL
- **`purchases`**: Kept operational listing + added `glPayableTotal` from GL
- **`balance-sheet`**: Added `journalEntry: { status: 'POSTED' }` filter (was missing!)
- **`income-statement`**: Added `journalEntry: { status: 'POSTED' }` filter (was missing!)
- **`project-card`**: Replaced operational table sums with GL queries by costCenterId
- **`activity-summary`**: Replaced all operational sums (purchase orders, labor, subcontractors, etc.) with GL-based by account type + activity type
- **`project-profitability`**: Replaced operational sums with GL queries + per-project expense breakdown by account role
- **`equipment-utilization`**: Kept operational data (equipment doesn't have direct cost centers)
- **`rental-revenue-by-client`**: Kept operational listing + added `glRentalRevenue` from GL
- **`purchase-summary`**: Kept operational listing + added `glPayableTotal` from GL
- **`revenue-summary`**: Replaced operational sales invoice aggregation with GL REVENUE accounts by activity type
- **`expense-summary`**: Replaced operational expense table with GL EXPENSE accounts grouped by role
- **`cash-flow-summary`**: Replaced operational payment tables with GL CASH/BANK account aggregation

### 3. `/api/financial-summary/route.ts`
- **Removed**: Hardcoded `getBalanceByCode('1210')`, `getBalanceByCode('3210')`, etc.
- **Added**: Role-based account resolution via `getAccountsByRoles()` with fallback defaults
- **Added**: `getBalanceByCodes()` helper for batch computation from pre-fetched balance map

### 4. `/api/financial-reports/route.ts`
- **Income Statement**: Replaced hardcoded code prefix categorization with `accountRole`-based categorization using `getAccountsByRoles()`
- **Cash Flow**: Replaced hardcoded depreciation codes `['8310', '8320', '8330', '8340', '7250']` with role-based `DEPRECIATION_EXPENSE` + `RENTAL_DEPRECIATION` lookup
- **Cash Flow**: Replaced hardcoded cash codes `['1110', '1120', '1130']` with role-based `CASH` + `BANK` lookup

### 5. `/api/financial-statements/cash-flow/route.ts`
- **Replaced**: Hardcoded `cashPrefixes = ['1110', '1120', '1130', '1140']` with role-based CASH/BANK account lookup
- **Replaced**: Hardcoded depreciation account lookup with role-based `DEPRECIATION_EXPENSE` + `RENTAL_DEPRECIATION` lookup
- **Added**: `getBalancesByAccountIds()` and `getBalanceChangeByAccountIds()` helpers for ID-based balance queries

### 6. `/api/account-statement/route.ts`
- **FIXED BUG**: Project statement double-counted revenue (from both GL + operational tables). Now uses ONLY GL data.
- **Removed**: Operational revenue adds (`salesInvoices` + `progressClaims` summation) from project statement
- **Added**: `bookBalance` (رصيد دفتري) from GL for customer and vendor statements
- **Added**: `statementBalance` (رصيد مستخلص) from operations for customer and vendor statements
- **Customer/Vendor**: Kept operational listing for descriptive detail, but clearly separate GL balance from operational balance

## Key Design Decisions
1. **Single batch queries**: Used `journalLine.groupBy()` or `findMany()` + in-memory aggregation instead of N+1 `getAccountBalance()` calls
2. **Role-based fallback**: `resolveAccountCodes()` falls back to default codes when no role-mapped accounts exist
3. **Backward compatibility**: All response shapes preserved; new fields added (glExpenseTotal, bookBalance, etc.)
4. **POSTED filter**: All GL queries now enforce `journalEntry.status = 'POSTED'`
5. **Operational data for descriptions only**: Where operational tables provide useful listing/invoice details, they're kept for display but NOT used for financial totals

## Testing
All API endpoints tested and returning valid responses:
- `/api/dashboard` ✅
- `/api/reports?type=projects` ✅
- `/api/reports?type=balance-sheet` ✅ (now with POSTED filter)
- `/api/reports?type=income-statement` ✅ (now with POSTED filter)
- `/api/reports?type=revenue-summary` ✅
- `/api/reports?type=expense-summary` ✅
- `/api/reports?type=cash-flow-summary` ✅
- `/api/financial-summary` ✅
- `/api/financial-reports?type=income-statement` ✅
- `/api/financial-statements/cash-flow?dateFrom=...&dateTo=...` ✅
- `/api/account-statement?entityType=project&entityId=...` ✅ (no double-counting)
- `/api/account-statement?entityType=customer&entityId=...` ✅ (with bookBalance)
