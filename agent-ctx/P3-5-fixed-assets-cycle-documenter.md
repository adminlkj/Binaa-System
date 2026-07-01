# P3-5 — Fixed Assets Cycle Documenter & E2E Tester

**Task ID**: P3-5
**Phase**: 3 — Workflow Integrity
**Cycle**: 5 (Fixed Assets)
**Status**: ✅ COMPLETE

## Mission

Document and test the FIXED ASSETS cycle end-to-end:
```
Fixed Asset Acquisition → Depreciation (monthly) → (optional Reversal) → (optional Disposal)
```

## Context Sources Read

- `/home/z/my-project/worklog.md` (prior tasks A → P3-4)
- `/home/z/my-project/download/Binaa-System/docs/WORKFLOW-CONSTRUCTION-CYCLE.md` (template)
- `/home/z/my-project/download/Binaa-System/scripts/e2e-construction-cycle.ts` (test pattern)
- `/home/z/my-project/download/Binaa-System/scripts/e2e-rental-cycle.ts` (testImpactOnRole helper)
- `/home/z/my-project/download/Binaa-System/scripts/e2e-payroll-cycle.ts` (cleanup pattern)
- All Fixed Assets API route files:
  - `src/app/api/fixed-assets/route.ts` (POST: create asset)
  - `src/app/api/fixed-assets/[id]/route.ts` (GET/PUT/DELETE)
  - `src/app/api/fixed-assets/[id]/depreciate/route.ts` (POST: single-asset depreciation)
  - `src/app/api/fixed-assets/depreciate-all/route.ts` (POST: bulk depreciation)
  - `src/app/api/fixed-assets/depreciate/route.ts` (POST: ⚠ LEGACY route, bypasses engine)
  - `src/app/api/fixed-assets/report/route.ts` (GET: schedule report)
  - `src/app/api/asset-depreciations/route.ts` (GET: list records)
  - `src/app/api/asset-depreciations/[id]/reverse/route.ts` (POST: reverse)
- `src/lib/accounting/depreciation-engine.ts` (944 lines — central engine)
- `src/lib/accounting/engine.ts` (autoEntryAssetDisposal:1199-1243 — DEAD CODE)
- `src/lib/accounting/guard.ts` (postJournalEntry, reverseJournalEntry)
- `src/lib/account-roles.ts` (FIXED_ASSET, ACCUM_DEPRECIATION, DEPRECIATION_EXPENSE, RENTAL_DEPRECIATION, ASSET_DISPOSAL_GAIN/LOSS roles)
- `src/lib/safe-money.ts` (Decimal.js helpers)
- `prisma/schema.prisma:2210-2270` (FixedAsset + AssetDepreciation models, @@unique constraint)
- `prisma/schema.prisma:74-78` (JournalEntryStatus enum — DRAFT, POSTED, CANCELLED only; NO 'REVERSED')

## Deliverables

1. **`docs/WORKFLOW-FIXED-ASSETS-CYCLE.md`** — full documentation (same format as construction-cycle doc):
   - Overview + ASCII flow diagram (with disposal flagged as DEAD CODE gap)
   - "The Central Engine" section documenting `depreciation-engine.ts` exports
   - Step 1 (Acquisition): API endpoint, route file path+lines, authz, prerequisites, required/optional fields, JE function, sourceType=ASSET_ACQUISITION, status transitions, safety guards, affected reports, JE structure
   - Step 2 (Monthly Depreciation) — three sub-paths:
     2a (single-asset), 2b (bulk), 2c (⚠ LEGACY route to avoid)
   - Step 3 (Reversal): API endpoint, engine function, reversal sequence, JE structure, idempotency
   - Step 4 (Disposal): **⚠ GAP** — documented as DEAD CODE
   - Asset Lifecycle States section with ASCII state diagram
   - Cycle Completion Verification (V1-V7): TB ties, JEs balanced, register ties to GL, source↔JE linkage, numerical consistency I1-I7, idempotency guards, Decimal.js rounding safety
   - Journal Entry Summary table
   - File Map
   - 13 Key Architectural Findings

2. **`scripts/e2e-fixed-assets-cycle.ts`** — 40-assertion E2E test:
   - (a) Setup: Branch, Client, CostCenter, Project
   - (b) Step 1: Create Fixed Asset (cost=12000, years=5, rate=20% → monthly=200, residual=0) → verify acquisition JE (Dr FIXED_ASSET 12000 / Cr CASH 12000, sourceType=ASSET_ACQUISITION)
   - (c) Step 2: Run depreciation for year=2099, month=12 → verify JE (Dr DEPRECIATION_EXPENSE 200 / Cr ACCUM_DEPRECIATION 200, sourceType=DEPRECIATION, date=2099-12-01); verify accumDep=200, NBV=11800; verify lastDepreciationDate; verify AssetDepreciation row; verify idempotency (re-run skipped); verify DB @@unique
   - (d) Step 3: Reverse → verify reversal JE (Dr ACCUM_DEPRECIATION 200 / Cr DEPRECIATION_EXPENSE 200, isReversal=true); verify original stays POSTED; verify accumDep=0, NBV=12000 restored; verify double-reversal blocked
   - (e) Final: 3 JEs balanced; trial balance ties (Dr=Cr=39000); verifyNumericalConsistency ok=true; source↔JE linkage intact; per-account impact verified (FIXED_ASSET Dr=12000/Cr=0, CASH Dr=0/Cr=12000, DEPRECIATION_EXPENSE Dr=200/Cr=200, ACCUM_DEPRECIATION Dr=200/Cr=200); net cash=-12000; register ties to GL; GL accum dep = FixedAsset accum dep
   - Cleanup in `finally`: soft-deletes all 3 JEs, hard-deletes all source docs in reverse FK order

## Significant Gap Documented — Disposal is DEAD CODE

**Location**: `src/lib/accounting/engine.ts:1205-1243`

**Finding**: `autoEntryAssetDisposal` is exported but **never called** anywhere in the codebase (verified via `grep -rn "autoEntryAssetDisposal" src/` — only the function definition matches).

**Impact**:
- No HTTP route exposes disposal
- No UI screen for disposal
- The `FixedAsset.status` enum has `SOLD` and `DISPOSED` values that are NEVER set
- The `ASSET_DISPOSAL_GAIN` (code 6310) and `ASSET_DISPOSAL_LOSS` (code 8610) roles are correctly mapped in `account-roles.ts` and ready to be used, but no caller exists
- Accountants must use DELETE (auto-reverses acquisition but does NOT recognise gain/loss) or manual JE with sourceType='MANUAL'

**Recommendation**: Add a `POST /api/fixed-assets/[id]/dispose` route that calls `autoEntryAssetDisposal`, updates `FixedAsset.status` to `DISPOSED`, and stores the disposal JE id on a new `disposalJournalEntryId` field (would require a schema migration).

## Results

| Check | Result |
|---|---|
| `bun scripts/e2e-fixed-assets-cycle.ts` | ✅ 40 passed, 0 failed |
| `bun run lint` | ✅ clean (exit 0) |
| `bun scripts/e2e-construction-cycle.ts` (regression) | ✅ 59 passed, 0 failed |
| `bun scripts/e2e-rental-cycle.ts` (regression) | ✅ 39 passed, 0 failed |
| `bun scripts/e2e-purchase-cycle.ts` (regression) | ✅ 43 passed, 0 failed |
| `bun scripts/e2e-payroll-cycle.ts` (regression) | ✅ 55 passed, 0 failed |
| Cleanup verification | ✅ 0 leftover records, 0 leftover JEs |
| Idempotency (re-run) | ✅ Same PASS result, no leftover data |

## Key Numbers Verified End-to-End

- Acquisition JE: Dr=FIXED_ASSET 12000 / Cr=CASH 12000 (sourceType=ASSET_ACQUISITION, sourceId=asset.id)
- Depreciation JE: Dr=DEPRECIATION_EXPENSE 200 / Cr=ACCUM_DEPRECIATION 200 (sourceType=DEPRECIATION, sourceId=asset.id, date=2099-12-01)
- Reversal JE: Dr=ACCUM_DEPRECIATION 200 / Cr=DEPRECIATION_EXPENSE 200 (sourceType=DEPRECIATION preserved, isReversal=true, reversedEntryId=original.id, status=POSTED, original stays POSTED)
- Trial balance total: Dr=39000.00 = Cr=39000.00 (balanced)
- After 1 month depreciation: accumDep=200.00 (Decimal.js safe), NBV=11800.00
- After reversal: accumDep=0.00, NBV=12000.00 (restored)
- 3 cycle JEs all balanced ✓
- verifyNumericalConsistency (I1-I7) ok=true, 9 accounts checked, 0 diffs ✓

## Per-Account Test Impact (filtered to this test's JEs only)

| Account | Code | Dr | Cr | Net | Notes |
|---|---|---|---|---|---|
| FIXED_ASSET | 2110-2140 | 12000 | 0 | +12000 | acquisition capitalisation |
| CASH | 1110 | 0 | 12000 | -12000 | acquisition payment out |
| DEPRECIATION_EXPENSE | 8310-8340 | 200 | 200 | 0 | depreciation Dr, reversal Cr |
| ACCUM_DEPRECIATION | 2210-2240 | 200 | 200 | 0 | reversal Dr, depreciation Cr |

## Stage Summary

- Phase 3 Cycle 5 (Fixed Assets Cycle): **COMPLETE ✅**
- All 5 phase-3 cycles now have full documentation + passing E2E tests:
  - Cycle 1 (Construction): 59/59 ✓
  - Cycle 2 (Rental): 39/39 ✓
  - Cycle 3 (Purchase): 43/43 ✓
  - Cycle 4 (Payroll): 55/55 ✓
  - Cycle 5 (Fixed Assets): 40/40 ✓
- Total: **236 E2E assertions across 5 cycles, all passing**.
- Significant gap documented: `autoEntryAssetDisposal` is DEAD CODE — no API endpoint for asset disposal.
- Ready to proceed to Cycle 6 (VAT) — P3-6.
