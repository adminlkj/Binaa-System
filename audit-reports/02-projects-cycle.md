# Phase 2 Audit Report — Projects Cycle (دورة المشاريع)

**Auditor:** Projects Cycle Deep Auditor (READ-ONLY)
**Task ID:** 2-a
**Scope:** Project lifecycle (Project, Contract, ChangeOrder, BOQItem, ProgressClaim, WBSElement, ProjectLedger, ProjectBudget, ProjectForecast, ClaimItem, ClaimCertification) + Subcontractor cycle (Subcontractor, SubcontractorContract, SubcontractorInvoice, SubcontractorAdvance, SubcontractorRetention, SubcontractorPayment) + project-controls + project-ledger + measurements + commitments + cost-entries
**Method:** static code analysis + schema review + JE-flow tracing + cross-reference with `src/lib/accounting/{engine,guard,auto-journal,ifrs15}.ts` + `src/lib/account-roles.ts`
**Note:** No source files modified — read-only audit. Issues already fixed in Phase 1 (e.g. progress-claim double revenue, salary cycle, double-cancellation in 7 routes) are explicitly excluded.

---

## Executive Summary

| Severity | Count |
|---|---|
| CRITICAL | 9 |
| HIGH | 14 |
| MEDIUM | 11 |
| LOW | 7 |
| **Total** | **41** |

- **Most severe:** Subcontractor advances / payments / retentions create **no journal entries** — the GL is blind to ~SAR millions of cash outflows and accruals (P2-CRIT-002).
- **Files audited:** 31 source files + `prisma/schema.prisma` + 4 lib files cross-referenced.
- **Top architectural finding:** `ProjectLedger` model exists with rich types (COST/REVENUE/WIP/CONTRACT_ASSET/RETENTION/ADVANCE/COMMITMENT/CASH) and a GET endpoint — but **has zero writers anywhere in the codebase**. The "single source of truth" is empty.
- **Top CRUD gap:** 8 subcontractor/claim/measurement/commitment/wbs entities have only `route.ts` (list + create) — no `[id]/route.ts`. They can be created but never fetched individually, updated, certified, settled, released, or cancelled.

---

## CRITICAL Issues (must fix before proceeding)

### P2-CRIT-001: ChangeOrder APPROVED does not update Contract.value or Project.contractValue
- **File:** `src/app/api/change-orders/[id]/route.ts:42-69`
- **Issue:** When a ChangeOrder is approved (PUT with `status: 'APPROVED'`), the route only updates the change order's `approvedDate`. It does **not** update `Contract.value`, `Contract.totalValue`, `Contract.vatAmount`, nor `Project.contractValue`. The `ChangeOrder.newValue` field is computed but never propagated.
- **Impact:** Contract value shown in dashboards, WIP reports, and IFRS 15 POC calculations (`calculatePOC` reads `project.contractValue`) is **wrong** after any approved variation order. EVM reports use `contractValue` as BAC fallback — so the EAC/VAC metrics are silently corrupted. Subcontractor retention calculation (if based on contract value) is also wrong.
- **Fix:** Wrap the status-change update in a `$transaction` that also (a) increments `Contract.value` by `changeValue`, (b) recomputes `Contract.vatAmount` and `Contract.totalValue`, (c) updates `Project.contractValue` to match the new contract total (or sum across multiple contracts). Add a compensating reverse on status change from APPROVED → DRAFT/REJECTED.
- **Accounting link:** No JE impact (variation orders are not accounting events under the current "claim-and-bill" model), but the corrupted contract value feeds into POC-based EVM reports that DO produce JEs (via the dead `autoEntryIFRS15Revenue`).

### P2-CRIT-002: Subcontractor advances / payments / retentions create NO journal entries
- **Files:**
  - `src/app/api/subcontractor-advances/route.ts:58-72` (advance.create — no `autoEntrySubcontractorAdvance` call)
  - `src/app/api/subcontractor-payments/route.ts:55-68` (payment.create — no `autoEntrySubcontractorPayment` call)
  - `src/app/api/subcontractor-retentions/route.ts:58-70` (retention.create — no `autoEntrySubcontractorRetention` call)
  - `src/lib/accounting/engine.ts` (no `autoEntrySubcontractorAdvance` / `autoEntrySubcontractorPayment` / `autoEntrySubcontractorRetention` functions exist)
  - `src/lib/account-roles.ts:442-457` (`SUBCONTRACTOR_ADVANCE` defaultCodes `['1230']`, `SUBCONTRACTOR_RETENTION_PAYABLE` defaultCodes `['3500']` — defined but unused)
- **Issue:** The three subcontractor cash-flow endpoints create DB records but **no journal entries**. A SAR 500,000 advance paid to a subcontractor appears nowhere in the GL. A SAR 50,000 retention withheld from a subcontractor invoice appears nowhere. A SAR 100,000 payment to a subcontractor appears nowhere.
- **Impact:** R1 violation (silent missing entries — GL doesn't reflect real money movement). Subcontractor AP balance is wrong. Cash account balance is wrong. Subcontractor advance asset account (1230) is always zero. Retention payable liability account (3500) is always zero. Trial balance doesn't tie to subcontractor subledger. Auditor cannot reconcile.
- **Fix:** Add three new autoEntry functions in `engine.ts`:
  - `autoEntrySubcontractorAdvance`: Dr SUBCONTRACTOR_ADVANCE (1230) / Cr CASH (1110) or BANK
  - `autoEntrySubcontractorPayment`: Dr SUBCONTRACTOR_AP (3220) / Cr CASH (1110) — plus Dr SUBCONTRACTOR_RETENTION_PAYABLE (3500) / Cr SUBCONTRACTOR_AP (3220) for the retention portion withheld at payment
  - `autoEntrySubcontractorRetention`: Dr SUBCONTRACTOR_AP (3220) / Cr SUBCONTRACTOR_RETENTION_PAYABLE (3500) — to accrue the retention as a liability at invoice time
  Wrap each create + autoEntry in `$transaction` (mirror the pattern in `subcontractor-invoices/route.ts:55-95`).
- **Accounting link:** Direct R1 violation — GL missing ~all subcontractor cash flows.

### P2-CRIT-003: SubcontractorPayment POST does not update SubcontractorInvoice.paidAmount or status
- **File:** `src/app/api/subcontractor-payments/route.ts:42-79`
- **Issue:** The route creates the `SubcontractorPayment` record but does **not** increment `SubcontractorInvoice.paidAmount` (even though `subcontractorInvoiceId` is provided) and does **not** transition `SubcontractorInvoice.status` from DRAFT→PARTIALLY_PAID→PAID when paidAmount reaches totalAmount. It also does not update `SubcontractorAdvance.recoveredAmount` / `status` (no advance offset against invoices).
- **Impact:** Subcontractor invoice list always shows `paidAmount: 0` and `status: DRAFT` regardless of actual payments. Aging reports are wrong. Outstanding AP balance is wrong. Subcontractor advance is never marked SETTLED — it sits as an open asset forever.
- **Fix:** In the `$transaction` (after adding the JE per P2-CRIT-002): (a) `tx.subcontractorInvoice.update({ where: { id }, data: { paidAmount: { increment: amount } } })`, (b) re-fetch and check if `paidAmount >= totalAmount` → set `status: 'PAID'`, (c) if advance recovery applies, increment `SubcontractorAdvance.recoveredAmount` and update status.
- **Accounting link:** Indirect — but the missing `paidAmount` update means the AR/AP subledger never reconciles with the GL.

### P2-CRIT-004: ProjectLedger model is a dead "single source of truth" — zero writers
- **Files:**
  - `prisma/schema.prisma:2340-2364` (model definition with 9 ledger types)
  - `src/app/api/project-ledger/[projectId]/route.ts` (GET-only endpoint that aggregates by ledgerType)
  - No writes: `grep -r "projectLedger\.(create|update|createMany|upsert|delete)" src/` → 0 matches
- **Issue:** The `ProjectLedger` table is designed as the project-level subledger (COST, REVENUE, WIP, CONTRACT_ASSET, CONTRACT_LIABILITY, RETENTION, ADVANCE, COMMITMENT, CASH) with `runningBalance`. But **no code anywhere writes to it**. The GET endpoint always returns an empty array and zero balances.
- **Impact:** The "Project Ledger" UI tab shows nothing. The WIP report (`/api/reports/project-wip`) compensates by querying `JournalLine` directly via cost center — but this loses the project-specific ledger type classification (COST vs WIP vs RETENTION). All project-cost analytics fall back to legacy sources (`Expense`, `LaborCost`, `SubcontractorInvoice`, `EquipmentCost`) which duplicate data already in the GL.
- **Fix:** Either (a) wire `ProjectLedger.create` calls into every accounting autoEntry function (preferred — gives true project subledger) by adding a `postProjectLedger()` helper that mirrors each `JournalLine` into `ProjectLedger` with the appropriate `ledgerType` derived from `accountRole`; OR (b) delete the model + endpoint if the team decides cost-center-based GL queries are sufficient.
- **Accounting link:** Architectural — without this, project profitability reports and project-level trial balance cannot be produced from a single source.

### P2-CRIT-005: 8 project-cycle entities have only `route.ts` — missing `[id]/route.ts` (no fetch/update/cancel lifecycle)
- **Files (all missing `[id]/route.ts`):**
  - `src/app/api/subcontractor-invoices/` — cannot fetch single invoice, cannot cancel, cannot reverse the JE created at POST
  - `src/app/api/subcontractor-advances/` — cannot settle advance, cannot cancel
  - `src/app/api/subcontractor-payments/` — cannot mark PAID, cannot cancel
  - `src/app/api/subcontractor-retentions/` — cannot release retention, cannot cancel
  - `src/app/api/claim-items/` — cannot edit/delete claim line items
  - `src/app/api/claim-certifications/` — cannot re-certify, cannot reject
  - `src/app/api/measurements/` — cannot certify (DRAFT→CERTIFIED), cannot reject
  - `src/app/api/commitments/` — cannot invoice against commitment, cannot cancel
  - `src/app/api/wbs/` — cannot update WBS element, cannot deactivate, cannot delete
- **Issue:** All these entities support only `GET (list)` and `POST (create)`. There is no way to:
  - Cancel a subcontractor invoice (and reverse its JE)
  - Mark a subcontractor payment as PAID
  - Release a retention (and create the release JE)
  - Settle an advance against future invoices
  - Certify a measurement (DRAFT→CERTIFIED transition)
  - Reject a certification
  - Cancel a commitment
  - Deactivate a WBS element
- **Impact:** The entire subcontractor/claim/measurement/commitment lifecycle is frozen at creation. Real-world workflows (release retention at project handover, cancel wrong invoice, certify measurement) cannot be performed through the API. Users would need direct DB access.
- **Fix:** Add `[id]/route.ts` for each of the 8 entities with at minimum: `GET` (fetch by id), `PUT` (update fields + status transitions), `DELETE` (soft-delete where applicable, or hard-delete with pre-condition checks). For status-changing operations that involve accounting (subcontractor invoice cancel, retention release, advance settlement), wrap in `$transaction` with `reverseEntry()` or appropriate new autoEntry calls.
- **Accounting link:** Without `[id]` routes, accounting errors in these flows cannot be corrected through the UI — a JE posted wrongly on a subcontractor invoice is permanent.

### P2-CRIT-006: claim-certifications POST has silent failure + no $transaction
- **File:** `src/app/api/claim-certifications/route.ts:64-95`
- **Issue:** The route performs two writes:
  1. `db.claimCertification.create({...})` (line 64) — creates the certification record
  2. `db.progressClaim.update({...})` (line 84) — sets claim status to APPROVED + certifiedAmount + retentionAmount
  
  These are **not in a `$transaction`**. The second write is wrapped in `try/catch` that **swallows the error** (`console.error` then continues). If step 2 fails (DB error, lock, validation), the certification is created but the claim is NOT marked APPROVED — and the API returns HTTP 201 success.
- **Impact:** R1 violation (silent failure). Inconsistent state: certification exists but claim stays in SUBMITTED status. The certified amount on the claim is lost. Downstream the claim cannot be invoiced (invoice API requires `claim.status === 'APPROVED'`).
- **Fix:** Wrap both writes in `db.$transaction(async tx => { cert = tx.claimCertification.create(...); await tx.progressClaim.update(...); return cert })`. Remove the try/catch — let errors propagate as 500.
- **Accounting link:** No direct JE impact (certifications don't create JEs), but the corrupted status blocks the entire invoice-generation chain that DOES create JEs.

### P2-CRIT-007: cost-entries POST creates no journal entry + no $transaction + swallows budget update error
- **File:** `src/app/api/cost-entries/route.ts:62-110`
- **Issue:** Three problems:
  1. **No JE**: A manual cost entry of SAR 100,000 to a project is recorded in `CostEntry` but **never posted to the GL**. The `journalEntryId` field on `CostEntry` is never set. So project costs in the GL are missing manual entries — the WIP report (which uses GL) will under-report costs.
  2. **No $transaction**: `db.costEntry.create()` (line 74) and `db.costCodeBudget.updateMany()` (line 97) are separate writes — partial failure possible.
  3. **Silent failure on budget update**: `updateMany(...).catch(() => {})` (line 100) swallows any error silently — the actual cost is incremented but the budget may not reflect it.
- **Impact:** R1 violation (missing GL entries). EVM `actualAmount` on `CostCodeBudget` may be wrong. Project profitability reports diverge from GL.
- **Fix:** (a) Add `autoEntryManualCost` to `engine.ts` (Dr PROJECT_COST 7110 / Cr CASH or AP based on `payFrom`), call it inside the same `$transaction`. (b) Wrap create + budget update + JE in `$transaction`. (c) Remove the `.catch(() => {})` — if no budget exists, that's fine (updateMany returns 0 count), but other errors should propagate.
- **Accounting link:** R1 violation — manual project costs invisible to GL.

### P2-CRIT-008: SubcontractorInvoice uses JS-number arithmetic on Decimal financial fields
- **File:** `src/app/api/subcontractor-invoices/route.ts:39-40`
  ```ts
  const vatAmount = amount * vatRate       // amount:number, vatRate:number
  const totalAmount = amount + vatAmount
  ```
- **Issue:** `amount` and `vatRate` come from the JSON body as JS `number`. The multiplication `100000 * 0.15` produces `15000.000000000000002` in IEEE 754. The result is then stored into a `Decimal @db.Decimal` field. Subsequent aggregations (`_sum: { vatAmount: true }`) may produce visible rounding errors. Comparison `paidAmount >= totalAmount` may fail due to floating-point drift.
- **Impact:** Precision loss on financial records. Trial balance may not balance to the centime. Invoice status transitions (PARTIALLY_PAID → PAID) may fail.
- **Fix:** Use `Decimal` from `prisma/client` or `decimal.js` for all financial arithmetic. Pattern:
  ```ts
  import { Prisma } from '@prisma/client'
  const amt = new Prisma.Decimal(body.amount)
  const rate = new Prisma.Decimal(body.vatRate || 0.15)
  const vatAmount = amt.mul(rate).toDecimalPlaces(2)
  const totalAmount = amt.add(vatAmount)
  ```
  Apply the same fix to: `subcontractor-advances/route.ts`, `subcontractor-payments/route.ts`, `subcontractor-retentions/route.ts`, `change-orders/route.ts:64-66`, `change-orders/[id]/route.ts:42-47`, `contracts/route.ts:74-76`, `boq/route.ts:35`, `claim-items/route.ts:59-61`, `claim-certifications/route.ts:55-62`, `measurements/route.ts:68-72`.
- **Accounting link:** Direct — Decimal precision is a foundational accounting requirement.

### P2-CRIT-009: Project DELETE is hard-delete with no protection / no soft-delete field
- **File:** `src/app/api/projects/[id]/route.ts:233-252`
- **Issue:** The DELETE route calls `db.project.delete({ where: { id } })` directly. The `Project` model has **no `deletedAt` field** in `schema.prisma:726-798`. Relations on `Project` use mixed `onDelete` rules:
  - `Contract.project` → `onDelete: Restrict` (good — blocks delete if contracts exist)
  - `BOQItem.project` → `onDelete: Restrict`
  - `ChangeOrder.project` → `onDelete: Restrict`
  - `ProgressClaim.project` → `onDelete: Restrict`
  - `WBSElement.project` → `onDelete: Cascade` (deletes all WBS!)
  - `ProjectLedger.project` → `onDelete: Cascade` (deletes ledger!)
  - `Activity.project` → `onDelete: Cascade`
  - `CostEntry.project` → `onDelete: ?` (need to check — if Restrict, blocks; if Cascade, deletes costs)
- **Impact:** Hard-deleting a project with no contracts/BOQ/claims will still CASCADE delete all WBS, ProjectLedger, Activity, CostEntry, Commitment records. This destroys audit history. If the project has ever had any JE posted through its cost center, those JEs remain orphaned (the cost center may still exist but the project is gone). For an ERP, this is unacceptable — projects should be CANCELLED, not deleted.
- **Fix:** (a) Add `deletedAt DateTime?` to `Project` model. (b) Change DELETE route to soft-delete: `db.project.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } })`. (c) Add `deletedAt: null` filter to all `project.findMany` queries in `GET` routes. (d) Block DELETE entirely if any `contracts`, `progressClaims`, `salesInvoices`, `purchaseInvoices`, `expenses`, or JEs exist.
- **Accounting link:** Hard-deleting a project with posted JEs breaks the audit trail — the GL will reference cost centers / projects that no longer exist.

---

## HIGH Issues

### P2-HIGH-001: Project.actualCost / committedCost / estimatedTotalCost / progressPercent are dead fields — never updated
- **Files:**
  - `prisma/schema.prisma:787-790` (field definitions)
  - `src/app/api/projects/route.ts` POST — doesn't set these
  - `src/app/api/projects/[id]/route.ts` PUT — doesn't update these
  - `grep "actualCost:|committedCost:|estimatedTotalCost:|progressPercent:" src/` → 0 update matches (only read references in reports)
- **Issue:** The four summary fields on `Project` are never written. Every read recomputes from scratch (e.g., `projects/[id]/route.ts:118-128` aggregates `purchaseInvoices + subcontractorInvoices + laborCosts + equipmentCosts + expenses` on every GET). For a project with 10k records, this is N+1 in nested includes + JS-side reduce.
- **Impact:** Performance regression on detail page. Data inconsistency between concurrent reads (e.g., one user reads while another posts an expense — old summary cached in client state).
- **Fix:** Either (a) make these computed (Prisma virtual / @map to a view) OR (b) update them in every relevant POST route (expense, subcontractor-invoice, purchase-invoice, equipment-cost) wrapped in `$transaction` with the source write. Option (a) is cleaner.

### P2-HIGH-002: Project PUT allows any status transition (DRAFT→COMPLETED allowed) + no closure logic
- **File:** `src/app/api/projects/[id]/route.ts:183-231`
- **Issue:** The PUT route accepts any `status` value from the body and writes it directly. There is **no validation** of allowed transitions (e.g., DRAFT → ACTIVE → ON_HOLD → ACTIVE → COMPLETED is the expected lifecycle). Setting `status: 'COMPLETED'` does not:
  - Set `endDate` if missing
  - Settle WIP balances
  - Release retentions (subcontractor + customer)
  - Create a project-closing JE
  - Mark all open commitments as CLOSED
  - Reconcile actual costs vs budget
- **Impact:** A user can mark a project COMPLETED while it has open invoices, unpaid retentions, and an unbalanced WIP. Subsequent reporting is inconsistent.
- **Fix:** Add a separate `POST /api/projects/[id]/close` route that: (a) validates all contracts are COMPLETED/TERMINATED, (b) validates all subcontractor invoices are PAID, (c) validates all retentions are FULLY_RELEASED, (d) creates a closing JE if needed (Dr/Cr WIP settlement), (e) sets status + endDate atomically.

### P2-HIGH-003: BOQItem lacks @@unique([projectId, code]) — duplicate BOQ codes allowed per project
- **File:** `prisma/schema.prisma:926-948`
- **Issue:** `BOQItem.code` has `@@index([code])` (line 947) but no `@@unique([projectId, code])`. Within a single project, two BOQ items can share the same code (e.g., `001-EXCAVATION` twice). BOQ codes are the canonical reference for `Measurement.boqItemId` and `ClaimItem.boqItemId` — duplicates break the FK semantic.
- **Impact:** Two BOQ items with code "001" → which one does a measurement refer to? UI dropdowns become ambiguous. Aggregations double-count.
- **Fix:** Add `@@unique([projectId, code])` to the `BOQItem` model. Run a data-dedup migration first.

### P2-HIGH-004: ProgressClaim.claimNo is not @unique (carried over from Phase 1 audit HIGH #29 — still unfixed)
- **File:** `prisma/schema.prisma:956`
- **Issue:** `claimNo String` — no `@unique`. The Phase 1 audit (report 01-accounting-engine.md HIGH #29) noted this. The Phase 1 fix cycles did not address it.
- **Impact:** Two claims with the same `claimNo` can be created. UI shows duplicate numbers. Sales invoice generation searches by claimNo → ambiguity.
- **Fix:** Add `@unique` to `claimNo`, OR if uniqueness is per-contract, add `@@unique([contractId, claimNo])`.

### P2-HIGH-005: Code-generation race condition (count+1 pattern) in 5 routes
- **Files:**
  - `src/app/api/subcontractor-advances/route.ts:55-56` — `advanceNo = SCA-{year}-{count+1}`
  - `src/app/api/subcontractor-payments/route.ts:51-53` — `paymentNo = SCP-{year}-{count+1}`
  - `src/app/api/subcontractor-retentions/route.ts:54-56` — `retentionNo = SRT-{year}-{count+1}`
  - `src/app/api/measurements/route.ts:64-66` — `code = MS-{year}-{count+1}`
  - `src/app/api/commitments/route.ts:54-56` — `commitmentNo = CMT-{year}-{count+1}`
  - `src/app/api/subcontractors/route.ts:31-42` — `code = SUB-{count+1}` (uses findFirst orderBy desc — also racy)
  - `src/app/api/contracts/route.ts:58-65` — `contractNo = CTR-{count+1}` (uses findFirst orderBy desc)
- **Issue:** All these endpoints compute the next sequential number by counting rows (or finding the max), then creating. Two concurrent POSTs get the same number → second one fails on `@unique` constraint with a generic 500 error. No retry, no user-friendly message.
- **Impact:** Under concurrent load (multiple users adding subcontractor invoices simultaneously), some POSTs fail mysteriously. The user sees a generic "فشل" error.
- **Fix:** Either (a) use a DB sequence / autoincrement, OR (b) wrap count+create in `$transaction` with a higher isolation level (sqlite doesn't support row-level locks well), OR (c) use a `getNextSequenceNo(name, tx)` helper that maintains a `Counter` table with `UPDATE ... RETURNING`.

### P2-HIGH-006: backfill route uses N+1 queries + swallows errors per section + missing salaries section
- **File:** `src/app/api/project-controls/[projectId]/backfill/route.ts:8-159`
- **Issue:** Three problems:
  1. **N+1 queries**: For each `Expense`, `LaborCost`, `SubcontractorInvoice`, `EquipmentCost` — the route does a `findFirst` to check if backfilled, then a `create`. For a project with 1,000 expenses, that's 2,000+ queries.
  2. **Silent error swallowing per section**: Lines 47-49, 79-81, 111-113, 143-145 each have `try { ... } catch (e) { console.error(...) }` — if section 1 fails, sections 2-4 still run, and the response returns `success: true` with partial results.
  3. **Missing salaries section**: Line 14 initializes `salaries: 0` in results, but there is NO salaries backfill code block. The Phase 1 audit redesigned the salary cycle to use `Salary` model with `employeeId, year, month` — these are never backfilled to `CostEntry`.
- **Impact:** Slow backfill (minutes for large projects). Partial backfill leaves CostEntry inconsistent. Salary costs missing from project cost analytics.
- **Fix:** (a) Use bulk `createMany` with `skipDuplicates: true` after a single `findMany` for existing sourceIds. (b) Wrap everything in one `$transaction` — let errors propagate. (c) Add the missing salaries section.

### P2-HIGH-007: IFRS15 engine (autoEntryIFRS15Revenue + calculatePeriodRevenue) is dead code
- **Files:**
  - `src/lib/accounting/ifrs15.ts:200-237` (`autoEntryIFRS15Revenue` — 0 callers, verified via `grep -r "autoEntryIFRS15Revenue" src/`)
  - `src/lib/accounting/ifrs15.ts:145-193` (`calculatePeriodRevenue` — 0 callers)
  - `src/lib/accounting/ifrs15.ts:161-179` filters `JournalEntry.sourceType: 'IFRS15_REVENUE'` — but no code creates JEs with that sourceType, so `previouslyRecognizedRevenue` is always 0.
- **Issue:** The POC-based revenue recognition engine is fully implemented but never invoked. There is no API endpoint that triggers `autoEntryIFRS15Revenue` for a project. The only revenue recognition path is sales invoice creation.
- **Impact:** Dead code confusion. The WIP report's `contractAssetBalance` is always 0 (no IFRS15 JEs to count). If a project needs POC-based revenue recognition (long-term contracts with milestones not billed), there's no way to do it.
- **Fix:** Either (a) wire `autoEntryIFRS15Revenue` to a new endpoint `POST /api/project-controls/[projectId]/recognize-revenue` that runs at month-end, OR (b) delete the dead functions and document that the system uses "claim-and-bill" model only.

### P2-HIGH-008: CostCodeBudget has no API — EVM BAC is always 0
- **Files:**
  - `prisma/schema.prisma:2318-2337` (model exists with `budgetAmount`, `committedAmount`, `actualAmount`, `earnedAmount`, `forecastAmount`, `variance`)
  - `src/app/api/cost-entries/route.ts:97-100` is the ONLY writer — and it only increments `actualAmount`
  - No API to set `budgetAmount` (the planned value / BAC)
- **Issue:** EVM (`/api/project-controls/[projectId]/evm/route.ts`) reads `bac = _sum.costCodeBudget.budgetAmount` — always 0 because no API sets it. The EVM endpoint then falls back to `contractValue` as BAC, which is wrong (BAC should be budgeted cost, not contract value).
- **Impact:** CPI, SPI, ETC, EAC, VAC metrics are all wrong. Project managers get misleading variance reports.
- **Fix:** Add `POST /api/cost-code-budgets/route.ts` to set budget per (wbsElementId, costCodeId). Allow bulk import from CSV.

### P2-HIGH-009: SubcontractorInvoice POST passes costCenterId: undefined — project costs not attributed to project cost center
- **File:** `src/app/api/subcontractor-invoices/route.ts:91`
  ```ts
  await autoEntrySubcontractorInvoice({
    ...
    costCenterId: undefined,   // ← always undefined
  }, tx)
  ```
- **Issue:** The route has access to `projectId` (line 62) but does not look up `project.costCenterId` to pass it to the JE. The same pattern was the Phase 1 CRITICAL #5 fix (costCenterId = projectId) — but here it's the opposite: costCenterId is left undefined entirely.
- **Impact:** The WIP report (`/api/reports/project-wip/route.ts`) joins `JournalLine.costCenterId` to project cost center — subcontractor invoice JEs have `costCenterId: null`, so they're never attributed. Project profitability shows zero subcontractor costs.
- **Fix:** Fetch `project.costCenterId` and pass it: `costCenterId: project.costCenterId || undefined`. Same fix needed in: `subcontractor-advances`, `subcontractor-payments`, `subcontractor-retentions` (after adding their JEs per P2-CRIT-002).

### P2-HIGH-010: Contracts POST does not sync Project.contractValue
- **File:** `src/app/api/contracts/route.ts:78-121`
- **Issue:** When a new contract is created with `value: 100000`, the `Project.contractValue` field is not updated. The project keeps its old `contractValue` (set at project creation). This means the dashboard "Contract Value" card and EVM BAC fallback are stale.
- **Impact:** Inconsistent: a project can have 3 contracts totaling 1,000,000 SAR but `project.contractValue` shows 100,000 (from project creation). EVM POC uses `project.contractValue` for revenue calculation — wrong.
- **Fix:** In the contract POST `$transaction`, also: `tx.project.update({ where: { id: projectId }, data: { contractValue: { increment: totalValue } } })`. Apply the reverse on contract DELETE.

### P2-HIGH-011: projects/[id] GET route loads ALL nested records — heavy N+1 + memory
- **File:** `src/app/api/projects/[id]/route.ts:10-112`
- **Issue:** The GET route includes **15 nested relations** with no `take` limit on most: `contracts.progressClaims`, `salesInvoices.clientPayments`, `purchaseOrders`, `purchaseInvoices.goodsReceipt`, `expenses`, `laborCosts`, `equipmentCosts`, `equipmentUsages`, `subcontractorInvoices`, `goodsReceipts`, `timesheets`, `workTeams.members.employee`, `fuelLogs`, `equipmentOperations`, `resourceAllocations`, `purchaseRequests`. For a project active for 2 years with 5,000+ expenses and 10,000+ fuel logs, this returns multi-MB JSON.
- **Impact:** Slow page load (5-10 seconds for large projects). High memory on server. Browser may freeze rendering huge JSON.
- **Fix:** Split into separate endpoints: `GET /api/projects/[id]` (basic + contracts), `GET /api/projects/[id]/costs` (paginated expenses), `GET /api/projects/[id]/invoices` (paginated), etc. Use `take: 50` and `orderBy: { date: 'desc' }` on every nested include.

### P2-HIGH-012: Measurements POST does not validate against contract quantity (over-claim)
- **File:** `src/app/api/measurements/route.ts:55-108`
- **Issue:** The route accepts any `currentQuantity` and `cumulativeQuantity` from the body without checking against `contractQuantity` (which is also passed but not validated). A user can submit a measurement with `cumulativeQuantity: 1000` when `contractQuantity: 500` — over-claim by 2x. There's no warning or block.
- **Impact:** Over-claiming inflates revenue and progress %. Subcontractor payments may exceed contract value. Audit findings.
- **Fix:** Add validation: `if (cumulativeQuantity > contractQuantity * 1.05) return 400` (5% tolerance for variance). Update `BOQItem` consumed quantity (which doesn't exist as a field — add `consumedQuantity Decimal @default(0)`).

### P2-HIGH-013: SubcontractorInvoice route has no PUT/cancel — JE cannot be reversed
- **File:** `src/app/api/subcontractor-invoices/` (only `route.ts`, no `[id]/route.ts`)
- **Issue:** A subcontractor invoice creates a JE via `autoEntrySubcontractorInvoice` (line 83-92). If the invoice is wrong (wrong amount, wrong subcontractor, duplicate), there is **no API to cancel it**. The JE stays POSTED forever. Compare to `purchase-invoices/[id]/route.ts` which has a DELETE that calls `reverseEntry()`.
- **Impact:** Accounting errors on subcontractor invoices are permanent — users must post a manual correcting JE, which violates the "no manual JEs for source documents" principle.
- **Fix:** Add `[id]/route.ts` with: `GET` (fetch by id), `PUT` (update DRAFT only), `DELETE` (soft-delete + `reverseEntry()` if `journalEntryId` exists + decrement `Subcontractor.paidAmount` if any payments were offset).

### P2-HIGH-014: contracts POST auto-generated contractNo has race condition (find + create not in tx)
- **File:** `src/app/api/contracts/route.ts:56-71`
- **Issue:** The auto-generation logic does:
  1. `db.contract.findFirst({ where: { contractNo: { startsWith: 'CTR-' } }, orderBy: { contractNo: 'desc' } })` (line 59)
  2. compute next number
  3. `db.contract.findUnique({ where: { contractNo: finalContractNo } })` (line 68 — duplicate check)
  4. `db.contract.create({ data: { contractNo: finalContractNo, ... } })` (line 78)
  
  Steps 1-4 are NOT in a transaction. Two concurrent POSTs can both read `CTR-0005` as the latest, both compute `CTR-0006`, both pass the duplicate check, then one succeeds and the second fails on `@unique` with a generic 500.
- **Impact:** Concurrent contract creation fails silently. Same issue applies to `change-orders/route.ts:48-59` and `subcontractors/route.ts:31-42`.
- **Fix:** Wrap the entire sequence in `db.$transaction`. Or use `getNextEntryNo`-style helper with a counter table.

---

## MEDIUM Issues

### P2-MED-001: Projects POST does not create a CostCenter — costCenterId stays null
- **File:** `src/app/api/projects/route.ts:75-94`
- **Issue:** The `Project` model has `costCenterId String?` (line 734) — the field that links project costs to GL. But the POST route never creates a `CostCenter` for the project nor links it. The fallback in `buildProjectCostCenterMap` (`src/lib/report-engine.ts:644-660`) matches by code/name heuristically — fragile.
- **Impact:** Project costs land on `costCenterId: null` in JEs → WIP report can't attribute them. The heuristic match breaks if a cost center with the same code/name doesn't exist.
- **Fix:** In the project POST `$transaction`, create a `CostCenter` with `code: project.code, name: project.name, type: 'PROJECT'` and link `costCenterId`.

### P2-MED-002: Contracts PUT does not validate contractNo uniqueness before update
- **File:** `src/app/api/contracts/[id]/route.ts:60-104`
- **Issue:** Line 64: `contractNo: body.contractNo || existing.contractNo` — if `body.contractNo` is a duplicate of another contract's number, Prisma throws a generic 500. No friendly error.
- **Fix:** Before update, check `db.contract.findUnique({ where: { contractNo: body.contractNo } })` and return 400 if it exists with a different id.

### P2-MED-003: No Zod validation on any project-cycle route — only manual if-checks
- **Files:** All routes in scope.
- **Issue:** Every POST/PUT uses inline `if (!field1 || !field2) return 400`. No schema validation for types, ranges, enums. A POST with `status: 'INVALID'` or `amount: 'abc'` produces a Prisma error or silent bad data.
- **Fix:** Define Zod schemas per entity (e.g., `projectCreateSchema`, `contractCreateSchema`) and parse the body with `schema.parse(body)`.

### P2-MED-004: Form components use useState instead of react-hook-form + zod
- **Files:** `src/components/modules/projects.tsx:289`, `contracts.tsx`, `boq.tsx:78`, `progress-claims.tsx:124`, `subcontractors.tsx:73`, `change-order-dialog.tsx:85-90`
- **Issue:** All forms use raw `useState` + manual `onChange` handlers. No client-side validation, no error messages per field, no react-hook-form `formState.errors`.
- **Impact:** Poor UX — validation errors only appear after submit + 400 response. No inline hints.
- **Fix:** Migrate to `react-hook-form` + `zodResolver`. Pattern is well-established in shadcn/ui templates.

### P2-MED-005: claim-certifications POST accepts consultantName/consultantApprovalNo but doesn't save them
- **File:** `src/app/api/claim-certifications/route.ts:49`
- **Issue:** The route destructures `consultantName, consultantApprovalNo` from the body but the `ClaimCertification` model has no such fields — they're silently dropped. The client likely sends them expecting persistence.
- **Fix:** Either add the fields to `ClaimCertification` schema, or remove from the destructuring + return 400 if provided.

### P2-MED-006: WBS POST doesn't validate parent belongs to same project
- **File:** `src/app/api/wbs/route.ts:50-88`
- **Issue:** Line 62: `db.wBSElement.findUnique({ where: { id: parentId } })` — doesn't check `parent.projectId === projectId`. A user can create a WBS element in project A with a parent in project B.
- **Impact:** Corrupted WBS tree, broken aggregations.
- **Fix:** `if (parent && parent.projectId !== projectId) return 400`.

### P2-MED-007: Subcontractor DELETE is hard-delete with no protection
- **File:** `src/app/api/subcontractors/[id]/route.ts:49-58`
- **Issue:** `db.subcontractor.delete({ where: { id } })` — no check for existing invoices, advances, payments, retentions. Prisma will throw FK error (because `SubcontractorInvoice.subcontractor` has `onDelete: Restrict`) but it surfaces as generic 500.
- **Fix:** Check `_count.invoices + _count.advances + _count.payments + _count.retentions === 0` before delete. Return 400 with list of dependent records. Add `deletedAt` for soft-delete.

### P2-MED-008: Subcontractor PUT writes `undefined` fields explicitly
- **File:** `src/app/api/subcontractors/[id]/route.ts:28-41`
- **Issue:** `data: { name: body.name, nameAr: body.nameAr || null, ... }` — if `body.name` is undefined (not sent), Prisma sets `name` to undefined which means "don't update" — OK. But `nameAr: body.nameAr || null` sets `nameAr` to null if `body.nameAr` is empty string, even if the user didn't intend to clear it.
- **Fix:** Use the conditional spread pattern from `projects/[id]/route.ts:207-218`: `...(body.nameAr !== undefined && { nameAr: body.nameAr || null })`.

### P2-MED-009: claim-certifications POST allows re-certification without reversing prior
- **File:** `src/app/api/claim-certifications/route.ts:64-80`
- **Issue:** The `ClaimCertification.claimId` is `@unique` (schema:2549) — so a second POST for the same claimId will fail at the DB level with a unique constraint violation, surfaced as a generic 500. The route doesn't check for existing certification first.
- **Fix:** `const existing = await db.claimCertification.findUnique({ where: { claimId } })`; if exists, return 400 "already certified, use PUT to amend".

### P2-MED-010: Commitments POST has no accounting JE + no `invoicedAmount`/`receivedAmount` update path
- **File:** `src/app/api/commitments/route.ts:44-97`
- **Issue:** Commitments are pure off-balance records (which can be acceptable for commitment accounting). But the schema has `invoicedAmount` and `receivedAmount` fields that are never updated — no automation when a PurchaseInvoice or GoodsReceipt is linked to a commitment. `Project.committedCost` is also never updated.
- **Fix:** Either (a) add a `commitmentId` link to PurchaseInvoice and update `invoicedAmount` on invoice POST, OR (b) remove the unused fields.

### P2-MED-011: Hardcoded fallback account codes still present in ifrs15.ts
- **File:** `src/lib/accounting/ifrs15.ts:216-217`
  ```ts
  const contractAssetCode = await getAccountCodeByRole('CONTRACT_ASSET', client) || '1310'
  const unbilledRevenueCode = await getAccountCodeByRole('UNBILLED_REVENUE', client) || '4210'
  ```
- **Issue:** The `|| '4210'` fallback references account 4210 which (per Phase 1 audit HIGH #25) doesn't exist in the chart of accounts. The `|| '1310'` fallback masks missing role configuration. (Note: this is in dead code per P2-HIGH-007, but if reactivated it will fail.)
- **Fix:** Remove fallbacks — throw if role not configured. Same as Phase 1 recommendation.

---

## LOW Issues

### P2-LOW-001: Misleading comment references non-existent endpoint
- **File:** `src/app/api/progress-claims/route.ts:78`
  ```ts
  // (See /api/progress-claims/[id]/generate-invoice or the sales-invoices API.)
  ```
  The endpoint `/api/progress-claims/[id]/generate-invoice` does not exist (verified via `ls src/app/api/progress-claims/`). The actual flow is via `POST /api/sales-invoices` with `progressClaimId` in the body.
- **Fix:** Update the comment to point to `src/app/api/sales-invoices/route.ts:141` (`createInvoiceFromExtract`).

### P2-LOW-002: Dead function `createProgressClaimJournalEntry` in auto-journal.ts
- **File:** `src/lib/auto-journal.ts:295-348`
- **Issue:** Function exists, exported, fully implemented — but `grep -r "createProgressClaimJournalEntry" src/` shows 0 callers (only a comment reference). The Phase 1 fix removed the call from `progress-claims/[id]/route.ts`. This is dead code.
- **Fix:** Delete the function. The intent (no JE at claim approval) is enforced by `autoEntryProgressClaim` in `engine.ts:611` which throws if called.

### P2-LOW-003: `autoEntryIFRS15Revenue` uses lazy import + `as any` cast
- **File:** `src/lib/accounting/ifrs15.ts:213-230`
  ```ts
  const { createJournalEntry } = await import('./engine')
  const { getAccountCodeByRole } = await import('../account-roles')
  ...
  } as any, client as any)
  ```
- **Issue:** Lazy imports inside a function are a code smell — usually indicates circular dependency. The `as any` casts bypass type safety.
- **Fix:** Resolve the circular dependency at module level (move shared types to a separate file), use direct imports, remove `as any`.

### P2-LOW-004: SubcontractorAdvance recoveryMethod field accepted but never used
- **File:** `src/app/api/subcontractor-advances/route.ts:48,67`
- **Issue:** The route accepts `recoveryMethod` (PER_CERTIFICATE, FIXED, LUMP_SUM) and saves it. But there is no recovery logic anywhere — no endpoint to deduct advance against future invoices.
- **Fix:** Add `POST /api/subcontractor-advances/[id]/recover` that takes `invoiceId` + `amount`, increments `recoveredAmount`, creates the offset JE (Dr SUBCONTRACTOR_AP / Cr SUBCONTRACTOR_ADVANCE).

### P2-LOW-005: Subcontractor PUT ignores `idOrRegNumber`, `nameEn` fields
- **File:** `src/app/api/subcontractors/[id]/route.ts:28-41`
- **Issue:** The `Subcontractor` model has `idOrRegNumber` and `nameEn` fields (schema:468-469). The PUT route doesn't write them — they're set on POST (no, they're not — POST also skips them at lines 44-56).
- **Fix:** Add `idOrRegNumber: body.idOrRegNumber || null` and `nameEn: body.nameEn || null` to both POST and PUT.

### P2-LOW-006: Console.error used everywhere instead of structured logger
- **Files:** All audited routes.
- **Issue:** Every catch block does `console.error('[API] Failed to ...', error)`. No structured logging, no log level, no correlation ID, no Sentry/Pino integration.
- **Fix:** Adopt a structured logger (e.g., `pino`) with request-scoped context. This is a cross-cutting concern for Phase 7 (RBAC + observability).

### P2-LOW-007: WBS GET filters `isActive: true` but no API to toggle isActive
- **File:** `src/app/api/wbs/route.ts:17`
- **Issue:** The GET route filters `isActive: true`, hiding deactivated WBS elements. But there's no PUT endpoint to set `isActive: false`. The filter is dead — all WBS elements are always active.
- **Fix:** Either remove the filter (show all) OR add `[id]/route.ts` with PUT to deactivate.

---

## Dead Code / Unused Functions

1. **`createProgressClaimJournalEntry`** — `src/lib/auto-journal.ts:295-348`. 0 callers. Phase 1 fix removed the only caller.
2. **`autoEntryIFRS15Revenue`** — `src/lib/accounting/ifrs15.ts:200-237`. 0 callers.
3. **`calculatePeriodRevenue`** — `src/lib/accounting/ifrs15.ts:145-193`. 0 callers.
4. **`autoEntryProgressClaim`** — `src/lib/accounting/engine.ts:611-626`. Throws immediately if called. 0 callers (intentional guard).
5. **`Project.actualCost`, `committedCost`, `estimatedTotalCost`, `progressPercent`** — schema fields, 0 writers (P2-HIGH-001).
6. **`ProjectLedger` model** — schema defined, 0 writers (P2-CRIT-004).
7. **`WIPEntry`, `WIPAdjustment`, `LossProvision`, `ProjectBudget`, `ProjectBudgetLine`, `ProjectForecast`, `CustomerAdvance`, `AdvanceRecovery` models** — schema defined, 0 writers (no API routes, no autoEntry calls). The entire IFRS 15 / EVM / customer-advance architecture is unbuilt.
8. **`Commitment.invoicedAmount`, `receivedAmount`, `remainingCommitment`** — schema fields, never updated after creation (P2-MED-010).
9. **`SubcontractorAdvance.recoveryMethod`, `deductionPercent`, `recoveredAmount`** — schema fields, `recoveredAmount` never incremented (P2-LOW-004).
10. **`Measurement.certifiedQuantity`, `certifiedAmount`, `certifiedDate`, `certifiedBy`, `rejectionReason`** — schema fields, never written (no certification endpoint).
11. **`ClaimItem.measurementId` (implicit via `Measurement.claimItemId @unique`)** — relation exists but no code links them.
12. **`Subcontractor.idOrRegNumber`, `nameEn`** — schema fields, never written (P2-LOW-005).
13. **`CostCodeBudget.committedAmount`, `earnedAmount`, `forecastAmount`, `variance`** — schema fields, only `actualAmount` is ever incremented.

---

## Recommendations for Phase 2 Fix Cycles

### Cycle 1 (CRITICAL — accounting integrity): Subcontractor cash-flow JEs
Fixes: P2-CRIT-002, P2-CRIT-003, P2-CRIT-007 (cost-entries JE), P2-HIGH-009 (costCenterId)
- Add 3 new `autoEntrySubcontractor*` functions in `engine.ts`
- Wrap all 3 subcontractor POST routes in `$transaction` with JE + invoice paidAmount update
- Add `autoEntryManualCost` for cost-entries
- Pass `project.costCenterId` everywhere
- Verification: create advance + payment + retention, verify balanced JEs in GL

### Cycle 2 (CRITICAL — CRUD completeness): Missing [id] routes
Fixes: P2-CRIT-005, P2-CRIT-008 (Decimal arithmetic)
- Add `[id]/route.ts` for 8 entities (subcontractor-invoices, -advances, -payments, -retentions, claim-items, claim-certifications, measurements, commitments, wbs)
- Each with GET / PUT (status transitions) / DELETE (with reversal where applicable)
- Switch all financial arithmetic to `Prisma.Decimal`
- Verification: cancel a subcontractor invoice → JE reversed; certify a measurement → status flows; release a retention → JE created

### Cycle 3 (CRITICAL — schema + atomicity): ChangeOrder + ProjectLedger + Project DELETE
Fixes: P2-CRIT-001 (change order contract value), P2-CRIT-004 (ProjectLedger writers), P2-CRIT-006 (claim-cert tx), P2-CRIT-009 (Project soft-delete)
- Wrap change-order PUT (APPROVED transition) in `$transaction` that updates Contract + Project
- Implement `postProjectLedger()` helper called from every autoEntry function
- Wrap claim-certifications POST in `$transaction`, remove try/catch
- Add `deletedAt` to Project schema + soft-delete in DELETE route
- Verification: approve a change order → contract value increases; create an expense → ProjectLedger row appears; delete a project → soft-deleted, JEs intact

### Cycle 4 (HIGH — performance + uniqueness):
Fixes: P2-HIGH-001 (dead project fields), P2-HIGH-003 (BOQ unique), P2-HIGH-004 (claimNo unique), P2-HIGH-005 (race conditions), P2-HIGH-006 (backfill), P2-HIGH-011 (N+1 GET)
- Add `@@unique([projectId, code])` to BOQItem, `@unique` to ProgressClaim.claimNo
- Refactor backfill to bulk `createMany` + add salaries section + `$transaction`
- Split `projects/[id]` GET into 3-4 endpoints with pagination
- Implement `getNextSequenceNo(name, tx)` counter helper, use in all 5 code-gen routes
- Either compute or maintain Project summary fields

### Cycle 5 (HIGH — IFRS 15 / EVM plumbing):
Fixes: P2-HIGH-007 (IFRS15 dead), P2-HIGH-008 (CostCodeBudget API), P2-HIGH-002 (project closure)
- Add `POST /api/cost-code-budgets` to set budget per WBS+CostCode
- Add `POST /api/project-controls/[projectId]/recognize-revenue` endpoint that calls `autoEntryIFRS15Revenue`
- Add `POST /api/projects/[id]/close` endpoint with full closure workflow
- Decide: keep IFRS15 POC engine (for long-term projects) or delete (claim-and-bill only)

### Cycle 6 (HIGH — measurements + contracts sync):
Fixes: P2-HIGH-010 (contract value sync), P2-HIGH-012 (over-claim), P2-HIGH-013 (subcontractor-invoice cancel), P2-HIGH-014 (contractNo race)
- Contracts POST `$transaction` increments Project.contractValue
- Measurements POST validates cumulativeQuantity against contractQuantity
- Add `consumedQuantity` to BOQItem, update on measurement certification
- Wrap contractNo generation in `$transaction`

### Cycle 7 (MEDIUM — validation + UI):
Fixes: P2-MED-001 through P2-MED-011
- Zod schemas for all routes
- Migrate forms to react-hook-form + zodResolver
- Project POST creates CostCenter automatically
- WBS POST validates parent.projectId
- Subcontractor DELETE pre-check + soft-delete
- Fix field drops in claim-certifications

---

## Verified Working (no issues found)

The following were explicitly verified as correct (do NOT re-audit in subsequent cycles):

1. **Progress claim → invoice → JE chain is atomic and correct** — `src/app/api/sales-invoices/route.ts:140-299` (`createInvoiceFromExtract`) wraps invoice creation + claim.invoiced update + `createSalesInvoiceJournalEntry` in `$transaction`. Duplicate prevention checks both `claim.invoiced` and `SalesInvoice.progressClaimId`. Status check (`claim.status === 'APPROVED'`) blocks invoicing un-approved claims.
2. **Progress claim approval does NOT create a JE** — `src/app/api/progress-claims/[id]/route.ts:42-124` correctly updates status only. The Phase 1 fix (Cycle 3, commit 57dc1b0) removed the double-revenue bug.
3. **Progress claim PUT reversal logic is correct** — `src/app/api/progress-claims/route.ts:141-158` calls `reverseEntry()` inside `$transaction` when amounts change on a previously-JE'd claim, then detaches `journalEntryId`. (Legacy defensive code — new claims don't create JEs.)
4. **Progress claim DELETE is soft-delete with status guards** — `src/app/api/progress-claims/[id]/route.ts:127-168` blocks deletion of APPROVED/PAID/invoiced claims, sets `deletedAt` instead of hard-delete.
5. **Status transition validation on progress claims** — `src/app/api/progress-claims/[id]/route.ts:60-74` enforces allowed transitions (DRAFT→SUBMITTED→APPROVED, REJECTED allowed from any state).
6. **Subcontractor invoice POST is atomic with JE** — `src/app/api/subcontractor-invoices/route.ts:58-95` wraps `tx.subcontractorInvoice.create` + `autoEntrySubcontractorInvoice` in `$transaction`. R1 enforced.
7. **Contracts DELETE has pre-condition checks** — `src/app/api/contracts/[id]/route.ts:130-142` blocks deletion of non-DRAFT contracts and contracts with progress claims.
8. **ChangeOrder DELETE has pre-condition checks** — `src/app/api/change-orders/[id]/route.ts:90-92` blocks deletion of non-DRAFT orders.
9. **`autoEntryProgressClaim` in engine.ts throws if called** — `src/lib/accounting/engine.ts:611-626` is an intentional guard preventing regressions of the Phase 1 double-revenue fix.
10. **`reverseEntry` is transaction-aware** — `src/lib/accounting/engine.ts:429-439` requires a `tx` parameter (no `db` fallback), ensuring all callers pass it from inside a `$transaction`.
11. **Schema unique constraints for primary entities** — `Project.code`, `Contract.contractNo`, `ChangeOrder.orderNo`, `Subcontractor.code`, `SubcontractorContract.contractNo`, `SubcontractorInvoice.invoiceNo`, `SubcontractorAdvance.advanceNo`, `SubcontractorRetention.retentionNo`, `SubcontractorPayment.paymentNo`, `WBSElement.@@unique([projectId, code])`, `Measurement.code`, `ClaimCertification.claimId`, `Commitment.commitmentNo` — all `@unique`. (Only `ProgressClaim.claimNo` and `BOQItem.code` lack uniqueness — see P2-HIGH-003/004.)
12. **Decimal fields use `Decimal` type** — all financial fields in the schema (contractValue, amount, vatAmount, totalAmount, etc.) use `Decimal @default(0)`, not `Float`. The bug is only in JS-side arithmetic (P2-CRIT-008), not in the schema.
13. **Status enums are consistent** — `ProjectStatus`, `ContractStatus`, `ChangeOrderStatus`, `ClaimStatus` all exist and are used. `SubcontractorAdvance.status`, `SubcontractorRetention.status`, `SubcontractorPayment.status` use `String` (not enum) — minor but acceptable.
14. **Cascade rules on `Contract.project` and `BOQItem.project` are `onDelete: Restrict`** — prevents accidental project deletion when contracts/BOQ exist (but doesn't help when no contracts exist — see P2-CRIT-009).
15. **UI uses TanStack Query with proper invalidation** — all components call `queryClient.invalidateQueries` in `onSuccess`. Loading states via `isLoading`, error states via `isError`. (Forms lack react-hook-form — see P2-MED-004.)
16. **`buildProjectCostCenterMap` has fallback matching** — `src/lib/report-engine.ts:632-662` matches projects to cost centers by code, then name, then numeric portion. Resilient to missing `costCenterId` link.
