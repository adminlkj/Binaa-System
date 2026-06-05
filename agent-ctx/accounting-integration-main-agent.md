# Task: Update API Routes for Accounting Engine Integration

## Agent: Main Agent
## Status: COMPLETED

## Summary of Changes

All 11 API routes were updated to properly integrate with the accounting engine at `/src/lib/accounting/engine.ts`.

### 1. Sales Invoices (`/api/sales-invoices/route.ts`)
- **Store journalEntryId**: After creating journal entry, the `journalEntryId` is now stored on the invoice via `db.salesInvoice.update()`
- **Rental invoices**: When `invoiceType === 'RENTAL'`, uses `autoEntryRentalInvoice` instead of `autoEntrySalesInvoice`
- **PUT endpoint added**: Supports updating invoices with reversal logic - when modifying an approved invoice that has a journal entry, creates a reversal entry + new entry (never modifies original)
- **Cannot modify CANCELLED invoices**

### 2. Purchase Invoices (`/api/purchase-invoices/route.ts`)
- **Store journalEntryId**: Same pattern as sales invoices
- **PUT endpoint added**: Supports reversal + new entry for amount changes on posted invoices
- **Added projectId filter** to GET
- **Cannot modify CANCELLED invoices**

### 3. Progress Claims (`/api/progress-claims/route.ts`)
- **Store journalEntryId**: After creating journal entry, stores the ID
- **PUT endpoint added**: Reversal logic for amount changes on posted claims
- **Auto-recalculates** vatAmount and totalAmount when amount changes
- **Cannot modify REJECTED claims**
- **Added status filter** to GET

### 4. Expenses (`/api/expenses/route.ts`)
- **Store journalEntryId**: After creating journal entry, stores the ID
- **PUT endpoint added**: Reversal logic for amount changes on posted expenses
- **Auto-recalculates** totalAmount when amount or vatAmount changes
- **Handles null vatAmount** correctly

### 5. Accounts Initialize (`/api/accounts/initialize/route.ts`)
- **Already used `initializeChartOfAccounts`** - verified correct
- **Added GET endpoint**: Returns current chart of accounts status with account list and counts
- **Enhanced POST response**: Includes success message in Arabic

### 6. Journal Entries (`/api/journal-entries/route.ts`)
- **Added `sourceType` filter**: Can filter by source type (SALES_INVOICE, PURCHASE_INVOICE, etc.)
- **Returns available source types** in response for UI filtering
- **Disabled manual POST**: Returns 403 with Arabic message explaining entries are auto-generated
- **Kept GET with existing filtering**: status, date range, search, pagination, lines with account details

### 7. Trial Balance (`/api/trial-balance/route.ts`)
- **Already used `getTrialBalance`** - verified correct
- **Added `byType` summary**: Groups results by account type (ASSET, LIABILITY, etc.)

### 8. General Ledger (`/api/general-ledger/route.ts`)
- **Already used `getGeneralLedger` and `getAccountBalance`** - verified correct
- No changes needed, already properly integrated

### 9. VAT Return (`/api/vat/route.ts`)
- **Snapshot IDs stored**: `salesInvoiceIds`, `purchaseInvoiceIds`, `expenseIds` are stored as JSON arrays on creation
- **Proper filing status flow**: DRAFT → FILED → PAID (using correct enum values)
- **FILE action**: Changes status from DRAFT to FILED, records `filedDate`
- **PAY action**: Changes status from FILED to PAID, records `paymentDate` and `paymentReference`
- **Cannot recreate**: Returns 409 if VAT return already exists for the period
- **Meta information**: Returns counts of included documents on creation

### 10. Equipment Timesheets (`/api/equipment/timesheets/route.ts`)
- **PUT endpoint added**: Supports updating timesheets
- **INVOICED lock**: Returns 403 when trying to modify a timesheet with INVOICED status
- **Status validation**: Can only change to INVOICED from APPROVED status
- **Fixed model references**: Uses `db.timesheet` and `db.equipmentRental` (matching Prisma schema)
- **Added rentalId filter** to GET

### 11. Seed Route (`/api/seed/route.ts`)
- **Uses `initializeChartOfAccounts`** from the accounting engine
- **Creates accounting entries for seeded data**: Sales invoices, purchase invoices, progress claims, and expenses all get journal entries via the auto-entry functions
- **Fixed VAT return fields**: Uses correct field names (outputVat, inputVat, totalSales, totalPurchases, etc.) matching the Prisma schema
- **Stores snapshot IDs**: VAT return stores salesInvoiceIds, purchaseInvoiceIds, expenseIds
- **Added cost centers**: Creates cost centers for each project
- **Added equipment and inventory data**
- **Proper deletion order**: Handles all model dependencies correctly

## Key Principles Applied
1. **Every journal entry is balanced** (Debits = Credits) - enforced by the engine
2. **Journal entries are auto-POSTED** - business transactions create POSTED entries
3. **No manual journal entries allowed** - POST on journal-entries returns 403
4. **Reversal pattern for modifications** - when modifying an approved document, creates reversal + new entry
5. **VAT returns are snapshots** - numbers are frozen after creation with document IDs stored
6. **Timesheets are locked when INVOICED** - prevents data integrity issues
