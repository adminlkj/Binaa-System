# Task 2a - Transaction Fix Agent

## Task
Add Prisma `$transaction` to ALL multi-step API operations that currently execute without transaction protection.

## What Was Done

### 1. Accounting Engine Refactor (`/src/lib/accounting/engine.ts`)
- Added `PrismaTransaction` type export
- Modified core functions to accept optional `tx?: PrismaTransaction`:
  - `getAccountByCode(code, tx?)` - uses `tx || db`
  - `ensureAccountExists(template, tx?)` - uses `tx || db` (renamed to `client`)
  - `createJournalEntry(template, tx?)` - uses `tx || db` (renamed to `client`)
- Modified ALL 22 `autoEntry*` functions to accept `tx?: PrismaTransaction` and pass to `createJournalEntry()`
- Added missing `getSalaryAccountCode()` function

### 2. API Routes Updated with $transaction

| Route | Operations Wrapped |
|-------|-------------------|
| sales-invoices/route.ts | POST (3 modes) + PUT |
| sales-invoices/[id]/route.ts | PATCH + DELETE |
| client-payments/route.ts | POST |
| supplier-payments/route.ts | POST |
| supplier-invoices/route.ts | POST |
| supplier-invoices/[id]/route.ts | PUT + DELETE |
| expenses/route.ts | POST + PUT |
| expenses/[id]/route.ts | DELETE |
| petty-cash/route.ts | POST |
| progress-claims/route.ts | POST + PUT |
| salary-payments/route.ts | POST |
| fixed-assets/depreciate/route.ts | POST |
| period-closing/route.ts | POST (close + reopen) |
| equipment/timesheets/[id]/generate-invoice/route.ts | POST |
| payroll-runs/[id]/route.ts | PUT (approve) + DELETE |

### Key Patterns
- `db.$transaction(async (tx: PrismaTransaction) => { ... })`
- All `db.` inside transactions → `tx.`
- All `autoEntry*(data, tx)` and `createJournalEntry(template, tx)`
- Validations remain outside transactions
- Error handling preserved

### Notes
- journal-entries POST was already disabled (returns 403)
- journal-entries/[id] PUT was already disabled (only has GET)
- payroll-runs POST creates run + lines in single nested create (already atomic)
- client-payments/[id] PUT and supplier-payments/[id] PUT reject edits when journalEntryId exists (no multi-step)
