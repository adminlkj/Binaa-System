# P4-FIX Agent Work Record

**Task ID**: P4-FIX
**Agent**: P4 (Dynamic Account Selection Fixer)
**Project**: Binaa-System ERP (`/home/z/my-project/download/Binaa-System`)
**Phase**: 4 — Dynamic Account Selection (ربط النظام بالدليل المحاسبي)

## Goal

Eliminate every hardcoded account code in the system. Make the chart of accounts fully dynamic: when a new account is created with a role, it should automatically (a) carry the right usage properties so it appears in the right screens, and (b) be usable in the right journal entries.

## Tasks Completed

### Task 1 — `src/lib/account-usage-mapping.ts` (NEW, 240 lines)

Single source of truth mapping each `AccountRole` (46 roles total) to its 20 usage/selection/behavior properties.

Exports:
- `AccountUsageProperties` interface — the 20 supported properties.
- `getUsagePropertiesForRole(role)` — pure function, returns the property set for a role (or `{}` for unknown/null roles).
- `getRolesWithUsageProperties()` — list of roles that have at least one property.
- `isRoleKnown(role)` — predicate.

Mapping design (sample):
- `CASH`, `BANK`, `PETTY_CASH` → `usableInExpenses`, `usableInAdvances`, `usableInPayroll`, `usableInFuel`, `usableInMaintenance`, `usableInPurchases` (liquid asset accounts are payment sources in those screens).
- `CUSTOMER_AR` → `allowsClient`, `usableInRevenue`.
- `SUPPLIER_AP`, `SUBCONTRACTOR_AP` → `allowsSupplier`, `usableInPurchases`.
- `PROJECT_COST`, `LABOR_COST`, `SUBCONTRACTOR_COST` → `usableInExpenses`, `usableInProjects`, `allowsProject`, `allowsCostCenter`.
- `PAYROLL_EXPENSE`, `GOSI_EXPENSE` → `usableInPayroll`, `allowsCostCenter`, `allowsEmployee`.
- `EMPLOYEE_ADVANCE` → `usableInAdvances`, `allowsEmployee`, `requiresEmployee`.
- `RENTAL_REVENUE` → `usableInRevenue`, `usableInRental`, `allowsClient`.
- `PROJECT_REVENUE` → `usableInRevenue`, `usableInProjects`, `allowsProject`, `allowsClient`.
- `VAT_INPUT`/`VAT_OUTPUT`/`VAT_DUE`/`VAT_REFUND_RECEIVABLE`/`VAT_SETTLEMENT` → `allowsVat`.
- `FIXED_ASSET`, `ACCUM_DEPRECIATION` → `allowsEquipment`.
- `RETAINED_EARNINGS` → `{}` (intentionally empty — only the closing engine posts to it).

### Task 2 — `scripts/backfill-account-usage-properties.ts` (NEW, 195 lines)

Backfill script that:
1. Reads all 155 accounts from the DB.
2. For each of the 59 accounts that has an `accountRole`, recomputes the 20 usage properties via `getUsagePropertiesForRole()`.
3. Persists only the properties the role explicitly touches (preserves accountant overrides on properties the role does NOT touch — e.g. `showInCash`).
4. Reports per-role counts: total accounts, updated accounts.

**First-run result**: 58 accounts updated (1 role-miss for `RETAINED_EARNINGS`, which has intentionally empty mapping).
**Second-run result**: 0 updated (idempotent — all accounts now match the role-derived values).

### Task 3 — `src/lib/accounting/engine.ts` (MODIFIED)

Updated `ensureAccountExists()` and `initializeChartOfAccounts()` to compute usage properties via `getUsagePropertiesForRole()` at seed time and spread them into both the create and update payloads. Newly seeded accounts (and re-synced existing accounts) now automatically carry the right usage properties for their role.

### Task 4 — Accounts POST/PUT API (MODIFIED)

**`src/app/api/accounts/route.ts` (POST)**:
- Accepts all 20 usage property fields from the request body (booleans).
- If the caller provides an `accountRole` but no explicit usage properties, auto-computes them via `getUsagePropertiesForRole()`. This is the dynamic-selection guarantee: a newly-created account immediately appears in the right screens.
- If the caller passes explicit properties, those override the role defaults (so an accountant can fine-tune individual flags).

**`src/app/api/accounts/[id]/route.ts` (PUT)**:
- Accepts all 20 usage property fields.
- If the caller changes `accountRole` AND doesn't provide explicit usage properties, auto-recomputes them from the new role. This keeps the account's "appear in the right screens" behavior in sync with its role.
- Explicit properties override role defaults.

### Task 5 — Hardcoded fallback codes ELIMINATED (MODIFIED)

**`src/app/api/dashboard/route.ts`**:
- Removed the `resolveAccountCodes(roles, defaultCodes)` function with hardcoded fallbacks.
- New `resolveAccountCodes(roles)` calls `getAccountsByRoles(roles)` and returns whatever it finds — NO fallback.
- Removed all `['1110']`, `['1210']`, `['3210']`, etc. fallbacks from the 15 `Promise.all` calls.
- Behavior change: if a role has no mapped accounts, the corresponding dashboard balance is `0` (real state of the chart of accounts), not a silent fallback to a hardcoded code that the accountant may not have intended.

**`src/app/api/reports/route.ts`**:
- Line 275-279: removed `['1210']` fallback for `CUSTOMER_AR`. Now purely role-based.
- Line 321-324: removed `['3120']` fallback for `VAT_INPUT`. Now purely role-based.
- Line 327-332: removed `['3210', '3220']` fallback for `SUPPLIER_AP` + `SUBCONTRACTOR_AP`. Now purely role-based.
- Line 963-965: removed `['3210', '3220']` fallback in the supplier-purchases report. Now purely role-based.

Note: `src/lib/account-roles.ts` still has `defaultCodes` arrays in the `ACCOUNT_ROLES` registry — these are documentation/reference only (showing which SOCPA codes typically carry this role) and are NOT used for runtime account resolution. They are intentionally retained.

### Task 6 — `src/components/shared/account-selector.tsx` (MODIFIED)

The component already supported `filterByProperty?: Record<string, boolean>` and the `/api/accounts/by-role` endpoint already supported property-based filtering. Enhanced the component with:
- 21 new direct boolean props (`usableInExpenses`, `usableInProjects`, `usableInRental`, `usableInPayroll`, `usableInAdvances`, `usableInMaintenance`, `usableInFuel`, `usableInPurchases`, `usableInRevenue`, `showInCash`, `showInBank`, `allowsProject`, `allowsCostCenter`, `allowsEmployee`, `allowsEquipment`, `allowsSupplier`, `allowsClient`, `requiresEmployee`, `requiresProject`, `requiresEquipment`, `requiresContract`, `allowsVat`).
- These direct props are merged with `filterByProperty` (direct props take precedence on key collision).
- Lets callers write `<AccountSelector usableInExpenses value={...} onValueChange={...} />` instead of the more verbose `<AccountSelector filterByProperty={{ usableInExpenses: true }} ... />`.

### Task 7 — `scripts/e2e-dynamic-account-selection.ts` (NEW, 415 lines)

17-assertion E2E test that walks the FULL dynamic account selection flow:

1. **Step 0**: Locate a CASH account via role lookup (used as the Cr side of the test expense JE).
2. **Step 1**: Create a NEW account in the DB with role=`ADMIN_EXPENSE` and name "مصروف نهاية خدمة" — auto-computing usage properties at creation time via `getUsagePropertiesForRole()` (mirrors what the POST /api/accounts route does).
3. **Step 2**: Verify the role mapping function returns the expected flags (`usableInExpenses=true`, `allowsCostCenter=true`, `allowsProject=true` for `ADMIN_EXPENSE`). Then verify the persisted Account row in the DB has those same flags.
4. **Step 3**: Query accounts filtered by `usableInExpenses=true` AND `isActive=true` AND `allowPosting=true` (the SAME query the AccountSelector runs against `/api/accounts/by-role?usableInExpenses=true`). Verify the new account appears. Cross-check that `RENTAL_REVENUE` accounts have `usableInRevenue=true` and `usableInExpenses=false` (proving the filter is selective).
5. **Step 4**: Post a JE via `postJournalEntry()`: Dr `<new account>` 1,000 / Cr `CASH` 1,000. Verify the JE is balanced (Dr=Cr=1,000), has 2 lines, and references the correct accounts (Dr line is the new account with role `ADMIN_EXPENSE`, Cr line is CASH with role `CASH`).
6. **Step 5**: Verify the new account appears in the trial balance with debit=1,000 and credit=0. Verify the trial balance ties (Dr=Cr).
7. **Step 6**: Verify the new account appears in the income statement's expense accounts with balance=1,000. Verify `getAccountBalance(code)` returns 1,000.
8. **Step 7**: Defensive checks — the new account's code (`P4DYN-NNNNN`) is NOT one of the SOCPA default codes (1110/1210/3210/etc.), and the JE's Dr line is the dynamically-created account (proving no hardcoded fallback was used).

**Cleanup in `finally`**: Soft-deletes the JE + lines, hard-deletes any soft-deleted journal lines referencing the new account, then deletes the test account. Cleanup is wrapped in `db.$transaction` and runs even if a step above threw.

**Result**: 17/17 passed, 0 failed. Idempotent — running twice produces the same PASS with no leftover data.

## Verification Results

| Check | Result |
|-------|--------|
| `bun scripts/backfill-account-usage-properties.ts` (first run) | 58 accounts updated ✓ |
| `bun scripts/backfill-account-usage-properties.ts` (second run) | 0 updated (idempotent) ✓ |
| `bun scripts/e2e-dynamic-account-selection.ts` | 17/17 passed ✓ |
| `bun run lint` | clean (exit 0) ✓ |
| `bun run test:accounting` | 21/21 passed ✓ |
| `bun scripts/e2e-construction-cycle.ts` | 59/59 passed ✓ |
| `bun scripts/e2e-rental-cycle.ts` | 39/39 passed ✓ |
| `bun scripts/e2e-purchase-cycle.ts` | 43/43 passed ✓ |
| `bun scripts/e2e-payroll-cycle.ts` | 55/55 passed ✓ |
| `bun scripts/e2e-fixed-assets-cycle.ts` | 40/40 passed ✓ |
| `bun scripts/e2e-vat-cycle.ts` | 74/74 passed ✓ |
| `bun scripts/e2e-closing-cycle.ts` | 47/47 passed ✓ |

**Total E2E assertions across all cycles**: 357 (Phase 3) + 17 (P4-FIX) = 374, all passing.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/account-usage-mapping.ts` | NEW — role → usage properties mapping (240 lines) |
| `scripts/backfill-account-usage-properties.ts` | NEW — backfill script (195 lines) |
| `scripts/e2e-dynamic-account-selection.ts` | NEW — 17-assertion E2E test (415 lines) |
| `src/lib/accounting/engine.ts` | MODIFIED — `ensureAccountExists()` and `initializeChartOfAccounts()` now spread `getUsagePropertiesForRole()` into create/update payloads |
| `src/app/api/accounts/route.ts` | MODIFIED — POST accepts 20 usage properties, auto-computes from role if none provided |
| `src/app/api/accounts/[id]/route.ts` | MODIFIED — PUT accepts 20 usage properties, auto-recomputes from role on role change |
| `src/app/api/dashboard/route.ts` | MODIFIED — removed `resolveAccountCodes()` fallback param, removed all 15 hardcoded `['1110']`/`['1210']`/etc. fallbacks |
| `src/app/api/reports/route.ts` | MODIFIED — removed 4 hardcoded fallbacks (`['1210']`, `['3120']`, `['3210','3220']` x2) |
| `src/components/shared/account-selector.tsx` | MODIFIED — added 21 direct usage-property convenience props that merge with `filterByProperty` |

## Architectural Findings

1. **Usage properties flow from the role, not from a manual configuration step.** The role mapping in `account-usage-mapping.ts` is the single source of truth. Accountants can override individual flags per-account for edge cases (e.g. "this petty cash is for project X only") — those overrides are preserved by the backfill script because it only writes properties the role explicitly touches.

2. **No hardcoded fallback codes anywhere in the operational read path.** The dashboard and reports APIs now reflect the real state of the chart of accounts. If a role is unmapped, the corresponding balance is `0` — never a silent fallback to a code the accountant may not have intended. This eliminates an entire class of "why is my dashboard showing the wrong account's balance?" bugs.

3. **The AccountSelector component is now property-first, role-second.** New screens should prefer `<AccountSelector usableInExpenses />` over `<AccountSelector roles={['CASH', 'BANK']} />`. Property-based selection is more flexible: an accountant can mark any account as `usableInExpenses=true` (even one without a traditional "payment method" role) and it will appear in the expenses screen.

4. **The 20 usage properties were already in the Prisma schema (Phase 1 work) but were NEVER populated.** The P4-FIX backfill script + the COA seed update + the POST/PUT API auto-compute together ensure that every account — past, present, and future — has the right properties set automatically. No manual configuration needed.

5. **The by-role API endpoint (`/api/accounts/by-role`) already supported property-based filtering.** The infrastructure was in place; what was missing was the data. P4-FIX closes that gap.

6. **The 7 Phase-3 cycle E2E tests (357 assertions) still pass unchanged.** The dynamic account selection changes are backwards-compatible: existing role-based lookups continue to work, and the new usage properties are additive (default false in the schema, set to true by the role mapping). No regression in any of the 7 cycles.

7. **The `defaultCodes` arrays in `ACCOUNT_ROLES` registry are documentation, not runtime.** They show which SOCPA codes typically carry each role (useful for the chart-of-accounts UI), but they are NEVER used for runtime account resolution. All runtime resolution goes through `getAccountsByRole()` / `getDefaultAccountByRole()` / `requireAccountByRole()` which query the DB by `accountRole` field. The P4-FIX work removed the last few places that used `defaultCodes` as a silent fallback when the DB query returned nothing.

## Stage Summary

Phase 4 (Dynamic Account Selection): **COMPLETE ✅**

The system is now fully dynamic with respect to account selection:
- Create an account with role `ADMIN_EXPENSE` → it automatically has `usableInExpenses=true`, `allowsProject=true`, `allowsCostCenter=true`.
- The expenses screen's AccountSelector (filtered by `usableInExpenses=true`) automatically shows the new account.
- The expense JE poster uses the account the user selected — no hardcoded fallback.
- The trial balance and income statement automatically include the new account.
- Zero code changes needed when adding a new account — just set its role.
