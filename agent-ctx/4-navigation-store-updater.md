# Task 4: Navigation Store Updater

## Summary
Updated the navigation store (`app-store.ts`) and dependent files for the new invoice workflow design.

## Changes Made

### `/home/z/my-project/src/stores/app-store.ts`
- **NavItem type**: Removed `expenses`, `labor-costs`, `advances`, `petty-cash`. Added `client-payments`.
- **NavGroup type**: Split `sales-purchases` into `sales` and `purchases`. Renamed `projects-costs` to `projects`.
- **navGroups**: Reorganized from 7 to 8 groups:
  1. home → dashboard
  2. sales → sales, extracts, clients, client-payments
  3. purchases → purchases, suppliers, subcontractors, supplier-payments
  4. projects → projects, contracts, boq, timesheets
  5. resources → (unchanged)
  6. supply-chain → (unchanged)
  7. inventory-accounting → (unchanged)
  8. reports-settings → (unchanged)
- **navItemLabels**: Updated `sales` → المبيعات / Sales Invoices, `purchases` → المشتريات / Purchase Invoices, added `client-payments` → تحصيلات العملاء / Client Payments

### `/home/z/my-project/src/components/layout/sidebar.tsx`
- Removed icon mappings for deleted NavItems
- Added `client-payments` icon (CreditCard)
- Updated `expandedGroups` default sets to use new NavGroup names
- Cleaned up unused imports (Receipt, UserCheck, Wallet, ClipboardCheck)

### `/home/z/my-project/src/app/page.tsx`
- Removed module mappings and imports for `expenses`, `labor-costs`, `advances`, `petty-cash`
- Added `client-payments` → PlaceholderModule

## Verification
- Lint passes (only pre-existing error in take-screenshots.mjs)
- Dev server running without errors
- All existing exports preserved
