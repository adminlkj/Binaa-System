# دورة الأصول الثابتة — Fixed Assets Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.5 (Task ID: P3-5)
>
> This document records the FULL fixed-assets business cycle as actually
> implemented in the Binaa-System ERP codebase, from asset acquisition
> through monthly depreciation, optional reversal, and (currently
> dormant) disposal. Each step lists the API endpoint, required input
> fields, the journal entry (if any) posted, status transitions,
> prerequisites, and the reports affected. A companion end-to-end test
> (`scripts/e2e-fixed-assets-cycle.ts`) exercises every step against the
> live database and verifies that all JEs are balanced, that the trial
> balance / depreciation schedule / fixed-asset register tie out, and
> that the underlying engine (using `safeMoney` / Decimal.js for
> rounding-safe arithmetic) leaves the asset's accumulated depreciation
> and net book value numerically consistent.

---

## نظرة عامة — Overview

The fixed-assets cycle in Binaa-System is the chain:

```
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ 1. Fixed Asset           │ → │ 2. Monthly Depreciation  │ → │ 3. (Optional) Reverse a  │
│    Acquisition           │    │    (per period)          │    │    Specific Depreciation │
│    POST /api/fixed-assets│    │    POST /api/fixed-assets│    │    POST /api/asset-      │
│      /route.ts           │    │      /[id]/depreciate    │    │      depreciations/[id]/ │
│                          │    │      OR                  │    │      reverse            │
│    JE: Dr FIXED_ASSET    │    │    /api/fixed-assets/    │    │                          │
│         Cr CASH / BANK   │    │      depreciate-all      │    │    Reverses the period's │
│    sourceType=           │    │                          │    │    depreciation JE +     │
│      ASSET_ACQUISITION   │    │    JE: Dr DEPRECIATION_  │    │    restores accum dep +  │
│                          │    │              EXPENSE     │    │    NBV on the asset      │
│                          │    │         Cr ACCUM_        │    │                          │
│                          │    │              DEPRECIATION│    │                          │
│                          │    │    sourceType=DEPRECIATION│    │                          │
└──────────────────────────┘    └──────────────────────────┘    └──────────────────────────┘
                                         │
                                         ↓
                          ┌──────────────────────────────────────────┐
                          │ 4. (Optional) Asset Disposal             │
                          │    ⚠ GAP: autoEntryAssetDisposal exists  │
                          │    in engine.ts but is DEAD CODE — no    │
                          │    route or service invokes it. There is │
                          │    NO public API for disposing of an     │
                          │    asset. The asset can only be DELETED  │
                          │    (which auto-reverses the acquisition  │
                          │    JE) — there is no sale/gain/loss JE.  │
                          └──────────────────────────────────────────┘
```

**Key design principle** — Fixed assets capitalise at *acquisition* time
(Dr FIXED_ASSET / Cr CASH or BANK) and depreciate at *period close*
time (Dr DEPRECIATION_EXPENSE / Cr ACCUM_DEPRECIATION, monthly
straight-line per IAS 16 / SOCPA). All depreciation arithmetic is
centralised in `src/lib/accounting/depreciation-engine.ts` and uses
`safeMoney` (Decimal.js) for rounding-safe accumulation across the
asset's full useful life (typically 60 months) — preventing the
sub-halala drift that plagues IEEE-754 floats.

---

## The Central Engine — `depreciation-engine.ts`

All asset creation, depreciation, reversal, and deletion logic lives in
`src/lib/accounting/depreciation-engine.ts` (944 lines). The HTTP
routes are thin wrappers — they validate input, call an engine
function, and serialise the response. The engine exposes:

| Export | Purpose |
|---|---|
| `calculateDepreciation(input)` | Pure function — straight-line calculation. Returns `monthlyDepreciation`, `annualDepreciation`, `residualValue`, `usefulLifeMonths`, `netBookValue`. Uses `safeMoney` (Decimal.js) — `round2Money(mulMoney(cost, divMoney(rate, 100)))`. |
| `generateDepreciationSchedule(asset, postedRecords)` | Pure function — generates the full expected depreciation schedule (one row per month from acquisitionDate through end of useful life). Marks each row `isPosted` if a matching `AssetDepreciation` row exists in `postedRecords`. |
| `resolveAssetAccounts(category, overrides, tx)` | Resolves the three accounts (FIXED_ASSET, DEPRECIATION_EXPENSE/RENTAL_DEPRECIATION, ACCUM_DEPRECIATION) by role lookup. For category=`EQUIPMENT`, uses `RENTAL_DEPRECIATION` (code 7250) instead of `DEPRECIATION_EXPENSE` (codes 8310–8340), with fallback to `DEPRECIATION_EXPENSE` if no rental-depreciation account is mapped. |
| `generateAssetCode(tx)` | Returns the next sequential `AST-NNNN` code. |
| `createAssetWithAcquisition(input)` | Creates the FixedAsset row + posts the acquisition JE (Dr FIXED_ASSET / Cr CASH or BANK, sourceType=`ASSET_ACQUISITION`). Single atomic `$transaction`. |
| `updateAssetAndRecalculate(input)` | Updates the asset — blocks if any non-reversed depreciation exists ("لا يمكن تعديل أصل تم إهلاكه — يجب عكس القيود أولاً"). Recalculates monthly/annual depreciation. |
| `runDepreciationForAsset(assetId, year, month, tx)` | Posts one month of depreciation. Idempotent — checks `@@unique([fixedAssetId, year, month])` AND a JS-level `findFirst` guard. Last-month truing-up to residual value. Posts JE with `sourceType=DEPRECIATION`. |
| `runBulkDepreciation(year, month, assetIds?)` | Iterates all ACTIVE assets (or a subset if `assetIds` provided) and calls `runDepreciationForAsset` per asset. Each asset is its own transaction (the bulk runner does NOT wrap the whole batch in one tx — a failure on one asset does NOT roll back the others). |
| `reverseAssetDepreciation(depreciationId, tx)` | Reverses a specific period's depreciation JE via `reverseEntry`, marks `AssetDepreciation.reversed=true`, restores the asset's `accumulatedDepreciation` and `netBookValue`, and flips `status` back to `ACTIVE` if it was `FULLY_DEPRECIATED`. |
| `deleteAsset(assetId, tx)` | Soft-blocks if any non-reversed depreciation exists. Otherwise auto-reverses the acquisition JE (if any) via `reverseEntry`, hard-deletes the (already-reversed) depreciation rows, then hard-deletes the FixedAsset row. |

---

## الخطوة 1: تملك أصل ثابت — Fixed Asset Acquisition

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fixed-assets` |
| **Route file** | `src/app/api/fixed-assets/route.ts` (lines 99-155) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | `createAssetWithAcquisition(input)` in `src/lib/accounting/depreciation-engine.ts` (lines 401-499) |
| **Prerequisites** | At least one account must be mapped to the `FIXED_ASSET` role (codes 2110/2120/2130/2140). At least one account must be mapped to `CASH` (1110) or `BANK` (1120) — selected by `payFrom`. The `DEPRECIATION_EXPENSE` and `ACCUM_DEPRECIATION` roles need not be mapped at acquisition time, but they ARE required at depreciation time. |
| **Required input fields** | `name` (non-empty), `acquisitionDate` (ISO date), `acquisitionCost` (number > 0), `usefulLifeYears` (number > 0) |
| **Optional fields** | `nameAr`, `category` (default `'OTHER'` — also accepts `EQUIPMENT`, `VEHICLE`, `OFFICE_EQUIPMENT`, `SOFTWARE`, `BUILDING`, `FURNITURE`), `depreciationRate` (percent; if omitted → derived as `100 ÷ usefulLifeYears`), `notes`, `accountId` (override the asset account), `depExpenseAccountId` (override the depreciation-expense account), `accumDepAccountId` (override the accumulated-depreciation account), `createAcquisitionEntry` (default `true`; pass `false` to create the asset without capitalising it), `payFrom` (`'TREASURY'` default → CASH, or `'BANK'` → BANK) |
| **Auto-generated** | `assetCode` as `AST-NNNN` (sequential, looked up from the highest existing `AST-NNNN` code) |
| **Computed (stored on FixedAsset)** | `residualValue = max(0, acquisitionCost − annualDepreciation × usefulLifeYears)`; `usefulLifeMonths = round(usefulLifeYears × 12)`; `annualDepreciation = round2(cost × rate ÷ 100)` via Decimal.js; `monthlyDepreciation = round2(annualDepreciation ÷ 12)` via Decimal.js; `accumulatedDepreciation = 0`; `netBookValue = acquisitionCost`; `depreciationMethod = 'STRAIGHT_LINE'`; `status = 'ACTIVE'` |
| **Journal entry posted** | **Yes (by default)** — `createAssetWithAcquisition` posts: `Dr FIXED_ASSET (cost)` / `Cr CASH (cost)` or `Cr BANK (cost)`. sourceType=`ASSET_ACQUISITION`, sourceId=`asset.id`. The JE id is stored back on `FixedAsset.journalEntryId`. If `createAcquisitionEntry=false` is passed, NO JE is posted (asset is registered but not capitalised — useful for already-owned assets being migrated). If the JE creation throws (e.g. role not mapped), the engine catches, logs, and continues — the asset is created without a JE. |
| **Status transitions** | New assets start at `ACTIVE`. No JE on any subsequent status change. `FULLY_DEPRECIATED` is set automatically by `runDepreciationForAsset` when NBV ≤ residualValue + 0.01. `SOLD` and `DISPOSED` are valid enum values on the model but have NO code path that sets them (disposal is dead code — see Step 4). |
| **Validation** | `usefulLifeYears > 0` (route-level check at line 114). `assetCode` uniqueness (DB-level `@unique`). |
| **Affected reports** | Fixed-assets register, balance sheet (Fixed Assets section: cost − accum dep = NBV), depreciation schedule report |

### Acquisition JE structure

```
Dr  FIXED_ASSET        (2110-2140)   acquisitionCost
Cr  CASH (1110)  or  BANK (1120)     acquisitionCost
```

- `sourceType = 'ASSET_ACQUISITION'`
- `sourceId   = asset.id` (the FixedAsset primary key)
- `description = "Acquisition of <name>"`
- `descriptionAr = "تملك أصل ثابت: <nameAr||name>"`
- The JE id is written back to `FixedAsset.journalEntryId` (line 478-481) — providing the source↔JE linkage.

---

## الخطوة 2: الإهلاك الشهري — Monthly Depreciation

Three equivalent entry points all delegate to the same engine function
`runDepreciationForAsset`. Choose by use case:

### 2a. Single-asset depreciation — `POST /api/fixed-assets/[id]/depreciate`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fixed-assets/[id]/depreciate` |
| **Route file** | `src/app/api/fixed-assets/[id]/depreciate/route.ts` (lines 7-46) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | `runDepreciationForAsset(id, year, month)` in `depreciation-engine.ts` (lines 624-791) |
| **Required input** | `{ year: number, month: number }` in JSON body |
| **Returns** | `{ success, assetId, assetCode, assetName, period, depreciationAmount, beginningNBV, endingNBV, journalEntryId, journalEntryNo, fullyDepreciated, message }` — or `{ skipped: true, skipReason }` with HTTP 200 if the asset was skipped (not active / already depreciated / fully depreciated). |
| **Status code** | `201 Created` on success; `200 OK` if skipped. |

### 2b. Bulk depreciation — `POST /api/fixed-assets/depreciate-all`

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fixed-assets/depreciate-all` |
| **Route file** | `src/app/api/fixed-assets/depreciate-all/route.ts` (lines 7-40) |
| **Authz** | `requireRoleApi('ADMIN')` — note: stricter than single-asset (ADMIN only, no ACCOUNTANT) |
| **Engine function** | `runBulkDepreciation(year, month, assetIds?)` in `depreciation-engine.ts` (lines 806-843) |
| **Required input** | `{ year, month, assetIds?: string[] }` in JSON body |
| **Returns** | `{ success, processed, skipped, skippedDetails, totalAmount, journalEntryIds, results, message }` |
| **Atomicity caveat** | `runBulkDepreciation` iterates assets and calls `runDepreciationForAsset` per asset — each in its own `$transaction` (the engine wraps a single call in `db.$transaction` when no `tx` is passed). A failure on asset N does NOT roll back assets 1..N−1. This is intentional — depreciation should be best-effort, with a `skippedDetails` array telling the operator what didn't post. |

### 2c. Legacy bulk route — `POST /api/fixed-assets/depreciate`  ⚠ AVOID

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/fixed-assets/depreciate` |
| **Route file** | `src/app/api/fixed-assets/depreciate/route.ts` (lines 7-139) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | None — this route implements its OWN inline depreciation logic in the route handler, bypassing `depreciation-engine.ts` entirely. |
| **Why avoid** | (a) It does NOT use `safeMoney`/Decimal.js — uses raw JS `Number` arithmetic, susceptible to sub-halala drift. (b) It posts with `sourceType='ASSET_DEPRECIATION'` instead of `'DEPRECIATION'` — different sourceType breaks downstream filtering (the `[id]/route.ts` GET handler queries by `journalEntryId` linkage, so the sourceType mismatch doesn't break linkage, but reporting tools that filter by `sourceType='DEPRECIATION'` will miss JEs from this route). (c) It does NOT record `beginningNBV` / `endingNBV` on the AssetDepreciation row (only `depreciationAmount`). (d) It does NOT set `lastDepreciationDate` on the asset. (e) It does NOT use `getNextEntryNo` for the entry number — actually it does, but it still bypasses the central engine's idempotency check (it does check for `existingDep` but does NOT check `reversed` flag). |

**Recommendation**: Use 2a or 2b only. The 2c route should be deleted in a future cleanup — it predates the central engine and was left in place for backwards compatibility. The E2E test does NOT exercise this route.

### Depreciation JE structure (both 2a and 2b)

```
Dr  DEPRECIATION_EXPENSE   (8310-8340)    monthlyDepreciation
Cr  ACCUM_DEPRECIATION     (2210-2240)    monthlyDepreciation
```

For category=`EQUIPMENT` assets, the Dr side uses `RENTAL_DEPRECIATION` (code 7250) instead:
```
Dr  RENTAL_DEPRECIATION    (7250)         monthlyDepreciation
Cr  ACCUM_DEPRECIATION     (2210-2240)    monthlyDepreciation
```

- `sourceType = 'DEPRECIATION'`
- `sourceId   = asset.id` (NOT the AssetDepreciation id — the FixedAsset id, so all depreciation JEs for an asset share the same sourceId)
- `date = new Date(year, month-1, 1)` — first day of the period month
- `description = "Depreciation - <asset.name> (<month>/<year>)"`
- `descriptionAr = "إهلاك <assetNameAr||asset.name> - <month>/<year>"`
- `entryNo = getNextEntryNo(tx)` — standard `JE-NNNNNN` sequential

### Side effects on the FixedAsset row

After a successful depreciation run:

| Field | Update |
|---|---|
| `accumulatedDepreciation` | `round2(old + depreciationAmount)` via Decimal.js `addMoney`/`round2Money` |
| `netBookValue` | `round2(acquisitionCost − newAccumDep)` via Decimal.js `subMoney`/`round2Money` |
| `lastDepreciationDate` | `new Date(year, month-1, 1)` — first day of the period |
| `status` | `'FULLY_DEPRECIATED'` if `newNBV ≤ residualValue + 0.01`, else remains `'ACTIVE'` |

A new `AssetDepreciation` row is created with `fixedAssetId`, `year`, `month`, `depreciationAmount`, `beginningNBV`, `endingNBV`, and `journalEntryId` — providing the per-period audit trail. The `@@unique([fixedAssetId, year, month])` DB constraint catches duplicate periods at the DB level if a concurrent request races past the JS-level `findFirst` idempotency check.

### Last-month truing-up

The engine trues up the final month so NBV lands exactly on `residualValue`:
```ts
let depreciationAmount = monthlyDep
const projectedNBV = beginningNBV - monthlyDep
if (projectedNBV < residualValue) {
  depreciationAmount = beginningNBV - residualValue
}
```
This prevents the off-by-one-penny problem where the standard monthly amount would leave NBV at `residualValue + ε` or `residualValue − ε` after the final period. The `Math.max(0, ...)` guard ensures a non-negative depreciation amount if the asset is already at residual.

### Skip conditions (no JE posted)

| Condition | `skipReason` |
|---|---|
| `asset.status !== 'ACTIVE'` | `الأصل ليس نشطاً (<status>)` — covers `FULLY_DEPRECIATED`, `SOLD`, `DISPOSED` |
| AssetDepreciation row already exists for `(fixedAssetId, year, month)` with `reversed=false` | `تم الإهلاك مسبقاً لهذه الفترة` |
| `monthlyDepreciation <= 0` | `قيمة الإهلاك الشهري صفر` |
| `beginningNBV <= residualValue + 0.01` | `وصل للقيمة المتبقية` (returns `fullyDepreciated: true`) |
| `depreciationAmount <= 0` after truing-up | `لا يوجد مبلغ قابل للإهلاك` |
| `DEPRECIATION_EXPENSE` or `ACCUM_DEPRECIATION` role not mapped to any account | `لم يتم ربط حسابات الإهلاك في دليل الحسابات` |
| `createJournalEntry` throws (e.g. R2 unbalanced — should never happen with straight-line) | `فشل إنشاء القيد: <errMsg>` |

---

## الخطوة 3: عكس إهلاك شهر محدد — Depreciation Reversal

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/asset-depreciations/[id]/reverse` |
| **Route file** | `src/app/api/asset-depreciations/[id]/reverse/route.ts` (lines 7-24) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Engine function** | `reverseAssetDepreciation(depreciationId)` in `depreciation-engine.ts` (lines 857-901) |
| **Required input** | None (the `[id]` path param is the `AssetDepreciation.id`) |
| **Returns** | `{ success: true, message: "تم عكس إهلاك <month>/<year> للأصل <assetCode>" }` |

### Reversal sequence (single atomic `$transaction`)

1. Fetch the `AssetDepreciation` row with its parent `FixedAsset`.
2. **Validate**: row exists, `reversed === false`, `journalEntryId` is not null. Throws on any violation.
3. Call `reverseEntry(dep.journalEntryId, tx)` — delegates to the central `guardedReverse` which:
   - Looks up the original posted JE.
   - Throws if `status !== 'POSTED'` or already reversed (a reversal JE with `reversedEntryId = originalId` already exists).
   - Builds a mirror JE (flips debit↔credit on every line), with `entryNo = getNextEntryNo(tx)`, `isReversal = true`, `reversedEntryId = originalId`, `date = new Date()` (today), `description = "عكس <originalEntryNo>"`.
   - Posts the reversal through `postJournalEntry` (re-runs R1–R12 guards on the new entry).
   - **The original JE stays `status='POSTED'`** — per the guard design (comment at `guard.ts:413`), both entries remain POSTED and net out to zero in the trial balance. There is no `'REVERSED'` status enum value. The linkage is expressed via the reversal JE's `isReversal=true` and `reversedEntryId=originalId` fields.
4. Mark `AssetDepreciation.reversed = true`, `reversedAt = new Date()`.
5. Recompute the asset:
   - `newAccumDep = max(0, asset.accumulatedDepreciation − dep.depreciationAmount)` — note: this uses raw JS `Number` arithmetic and `Math.max`, NOT `safeMoney` (a minor inconsistency with the depreciation path which uses Decimal.js). The amounts are small and well within JS float precision for typical fixed-asset values, so this is acceptable but worth noting.
   - `newNBV = acquisitionCost − newAccumDep` — note: NOT clamped to `residualValue` here (a reversal can take NBV back above residual, which is correct).
   - `status = 'ACTIVE'` — unconditionally. If the asset was `FULLY_DEPRECIATED` because of this period's depreciation, it goes back to `ACTIVE`. If it was `FULLY_DEPRECIATED` from prior periods, the unconditional reset to `ACTIVE` is technically incorrect (the asset is still fully depreciated as of the prior period). This is a minor design trade-off — the operator is expected to reverse only the most recent period.

### Reversal JE structure

Identical to the depreciation JE but with Dr/Cr flipped:
```
Dr  ACCUM_DEPRECIATION     (2210-2240)    depreciationAmount   (was Cr)
Cr  DEPRECIATION_EXPENSE   (8310-8340)    depreciationAmount   (was Dr)
```
(or `RENTAL_DEPRECIATION` for `EQUIPMENT` category assets)

- `sourceType = 'DEPRECIATION'` (preserved from the original — `reverseEntry` copies `original.sourceType`)
- `sourceId = asset.id` (preserved from the original)
- `isReversal = true`
- `reversedEntryId = originalJE.id`
- `date = new Date()` (today — NOT the original period date)

### Idempotency

- The route does NOT guard against double-reversal at the HTTP level, but the engine throws `'تم عكس هذا الإهلاك مسبقاً'` if `dep.reversed === true` is detected at step 2.
- The `reverseEntry` guard also throws `ALREADY_REVERSED` if a reversal JE for the same original already exists.
- Together these prevent double-reversal under any race condition.

---

## الخطوة 4 (اختيارية): التخلص من أصل — Asset Disposal  ⚠ GAP

### Status: **DEAD CODE — no API endpoint exists**

| Field | Value |
|---|---|
| **API endpoint** | **NONE** — there is no route under `src/app/api/` that exposes disposal |
| **Engine function** | `autoEntryAssetDisposal(data)` in `src/lib/accounting/engine.ts` (lines 1205-1243) — exported but **never called** anywhere in the codebase (verified via `grep -rn "autoEntryAssetDisposal" src/`) |
| **Roles mapped** | `ASSET_DISPOSAL_GAIN` → code 6310 (revenue); `ASSET_DISPOSAL_LOSS` → code 8610 (expense) — both correctly defined in `account-roles.ts` and ready to be used, but no caller exists |

### The intended disposal JE (per the dead-code function)

For a sale at `salePrice` of an asset with `originalCost` and `accumulatedDepreciation`:

```
Dr  CASH / BANK                        salePrice                  (cash received)
Dr  ACCUM_DEPRECIATION                  accumulatedDepreciation    (remove accum dep)
Cr  FIXED_ASSET                         originalCost               (remove asset)
Dr  ASSET_DISPOSAL_LOSS (8610)          |salePrice − NBV|          (if loss)
Cr  ASSET_DISPOSAL_GAIN (6310)          |salePrice − NBV|          (if gain)
```

where `NBV = originalCost − accumulatedDepreciation` and `gainLoss = salePrice − NBV`.

- `sourceType = 'ASSET_DISPOSAL'`
- `sourceId = "DSP-<Date.now()>"` (timestamp-based, NOT a stable FK — a known minor issue)
- `description = "Asset disposal - <assetAccountCode>"`

### What's missing

1. **No HTTP route** — accountants cannot dispose of an asset through the UI.
2. **No state transition** — the `FixedAsset.status` enum has `SOLD` and `DISPOSED` values, but no code path ever sets them.
3. **No FK linkage** — the `sourceId` in the dead function is `"DSP-<timestamp>"`, not the asset id. If this were wired up, the `FixedAsset.journalEntryId` would need to be updated to point to the disposal JE (currently only the acquisition JE id is stored there).
4. **No `disposalDate` / `disposalPrice` field** on the FixedAsset model — would need a schema migration to support full disposal tracking.
5. **No accumulation guard** — the dead function does NOT check whether the asset has un-reversed depreciation rows that would need to be reversed first (or whether the disposal should post the disposal JE based on the net book value at the disposal date — which requires the asset's accumulated depreciation to be correct as of that date).

### Workaround in production

Accountants currently "dispose" of an asset by either:

1. **DELETE the asset** (`DELETE /api/fixed-assets/[id]`) — the engine's `deleteAsset` function soft-blocks if any non-reversed depreciation exists, otherwise auto-reverses the acquisition JE (Dr CASH / Cr FIXED_ASSET) and hard-deletes the asset. This **does NOT recognise a gain or loss** — it simply unwinds the acquisition as if it never happened. This is acceptable for assets that were never depreciated, but is incorrect for assets that were partially or fully depreciated.
2. **Manual journal entry** — the accountant posts a manual JE through the Journal Entries screen with `sourceType='MANUAL'` to record the disposal, and marks the asset as `DISPOSED` via the `PUT /api/fixed-assets/[id]` route. This is the only way to recognise a gain/loss on disposal in the current system.

This gap should be tracked as a future enhancement: a `POST /api/fixed-assets/[id]/dispose` route that calls `autoEntryAssetDisposal`, updates `FixedAsset.status` to `DISPOSED`, and stores the disposal JE id on a new `disposalJournalEntryId` field.

---

## دورة حياة الأصل — Asset Lifecycle States

```
                  POST /api/fixed-assets
            ┌─────────────────────────────┐
            │                             │
            ▼                             │
       ┌─────────┐   runDepreciationForAsset   ┌──────────────────┐
       │ ACTIVE  │ ─────────────────────────▶ │ FULLY_DEPRECIATED│
       └─────────┘                              └──────────────────┘
            │                                          │
            │ reverseAssetDepreciation                 │ reverseAssetDepreciation
            │ (restores accum dep + NBV)               │ (restores accum dep + NBV,
            │                                          │  flips status back to ACTIVE)
            ▼                                          ▼
       ┌─────────┐                              ┌─────────┐
       │ ACTIVE  │ ◀────────────────────────── │ ACTIVE  │
       └─────────┘                              └─────────┘
            │
            │ deleteAsset (only if no non-reversed depreciation)
            │ → auto-reverses acquisition JE
            │ → hard-deletes asset + depreciation rows
            ▼
        [deleted]

   ⚠ SOLD and DISPOSED enum values exist but have NO code path
     that sets them. Disposal is dead code.
```

---

## Cycle Completion Verification

When the fixed-assets cycle is operating correctly, the following
invariants hold:

### V1. Trial balance ties (overall Dr = Cr)

Every JE in the cycle is double-entry balanced (R2 guard), so the
overall trial balance must tie:

```sql
SELECT SUM(debit), SUM(credit) FROM JournalLine WHERE deletedAt IS NULL;
-- totalDebit MUST equal totalCredit (within 0.01)
```

### V2. All cycle JEs are individually balanced

| JE | Dr | Cr | sourceType |
|---|---|---|---|
| Acquisition | FIXED_ASSET (cost) | CASH or BANK (cost) | ASSET_ACQUISITION |
| Depreciation (period N) | DEPRECIATION_EXPENSE (monthlyDep) | ACCUM_DEPRECIATION (monthlyDep) | DEPRECIATION |
| Reversal of period N | ACCUM_DEPRECIATION (monthlyDep) | DEPRECIATION_EXPENSE (monthlyDep) | DEPRECIATION (isReversal=true) |

### V3. Fixed-asset register ties to GL

For each asset:
- `FixedAsset.acquisitionCost` === sum of Dr − Cr on the FIXED_ASSET account filtered by `sourceId = asset.id` and `sourceType = 'ASSET_ACQUISITION'`
- `FixedAsset.accumulatedDepreciation` === sum of Cr − Dr on the ACCUM_DEPRECIATION account filtered by `sourceId = asset.id` and `sourceType = 'DEPRECIATION'` and `isReversal = false`, MINUS the same for `isReversal = true`
- `FixedAsset.netBookValue` === `acquisitionCost − accumulatedDepreciation`

### V4. Source ↔ JE linkage intact

| Source document | Linkage field | Expected value |
|---|---|---|
| `FixedAsset` (acquisition) | `FixedAsset.journalEntryId` | id of the ASSET_ACQUISITION JE |
| `AssetDepreciation` (each period) | `AssetDepreciation.journalEntryId` | id of the DEPRECIATION JE |
| Reversal JE | `JournalEntry.isReversal` | `true` |
| Reversal JE | `JournalEntry.reversedEntryId` | id of the original DEPRECIATION JE |
| Original DEPRECIATION JE (after reversal) | `JournalEntry.status` | `'POSTED'` (stays POSTED — per guard design, both entries remain POSTED and net out to zero in the trial balance; the `isReversal`/`reversedEntryId` fields on the reversal JE express the linkage) |

### V5. Numerical consistency (I1-I7)

The `verifyNumericalConsistency()` function in
`src/lib/accounting/queries.ts` checks seven cross-cutting invariants:

- **I1**: Trial balance ties (Dr = Cr)
- **I2**: Σ netDebit = Σ netCredit
- **I3**: Raw `JournalLine` aggregate = trial-balance totals (no orphan lines)
- **I4**: Accounting equation A = L + E (including current-year earnings)
- **I5**: Σ GL closingBalance by type = Σ TB signed balance by type
- **I6**: For every account with activity: GL.closingBalance = getAccountBalance(code) = TB.signedBalance
- **I7**: Account-statement closingBalance = TB signedBalance (full-history)

All seven must pass with 0 diffs after a fixed-assets cycle run.

### V6. Idempotency guards

- `AssetDepreciation.@@unique([fixedAssetId, year, month])` — DB-level prevents duplicate period postings.
- JS-level `findFirst` in `runDepreciationForAsset` checks for `reversed=false` rows before posting — a reversed period CAN be re-posted (which is the correct behaviour: reverse a mistake, then re-post with the correct amount).
- `reverseEntry` throws `ALREADY_REVERSED` if a reversal JE already exists for the original.
- `deleteAsset` throws if any non-reversed depreciation exists — protects against deleting an asset that still has GL impact.

### V7. Decimal.js rounding safety

The depreciation engine uses `safeMoney` (Decimal.js with `precision: 30, ROUND_HALF_UP`) for:
- `annualDepreciation = round2Money(mulMoney(cost, divMoney(rate, 100)))`
- `monthlyDepreciation = round2Money(divMoney(annualDep × rate/100, 12))`
- `newAccumDep = round2Money(addMoney(oldAccumDep, depreciationAmount))`
- `newNBV = round2Money(subMoney(acquisitionCost, newAccumDep))`

This prevents the IEEE-754 float drift that would otherwise accumulate over a 60-month useful life (e.g. `100.00 × 60` months = `6000.00` exactly with Decimal.js, vs `5999.999999...` with raw JS floats).

**Minor inconsistency**: The reversal path (`reverseAssetDepreciation` at line 885-886) uses raw JS `Number` arithmetic (`toNumber(...) − toNumber(...)`) instead of `safeMoney`. For typical fixed-asset values (< 10M SAR), this is within float64 precision and does not cause halala-level errors, but it should be migrated to `safeMoney` for consistency.

---

## Journal Entry Summary

| Step | sourceType | Dr | Cr | JE function | Lines |
|---|---|---|---|---|---|
| 1. Acquisition | `ASSET_ACQUISITION` | FIXED_ASSET | CASH or BANK | `createJournalEntry` (called inside `createAssetWithAcquisition`) | 2 |
| 2. Depreciation (per period) | `DEPRECIATION` | DEPRECIATION_EXPENSE (or RENTAL_DEPRECIATION for EQUIPMENT) | ACCUM_DEPRECIATION | `createJournalEntry` (called inside `runDepreciationForAsset`) | 2 |
| 3. Reversal | `DEPRECIATION` (with `isReversal=true`) | ACCUM_DEPRECIATION | DEPRECIATION_EXPENSE (or RENTAL_DEPRECIATION) | `reverseEntry` → `guardedReverse` → `postJournalEntry` | 2 |
| 4. Disposal (DEAD) | `ASSET_DISPOSAL` (intended) | CASH/BANK + ACCUM_DEPRECIATION + (LOSS) | FIXED_ASSET + (GAIN) | `autoEntryAssetDisposal` (DEAD CODE — no caller) | 3 or 4 |

---

## File Map

| File | Lines | Purpose |
|---|---|---|
| `src/lib/accounting/depreciation-engine.ts` | 1-944 | Central engine — all depreciation logic, account resolution, asset CRUD, reversal |
| `src/lib/accounting/engine.ts` | 1199-1243 | `autoEntryAssetDisposal` (DEAD CODE) + `reverseEntry` (line 276) + `createJournalEntry` (line 288) |
| `src/lib/accounting/guard.ts` | 290-333 | `postJournalEntry` (the unbreakable R1-R12 guard) |
| `src/lib/accounting/guard.ts` | 340-440 | `reverseJournalEntry` (used by `reverseEntry`) |
| `src/lib/account-roles.ts` | 165-179 | `FIXED_ASSET` + `ACCUM_DEPRECIATION` role definitions |
| `src/lib/account-roles.ts` | 362-368 | `RENTAL_DEPRECIATION` role (for EQUIPMENT category) |
| `src/lib/account-roles.ts` | 396-402 | `DEPRECIATION_EXPENSE` role |
| `src/lib/account-roles.ts` | 515-528 | `ASSET_DISPOSAL_GAIN` + `ASSET_DISPOSAL_LOSS` roles (defined, mapped, but unused) |
| `src/lib/safe-money.ts` | 1-139 | Decimal.js-based money arithmetic helpers |
| `src/app/api/fixed-assets/route.ts` | 99-155 | POST: create asset (calls `createAssetWithAcquisition`) |
| `src/app/api/fixed-assets/[id]/route.ts` | 7-147 | GET (with schedule), PUT (update), DELETE (delete asset) |
| `src/app/api/fixed-assets/[id]/depreciate/route.ts` | 7-46 | POST: single-asset depreciation (calls `runDepreciationForAsset`) |
| `src/app/api/fixed-assets/depreciate-all/route.ts` | 7-40 | POST: bulk depreciation (calls `runBulkDepreciation`) |
| `src/app/api/fixed-assets/depreciate/route.ts` | 7-139 | POST: ⚠ LEGACY bulk depreciation — bypasses central engine, sourceType=`ASSET_DEPRECIATION`, avoid |
| `src/app/api/fixed-assets/report/route.ts` | 7-101 | GET: depreciation schedule report |
| `src/app/api/asset-depreciations/route.ts` | 7-65 | GET: list depreciation records |
| `src/app/api/asset-depreciations/[id]/reverse/route.ts` | 7-24 | POST: reverse a single depreciation (calls `reverseAssetDepreciation`) |
| `prisma/schema.prisma` | 2210-2248 | `FixedAsset` model |
| `prisma/schema.prisma` | 2250-2270 | `AssetDepreciation` model (with `@@unique([fixedAssetId, year, month])`) |
| `scripts/e2e-fixed-assets-cycle.ts` | — | E2E test companion to this doc |

---

## Key Architectural Findings

1. **Single source of truth** — `depreciation-engine.ts` is the canonical implementation. All HTTP routes are thin wrappers (with one exception — see finding 3). This makes the engine easy to test in isolation (the E2E test calls engine functions directly, mirroring the construction/rental/payroll cycle test patterns).

2. **Decimal.js rounding safety** — `calculateDepreciation` and `runDepreciationForAsset` both use `safeMoney` (Decimal.js with precision=30, ROUND_HALF_UP) for annual/monthly depreciation, accumulated depreciation, and net book value. This is critical for a 60-month depreciation schedule where raw-JS-float drift would otherwise accumulate to several halalas of error.

3. **Legacy duplicate route** — `POST /api/fixed-assets/depreciate` (file `depreciate/route.ts`, NOT `depreciate-all/route.ts`) implements its own inline depreciation logic, bypassing the central engine. It uses raw JS `Number` arithmetic, posts with `sourceType='ASSET_DEPRECIATION'` (vs the engine's `'DEPRECIATION'`), doesn't set `beginningNBV`/`endingNBV` on the AssetDepreciation row, doesn't update `lastDepreciationDate`, and doesn't check the `reversed` flag in its idempotency guard. **Recommendation: delete this route** — `depreciate-all` is the correct bulk-depreciation endpoint.

4. **RENTAL_DEPRECIATION vs DEPRECIATION_EXPENSE** — Assets with `category='EQUIPMENT'` depreciate to `RENTAL_DEPRECIATION` (code 7250, a direct cost) instead of `DEPRECIATION_EXPENSE` (codes 8310-8340, a G&A expense). The engine resolves this via `resolveAssetAccounts` and falls back to `DEPRECIATION_EXPENSE` if no `RENTAL_DEPRECIATION` account is mapped. This aligns with the rental-cycle distinction between direct costs (rental equipment) and indirect costs (office equipment). NOTE: equipment created via the rental cycle (`autoEntryEquipmentPurchase`) is capitalised on the Equipment model with its own JE (sourceType=`EQUIPMENT_PURCHASE`), NOT on the FixedAsset model — so the FixedAsset depreciation path is for non-equipment fixed assets (vehicles, buildings, office equipment, software, furniture).

5. **sourceId is the asset id, not the AssetDepreciation id** — All depreciation JEs for a given asset share `sourceId = asset.id`. This means a query like `WHERE sourceType='DEPRECIATION' AND sourceId=<assetId>` returns ALL depreciation JEs (and their reversals) for that asset. This is intentional — it makes the per-asset depreciation history trivial to query. The `AssetDepreciation.journalEntryId` field provides the per-period linkage.

6. **Reversal does NOT use safeMoney** — `reverseAssetDepreciation` (line 885-886) computes `newAccumDep = toNumber(asset.accumulatedDepreciation) - toNumber(dep.depreciationAmount)` with raw JS Number. For typical fixed-asset values this is fine, but it's an inconsistency with the depreciation path. Minor — should be migrated to `subMoney`/`round2Money` for consistency.

7. **Reversal unconditionally resets status to ACTIVE** — `reverseAssetDepreciation` sets `status = 'ACTIVE'` even if the asset was `FULLY_DEPRECIATED` from prior periods (not just the period being reversed). This is a design trade-off: the operator is expected to reverse only the most recent period. If they reverse an older period, the status will incorrectly flip to `ACTIVE` even though the asset is still fully depreciated as of the latest period. The fix would be to re-derive status from the recomputed NBV: `status = (newNBV <= residualValue + 0.01) ? 'FULLY_DEPRECIATED' : 'ACTIVE'`.

8. **Disposal is DEAD CODE** — `autoEntryAssetDisposal` is exported but never called. The `ASSET_DISPOSAL_GAIN` (6310) and `ASSET_DISPOSAL_LOSS` (8610) roles are correctly defined and mapped, but there is no HTTP route, no UI screen, and no service-layer caller. The `FixedAsset.status` enum has `SOLD` and `DISPOSED` values that are never set. This is a significant functional gap — accountants must use manual JEs to record disposals.

9. **Acquisition JE failure is non-fatal** — `createAssetWithAcquisition` wraps the acquisition JE creation in a try/catch (lines 463-486). If the JE fails (e.g. role not mapped, R2 imbalance), the engine logs the error and continues — the FixedAsset row is created without a JE. The route returns a different message depending on whether the JE was posted: `'تم إنشاء الأصل وقيد التملك تلقائياً'` (success) vs `'تم إنشاء الأصل (لم يتم إنشاء قيد التملك - تأكد من ربط الحسابات)'` (JE failed). This is intentional — it allows the asset to be registered even if the chart of accounts is incomplete, deferring the capitalisation to a later manual JE.

10. **Idempotency is defense-in-depth** — Three layers prevent duplicate period postings:
    - DB-level `@@unique([fixedAssetId, year, month])` on `AssetDepreciation` — catches concurrent inserts.
    - JS-level `findFirst({ where: { fixedAssetId, year, month, reversed: false } })` in `runDepreciationForAsset` — catches sequential duplicate calls before they hit the DB.
    - The `reversed: false` filter means a reversed period CAN be re-posted (correct behaviour — reverse a mistake, then re-post with the right amount).

11. **Bulk depreciation is NOT atomic** — `runBulkDepreciation` iterates assets and calls `runDepreciationForAsset` per asset, each in its own `$transaction`. A failure on asset N does NOT roll back assets 1..N−1. The `skippedDetails` array tells the operator what didn't post. This is intentional — depreciation should be best-effort, not all-or-nothing.

12. **Last-month truing-up** — `runDepreciationForAsset` trues up the final month so NBV lands exactly on `residualValue` (lines 685-689). Without this, the standard monthly amount would leave NBV at `residualValue ± ε` after the final period, breaking V3 (fixed-asset register ties to GL) by a fraction of a halala.

13. **Asset deletion auto-reverses the acquisition JE** — `deleteAsset` (lines 907-943) calls `reverseEntry(asset.journalEntryId, tx)` to post a reversal of the acquisition JE before hard-deleting the asset. This keeps the GL clean — the acquisition JE is reversed (not deleted, per R12), and the asset is removed from the register. The function soft-blocks if any non-reversed depreciation exists (`'لا يمكن حذف أصل تم إهلاكه — يجب عكس القيود أولاً'`), forcing the operator to reverse all depreciation first.

---

## E2E Test Companion

The companion test `scripts/e2e-fixed-assets-cycle.ts` exercises:

1. **Setup**: Branch, Client, CostCenter, Project (the cost center is not strictly required by the depreciation path, but is created for consistency with other cycle tests and for future cost-center-tagging of depreciation expense).
2. **Step 1**: Create a fixed asset (cost=12,000, years=5, rate=20% → monthly=200, residual=0) via `createAssetWithAcquisition` → verify acquisition JE posted (Dr FIXED_ASSET 12,000 / Cr CASH 12,000, sourceType=`ASSET_ACQUISITION`, sourceId=asset.id).
3. **Step 2**: Run depreciation for one month (year=2099, month=12) via `runDepreciationForAsset` → verify JE posted (Dr DEPRECIATION_EXPENSE 200 / Cr ACCUM_DEPRECIATION 200, sourceType=`DEPRECIATION`).
4. **Step 2b**: Verify `FixedAsset.accumulatedDepreciation = 200` and `netBookValue = 11,800` (via `safeMoney` Decimal.js — exactly 11,800.00, not 11,799.999...).
5. **Step 2c**: Verify AssetDepreciation row created with `beginningNBV=12,000`, `endingNBV=11,800`, `reversed=false`.
6. **Step 3 (optional)**: Reverse the depreciation via `reverseAssetDepreciation` → verify reversal JE posted (Dr ACCUM_DEPRECIATION 200 / Cr DEPRECIATION_EXPENSE 200, `isReversal=true`, `reversedEntryId=original.id`).
7. **Step 3b**: Verify `FixedAsset.accumulatedDepreciation` restored to 0 and `netBookValue` restored to 12,000.
8. **Step 3c**: Verify original depreciation JE status = `'REVERSED'` and AssetDepreciation.reversed = true.
9. **Final**: All 3 JEs balanced (acquisition, depreciation, reversal); trial balance ties; `verifyNumericalConsistency` ok=true; source↔JE linkage intact; fixed-asset register ties to GL.
10. **Cleanup**: Soft-delete all 3 JEs, hard-delete the AssetDepreciation rows + FixedAsset + CostCenter + Client + Branch (in reverse FK order).

The test uses distinctive `year=2099, month=12` to avoid colliding with real depreciation data, and uses a `P3FA` prefix for all generated codes to make cleanup trivial.
