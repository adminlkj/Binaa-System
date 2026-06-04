# Task 5 - Equipment Timesheets Module

## Agent: full-stack-developer
## Task: Build Equipment Timesheets module with approval workflow and auto-invoice generation

## Files Created/Modified

### API Routes (3 new)
1. `/src/app/api/equipment/timesheets/route.ts` - GET (list timesheets) + POST (create timesheet)
2. `/src/app/api/equipment/timesheets/[id]/route.ts` - GET (single detail) + PATCH (update/workflow)
3. `/src/app/api/equipment/timesheets/[id]/generate-invoice/route.ts` - POST (generate SalesInvoice)

### Component (1 new)
4. `/src/components/modules/timesheets.tsx` - Full TimesheetsModule with 3 views (list, create, detail)

### Page Integration (1 modified)
5. `/src/app/page.tsx` - Added TimesheetsModule import and 'timesheets' route

## Key Features
- List view with 12-column table, KPI cards, search, status filter
- Create full-page form with contract selector, auto-fill, live calculation
- Detail view with workflow buttons, status indicator, invoice section
- Approval workflow: DRAFT → SUBMITTED → APPROVED/REJECTED
- Auto-invoice generation with RENTAL type from approved timesheets
- Full bilingual AR/EN support, RTL layout, purple/emerald/teal color scheme

## Verification
- ESLint: zero errors
- Dev server: compiles successfully
- All API routes functional
