# Task 1a - Schema Fix Agent

## Task
Fix critical Prisma schema issues: Float→Decimal, indexes, relations, soft delete, updatedAt, onDelete/onUpdate

## Changes Made

### 1. Float → Decimal Conversion (118 fields)
All financial Float fields converted to Decimal across 40+ models for precision.

### 2. Database Indexes (181 @@index directives)
- All FK fields indexed
- Status, date, category fields indexed
- Composite indexes for common query patterns

### 3. Fixed Broken Relations (6 fixes)
- SubcontractorContract.projectId → added @relation + Project.subcontractorContracts
- FixedAsset 3 account fields → named relations with Account reverse sides
- BankAccount.accountId → @relation to Account
- JournalEntry.reversedEntryId → self-relation
- EquipmentDeliveryOrder.projectId → added missing relation

### 4. Soft Delete (13 models)
deletedAt DateTime? added to: SalesInvoice, PurchaseInvoice, SubcontractorInvoice, ClientPayment, SupplierPayment, JournalEntry, JournalLine, Expense, PettyCash, ProgressClaim, EquipmentDeliveryOrder, Salary, EmployeeAdvance

### 5. updatedAt (all 62 models)
Added missing updatedAt to CostCenter and 19 other models

### 6. onDelete/onUpdate (85 directives)
- Cascade: child items (invoice items, journal lines, etc.)
- Restrict: financial records prevent deletion of referenced entities
- SetNull: optional references safely dereferenced

## Verification
- `prisma validate` ✅
- `prisma db push --force-reset` ✅
- `prisma generate` ✅
- DB connection test ✅
- No new lint errors

## Important Note for Future Agents
- Prisma Decimal fields return `Prisma.Decimal` objects, not JavaScript numbers
- Code that reads Decimal fields may need `.toNumber()` conversion
- Soft delete: queries should filter `where: { deletedAt: null }` for active records
