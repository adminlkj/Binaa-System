# Task 6: Financial Audit Center (مركز تحقيق مالي)

## Summary
Redesigned the Journal Entry screen in `src/components/modules/accounting.tsx` to become a comprehensive Financial Audit Center (مركز تحقيق مالي), implementing the principle "القيد هو المصدر الوحيد للحقيقة المالية" (Journal Entry is the Single Source of Financial Truth).

## Changes Made

### 1. Updated Imports
- Added new Lucide icons: `ArrowUpRight`, `GitBranch`, `ClipboardCheck`, `RotateCcw`, `FileSearch`, `ExternalLink`, `History`, `Link2`, `Activity`
- Added `DialogFooter`, `DialogDescription` from dialog component
- Added `Textarea` for reversal reason input
- Added `ScrollArea` for dialog content scrolling
- Added `formatSAR` from app store for financial formatting

### 2. Extended Type System
- **JournalEntry interface**: Added fields: `activityType`, `entryType`, `postingDate`, `createdBy`, `projectId`, `clientId`, `supplierId`, `costCenterId`, `reversedEntryId`, `reversedById`, `project?`, `client?`, `supplier?`
- **New interfaces**: `FinancialImpactItem`, `LinkedDocument`, `AuditLogEntry`, `HealthCheckItem`, `DependentOperation`, `ReversalDependency`, `JournalEntryDetailData`

### 3. New Component: ReverseEntryDialog
- Full reversal workflow with dependency checking
- Fetches reversal dependencies via GET `/api/journal-entries/[id]/reverse`
- Shows affected operations with reversible/non-reversible badges
- Displays warnings if any
- Blocks reversal if `canReverse` is false
- Requires reason input for reversal
- Calls POST `/api/journal-entries/[id]/reverse` with `{ reason }`
- Error handling with clear messages

### 4. New Component: JournalEntryDetailDialog (مركز تحقيق مالي)
Comprehensive dialog with all 10 required sections:

1. **Header Card (رأس القيد)**: Entry number prominently displayed, status with emoji (🟢/🔴/🟡), entry type badge, activity type badge, source document info, project/client/supplier names, dates, creator

2. **Quick Action Bar (شريط الإجراءات)**: Print, Open Source Doc, Account Statement, General Ledger, Reverse Entry (POSTED only), Audit Trail, Consistency Check

3. **Financial Impact Card (بطاقة التأثير المالي)**: Grid showing each account impact with emoji icons and formatted SAR values

4. **Journal Lines Tab (خطوط القيد)**: Full debit/credit table with account code, name, cost center, totals row, and balance verification badge

5. **Linked Documents Tab (المستندات المرتبطة)**: Document tree with type badges, numbers, descriptions, and status badges

6. **Accounting Effect Tab (الأثر المحاسبي)**: Before/Movement/After balance table with color-coded values

7. **Audit Trail Tab (سجل الأحداث)**: Timeline view with action, user, timestamp, and details

8. **Dependent Operations Tab (العمليات التابعة)**: Operation/account/status table with reversal indicators

9. **Reviewer Panel (لوحة المراجع)**: Health checks with ✅/❌ indicators, overall pass/fail badge

10. **Reverse Entry Integration**: Opens ReverseEntryDialog from action bar

### 5. Enhanced Journal Entries List View
- Added **activityType filter** (مشاريع بناء / تأجير معدات / إداري)
- **Color coding by activity type**: emerald for CONSTRUCTION, cyan for EQUIPMENT_RENTAL, gray for ADMIN (left border on rows + badge)
- **Summary cards** at top: Total Entries, Total Debit, Total Credit, Difference
- **Activity column** in table with color-coded badges
- Opens comprehensive **Dialog** on row click instead of inline view
- Eye icon on entry number for better affordance

### 6. Preserved Functionality
All 16 existing tabs remain intact:
- Chart of Accounts, Journal Entries, General Ledger, Trial Balance
- Income Statement, Balance Sheet, Cash Flow
- Cost Centers, Customer Statement, Vendor Statement
- Project Profitability, Equipment Profitability
- Period Closing, Fixed Assets, Provisions, Bank Reconciliation

## File Size
- Before: 1,943 lines
- After: 2,645 lines (+702 lines)

## TypeScript & Lint
- ✅ No TypeScript errors in accounting.tsx
- ✅ ESLint passes cleanly
- ✅ Build succeeds

## API Dependencies
The detail dialog fetches from:
- `GET /api/journal-entries/[id]` - Full entry with lines, auditLogs, financialImpact, linkedDocuments, healthChecks, reversedEntry, reversedBy, project, client, supplier
- `GET /api/journal-entries/[id]/reverse` - Reversal dependency check
- `POST /api/journal-entries/[id]/reverse` - Execute reversal
