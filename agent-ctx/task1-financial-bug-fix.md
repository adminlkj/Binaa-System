# Task 1: Fix Financial Calculation Bug in Dashboard

## Bug Report
The dashboard was showing trillions of SAR for revenue/costs in the "المشاريع التنفيذية" (Executive Projects) section when actual values were only millions.

## Root Cause
**Prisma Decimal string concatenation bug** — Prisma's `Decimal` type has a `valueOf()` method that returns a **string** (by design in `decimal.js` to prevent precision loss). When JavaScript's `+` operator is used between two Prisma Decimal values (or a number and a Decimal), it falls back to string concatenation instead of numeric addition.

### Example of the bug:
```typescript
// Prisma aggregate returns Decimal objects
const claimsTotal = constructionClaimsAgg._sum.totalAmount  // Decimal("3084875")
const salesSubtotal = constructionSalesAgg._sum.subtotal    // Decimal("2445000")

// BUG: String concatenation instead of addition!
const revenue = (claimsTotal || 0) + (salesSubtotal || 0)
// Result: "30848752445000" (string!) instead of 5529875
```

This affected ALL arithmetic operations on Prisma Decimal fields throughout the API route.

## Fix
Added a `toNum()` helper function that safely converts Prisma Decimal values to JavaScript numbers:

```typescript
function toNum(value: { valueOf(): string | number } | null | undefined): number {
  return Number(value ?? 0)
}
```

Applied it to **22 locations** in the API route where Decimal values were used in arithmetic:
- Aggregate `_sum` results (revenue, expenses, costs, contract values)
- `reduce()` operations on Decimal fields from `findMany` with `include`
- Account balance calculations (debit/credit)
- Invoice amount calculations (totalAmount - paidAmount)
- Recent project/rental contract serialization

## Verified Results
| Metric | Before (Bug) | After (Fix) |
|--------|-------------|-------------|
| constructionRevenue | 30,848,752,445,000 | 5,529,875 |
| constructionCosts | 35,500,000,920,000 | 955,500 |
| constructionProfit | -4,651,248,475,000 | 4,574,375 |
| totalContractValue | 9,487,500 | 9,487,500 (unchanged) |
| Project costs (PRJ-001) | 01500085000007245006210000402500517500 | 2,289,000 |

All values are now in the correct order of magnitude and consistent with contract values.

## Files Modified
- `/home/z/my-project/src/app/api/dashboard/route.ts`
