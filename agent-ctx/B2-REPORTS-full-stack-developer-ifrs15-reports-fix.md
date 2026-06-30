# Task ID: B2-REPORTS
**Agent:** full-stack-developer (IFRS15 reports fix)
**Task:** Fix 3 project profitability reports to use POC-based earned revenue

## Context
Read /home/z/my-project/worklog.md to understand prior work (Barrier 1 auth, B2-EXPLORE IFRS 15 gap analysis). The B2-EXPLORE audit identified that the 3 project profitability APIs use billed/GL revenue instead of POC-based earned revenue — breaking profitability correctness in 3 scenarios: not-yet-invoiced projects (revenue=0 → understates profit), lagging invoices (understates profit), advance billing (overstates profit).

## Files Edited

### 1. `src/app/api/reports/project-profitability/route.ts`
- Added `import { calculatePOC } from '@/lib/accounting/ifrs15'` at the top.
- Computed `asOfDate = dateTo ? new Date(dateTo) : new Date()`.
- Wrapped `await calculatePOC(project.id, asOfDate)` in try/catch (fallback: old `revenueFromJournal > 0 ? revenueFromJournal : billedRevenue`).
- Set `earnedRevenue = poc.revenueToDate`, `billedRevenue = revenueFromInvoices`, `totalRevenue = earnedRevenue` (POC-based, was previously the max of journal/billed — now IFRS 15 compliant).
- `grossProfit = earnedRevenue - totalCost`, `profitMargin = earnedRevenue > 0 ? (grossProfit/earnedRevenue)*100 : 0`.
- Added new fields to `revenue` block: `earnedRevenue`, `billedRevenue`, `percentComplete`, `pocContractValue`, `estimatedTotalCost`, `pocGrossProfit`, `pocGrossProfitPercent`.
- Added new fields to `summary` block: `earnedRevenue`, `billedRevenue`, `percentComplete`, `contractValue`, `estimatedTotalCost`, `revenueSource: 'ifrs15-poc'`.
- All previously returned fields preserved (backward compatibility).

### 2. `src/app/api/reports/project-wip/route.ts`
- Added `import { calculatePOC } from '@/lib/accounting/ifrs15'` at the top.
- Added a single `db.salesInvoice.groupBy({ by: ['projectId'], ... })` aggregation to compute `billedByProject` map (avoids N+1 queries).
- Set `asOfDate = range?.to ?? new Date()`.
- Converted `rows = projects.map(p => {...})` (sync) to `rows = await Promise.all(projects.map(async (p) => {...}))` so we can `await calculatePOC` per project.
- Per-project: try/catch around `calculatePOC(p.id, asOfDate)` (fallback: `bal.revenue`).
- `earnedRevenue = poc.revenueToDate`, `recognizedRevenue = earnedRevenue` (alias to old field name), `billedRevenue = billedByProject.get(p.id) || 0`.
- **WIP position changed to IFRS 15 definition:** `netWip = earnedRevenue - billedRevenue` (positive = Contract Asset, negative = Contract Liability). Previously it was `incurredCosts - recognizedRevenue`.
- `profitToDate = earnedRevenue - incurredCosts` (was `recognizedRevenue - incurredCosts`).
- `completionPercent = poc.percentComplete * 100` (was `incurredCosts / estimatedTotalCost * 100`).
- `contractValue` and `estimatedTotalCost` now sourced from `calculatePOC` (with fallback).
- Added new fields per row: `earnedRevenue`, `billedRevenue`, `percentComplete`.
- Added new totals: `earnedRevenue`, `billedRevenue`.
- Preserved all existing fields: `recognizedRevenue`, `wipBalance`, `contractAssetBalance`, `contractLiabilityBalance`, `incurredCosts`, etc.
- `source` changed from `'posted-journal-entries'` to `'ifrs15-poc'`.

### 3. `src/app/api/reports/project-costs/route.ts`
- Added `import { calculatePOC } from '@/lib/accounting/ifrs15'` at the top.
- **Removed the CRITICAL bug** at old line 61: `(revenueFromJournal > 0 ? revenueFromJournal : contractValue) - totalCost` which inflated profit by treating the entire contract value as revenue when no GL revenue existed.
- Added a `db.salesInvoice.findMany` query to compute `billedRevenue = sum(netAmount)`.
- Computed `asOfDate = range?.to ?? new Date()`.
- Wrapped `await calculatePOC(project.id, asOfDate)` in try/catch (fallback: `revenueFromJournal` — NOT `contractValue`).
- `earnedRevenue = poc.revenueToDate`.
- `grossProfit = earnedRevenue - totalCost` (IFRS 15 compliant).
- `profitMargin = earnedRevenue > 0 ? (grossProfit / earnedRevenue) * 100 : 0`.
- Added new fields to response: `estimatedTotalCost`, `billedRevenue`, `earnedRevenue`, `percentComplete`.
- `contractValue` (top-level and inside `project`) now sourced from `pocContractValue` (with fallback to old contract-derived value).
- `source` changed from `'posted-journal-entries'` to `'ifrs15-poc'`.

## Verification
- `bun run lint` → passed (no errors, no warnings).
- `dev.log` → no compile errors after edits (server is idle on /login redirect).
- All Decimal values converted via `toNumber()` and/or `Number()` before math operations.
- Error handling: every `calculatePOC` call wrapped in try/catch with fallback to legacy revenue source + `console.error` log.

## Stage Summary
All 3 project profitability reports now use IFRS 15 POC-based earned revenue (`calculatePOC().revenueToDate`) as the primary revenue figure for profit calculation. Billed revenue remains visible as a separate field so users can compare earned vs billed and see contract asset/liability positions. The critical bug in project-costs (treating contractValue as revenue) is removed. All existing response fields are preserved for backward compatibility with the frontend.
