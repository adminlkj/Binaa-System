# Task 10 - Journal Entry Reversal System

## Agent: Code Agent

## Summary
Implemented a complete journal entry reversal system for Binaa ERP with three components:

### 1. `reverseEntry()` function in accounting engine
- Location: `/src/lib/accounting/engine.ts` (inserted at line ~371)
- General-purpose reversal utility requiring a `PrismaTransaction`
- Validates: entry exists, is POSTED, not already a reversal, not already reversed
- Creates reversal entry with flipped debit/credit, "عكس" prefix, `isReversal: true`, `reversedEntryId` link
- Cancels original entry (status → CANCELLED)
- Full audit trail preserved

### 2. Journal Entry Reversal API Route
- Location: `/src/app/api/journal-entries/[id]/reverse/route.ts`
- POST `/api/journal-entries/[id]/reverse`
- Wraps in `$transaction()`, calls `reverseEntry(id, tx)`
- Returns reversal entry or error with Arabic messages

### 3. Payment APIs - Reverse+Recreate Pattern
- **Client Payments** (`/src/app/api/client-payments/[id]/route.ts`): PATCH handler for POSTED payments now reverses journal entry, updates payment, creates new journal entry
- **Supplier Payments** (`/src/app/api/supplier-payments/[id]/route.ts`): PUT handler for POSTED payments now reverses journal entry, updates payment, creates new journal entry
- Both properly handle invoice paidAmount reversal and re-application within the same transaction
- Non-posted payments still use simple update path
- DELETE handlers unchanged (still block posted payment deletion)

### Lint: Passes with 0 errors
### Dev server: Running normally
