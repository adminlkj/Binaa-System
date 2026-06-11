# Task 5: Client Payments Frontend Module + Fix Construction Workflow

## Work Completed

### Part 1: Client Payments Module

Created `/src/components/modules/client-payments.tsx` with:
- List all client payments with date, client name, amount, receivedIn (TREASURY/BANK), reference
- Add new payment dialog:
  - Select client (from /api/clients)
  - Select invoice (from /api/sales-invoices filtered by clientId and unpaid)
  - Auto-fill amount from invoice remaining balance
  - Date, receivedIn (TREASURY/BANK), reference, notes fields
  - On save: POST to /api/client-payments
- Payment detail dialog showing accounting entry link
- Delete payment (with reversal of journal entry via DELETE /api/client-payments/[id])
- Summary cards: Total Payments, Treasury, Bank
- Filters: Client, Search, Received In (TREASURY/BANK)

### Part 1b: Client Payments API

Created `/src/app/api/client-payments/route.ts`:
- GET: List payments with optional filters (clientId, invoiceId, receivedIn, projectId)
- POST: Create payment with auto accounting entry (autoEntryClientPayment) and invoice status update

Created `/src/app/api/client-payments/[id]/route.ts`:
- GET: Get single payment with relations
- DELETE: Delete payment with journal entry reversal and invoice paidAmount reversal

### Part 2: Fix Construction Workflow in Projects Section

Rebuilt `/src/components/sections/projects-section.tsx` with the proper workflow:

**Contract → Extract (مستخلص) → Sales Invoice → Collection**

New tabs:
1. **Overview Tab**: Financial summary (contract value, invoiced, collected, remaining, costs, profit) + Workflow visual showing the 4-step construction cycle with counts
2. **Contracts Tab**: List contracts linked to this project, with status, value, VAT, claims count
3. **Extracts Tab**: List progress claims (مستخلصات) for this project's contracts, with invoiced flag
4. **Invoices Tab**: List sales invoices generated from extracts (sourceType=EXTRACT) with remaining balance
5. **Costs Tab**: Project card with full cost breakdown and profitability
6. **Collections Tab**: List client payments for this project's invoices
7. **BOQ Tab**: Bill of quantities
8. **Documents Tab**: Placeholder

Each tab shows:
- Accounting entries linked to each transaction (JE badges)
- Proper status badges (DRAFT, SENT, PAID, etc.)
- Remaining balance on invoices
- Project profitability calculation

### Part 3: Fix Progress Claims (Extracts) Module

Updated `/src/components/modules/progress-claims.tsx`:
- Added `invoiced` flag display in the table and detail view
- Shows whether claim has been invoiced (sky badge "مفوتر"/"Invoiced" or amber badge "غير مفوتر"/"Not Invoiced")
- Added "Create Invoice" button for APPROVED uninvoiced claims that navigates to sales module
- Shows the linked sales invoice if invoiced (with invoice number, amount, status)
- Shows the accounting entry for each extract (journalEntryId with auto-entry label)
- Added invoiced/uninvoiced count summary cards
- Status workflow: DRAFT → SUBMITTED → APPROVED → PAID

### Part 4: App Store Updates

Added to `/src/stores/app-store.ts`:
- `SubModuleKey` type (string)
- `subModuleLabels` record with all project sub-tab labels (bilingual)
- `activeSubModule` state property
- `setActiveSubModule` action

### Part 5: Module Router Update

Updated `/src/app/page.tsx`:
- Replaced `PlaceholderModule` with `ClientPaymentsModule` for 'client-payments' route

## Files Modified
- `/src/components/modules/client-payments.tsx` (NEW)
- `/src/app/api/client-payments/route.ts` (NEW)
- `/src/app/api/client-payments/[id]/route.ts` (NEW)
- `/src/components/sections/projects-section.tsx` (REBUILT)
- `/src/components/modules/progress-claims.tsx` (ENHANCED)
- `/src/stores/app-store.ts` (UPDATED - added SubModuleKey, subModuleLabels, activeSubModule)
- `/src/app/page.tsx` (UPDATED - ClientPaymentsModule instead of PlaceholderModule)

## Verification
- ESLint: Only pre-existing error in take-screenshots.mjs
- Dev server: Running without errors
- Client payments API: GET and POST returning 200, GET [id] returning 404 for non-existent
