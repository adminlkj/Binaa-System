# Task: Build 5 ERP Module Components for Binaa Construction System

## Summary

Built 5 complete, production-ready module components for the بِنَاء (Binaa) ERP construction management system. All modules follow the established patterns with bilingual support (Arabic/English), RTL support, MoneyDisplay component usage, StatusBadge, ModuleLayout, TanStack Query, and proper CRUD operations.

## Files Modified/Created

### 1. `src/stores/app-store.ts` - Added `formatSAR` export
- **Issue**: The `formatSAR` function was missing from the app-store but was being imported by many modules, causing 500 errors.
- **Fix**: Added `formatSAR(value, lang)` function that formats numbers as Saudi Riyal currency.

### 2. `src/components/modules/contracts.tsx` - CONTRACTS MODULE (عقود التأجير)
- Full CRUD: List view, Create page, Edit page, Detail view
- Client/Project/Equipment dropdowns fetching from their respective APIs
- Rental-specific fields: hourly rate, delivery fees, delivery fees taxable, sales order no., payment terms
- Contract type selection (RENTAL, PROJECT, SERVICE)
- Auto-fill hourly rate from equipment selection
- VAT preview card with MoneyDisplay
- Delete confirmation with AlertDialog
- Bilingual labels with `lang` from useAppStore
- Accounting integration comments for journal entries

### 3. `src/components/modules/sales.tsx` - SALES MODULE (المبيعات)
- SERVICE invoice type module
- Client/project selection with dropdowns
- Dynamic line items (description, quantity, unit, unit price)
- Auto-calculated subtotal, VAT (15%), total
- Status workflow: DRAFT → SENT → PAID with action buttons
- Print button (comment for future print service integration)
- Detail view with items table and financial summary
- Accounting integration: When invoice confirmed, creates journal entries (Debit AR, Credit Revenue + Output VAT)

### 4. `src/components/modules/timesheets.tsx` - TIMESHEETS MODULE (ساعات العمل)
- Equipment rental workflow: linked to active rental contracts only
- Month (1-12) and Year selection
- Operating hours input
- **RULE**: Hourly rate comes from contract ONLY (read-only in timesheet)
- **RULE**: No timesheet without an active contract
- Status workflow: DRAFT → SUBMITTED → APPROVED → INVOICED
- **RULE**: Only APPROVED timesheets can be invoiced
- **RULE**: Once INVOICED, timesheet cannot be modified
- Billing preview with delivery fees and VAT calculations
- Auto-filled contract info display (client, project, equipment, rate, sales order no.)

### 5. `src/components/modules/progress-claims.tsx` - EXTRACTS MODULE (المستخلصات)
- Linked to project and contract
- Completion percentage with cumulative tracking
- **RULE**: Cannot exceed 100% total completion (with warning)
- Auto-calculated amount: Contract Value × Current %
- VAT 15% auto-calculation
- Contract running totals table with progress bars
- Status workflow: DRAFT → SUBMITTED → APPROVED → PARTIALLY_PAID → PAID
- Accounting integration comments for journal entries

### 6. `src/components/modules/rental-invoices.tsx` - RENTAL INVOICES MODULE
- **RULE**: User selects ONLY a Timesheet (APPROVED and not yet invoiced)
- System auto-fills from contract: client, project, equipment, contract no, sales order no, hourly rate, delivery fees, payment terms
- System auto-fills from timesheet: month, year, operating hours
- System auto-calculates: hours × rate = subtotal
- VAT 15% on rental amount
- Delivery fees (with/without VAT based on contract setting)
- **RULE**: Cannot create invoice without an approved timesheet
- **RULE**: Rate is read-only (from contract)
- **RULE**: After invoice creation, timesheet status = INVOICED
- **RULE**: No duplicate invoice for same timesheet
- Blue info notice for available approved timesheets
- CSV export functionality
- Full detail view with contract information section

### 7. `src/app/page.tsx` - Fixed import
- Changed `ExtractsModule` import to `ProgressClaimsModule as ExtractsModule` since the export was renamed.

## Key Design Decisions

1. **formatSAR Fix**: Added the missing `formatSAR` export to app-store.ts to fix 500 errors across all modules
2. **MoneyDisplay Usage**: Used `<MoneyDisplay>` component for all monetary values in the new modules
3. **StatusBadge Usage**: Used `<StatusBadge>` from module-layout for consistent status display
4. **ModuleLayout**: Used `<ModuleLayout>` for consistent header/title/actions layout
5. **Bilingual Pattern**: All text uses `{ ar: '...', en: '...' }` labels with `const t = (ar, en) => lang === 'ar' ? ar : en`
6. **Full-page Forms**: Create/edit forms use full-page view (not dialogs) for better UX
7. **AlertDialog**: Delete confirmations use shadcn AlertDialog component
8. **Business Rules**: All rental workflow rules are enforced in the UI with proper validation and warnings

## Lint Status
- All files pass `bun run lint` with no errors
