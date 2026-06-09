# Task 5: API Workflow Updater - Work Record

## Summary
Updated all API routes to support the new invoice workflow design, including two new invoice creation modes (from ProgressClaims and Timesheets), expense type enforcement, and uninvoiced filtering.

## Files Modified

### 1. `/src/app/api/sales-invoices/route.ts` (Full rewrite)
- **MODE A (EXTRACT)**: Creates invoice from ProgressClaim
  - Validates claim exists, is APPROVED, and not invoiced
  - Auto-populates from claim: clientId, projectId, contractId, subtotal, vatAmount, totalAmount
  - Sets sourceType="EXTRACT", invoiceType="PROGRESS_CLAIM"
  - Marks claim as invoiced
  - Auto accounting entry via `autoEntrySalesInvoice`

- **MODE B (TIMESHEET)**: Creates invoice from Timesheet
  - Validates timesheet exists, is APPROVED, and not invoiced
  - Calculates subtotal = operatingHours × hourlyRate
  - Adds delivery fees from rental contract if applicable
  - Sets sourceType="TIMESHEET", invoiceType="RENTAL"
  - Marks timesheet as INVOICED
  - Auto accounting entry via `autoEntryRentalInvoice`

- **Legacy Mode**: Manual creation with items array preserved

- **GET**: Added sourceType filter, includes timesheet and progressClaim relations

### 2. `/src/app/api/expenses/route.ts`
- POST auto-determines expenseType (PROJECT/INTERNAL based on projectId)
- Validates PROJECT expenses require projectId; INTERNAL forces null
- Added vatRate (default 0.15) with automatic vatAmount calculation
- Added attachmentPath field
- Calculates totalAmount = amount + vatAmount
- GET supports expenseType filter
- PUT handles expenseType consistency

### 3. `/src/app/api/progress-claims/route.ts`
- GET: Added `?uninvoiced=true` filter (APPROVED claims with invoiced=false)
- GET: Includes client info in project relation
- POST: Explicitly sets invoiced: false
- PUT: Prevents modification of invoiced claims

### 4. `/src/app/api/equipment/timesheets/route.ts`
- GET: Added `?uninvoiced=true` filter (APPROVED timesheets only)
- Fixed contract include (removed non-existent equipment relation)
- GET: Includes rental details for invoice creation

### 5. `/src/app/api/projects/route.ts` (Already had projectType)
### 6. `/src/app/api/projects/[id]/route.ts` (Already had projectType in PUT)

## Lint Status
- Only pre-existing error in take-screenshots.mjs (unrelated)
- All new code passes ESLint

## Testing
- All endpoints return HTTP 200
- Filter parameters work correctly
- No TypeScript errors
