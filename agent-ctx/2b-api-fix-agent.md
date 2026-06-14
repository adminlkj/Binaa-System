# Task 2b: API Fix Agent

## Summary
Fixed three critical API issues in the بِنَاء ERP system.

## Changes Made

### 1. VAT State Machine Unification (`/src/app/api/vat/[id]/route.ts`)
- Changed validTransitions from `DRAFT → CREATED → DUE → PAID` to `DRAFT → FILED → PAID`
- Added auto `filedDate` when transitioning to FILED
- Updated payment fields to match schema (paymentReference, paymentDate)

### 2. Equipment Timesheets N+1 Fix (`/src/app/api/equipment/timesheets/route.ts`)
- Added `client` include to the rental relation in the initial query
- Replaced `Promise.all` + per-record DB lookups with synchronous `.map()` using pre-fetched data

### 3. Financial Summary N+1 Fix (`/src/app/api/financial-summary/route.ts`)
- Replaced 24+ individual `getAccountBalance()` calls with single `db.journalLine.groupBy()`
- Removed import of heavy accounting engine
- Uses in-memory balanceMap for all balance calculations

### 4. Dashboard Broken Query Fix (`/src/app/api/dashboard/route.ts`)
- Replaced `db.inventoryItem.fields.minQuantity` (Prisma internal API) with `$queryRaw`
- Raw SQL: `SELECT COUNT(*) FROM InventoryItem WHERE quantity <= minQuantity AND isActive = 1`

## Files Modified
- `/src/app/api/vat/[id]/route.ts`
- `/src/app/api/equipment/timesheets/route.ts`
- `/src/app/api/financial-summary/route.ts`
- `/src/app/api/dashboard/route.ts`
