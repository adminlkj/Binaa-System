# Task 3a+3b - Module Fix Agent

## Task: Fix 6 broken/incomplete module components

## Summary
Fixed all 6 module components by adding missing functionality (Edit, Delete, CSV export, toast notifications, PrintButton data) and creating 3 new API routes for CRUD operations that were missing.

## Files Modified

### API Routes Created
- `/src/app/api/boq/[id]/route.ts` - GET, PUT, DELETE for BOQ items
- `/src/app/api/labor-costs/[id]/route.ts` - GET, PUT, DELETE for labor costs
- `/src/app/api/petty-cash/[id]/route.ts` - GET, PUT, DELETE for petty cash (with journal entry reversal on delete)

### Module Components Refactored
1. **rental-payments.tsx** - Complete refactor: added ModuleLayout, EditPaymentDialog, AlertDialog delete, CSV export, toast notifications, print data
2. **boq.tsx** - Added Edit/Delete in form dialog, Actions column, AlertDialog delete, CSV export, toast notifications
3. **labor.tsx** - Added Edit/Delete in form dialog, Actions column, AlertDialog delete, CSV export, PrintButton data, toast notifications
4. **petty-cash.tsx** - Added Edit/Delete in form dialog, posted-entry protection, Actions column, AlertDialog delete, CSV export, toast notifications
5. **inventory.tsx** - Fixed broken "New Item" button by lifting dialog state, added Edit/Delete, Actions column, AlertDialog delete, CSV export, toast notifications, print data
6. **client-payments.tsx** - Added EditPaymentDialog, Edit (Pencil) button, CSV export, toast notifications

## Consistent Pattern Applied
All modules now follow the same pattern:
- ModuleLayout wrapper with title/subtitle/actions
- MoneyDisplay for currency values
- AlertDialog for delete confirmation
- CSV export via `exportToCSV` with Download button
- Toast notifications via `useToast` for all CRUD operations
- React Query invalidation after mutations
- `commonText` for cancel/delete button labels
