# FIX-B — Settings Compliance Fix Agent

**Task ID**: FIX-B
**Agent**: code-agent
**Date**: 2025-07-01
**Scope**: Apply targeted fixes for the 4 HIGH-severity settings issues flagged
by AUDIT-2 (S1-S4) plus the AUDIT-1 `|| 0.15` → `?? 0.15` cleanup.

## Tasks Completed

### Task 1 — S1: defaultVatRate now honored by 7 more invoice-creation routes
**Before**: `getDefaultVatRate()` (in `src/lib/settings.ts`) was called only by
`supplier-invoices/route.ts`. The other 7 invoice-creation routes hardcoded
`0.15` as the fallback VAT rate.

**After**: All 8 routes now import `getDefaultVatRate` from `@/lib/settings`
and call it as the fallback. A zero rate (tax-exempt) is preserved by using
`!= null` / `!== undefined` checks instead of `||`.

Files modified:
- `src/app/api/purchase-invoices/route.ts` — replaced `vatRate = 0.15`
  destructure default with `vatRateRaw != null ? Number(vatRateRaw) :
  await getDefaultVatRate()`
- `src/app/api/purchase-orders/route.ts` — same pattern
- `src/app/api/expenses/route.ts` — replaced `vatRate !== undefined ?
  parseFloat(body.vatRate) : 0.15` with `: await getDefaultVatRate()`
- `src/app/api/subcontractor-invoices/route.ts` — replaced
  `vatRate !== undefined ? Number(vatRate) : 0.15` with
  `: await getDefaultVatRate()`
- `src/app/api/progress-claims/route.ts` — replaced `vatRate ?? 0.15` with
  `vatRate != null ? Number(vatRate) : await getDefaultVatRate()`
- `src/app/api/change-orders/route.ts` — replaced
  `Number(contract.vatRate) || 0.15` with
  `contract.vatRate != null ? Number(contract.vatRate) :
  await getDefaultVatRate()` (preserves legitimate 0 rate on the parent
  contract too)
- `src/app/api/contracts/route.ts` — replaced `vatRate ?? 0.15` with
  `vatRate != null ? Number(vatRate) : await getDefaultVatRate()`

`supplier-invoices/route.ts` was already fixed in an earlier pass — no
change needed (verified only).

### Task 2 — S2: bankInfoSection respects `invoiceShowBankDetails`
File: `src/printing/shared/sections.ts`

Added an early-return at the top of `bankInfoSection`:
```ts
if (settings.invoiceShowBankDetails === false) return ''
```

The check is explicit (`=== false`) so that `undefined` defaults to showing
bank info (backward-compatible with existing CompanySetting rows that
pre-date the toggle).

### Task 3 — S3: stampPosition honored in print templates
File: `src/printing/shared/sections.ts` — rewrote `signaturesSection`.

The function now branches on `settings.stampPosition`:
- `'after-signatures'` (default / undefined / unrecognized) → stamp rendered
  inside the signatures area alongside the signature boxes. (Backward-
  compatible — matches previous behavior.)
- `'before-signatures'` → stamp rendered in its own block above the
  signatures row.
- `'top-right'` | `'top-left'` | `'bottom-right'` | `'bottom-left'` |
  `'center'` | `'after-totals'` → stamp rendered as an absolutely-positioned
  overlay `<div class="stamp-overlay">` anchored to the `.page` wrapper
  (which has `position: relative` in `css.ts`). The signatures row is
  rendered WITHOUT a stamp-area in this case.

For the `ri` (rental-invoice) layout, the same logic applies: overlay
positions render the stamp outside the signature boxes; non-overlay
positions keep the existing inline stamp box.

The overlay markup is appended at the end of the function's return value
so existing callers don't need to be modified — the overlay anchors to
`.page` regardless of where in the body it appears.

### Task 4 — S4: colorOverrideCSS extended
File: `src/printing/print-service.ts` — extended the `colorOverrideCSS`
block with the 4 missing selectors flagged by AUDIT-1 D15-D18:

- `.doc-table thead` and `.doc-table thead th` — table headers
  (background + border-bottom color now follows `invoicePrimaryColor`)
- `.total-row.grand` and its `.label` / `.value` children — grand-total row
- `.section-title` — text color + left/right border (covers both LTR/RTL)
- `.info-item` — left/right border color
- `.totals-section .totals-box` — border color

Each new rule uses `!important` to override the hardcoded emerald
(`#047857` / `#059669`) shades from `css.ts`. The shade variants
(`primaryDark`, `primaryColor`) are the same hex helpers already used by
the existing rules.

### Task 5 — AUDIT-1 `|| 0.15` → `?? 0.15` cleanup
File: `src/printing/projects/ProgressClaim.ts` line 106.

Changed:
```ts
const vatRate = Number(data.vatRate ?? settings.defaultVatRate) || 0.15
```
to:
```ts
const vatRate = Number(data.vatRate ?? settings.defaultVatRate ?? 0.15)
```

The old form re-defaulted to 0.15 when the resolved VAT rate was `0`
(zero-rated progress claim). The new form only falls back when the value
is `null` or `undefined`.

Other templates (`PaymentVoucher.ts`, `ProjectContract.ts`) already used
`?? 0.15` — no change needed (verified only).

## Verification

1. `bun run lint` — ✅ CLEAN (exit 0, no errors, no warnings)
2. `bun run test:accounting` — ✅ 21/21 PASSED (exit 0)
3. `bun scripts/e2e-production-acceptance.ts` — ✅ 70/70 PASSED (exit 0)

The e2e test exercises the full Construction + Rental + Purchase + Payroll +
Fixed Assets + VAT + Closing cycles end-to-end, including the routes
modified in Task 1 (contracts, progress-claims, purchase-invoices,
purchase-orders, subcontractor-invoices, expenses). All journal entries
balanced, trial balance tied, accounting equation held, all 19 cycle JEs
balanced, fiscal-period close + reopen verified.

## Files Changed

| # | File | Change | Approx Lines |
|---|------|--------|---|
| 1 | `src/app/api/purchase-invoices/route.ts` | Added `getDefaultVatRate` import + replaced hardcoded `0.15` destructure default with `getDefaultVatRate()` call. | +6 |
| 2 | `src/app/api/purchase-orders/route.ts` | Same. | +6 |
| 3 | `src/app/api/expenses/route.ts` | Same (different pattern — `!== undefined` check). | +5 |
| 4 | `src/app/api/subcontractor-invoices/route.ts` | Same. | +5 |
| 5 | `src/app/api/progress-claims/route.ts` | Same (`?? 0.15` → `getDefaultVatRate()`). | +5 |
| 6 | `src/app/api/change-orders/route.ts` | Same (`Number(contract.vatRate) || 0.15` → `getDefaultVatRate()` fallback). | +5 |
| 7 | `src/app/api/contracts/route.ts` | Same. | +5 |
| 8 | `src/printing/shared/sections.ts` | Added `invoiceShowBankDetails === false` early return to `bankInfoSection`. Rewrote `signaturesSection` to branch on `stampPosition` (overlay positions render absolutely-positioned stamp anchored to `.page`). | +120 (rewrite of signaturesSection) |
| 9 | `src/printing/print-service.ts` | Extended `colorOverrideCSS` with `.doc-table thead`, `.total-row.grand`, `.section-title`, `.info-item`, `.totals-section .totals-box` overrides. | +13 |
| 10 | `src/printing/projects/ProgressClaim.ts` | Changed `|| 0.15` to `?? 0.15` so a zero VAT rate is preserved. | +3 |

Total: 10 files changed, ~175 lines of code modified.

## Notes / Decisions

1. **Why `!= null` instead of `??` in the API routes?**
   The destructure default `vatRate = 0.15` pattern doesn't compose cleanly
   with `??` because `??` is a binary operator and we need to also coerce
   to `Number`. Using `vatRateRaw != null ? Number(vatRateRaw) :
   await getDefaultVatRate()` is explicit, side-effect-free, and preserves
   legitimate `0` values. (Note: `??` would also work as
   `Number(vatRateRaw ?? await getDefaultVatRate())` but the ternary form
   is more readable when an `await` is involved.)

2. **Why explicit `=== false` for `invoiceShowBankDetails`?**
   The toggle defaults to `true` in the UI/settings, but existing
   CompanySetting rows that pre-date the field will have `undefined`.
   Using `=== false` (rather than `!settings.invoiceShowBankDetails`)
   ensures existing rows continue to show bank details — backward-
   compatible.

3. **Why use an overlay div for corner stamp positions?**
   The `.page` wrapper in `css.ts` already has `position: relative`, so an
   absolutely-positioned descendant anchors to the page (not the
   signatures section). This matches the on-screen preview behavior in
   `invoice-preview.tsx` (which uses the same approach for the React
   preview). The overlay markup is appended at the end of the
   `signaturesSection` return value so callers don't need to be modified.

4. **Why include both `border-left` and `border-right` in the section-title
   and info-item color overrides?**
   The original CSS uses `${borderStart}` (a CSS variable that resolves to
   `border-left` in LTR and `border-right` in RTL). The override CSS runs
   at page-render time after the template's CSS, so it can't reliably know
   the direction. Applying both `border-left` and `border-right` ensures
   the override works in both directions without needing to know which
   side the original rule applied to. (One side will be overridden to the
   new color redundantly; the other will be the actually-visible one.)
   This is a small visual trade-off — both sides get the brand color
   instead of just the start side. In practice this is invisible because
   the original rule sets only one side.

5. **Why not also fix the MEDIUM/LOW settings issues (S5-S12)?**
   Out of scope for FIX-B. The task explicitly listed only the 4 HIGH
   issues (S1-S4) plus the `|| 0.15` AUDIT-1 cleanup. S5 (`accentColor`
   dead), S6 (`invoiceTemplate` dead), S7
   (`useThousandSeparatorsOfficial` dead), S8 (headerHeight/footerHeight/
   decimalPlaces dead schema), S9 (currency dead), S10 (legacy
   currencySymbol trio), S11 (logo vs logoUrl), S12
   (useThousandSeparatorsSystem not in UI) are MEDIUM/LOW and were not
   part of the FIX-B mandate.

6. **Why was supplier-invoices not changed?**
   AUDIT-2 listed it as one of the 8 routes to fix, but on inspection it
   was already using `getDefaultVatRate()` (lines 6 and 88). The fix was
   applied in an earlier commit (likely FIX-A or earlier — the import +
   call are present). I only verified the existing implementation was
   correct.

## END OF FIX-B WORK RECORD
