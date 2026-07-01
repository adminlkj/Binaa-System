# Task ID: P2-1-FIX — RBAC enforcement on all 159+ API routes

**Agent**: Code Agent (Z.ai Code)
**Phase**: 2 (P0) — Security
**Project**: Binaa-System ERP at `/home/z/my-project/download/Binaa-System`

## Objective
Close the critical RBAC gap: 272 of 314 HTTP method handlers across 142 route files had NO role-based access control. Any authenticated user (including VIEWER) could create/modify/delete financial data via direct API calls.

## Pre-work Reading
- `/home/z/my-project/worklog.md` — confirmed Phase 1 (Accounting Integrity) complete; Agent C's RBAC inventory in Task ID: C section; Agent P1's subcontractor + fiscal-year work in Task ID: FIX-RBAC-VAT section.
- `src/lib/auth-helpers.ts` — confirmed API:
  - `requireAuthApi()` → `{ user, response }` (401 if unauthenticated)
  - `requireRoleApi(...roles)` → `{ user, response }` (401 unauth, 403 wrong role)
- Audited all 167 `src/app/api/**/route.ts` files with a Python script that splits each file by `export async function METHOD` markers and checks each chunk for `requireRoleApi`/`requireAuthApi` calls.

## Permission Policy Applied (consistent across all routes)
| HTTP Method | Auth Helper | Roles |
| --- | --- | --- |
| GET (read) | `requireAuthApi()` | any authenticated user |
| POST (create) | `requireRoleApi('ADMIN', 'ACCOUNTANT')` | admin or accountant |
| PUT (update) | `requireRoleApi('ADMIN', 'ACCOUNTANT')` | admin or accountant |
| PATCH (status change) | `requireRoleApi('ADMIN', 'ACCOUNTANT')` | admin or accountant |
| DELETE | `requireRoleApi('ADMIN')` | admin only |

## Files Skipped (already protected or intentionally public)
**Public-by-design (no auth needed):**
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth handler
- `src/app/api/health/route.ts` — orchestrator health check
- `src/app/api/route.ts` — root API index (informational "Hello, world!" message)
- `src/app/api/seed/route.ts` — 4-layer protection (dev-only + middleware + ADMIN + confirm=WIPE_ALL_DATA)

**Already fully protected (left untouched, except GET additions noted below):**
- `src/app/api/asset-depreciations/[id]/reverse/route.ts`
- `src/app/api/company-settings/route.ts` (PUT only — added GET)
- `src/app/api/financial-mapping/route.ts` (POST only — added GET)
- `src/app/api/fiscal-years/[id]/close/route.ts`
- `src/app/api/fiscal-years/[id]/closing-preview/route.ts`
- `src/app/api/fiscal-years/[id]/periods/[periodId]/route.ts`
- `src/app/api/fiscal-years/[id]/reopen/route.ts`
- `src/app/api/fiscal-years/[id]/route.ts` (PUT/DELETE — added GET)
- `src/app/api/fiscal-years/route.ts` (POST — added GET)
- `src/app/api/fixed-assets/[id]/depreciate/route.ts`
- `src/app/api/fixed-assets/depreciate-all/route.ts`
- `src/app/api/fixed-assets/depreciate/route.ts`
- `src/app/api/ifrs15/preview/route.ts`
- `src/app/api/ifrs15/recognize/route.ts`
- `src/app/api/journal-entries/[id]/reverse/route.ts`
- `src/app/api/journal-entries/route.ts` (POST — added GET)
- `src/app/api/period-closing/route.ts` (POST — added GET)
- `src/app/api/subcontractor-advances/[id]/route.ts` and `route.ts`
- `src/app/api/subcontractor-invoices/[id]/route.ts` and `route.ts`
- `src/app/api/subcontractor-payments/[id]/route.ts` and `route.ts`
- `src/app/api/subcontractor-retentions/[id]/route.ts` and `route.ts`
- `src/app/api/users/[id]/route.ts` and `route.ts`

## Files Modified (142 files, 272 handlers)
**Implementation pattern (consistent across all 142 files):**

For GET handlers:
```typescript
import { requireAuthApi } from '@/lib/auth-helpers'
// ...
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    // ... existing code unchanged
```

For POST/PUT/PATCH handlers:
```typescript
import { requireRoleApi } from '@/lib/auth-helpers'
// ...
export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    // ... existing code unchanged
```

For DELETE handlers (admin-only):
```typescript
import { requireRoleApi } from '@/lib/auth-helpers'
// ...
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    // ... existing code unchanged
```

When a single file needed both helpers (e.g., GET + POST), the import was merged:
```typescript
import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
```

### Route groups modified (alphabetical):
- **account-impact, account-statement, accounting-consistency, accounting-guard/health, accounting-health** (5 files)
- **accounts** — `[id]`, `by-role`, `initialize` (GET only — POST already protected), `role-mapping` (GET + POST validate — PUT already protected), `route`, `statement` (6 files)
- **activities, advances** (`[id]` + `route`), **asset-depreciations** (route — reverse already protected), **attendance** (`[id]` + `route`) (7 files)
- **bank-accounts, bank-reconciliation, boq** (`[id]` + `route`), **branches, business-flow/validate, business-flows** (8 files)
- **change-orders** (`[id]` + `route`), **client-payments** (`[id]` + `route`), **clients** (`[id]` + `route`), **company-settings** (GET only — PUT already protected), **contracts** (`[id]` + `route`), **cost-centers** (`[id]` + `route`), **currencies** (12 files)
- **dashboard, delivery-orders** (`[id]` + `route`) (3 files)
- **employee-contracts** (`[id]` + `route`), **employees** (`[id]` + `route`), **equipment** — `[id]`, `expenses`, `fuel/[id]`, `fuel/route`, `maintenance/[id]/complete`, `maintenance/[id]/route`, `maintenance/route`, `operations/[id]`, `operations/route`, `rental-contracts/[id]`, `rental-contracts/route`, `rentals/route`, `route`, `timesheets/[id]/generate-invoice`, `timesheets/[id]/route`, `timesheets/route`, `usages/route` (19 files)
- **expenses** (`[id]` + `route`) (2 files)
- **financial-consistency, financial-mapping** (GET only — POST already protected), **fiscal-years** (GET only on `[id]/route` and `route` — POST/PUT/DELETE already protected), **fixed-assets** — `[id]`, `report`, `route` (6 files)
- **general-ledger, generate-qr, goods-receipt** (`[id]` + `route`) (4 files)
- **inventory** (`[id]` + `route`) (2 files)
- **journal-entries** — `[id]` (GET/PUT/DELETE — none previously protected), `by-account`, `by-source`, `route` (GET only — POST already protected) (4 files)
- **labor-costs** (`[id]` + `route`) (2 files)
- **payroll-runs** (`[id]` + `route`), **petty-cash** (`[id]` + `route`), **print, progress-claims** (`[id]` + `route`), **projects** — `[id]`, `list`, `route`, **provisions**, **purchase-invoices** (`[id]` + `route`), **purchase-orders** (`[id]` + `route`), **purchase-requests** (`[id]` + `route`) (14 files)
- **remove-bg, rental-payments** (`[id]` + `route`) (3 files)
- **reports** — `account-statement`, `aging`, `balance-sheet`, `cash-flow-statement`, `client-balances`, `cost-center-report`, `general-ledger`, `income-statement`, `project-costs`, `project-profitability`, `project-wip`, `route`, `supplier-balances`, `trial-balance`, `vat-reconciliation` (15 files, all GET-only)
- **resource-distribution** — `project-costs/[projectId]/route.ts`, `route.ts` (2 files)
- **salaries** — `[id]`, `auto-calculate`, `route` (3 files; note: the helper export `createSalaryAccrualJournalEntry` in `salaries/route.ts` was correctly NOT modified — only HTTP method handlers GET and POST got the guard)
- **salary-payments** (`[id]` + `route`), **sales-invoices** (`[id]` + `route`), **subcontractors** (`[id]` + `route`), **supplier-invoices** (`[id]` + `route`), **supplier-payments** (`[id]` + `route`), **suppliers** (`[id]` + `route`) (10 files)
- **timesheets** (`[id]` + `route`), **trial-balance** (3 files)
- **vat** — `[id]`, `route` (2 files)
- **warehouses, work-teams** (`[id]` + `route`) (3 files)

## Implementation Approach (scripted for consistency)
A Python script (`/tmp/rbac_fix.py`) performed the edits atomically per file:
1. For each route file, find all `export async function METHOD` markers (METHOD ∈ {GET, POST, PUT, PATCH, DELETE}).
2. For each handler chunk (from marker start to next marker), check if it contains `requireRoleApi` or `requireAuthApi`. If yes → skip. If no → schedule an edit.
3. Determine which helpers to import (only those actually needed by scheduled edits; merge into existing `@/lib/auth-helpers` import line if present, else add new line after last existing import).
4. For each scheduled edit, locate the function's opening brace (walking the source char-by-char tracking `(`/`)` depth so multi-line signatures with `Promise<{ id: string }>` params are correctly handled), and insert the auth block immediately after `{`:
   ```
     const { response } = await <helper>(<args>)
     if (response) return response
   ```
5. No business logic was touched. Only the import block and the first two lines of each handler body changed.

## Verification
- **`bun run lint`** → exit 0, no errors. ESLint (with TypeScript rules) confirms all 142 modified files are syntactically valid and have no unused imports.
- **`bun run test:accounting`** → 21/21 passed (BA-02 behavioral accounting tests).
- **`bun run verify:engine`** → ALL NUMERICAL CONSISTENCY CHECKS PASSED (TrialBalance, BalanceSheet, I3+I5+I6+I7 invariants).
- **`bun scripts/e2e-accounting-integrity-test.ts`** → 29/29 passed (E2E accounting integrity test).
- **Re-audit after fix** → 0 unprotected handlers remaining across the entire `src/app/api` tree (excluding the 4 intentionally-public files: `auth/[...nextauth]`, `health`, root `route.ts`, `seed`).
- **Pre-existing TS errors unrelated to RBAC**: `npx tsc --noEmit` reports 4 errors in 3 files (`business-flows/route.ts:143` — pre-existing `bOQItems` typo; `business-flows.tsx:204,287` — `MoneyDisplay` `amount` prop naming; `users.tsx:511` — boolean coercion). None are in code touched by this task — verified via `git diff`. The project's quality gate is `bun run lint`, which is clean.

## Summary
- **Files modified**: 142
- **HTTP handlers protected**: 272 (was unprotected; now has auth guard)
- **Files already protected (skipped)**: 30 (42 handlers)
- **Files intentionally public (skipped)**: 4 (auth, health, root index, seed)
- **Total route files audited**: 167
- **Total HTTP handlers in codebase**: 314 (272 newly protected + 42 already protected = 314; all now have auth)
- **RBAC gap closed**: 100% (was 86% unprotected, now 0% unprotected)
- **All accounting tests still pass**: 21/21, 29/29, all numerical consistency invariants ✓
- **Lint clean**: exit 0

## Constraints honored
- No business logic changed — only auth-check insertion at the very start of each handler.
- No Prisma schema changes.
- No new dependencies added.
- Helper exports (e.g., `createSalaryAccrualJournalEntry` in `salaries/route.ts`) correctly left unguarded — they are not HTTP handlers and are only called from within other transactional code.
- Arabic error messages preserved.
- The existing 4-layer protection on `seed/route.ts` was respected (no modification).
- The NextAuth handler in `auth/[...nextauth]/route.ts` was respected (no modification).
- The public health endpoint was respected (no modification).
