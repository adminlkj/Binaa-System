---
Task ID: 2
Agent: API Fix Agent
Task: Fix API routes with $transaction, validation, accounting auto-entries

Work Log:
- Created `/home/z/my-project/src/lib/auto-journal.ts` with:
  - PrismaTransaction type export
  - createSalesInvoiceJournalEntry() - Debit clients, Credit revenue + output VAT
  - createPurchaseInvoiceJournalEntry() - Debit cost + input VAT, Credit suppliers
  - createClientPaymentJournalEntry() - Debit treasury, Credit clients
  - createSupplierPaymentJournalEntry() - Debit suppliers, Credit treasury
  - createExpenseJournalEntry() - Debit cost + input VAT, Credit treasury
- Fixed sales-invoices/route.ts:
  - Switched from accounting/engine to auto-journal for POST operations
  - Added timesheet.invoiced=true and invoiceId when creating from timesheet
  - Fixed Decimal type issues with toNumber()
  - Added proper error handling with details
- Fixed client-payments/route.ts:
  - Switched from accounting/engine to auto-journal
  - Fixed date filter typing and Decimal arithmetic
  - Already had $transaction, kept it
- Fixed supplier-payments/route.ts:
  - Switched from accounting/engine to auto-journal
  - Fixed Decimal arithmetic with toNumber()
- Fixed purchase-orders/route.ts:
  - Wrapped POST in $transaction for data integrity
  - Added pagination to GET
  - Moved orderNo generation inside transaction
- Fixed expenses/route.ts:
  - Switched from accounting/engine to auto-journal
  - Fixed Decimal arithmetic in PUT handler
  - Added toNumber() for reversal line conversions
- Fixed purchase-invoices/route.ts:
  - Switched from accounting/engine to auto-journal
  - Added pagination to GET
  - Moved invoiceNo generation inside transaction
  - Fixed Decimal arithmetic in PUT handler
- Fixed progress-claims/route.ts:
  - Added pagination to GET
  - Fixed Decimal type issues with toNumber()
  - Already had $transaction
- Fixed equipment/timesheets/[id]/generate-invoice/route.ts:
  - ENFORCED rental workflow: Contract ACTIVE → Delivery Order DELIVERED → Timesheet APPROVED → Not invoiced
  - Added contract status check (must be ACTIVE)
  - Added delivery order existence check (must be DELIVERED)
  - Added timesheet.invoiced flag check
  - Set invoiced=true and invoiceId when marking as INVOICED
  - Switched to auto-journal for accounting entries
  - Moved invoiceNo generation inside transaction
- Fixed supplier-invoices/route.ts:
  - Switched from accounting/engine to auto-journal
  - Fixed Decimal arithmetic with toNumber()
- Added pagination to timesheets/route.ts (both legacy and equipment/timesheets)
- Added pagination to delivery-orders/route.ts
- Added $transaction to delivery-orders PATCH for equipment status updates
- Fixed journal-entries/route.ts error handling
- Fixed all Decimal type issues using toNumber() from @/lib/decimal
- All main route files pass TypeScript type checking and ESLint

Stage Summary:
- Created new auto-journal.ts with 5 journal entry generation functions
- All 10 targeted API routes now use $transaction for data integrity
- Rental workflow enforcement implemented in generate-invoice route
- All routes have consistent error handling with details
- Pagination added to all list endpoints (backward compatible)
- Timesheet invoicing now sets invoiced=true and invoiceId
- All Decimal/number type issues resolved with toNumber()
