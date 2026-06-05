# Task 4 - Accounting Integration Agent

## Task
Connect existing business API routes to the accounting engine so that every business transaction automatically creates journal entries.

## Summary of Changes

### Routes Updated (7 files)

1. **`/api/sales-invoices/route.ts`** — Added `autoEntrySalesInvoice()` after invoice creation
   - Maps: invoiceNo, clientId, subtotal, vatRate, vatAmount, totalAmount, invoiceType, date, projectId

2. **`/api/purchase-invoices/route.ts`** — Added `autoEntryPurchaseInvoice()` after invoice creation
   - Maps: invoiceNo, supplierId, subtotal, vatRate, vatAmount, totalAmount, date, expenseCategory

3. **`/api/progress-claims/route.ts`** — Added `autoEntryProgressClaim()` after claim creation
   - Maps: claimNo, projectId, contractId, amount, vatRate, vatAmount, totalAmount, date

4. **`/api/expenses/route.ts`** — Added `autoEntryExpense()` after expense creation
   - Maps: description, amount, vatAmount, category, date, payFrom (default 'TREASURY'), costCenterId

5. **`/api/petty-cash/route.ts`** — Added `autoEntryPettyCash()` after petty cash creation
   - Maps: description, amount, category (default 'OTHER'), date

6. **`/api/advances/route.ts`** — Added `autoEntryEmployeeAdvance()` in POST + `autoEntryAdvanceSettlement()` in new PUT handler
   - POST maps: employeeName, amount, date
   - PUT maps: employeeName, settledAmount, date (new settlement endpoint)

7. **`/api/subcontractor-invoices/route.ts`** — Added `autoEntrySubcontractorInvoice()` after invoice creation
   - Maps: invoiceNo, subcontractorName, amount, vatRate, vatAmount, totalAmount, date, costCenterId

### Skipped
- `/api/supplier-invoices/route.ts` — File does not exist

### Pattern Applied
Each route follows the same pattern:
1. Import `autoEntryXxx` and `initializeChartOfAccounts` from `@/lib/accounting/engine`
2. After successful business record creation, wrap accounting call in try/catch
3. Call `initializeChartOfAccounts()` first (ensures chart of accounts exists)
4. Call the appropriate auto-entry function with mapped business data
5. If accounting fails, log error but don't fail the business transaction

### Verification
- Lint passes (only pre-existing error in take-screenshots.mjs)
- Dev server running correctly
- All routes compile and serve requests properly
