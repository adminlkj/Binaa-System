# Task 3c - Pagination Agent

## Task
Add pagination support to 10 list API endpoints in the بِنَاء (Binaa) ERP system.

## What was done
All 10 endpoints were updated with backward-compatible pagination:

1. **sales-invoices** - Added `page`, `pageSize`, `search` (invoiceNo, notes)
2. **supplier-invoices** - Added `page`, `pageSize`, `search` (invoiceNo, notes)
3. **clients** - Added `page`, `pageSize`, `search` (name, nameAr, code, phone, email)
4. **suppliers** - Added `page`, `pageSize`, `search` (name, nameAr, code, phone, email)
5. **projects** - Added `page`, `pageSize`, `search` (name, nameAr, code, location), `status` filter
6. **equipment** - Added `page`, `pageSize`, `search` (name, nameAr, code, type, model, serialNumber)
7. **employees** - Added `page`, `pageSize` (search already existed)
8. **expenses** - Added `page`, `pageSize`, `search` (description, reference, category)
9. **client-payments** - Added `page`, `pageSize`, `search` (reference, notes)
10. **supplier-payments** - Added `page`, `pageSize`, `search` (reference, notes)

## Key design decisions
- **Backward compatibility**: If `page` param is NOT provided, returns the old array format `[...]`
- **Paginated format**: When `page` IS provided, returns `{ data: [...], total, page, pageSize, totalPages }`
- **Search fields**: Chosen per-entity based on what makes sense (names, codes, references)
- **Performance**: Used `Promise.all` for parallel count + data queries
- **Defaults**: page defaults to null (backward compat), pageSize defaults to 50

## Files modified
- `src/app/api/sales-invoices/route.ts`
- `src/app/api/supplier-invoices/route.ts`
- `src/app/api/clients/route.ts`
- `src/app/api/suppliers/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/equipment/route.ts`
- `src/app/api/employees/route.ts`
- `src/app/api/expenses/route.ts`
- `src/app/api/client-payments/route.ts`
- `src/app/api/supplier-payments/route.ts`

## No issues encountered
All changes were clean, lint passed with only pre-existing errors.
