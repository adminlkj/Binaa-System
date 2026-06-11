# Task 4 - Fix Equipment Expenses API + Rebuild Rental Section

## Work Log

### Part 1: Fix Equipment Expenses API

1. **Added `journalEntryId` field to EquipmentExpense model** in Prisma schema
   - Added `journalEntryId String?` field between `reference` and `createdAt`
   - Ran `bun run db:push` to sync schema with database
   - Prisma Client regenerated successfully

2. **Updated Equipment Expenses API** (`/src/app/api/equipment/expenses/route.ts`)
   - Added import for `autoEntryEquipmentCost` from `@/lib/accounting/engine`
   - Created `mapCategoryToCostType()` function to map ExpenseCategory to costType:
     - MAINTENANCE → 'MAINTENANCE'
     - FUEL → 'FUEL'
     - TRANSPORT → 'OTHER'
     - DELIVERY → 'OTHER'
     - Other categories → 'OTHER'
   - POST handler now:
     1. Creates the equipment expense record
     2. Calls `autoEntryEquipmentCost()` with mapped costType, payFrom, costCenterId
     3. Stores the returned `journalEntryId` on the EquipmentExpense record
     4. Re-fetches the expense to include journalEntryId in response
     5. Accounting errors are caught and logged but don't fail the expense creation
   - GET handler unchanged (returns journalEntryId via Prisma include)

### Part 2: Rebuild Rental Section

1. **Updated app-store sub-module labels** (`/src/stores/app-store.ts`)
   - Added 5 rental sub-tab labels:
     - `rental-contracts`: عقود التأجير / Rental Contracts
     - `rental-delivery-orders`: أوامر التسليم / Delivery Orders
     - `rental-timesheets`: ساعات العمل / Timesheets
     - `rental-invoices`: الفواتير / Invoices
     - `rental-collections`: التحصيلات / Collections

2. **Rebuilt Rental Section** (`/src/components/sections/rental-section.tsx`)
   - **5-tab layout** matching the complete rental workflow:
     Contract → Delivery Order → Timesheet → Invoice → Collection

   - **AccountingEntryDisplay component**:
     - Expandable section that fetches and shows journal entry lines
     - Shows account code, name (bilingual), debit/credit amounts
     - Used in Collections tab for viewing payment entries

   - **AccountingInfoBanner component**:
     - Shows at the top of each tab explaining the accounting impact
     - Expandable with debit/credit account details
     - Each tab explains which accounts are debited/credited
     - Contracts: DR Clients Receivable (1210) / CR Rental Revenue (6210)
     - Delivery Orders: No direct entry (recorded upon invoicing)
     - Timesheets: No direct entry (recorded upon invoicing)
     - Invoices: DR Clients Receivable (1210) / CR Rental Revenue (6210) + VAT Payable (3200)
     - Collections: DR Treasury/Bank (1110/1120) / CR Clients Receivable (1210)

   - **CollectionsModule component** (new):
     - Fetches client payments linked to rental invoices
     - Summary card with total collected amount and payment count
     - Table showing: Client, Invoice badge, Amount, Date, Received In, Reference, Actions
     - Create Collection dialog with:
       - Client selector
       - Rental invoice selector (filtered by client, excluding PAID/CANCELLED)
       - Auto-fills remaining amount from selected invoice
       - Received In (Treasury/Bank), Reference, Notes fields
       - **Accounting Entry Preview** showing the auto journal entry that will be created
     - View accounting entry dialog for each payment
     - Delete confirmation dialog
     - Full bilingual support

   - **Tab content integration**:
     - rental-contracts → ContractsModule (existing)
     - rental-delivery-orders → DeliveryOrdersModule (existing)
     - rental-timesheets → TimesheetsModule (existing)
     - rental-invoices → RentalInvoicesModule (existing)
     - rental-collections → CollectionsModule (new)

   - All labels use `t(ar, en, lang)` bilingual pattern
   - Uses MoneyDisplay for amounts, StatusBadge for statuses
   - Uses SectionLayout for tab navigation, ModuleLayout for individual tabs

### Verification

- Lint: Only pre-existing errors (take-screenshots.mjs) and one warning (unused eslint-disable)
- All API endpoints returning 200: equipment/expenses, client-payments, sales-invoices?invoiceType=RENTAL
- Database schema synced with journalEntryId field on EquipmentExpense
- Dev server running without errors
