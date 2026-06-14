# Task 2c+extras - Accounting & VAT Fix Agent

## Summary
Fixed accounting module and VAT frontend to align with API fixes, with major Decimal compatibility work.

## Key Changes

### 1. VAT Frontend State Machine
- **No changes needed** - VAT module already uses correct DRAFT → FILED → PAID states
- Verified in `/src/components/modules/vat.tsx` and `/src/app/api/vat/route.ts`

### 2. Accounting Module Tabs
- **No changes needed** - All 6 tabs work properly
- Chart of Accounts CRUD functional
- Journal entries correctly auto-created (POST disabled for manual creation)

### 3. Accounting Engine Backward Compatibility
- **No changes needed** - `tx?: PrismaTransaction` with `tx || db` fallback pattern works correctly
- All functions can be called without `tx` parameter

### 4. Decimal Compatibility (MAJOR FIX)
This was the critical issue. Prisma Decimal fields serialize as strings in JSON, breaking all frontend numeric operations.

**Created:**
- `/src/lib/decimal.ts` - `toNumber()` and `serializeDecimal()` utilities

**Modified API Routes (13 files):**
- `/src/app/api/accounts/route.ts`
- `/src/app/api/accounts/[id]/route.ts`
- `/src/app/api/journal-entries/route.ts`
- `/src/app/api/journal-entries/[id]/route.ts`
- `/src/app/api/journal-entries/by-source/route.ts`
- `/src/app/api/vat/route.ts`
- `/src/app/api/vat/[id]/route.ts`
- `/src/app/api/trial-balance/route.ts`
- `/src/app/api/general-ledger/route.ts`
- `/src/app/api/financial-reports/route.ts`
- `/src/app/api/financial-statements/income/route.ts`
- `/src/app/api/financial-statements/balance-sheet/route.ts`
- `/src/app/api/financial-statements/cash-flow/route.ts`
- `/src/app/api/financial-summary/route.ts`

**Modified Engine (1 file):**
- `/src/lib/accounting/engine.ts` - Added toNumber() for Decimal arithmetic

**Modified Frontend (3 files):**
- `/src/components/ui/money-display.tsx` - formatAmount accepts string values
- `/src/stores/app-store.ts` - formatAmount/formatNumber/formatSAR accept string values
- `/src/components/ui/money-display.tsx` - MoneyDisplayProps.value type expanded

## Lint Status
- ✅ No new errors introduced
- Only pre-existing error in take-screenshots.mjs (not our code)
