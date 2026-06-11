# Task 3 - Chart of Accounts Rebuilder

## Summary
Rebuilt the Chart of Accounts template in the accounting engine with 147 comprehensive accounts following Saudi SOCPA standards, supporting both Construction Projects and Equipment Rental activities.

## Files Modified
1. `prisma/schema.prisma` - Added 4 new fields to Account model (activityType, isSystem, allowPosting, level)
2. `src/lib/accounting/engine.ts` - Complete rebuild with 147 accounts, updated interfaces, updated auto-entry functions, and 10 new auto-entry functions
3. `worklog.md` - Appended work record

## Key Changes

### AccountTemplate Interface
- Added `activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'`
- Added `isSystem?: boolean`
- Added `allowPosting?: boolean`
- Added `level?: number`

### Chart of Accounts (147 accounts)
- 1xxx Current Assets (27 accounts)
- 2xxx Non-Current Assets (17 accounts)
- 3xxx Current Liabilities (23 accounts)
- 4xxx Non-Current Liabilities (5 accounts)
- 5xxx Equity (7 accounts)
- 6xxx Revenue (15 accounts)
- 7xxx Direct Costs (20 accounts)
- 8xxx Indirect Costs (37 accounts)

### New Auto-Entry Functions (10)
1. autoEntrySalary
2. autoEntryGOSI
3. autoEntryDepreciation
4. autoEntryRentalDepreciation
5. autoEntryDeliveryFees
6. autoEntryContractAdvance
7. autoEntryRetention
8. autoEntryZakat
9. autoEntryEndOfService
10. autoEntryAssetDisposal

### Updated Functions
- ensureAccountExists: Now updates existing accounts with new fields
- initializeChartOfAccounts: Now re-runnable, updates existing accounts
- All auto-entry functions: Updated account codes to new SOCPA codes
- categoryMap: Updated in autoEntryPurchaseInvoice, autoEntryExpense, autoEntryPettyCash

## Verification
- `bun run db:push` - Success
- `bun run lint` - Passes (only pre-existing error in take-screenshots.mjs)
- Dev server running without errors
