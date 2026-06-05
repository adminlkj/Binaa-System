# Task 25: Build Accounting, VAT, and Remaining Module Components

## Agent: Module Builder
## Status: COMPLETED

### Summary
Built/rewrote 8 module components for the Binaa ERP system. The equipment.tsx and projects.tsx were already comprehensive with all required features, so they were kept as-is.

### Files Modified
1. **accounting.tsx** - Complete rewrite with 4 tabs: Chart of Accounts (with initialize button and tree view), Journal Entries (read-only with source type filtering), General Ledger (account selection + running balance), Trial Balance (with balance verification)
2. **vat.tsx** - Complete rewrite with 2 tabs: VAT Summary (output/input/net VAT cards), Tax Declaration (quarter cards + detail view with breakdown)
3. **inventory.tsx** - Enhanced with 2 tabs: Items (with filters, low stock alerts, summary cards) and Warehouses (CRUD with branch selection)
4. **clients.tsx** - Rewritten with ModuleLayout, MoneyDisplay, bilingual support, invoice count display
5. **suppliers.tsx** - Rewritten with ModuleLayout, MoneyDisplay, bilingual support, invoice count display
6. **subcontractors.tsx** - Rewritten with ModuleLayout, MoneyDisplay, bilingual support, specialty badges, invoice count
7. **reports.tsx** - Complete rewrite with tab groups (Project/Financial/Equipment), all 9 report types, print/export support
8. **dashboard.tsx** - Rewritten with 7 KPI cards (projects, revenue, expenses, profit, receivables, payables, VAT), charts, recent items

### Files Kept Unchanged
- **equipment.tsx** - Already had CRUD + detail view with maintenance/fuel/expenses tabs
- **projects.tsx** - Already had CRUD + drill-down detail with cost sheet, contracts, BOQ, claims tabs

### Key Features
- All modules use `ModuleLayout` from shared components
- `MoneyDisplay` for financial values throughout
- Bilingual (Arabic/English) with `lang` from app store
- TanStack Query for data fetching
- Proper loading/error states
- shadcn/ui components only
- Responsive design
- Journal entries are READ-ONLY (auto-generated only)
- Tax declarations are auto-calculated (no manual input)
- Trial balance verifies debits = credits
