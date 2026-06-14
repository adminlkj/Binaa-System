# Task 6 - Salary Payments API + Frontend Module

## Task
Create Salary Payments API + Frontend Module for the بِنَاء ERP system.

## Files Created/Modified

### API Routes
- **`/src/app/api/salary-payments/route.ts`** - GET (list with filters) + POST (create with validation + accounting)
- **`/src/app/api/salary-payments/[id]/route.ts`** - DELETE (with status recalculation)

### Frontend Module
- **`/src/components/modules/salary-payments.tsx`** - Complete rewrite from placeholder

## Key Implementation Details

### API - POST /api/salary-payments
1. Validates payrollRunId, amount > 0, paymentMethod (BANK/CASH)
2. Validates payroll run exists and status is APPROVED or PARTIALLY_PAID
3. Calculates total paid so far and validates amount doesn't exceed remaining
4. Creates SalaryPayment record
5. Creates journal entry: Debit 3310 (رواتب مستحقة) / Credit 1120 (البنك) or 1110 (الصندوق)
6. Updates payroll run status: PAID or PARTIALLY_PAID

### API - DELETE /api/salary-payments/[id]
1. Only allows deletion if payroll run is not PAID
2. Recalculates payroll run status (reverts to APPROVED if no payments remain)

### Frontend Module
- Summary cards: Total Paid, Remaining, Approved Runs count
- Payments table with filter by payment method and search
- Create Payment Dialog with payroll run selection, info card, auto-fill remaining
- Delete support, journal entry badge, export/print support

## Lint Results
- 0 new errors (2 pre-existing warnings from other files)
- Dev server compiles successfully
