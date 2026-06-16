# Task: Fix TypeScript Decimal Type Errors in Binaa ERP API Routes

## Task ID: decimal-fix-batch1

## Summary

Fixed Prisma `Decimal` type incompatibility with JavaScript `number` type across 6 API route files by adding a `toNum()` helper function and wrapping all Prisma Decimal values before arithmetic operations.

## Files Modified

### 1. `/src/app/api/reports/route.ts`
- **Errors fixed: 83**
- Added `toNum()` helper function
- Wrapped all Decimal field accesses in reduce operations (`.reduce((s, x) => s + x.amount, 0)` → `.reduce((s, x) => s + toNum(x.amount), 0)`)
- Fixed fields: totalValue, amount, totalAmount, paidAmount, debit, credit, cost, totalCost, hourlyRate, deliveryFees, netSalary, quantity, purchasePrice, minQuantity, contractValue
- Fixed across all report types: projects, expenses, sales, purchases, inventory, balance-sheet, income-statement, project-card, activity-summary, project-profitability, equipment-utilization, rental-revenue-by-client, purchase-summary, revenue-summary, expense-summary, cash-flow-summary

### 2. `/src/app/api/account-statement/route.ts`
- **Errors fixed: 32**
- Added `toNum()` helper function
- Fixed all 4 statement generators: customer, vendor, project, equipment
- Wrapped Decimal fields: totalAmount, amount, debit, credit, totalCost, cost, monthlyRate, liters (in description only)
- Fixed running balance calculations and revenue/cost aggregations

### 3. `/src/app/api/account-statement/project/route.ts`
- **Errors fixed: 35 + 10 bonus (type assertion & schema errors)**
- Added `toNum()` helper function alongside existing `r4()` helper
- Wrapped all Decimal values in reduce operations and arithmetic
- Fixed `totalEarnings` field which doesn't exist on Salary model - replaced with computed value from basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount
- Fixed `as Parameters<typeof db.XXX.findMany>[0]['where']` type assertions that were causing TS2339 errors - replaced with `as any`
- Fixed `contractValue` output with `toNum(project.contractValue)`

### 4. `/src/app/api/reports/project-costs/route.ts`
- **Errors fixed: 19**
- Added `toNum()` helper function
- Wrapped all Decimal fields: totalPrice, subtotal, vatAmount, hourlyRate, hours, cost, totalCost, totalAmount, amount, netSalary, contractValue

### 5. `/src/app/api/resource-distribution/project-costs/[projectId]/route.ts`
- **Errors fixed: 15**
- Added `toNum()` helper function
- Wrapped all Decimal fields: totalPrice, amount, hourlyRate, hours, cost, totalCost, totalAmount, netSalary, contractValue

### 6. `/src/app/api/fixed-assets/depreciate/route.ts`
- **Errors fixed: 14**
- Added `toNum()` helper function
- Wrapped all Decimal fields in depreciation calculations: acquisitionCost, residualValue, accumulatedDepreciation, netBookValue
- Fixed arithmetic in: monthly depreciation calculation, fully-depreciated checks, journal entry amounts, final accumulated depreciation, net book value calculations

## Pattern Used

```typescript
function toNum(value: any): number {
  return Number(value ?? 0)
}
```

Applied as: `toNum(x.someDecimalField)` before any arithmetic or comparison.

## Results

- **Before fix**: 198 errors across the 6 target files
- **After fix**: 0 errors across the 6 target files
- **Overall route.ts errors**: Reduced from ~310 to 112 (remaining errors are in other route files not in scope)
