# Module Components Build - Task Complete

## Summary
Built 6 complete module components for the Binaa ERP construction management system with full bilingual support (Arabic/English), ModuleLayout, MoneyDisplay, TanStack Query, and shadcn/ui.

## Files Created/Modified

### Module Components (6 files)
1. **src/components/modules/expenses.tsx** - Expenses Module (المصروفات)
   - Project vs Administrative expense toggle with type-specific categories
   - Pay From field (TREASURY/BANK/PETTY_CASH) with icons
   - VAT auto-calculation at 15%
   - Total = Amount + VAT
   - Summary cards, filters, bilingual

2. **src/components/modules/purchases.tsx** - Purchases Module (المشتريات)
   - 3 tabs: Purchase Requests (طلبات الشراء), Purchase Orders (أوامر الشراء), Supplier Invoices (فواتير الموردين)
   - Line items with add/remove
   - Project field on invoices for cost tracking
   - Expense category for accounting mapping
   - Bilingual status labels and colors

3. **src/components/modules/petty-cash.tsx** - Petty Cash Module (الصندوق النقدي)
   - Branch selection, category, reference
   - MoneyDisplay for amounts
   - ModuleLayout wrapper, bilingual

4. **src/components/modules/advances.tsx** - Advances Module (العهد والسلف)
   - Employee selection, settlement dialog
   - Status badges: PENDING → PARTIALLY_SETTLED → SETTLED
   - MoneyDisplay throughout, bilingual

5. **src/components/modules/labor.tsx** - Labor Costs Module (تكاليف العمالة)
   - Auto-calc: Workers × Days × Daily Rate = Total
   - Project filter, summary cards
   - MoneyDisplay, bilingual

6. **src/components/modules/boq.tsx** - BOQ Module (جدول الكميات)
   - Grouped by category with subtotals
   - Auto-calc: Quantity × Unit Price = Total
   - Project filter, search by code/description/category
   - MoneyDisplay, bilingual

### API Routes (2 new, 2 modified)
- **src/app/api/purchase-requests/route.ts** - NEW: GET/POST with auto-numbering (PR-0001)
- **src/app/api/expenses/route.ts** - MODIFIED: Added payFrom and totalAmount fields
- **src/app/api/purchase-invoices/route.ts** - MODIFIED: Added projectId and expenseCategory, included project relation

## Key Improvements Over Previous Versions
- All modules now use `ModuleLayout` from shared components
- All monetary values rendered with `MoneyDisplay` component
- Full bilingual support (Arabic/English) using `lang` from `useAppStore()`
- `t()` helper function pattern for consistent bilingual text
- Purchases module now has 3 tabs including Purchase Requests
- Expenses module includes payFrom and auto-calculated total
- Purchase invoices include project and expense category fields
