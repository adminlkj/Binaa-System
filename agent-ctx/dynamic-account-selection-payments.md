# Task: Dynamic Account Selection for Client & Supplier Payments

## Summary
Updated the Client Payments and Supplier Payments screens to use dynamic account selection from the Chart of Accounts instead of hardcoded radio buttons, with full backend support including Prisma schema, API routes, and auto-journal integration.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- **ClientPayment model**: Added `receivingAccountId`, `receivingAccountCode`, `receivingAccountName` (all optional String fields)
- **SupplierPayment model**: Added `payingAccountId`, `payingAccountCode`, `payingAccountName` (all optional String fields)
- These fields store the Chart of Accounts reference for the cash/bank account used in each payment

### 2. Client Payments API (`src/app/api/client-payments/route.ts` + `[id]/route.ts`)
- **POST**: Now extracts and saves `receivingAccountId`, `receivingAccountCode`, `receivingAccountName` from request body
- **PATCH**: Updated both the posted (reverse+recreate) and non-posted update paths to handle the new account fields

### 3. Supplier Payments API (`src/app/api/supplier-payments/route.ts` + `[id]/route.ts`)
- **POST**: Now extracts and saves `payingAccountId`, `payingAccountCode`, `payingAccountName` from request body
- **PUT**: Updated both the posted and non-posted update paths to handle the new account fields

### 4. Auto-Journal (`src/lib/auto-journal.ts`)
- **createClientPaymentJournalEntry**: Uses `payment.receivingAccountId` to find the receiving account when available, falls back to hardcoded account code '1102' (treasury)
- **createSupplierPaymentJournalEntry**: Uses `payment.payingAccountId` to find the paying account when available, falls back to hardcoded account code '1102' (treasury)

### 5. Frontend (No changes needed)
Both `client-payments.tsx` and `supplier-payments.tsx` already had:
- `AccountSelector` component with roles `['CASH', 'BANK']` replacing old radio buttons
- `JePreview` component showing the expected journal entry
- Auto-population of `receivedIn`/`paidFrom` from the selected account's role for backward compatibility
- Proper state management for `receivingAccountId/Code/Name` and `payingAccountId/Code/Name`

Minor cleanup: Removed unused `JePreviewLine` type import from `client-payments.tsx`

## Backward Compatibility
- The `receivedIn` field (ClientPayment) and `paidFrom` field (SupplierPayment) are still populated from the selected account's role
- When no account is explicitly selected, the auto-journal falls back to the hardcoded treasury account (code '1102')
- Existing payments without the new fields continue to work as before

## Database
- Schema was pushed successfully with `bun run db:push`
- All new columns are optional (nullable), so existing data is not affected
