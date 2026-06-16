# Task: Validation Rules & Chart of Accounts Enhancement

## Agent: Main Developer
## Date: 2026-06-16

## Summary
Implemented three validation rules, enhanced the Chart of Accounts GET endpoint with computed indicators, and added action buttons to the Chart of Accounts table.

## Changes Made

### 1. Validation Rules

#### Rule 1: Prevent posting unbalanced journal entries
- **File**: `/home/z/my-project/src/app/api/journal-entries/route.ts`
- **Change**: Replaced the 403 disabled POST handler with a full implementation that:
  - Validates required fields (entryNo, date, lines)
  - Checks balance: `Math.abs(totalDebit - totalCredit) > 0.01` → rejects with Arabic error
  - Validates each line has an account and at least one debit/credit value
  - Resolves account IDs from codes
  - Creates the journal entry with DRAFT status by default

#### Rule 2: Prevent creating child accounts without parent
- **File**: `/home/z/my-project/src/app/api/accounts/route.ts`
- **Change**: Added validation in POST handler:
  - If `allowPosting = true` and no `parentId` or `parentCode` is set → reject
  - If `parentCode` is provided, verify the parent account exists
  - Auto-set `parentId` from `parentCode` if not already set
  - Include `parentCode` in the create data

#### Rule 3: Prevent deleting accounts with journal lines
- **File**: `/home/z/my-project/src/app/api/accounts/[id]/route.ts`
- **Change**: Added DELETE handler:
  - Check for children → reject with 400
  - Check for journal lines → deactivate instead of delete
  - Clean delete only when no children and no journal lines

### 2. Enhanced Chart of Accounts GET Endpoint
- **File**: `/home/z/my-project/src/app/api/accounts/route.ts`
- **Changes**:
  - Imported `NORMAL_BALANCE` and `AccountTypeValue` from engine
  - Removed `withBalances` conditional logic - always computes balances
  - Added `groupBy` query with `_sum: { debit, credit }` and `_max: { createdAt }`
  - Added computed fields: `balance`, `entryCount`, `lastTransactionDate`, `childrenCount`

### 3. New API Endpoint: Journal Entries by Account
- **File**: `/home/z/my-project/src/app/api/journal-entries/by-account/route.ts`
- **Purpose**: Fetch all journal entries that include a specific account
- **Returns**: Account info, grouped entries with debit/credit totals per entry, line count

### 4. Action Buttons in Chart of Accounts
- **File**: `/home/z/my-project/src/components/modules/accounting.tsx`
- **Changes**:
  - Added `List` icon import from lucide-react
  - Updated `Account` interface with `entryCount`, `lastTransactionDate`, `childrenCount`
  - Added `AccountTransactionsDialog` component (shows entries table with summary cards)
  - Added `onViewLedger` prop to `ChartOfAccountsTab`
  - Added `transactionsAccount` and `transactionsOpen` state
  - Replaced single "كشف" column with "الإجراءات" (Actions) column containing 3 buttons:
    - **كشف** (Statement) - existing statement dialog
    - **أستاذ** (Ledger) - switches to General Ledger tab with pre-selected account
    - **حركات** (Transactions) - opens transactions dialog
  - Updated `GeneralLedgerTab` to accept `preselectedCode` prop
  - Updated `AccountingModule` with `glPreselectedCode` state and `onViewLedger` callback
  - Changed entries count display to use `a.entryCount` instead of `a._count.journalLines`

## Test Results
- ✅ Unbalanced JE rejected with Arabic error message
- ✅ Balanced JE created successfully (DRAFT status)
- ✅ Posting account without parent rejected
- ✅ Header account without parent created successfully
- ✅ Account with children cannot be deleted
- ✅ Account with journal lines gets deactivated instead of deleted
- ✅ Clean account can be deleted
- ✅ Accounts API returns new computed fields (balance, entryCount, lastTransactionDate, childrenCount)
- ✅ by-account API returns entries correctly
- ✅ Lint passes cleanly
