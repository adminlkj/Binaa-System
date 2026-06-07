# Task 6: Sales Invoice Module Rebuild

## Summary
Completely rebuilt the Sales Invoice module so invoices can ONLY be created from approved Extracts (ProgressClaims) or approved TimeSheets. Manual invoice creation is prohibited.

## Files Modified
1. `/src/components/modules/sales.tsx` - Complete rebuild with 3-step source-based creation flow
2. `/src/app/api/sales-invoices/route.ts` - Enhanced GET includes, POST accepts date/dueDate/notes, duplicate prevention
3. `/src/app/api/sales-invoices/[id]/route.ts` - Added rich source includes for GET/PATCH
4. `/src/app/api/progress-claims/route.ts` - Added invoiced filter, client relation
5. `/src/app/api/equipment/timesheets/route.ts` - Fixed Prisma query, added client relation, uninvoiced filter

## Business Rules Enforced
- No manual invoice creation - only from approved sources
- Two sources only: Extract (ProgressClaim) or TimeSheet
- Duplicate prevention at frontend and backend
- All financial fields read-only from source
- Auto-calculation from source document
- After invoice creation, source marked as invoiced

## UI Architecture
- Step 1: Visual card selection for source type (Extract vs Timesheet)
- Step 2: Selectable table of uninvoiced approved sources
- Step 3: Read-only preview with date/dueDate/notes entry
- Detail view: Source reference, financial breakdown, status workflow
