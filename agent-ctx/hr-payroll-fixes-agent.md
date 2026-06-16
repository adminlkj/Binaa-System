# HR/Payroll API Fixes - Agent Work Record

## Task: Fix API routes for HR/Payroll in the Binaa ERP project

## Summary of Analysis

After thorough review of all 6 API route files and the Prisma schema, I found that most of the requested fixes were already implemented in the codebase. Only the Payroll Runs API had actual bugs that needed fixing.

## Changes Made

### File Modified: `/home/z/my-project/src/app/api/payroll-runs/route.ts`

**Bug Fix 1: Advance deduction query now includes PARTIALLY_SETTLED status**
- **Before:** Only queried `status: 'PENDING'` for employee advances
- **After:** Queries `status: { in: ['PENDING', 'PARTIALLY_SETTLED'] }`
- **Impact:** Partially settled advances (where some but not all has been deducted) are now included in payroll calculations. The remaining amount (amount - settledAmount) is correctly calculated, with a guard to never add negative values.

**Bug Fix 2: Support `body.employeeIds` as fallback to `body.selectionIds`**
- **Before:** `const selectionIds: string[] = body.selectionIds || []`
- **After:** `const selectionIds: string[] = body.selectionIds || body.employeeIds || []`
- **Impact:** Clients can now pass employee IDs via either `selectionIds` or `employeeIds` parameter when using EMPLOYEES selection type.

**Bug Fix 3: Cleaned up DEPARTMENT filter logic**
- **Before:** Messy logic with `const deptFilter = departmentFilter || (selectionIds.length > 0 ? undefined : undefined)` which always resolved the second OR branch to undefined
- **After:** Clear conditional: if `department` body param is provided, use it; otherwise if `selectionIds` are provided, treat them as department names; otherwise no department filter
- **Impact:** DEPARTMENT selection type now works correctly with both direct department name and department name arrays in selectionIds.

## Already Implemented (No Changes Needed)

### FIX 1: Employees API (`/api/employees/route.ts`)
All fields already present in POST handler: `salaryType`, `housingAllowance`, `transportAllowance`, `otherAllowances`, `referenceMonthlySalary`, `referenceMonthlyHours`, `hasGosi`, `gosiPercentage`, `projectId`, `department`

### FIX 2: Employees Detail API (`/api/employees/[id]/route.ts`)
All fields already present in PUT handler with proper `parseFloat() || 0` pattern and null handling via `??` operator

### FIX 3: Attendance API (`/api/attendance/route.ts`)
- `status` field with default "PRESENT" already handled
- `leaveType` field already handled with conditional logic for LEAVE status
- ABSENT status already auto-sets `workHours=0` and `overtimeHours=0`

### FIX 5: Salaries API (`/api/salaries/route.ts`)
- `advanceDeduction`, `absenceDeduction`, `gosiDeduction` already in create data
- Net salary calculation already uses: `totalEntitlements - deductions - advanceDeduction - absenceDeduction - gosiDeduction`

### FIX 6: Salary Payments API (`/api/salary-payments/route.ts`)
- Already creates proper accounting entries using `autoEntrySalary` from the accounting engine
- Payment step correctly debits salary payable (3310) and credits bank (1120) or cash (1110)
- Uses `PrismaTransaction` for atomic operations

## Verification
- `bun run lint` passed with zero errors
- Dev server running correctly on port 3000
- No breaking changes to existing API contracts
