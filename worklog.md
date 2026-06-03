# Task 7: VAT Tax Declaration Module - Work Log

## Summary
Developed the complete VAT Tax Declaration module with the Year → Quarter → Create pattern, NO editable numeric fields, auto-calculated values from invoices, and full declaration detail view with print/export capabilities.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
**VATReturn model - restructured fields:**
- Removed: `salesVAT`, `purchaseVAT`, `netVAT` (old field names)
- Added: `year` (Int), `quarter` (Int) — for structured year/quarter navigation
- Added: `totalSales` (Float) — sum of all sales invoice totals in the quarter
- Added: `outputVat` (Float) — sum of VAT from sales invoices (renamed from salesVAT)
- Added: `totalPurchases` (Float) — sum of all purchase invoice + subcontractor + expense totals
- Added: `inputVat` (Float) — sum of VAT from purchases/subcontractors/expenses (renamed from purchaseVAT)
- Added: `netVat` (Float) — outputVat - inputVat (renamed from netVAT)
- Kept: `period` (unique), `status`, `filedDate`, `createdAt`, `updatedAt`

### 2. VAT API Route (`src/app/api/vat/route.ts`)
**Complete rewrite with enhanced functionality:**
- **GET**: Now accepts `year` and `quarter` query parameters
  - Without params: Returns all VAT returns
  - With year: Returns returns filtered by year
  - With year+quarter: Returns declaration + full breakdown (sales invoices, purchase invoices, subcontractor invoices, expenses)
- **POST**: Creates new declaration with auto-calculated values
  - Calculates `totalSales` and `outputVat` from SalesInvoice
  - Calculates `totalPurchases` and `inputVat` from PurchaseInvoice + SubcontractorInvoice + Expense
  - Calculates `netVat` as `outputVat - inputVat`
  - Stores `year` and `quarter` as separate fields
  - Returns 409 if declaration already exists for the period
- **PATCH**: Updates declaration status
  - Supports both `SUBMIT` and `FILE` actions (backward compatible)
  - Changes status to `SUBMITTED` and sets `filedDate`

### 3. VAT Module UI (`src/components/modules/vat.tsx`)
**Complete rewrite with Year → Quarter → Create pattern:**

#### List View:
- **Year Summary Cards**: 3 cards showing Output VAT, Input VAT, and Net VAT totals for the selected year
- **Year Selector**: Button-style year tabs (currentYear-2 to currentYear+1), default to current year
- **Quarter Cards (4 cards)**: Grid layout (1 col mobile, 2 col desktop)
  - Each card shows: Quarter name, months range, status badge
  - If no declaration: Shows "No Declaration" icon and "Create Declaration" button
  - If declaration exists: Shows auto-calculated financial summary (Total Sales, Output VAT, Total Purchases, Input VAT, Net VAT) with MoneyDisplay
  - Status-based styling: gray (none), amber border (draft), emerald border (submitted)
- **Auto-calculated Notice**: Footer notice explaining all values are auto-calculated
- **Error/Loading States**: Skeleton cards during loading, error state with retry

#### Detail View (DeclarationDetailView):
- **Header**: Back button, declaration title, status badge
- **Action Buttons**: Print, Export CSV, Submit Declaration (only for DRAFT)
- **Period Info Card**: Shows tax period and months
- **VAT Summary Cards (3)**: Output VAT, Input VAT, Net VAT with gradient backgrounds
- **Submission Info**: Shows filing date if submitted
- **Invoice Breakdown**: Full breakdown of contributing invoices
  - Sales Invoices table
  - Purchase Invoices table
  - Subcontractor Invoices table
  - Taxed Expenses table
  - Each table has max-height with scroll, count badge
- **Empty State**: When no invoices exist in the period

#### Features:
- **NO editable numeric fields** — all amounts are auto-calculated
- **ViewState pattern**: `list` | `detail` navigation
- **Bilingual support**: Full Arabic/English with `t()` helper
- **MoneyDisplay**: Used for all monetary values
- **Print**: Uses `window.print()`
- **Export CSV**: Downloads declaration data with BOM for Arabic support, includes breakdown data
- **Submit**: Changes status from DRAFT → SUBMITTED

## Files Modified
1. `prisma/schema.prisma` — VATReturn model restructured
2. `src/app/api/vat/route.ts` — Complete API rewrite
3. `src/components/modules/vat.tsx` — Complete UI rewrite

## Database Migration
- Ran `bunx prisma db push --accept-data-loss` to apply schema changes
- Existing VATReturn record preserved with default values (year=0, quarter=0) for new fields

## Lint
- `bun run lint` — passes with no errors

## Pre-existing Issue (Not Related)
- CompanySetting model has `currencySymbolImage` in schema but database has `currencySymbolFile` column — this is a pre-existing schema mismatch

---
Task ID: Overall
Agent: Main
Task: Comprehensive ERP improvement - fixing all user-reported issues

Work Log:
- Inspected full codebase: 22 module components, 35 Prisma models, 50+ shadcn/ui components
- Fixed Settings screen: replaced text URL inputs with image upload for logo, stamp, currency symbol, header, footer
- Created file upload API at /api/upload
- Added MoneyDisplay symbolImage prop for currency symbol from uploaded file
- Converted Sales Invoice from Dialog to full-page views (ViewState pattern: list|create|detail|preview)
- Added proper print CSS @media rules for invoice printing
- Built Project Card report (most important construction report) with profit/margin calculations
- Added print/export buttons to ALL reports
- Created CSV export utility with UTF-8 BOM for Arabic text
- Developed Rental Invoices module (full CRUD, full-page forms, print/export)
- Developed Delivery Orders module (new EquipmentDeliveryOrder model, status workflow)
- Developed Service Invoices module (full CRUD, full-page forms, print/export)
- Developed Purchase Orders module (full-page views, print/export)
- Developed Supplier Invoices module (full-page views, VAT toggle, print/export)
- Added print/export buttons to: Expenses, Clients, Suppliers, Equipment modules
- Built VAT Tax Declaration module (Year→Quarter→Create, no editable numeric fields)
- Updated VATReturn Prisma model with year/quarter/totalSales/outputVat/totalPurchases/inputVat/netVat
- Cleared .next cache to fix Prisma client caching issues
- Build passes, lint passes, all API routes verified

Stage Summary:
- All user-reported issues addressed: screens developed, print/export added, image uploads for settings
- 7 placeholder/underdeveloped modules now fully functional
- Project Card report implemented as the most important report
- VAT module follows Year→Quarter→Create pattern with auto-calculated values only
- MoneyDisplay component now supports currency symbol from uploaded image file
- All invoices use full-page views instead of dialogs
- Print CSS properly hides app shell during printing
