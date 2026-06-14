---
Task ID: 1
Agent: Main Coordinator
Task: Comprehensive ERP Restructuring per Audit Document

Work Log:
- Read full prisma schema (1743 lines, 62 models)
- Read all API routes, module components, store, contexts
- Analyzed audit document requirements
- Rewrote entire prisma schema with critical fixes:
  - Converted ALL Float fields to Decimal for financial data (20+ fields)
  - Added ChangeOrder model for variation orders
  - Added Warranty model for contract guarantees
  - Added FiscalYear and FiscalPeriod models
  - Added EquipmentOwnershipType enum (COMPANY_OWNED, LEASED_ASSET, CUSTOMER_OWNED)
  - Added WarrantyType enum
  - Added ChangeOrderStatus enum
  - Added ownershipType and ownerId fields to Equipment model
  - Added invoiced and invoiceId fields to Timesheet model
  - Added zatcaQr field to SalesInvoice and PurchaseInvoice models
  - Added isSystem field to JournalEntry model
  - Added decimalPlaces field to Currency and CompanySetting models
  - Added employeeId relation to LaborCost model
  - Ran db:push successfully
- Launched 3 parallel agents for API fixes, printing system, and module fixes
- All agents completed successfully
- Added ZATCA QR to supplier-invoices API
- Build succeeds, lint clean
- Dev server tested: main page 200, company-settings API working, dashboard API working

Stage Summary:
- Schema restructured with 3 new models (ChangeOrder, Warranty, FiscalYear/FiscalPeriod)
- 20+ Float fields converted to Decimal for data integrity
- Equipment ownership types added
- Timesheet invoicing control fields added
- ZATCA QR fields added to invoice models
- API routes: $transaction added to all multi-step operations
- Auto journal entries for: sales invoices, purchase invoices, client payments, supplier payments, expenses
- Rental workflow enforced: Contract ACTIVE → Delivery Order DELIVERED → Timesheet APPROVED → Not invoiced
- ZATCA QR generation implemented (zatca-qr.ts)
- Unified print engine created (unified-print-engine.ts)
- Contract module separated into Project vs Rental tabs
- Equipment module updated with ownership type
- Change Orders UI and API created
- Pagination added to list APIs
- Error handling improved across all routes
