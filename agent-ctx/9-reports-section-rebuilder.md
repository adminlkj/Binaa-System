# Task 9: Reports Section Rebuilder

## Summary
Completely rebuilt the Reports section with 6 comprehensive report tabs containing 19 sub-reports, adding 8 new API endpoints.

## Files Modified
- `/src/components/sections/reports-section.tsx` - Rebuilt with 6 new tabs (projects, rental, finance, purchases, clients, tax)
- `/src/components/modules/reports.tsx` - Completely rewritten with 6 tab components and 19 sub-reports
- `/src/app/api/reports/route.ts` - Added 8 new report types, fixed 5 TypeScript errors

## New API Endpoints
- `?type=project-profitability` - All projects profitability table
- `?type=equipment-utilization` - Per-equipment hours/revenue/costs
- `?type=rental-revenue-by-client` - Revenue per client from rental invoices
- `?type=equipment-status` - Equipment count by status and type
- `?type=purchase-summary` - Purchases by supplier and project
- `?type=revenue-summary` - Construction vs Rental revenue monthly
- `?type=expense-summary` - Direct vs Indirect costs by category
- `?type=cash-flow-summary` - Cash inflows vs outflows monthly

## Report Structure
1. Project Reports (3 sub-tabs): Profitability, Cost Breakdown, Status Summary
2. Rental Reports (3 sub-tabs): Equipment Utilization, Revenue by Client, Equipment Status
3. Financial Reports (4 sub-tabs): Trial Balance, Revenue Summary, Expense Summary, Cash Flow
4. Purchase Reports (2 sub-tabs): Purchase Summary, Supplier Balances
5. Client Reports (2 sub-tabs): Client Balances, Aging Report
6. Tax Reports: VAT quarter selector with full lifecycle

## Key Decisions
- Equipment model uses `type` not `category`, `operatorLogs` not `operations`
- EquipmentRental uses `rate` not `hourlyRate`
- Salary uses `month`/`year` not `date`
- InventoryItem uses `purchasePrice` not `unitPrice`
- All reports READ-ONLY (no CRUD)
- MoneyDisplay for all amounts, bilingual labels, color coding for profit/loss
