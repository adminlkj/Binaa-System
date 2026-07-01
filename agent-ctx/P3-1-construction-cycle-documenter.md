# Task ID: P3-1
# Agent: P3.1 — Construction Cycle Documenter & E2E Tester

## Task
Phase 3 — Workflow Integrity, Cycle 1: Document the FULL construction project
business cycle from start to finish, then test it end-to-end against the live
database. The cycle is:
`Project → Contract → BOQ → Costs (expense/labor/subcontractor) → Progress Claim → Sales Invoice → Client Payment → Closing (IFRS-15)`

## Work Log

### Documentation
- Read all 8 API route files (projects, contracts, boq, expenses, labor-costs,
  subcontractor-invoices, progress-claims, sales-invoices, client-payments,
  ifrs15/recognize).
- Read `src/lib/auto-journal.ts` (createExpenseJournalEntry,
  createSalesInvoiceJournalEntry, createClientPaymentJournalEntry,
  createProgressClaimJournalEntry — confirmed DEAD CODE).
- Read `src/lib/accounting/engine.ts` (autoEntryLaborCost,
  autoEntrySubcontractorInvoice).
- Read `src/lib/accounting/ifrs15.ts` (calculatePOC, calculatePeriodRevenue,
  autoEntryIFRS15Revenue — idempotent via sourceId=projectId).
- Read `src/lib/business-flow/engine.ts` (canCreateExtract, canCreateInvoice
  validation gates).
- Read `src/lib/accounting/queries.ts` (getTrialBalance, getProjectBalances,
  getProjectCostBreakdown, verifyNumericalConsistency).
- Read relevant Prisma models (Project, Contract, BOQItem, ProgressClaim,
  SalesInvoice, ClientPayment, Expense, LaborCost, SubcontractorInvoice,
  JournalEntry, JournalLine, Account, CostCenter, Client, Subcontractor, Branch).
- Wrote `docs/WORKFLOW-CONSTRUCTION-CYCLE.md` — comprehensive Arabic+English
  documentation with:
  - ASCII flow diagram of the full cycle
  - For each step: API endpoint, route file path+lines, authz, prerequisites,
    required/optional input fields, JE function called, sourceType, Dr/Cr
    account roles with codes, status transitions, affected reports
  - Confirmation that `createProgressClaimJournalEntry` is DEAD CODE (revenue
    recognized at invoicing or IFRS-15, not at claim approval)
  - Confirmation that sales invoice JEs are posted on DRAFT→SENT transition
    (P6-CRIT-002 fix), NOT at invoice creation
  - JE summary table
  - File map of all relevant code paths
  - Final integrity verification checklist (6 points)

### E2E Test Script
- Wrote `scripts/e2e-construction-cycle.ts` — 59 assertions across 14 steps:
  - (a) Setup: creates test Branch, Client, Subcontractor, CostCenter
  - (b) Step 1: Project PLANNING → ACTIVE (no JE)
  - (c) Step 2: Contract DRAFT → ACTIVE (no JE)
  - (d) Step 3: 4 BOQ items totaling 1,000,000 (no JE)
  - (e) Step 4a: Expense (PROJECT, 10000+1500 VAT=11500) → JE verified
        (Dr PROJECT_COST + VAT_INPUT / Cr CASH, sourceType=EXPENSE)
  - (f) Step 4b: Labor Cost (5 workers × 10 days × 200 = 10000) → JE verified
        (Dr LABOR_COST / Cr CASH, sourceType=LABOR_COST)
  - (g) Step 4c: Subcontractor Invoice (50000+7500 VAT=57500) → JE verified
        (Dr SUBCONTRACTOR_COST + VAT_INPUT / Cr SUBCONTRACTOR_AP,
        sourceType=SUBCONTRACTOR_INVOICE, status=SENT)
  - (h) Step 5: Progress Claim DRAFT (200000, 20%) → NO JE (by design)
  - (i) Step 5b: Claim DRAFT → SUBMITTED → APPROVED → still NO JE
  - (j) Step 6: Sales Invoice from claim (DRAFT, no JE) → DRAFT→SENT → JE posted
        (Dr CUSTOMER_AR 230000 / Cr PROJECT_REVENUE 200000 + Cr VAT_OUTPUT 30000,
        sourceType=SALES_INVOICE, claim.invoiced=true)
  - (k) Step 7: Client Payment (230000) → JE posted
        (Dr CASH / Cr CUSTOMER_AR, sourceType=CLIENT_PAYMENT,
        invoice.paidAmount updated, invoice status → PAID)
  - (l) Step 8: IFRS 15 Revenue Recognition → JE posted
        (Dr CONTRACT_ASSET 87500 / Cr UNBILLED_REVENUE 87500,
        sourceType=IFRS15_REVENUE, sourceId=projectId; POC=8.75% = 70000/800000;
        second run periodRevenue=0 — idempotent confirmed)
  - (m) Final integrity:
        - All 6 cycle JEs balanced ✓
        - Trial balance ties (Dr=653100.00 = Cr=653100.00) ✓
        - tb.totals.isBalanced=true ✓
        - Project cost breakdown = 70000 (matches sum of costs) ✓
        - Cost breakdown by role correct (PROJECT_COST=10000, LABOR_COST=10000,
          SUBCONTRACTOR_COST=50000) ✓
        - Project balances tie to GL (revenue=200000 from cost-center-tagged
          sales invoice, costs=70000) ✓
        - IFRS-15 revenue verified via sourceId filter (UNBILLED_REVENUE Cr=87500,
          CONTRACT_ASSET Dr=87500) — separate from cost-center path ✓
        - Total project revenue = 200000 (cost center) + 87500 (IFRS-15) =
          287500 ✓
        - Source ↔ JE linkage intact for all source documents (claim JE
          correctly NULL by design) ✓
        - verifyNumericalConsistency (I1-I7) ok=true, 13 accounts checked,
          0 diffs ✓
        - POC matches expected cost-to-cost ratio (8.75%) ✓
  - try/finally cleanup: all 14 source docs hard-deleted, all 6 JEs
    soft-deleted (status=CANCELLED, deletedAt=now)

### Architectural Findings Documented
1. **ProgressClaim journalEntryId is always NULL by design** — revenue is
   recognized at invoicing (Step 6) or via IFRS-15 (Step 8), NOT at claim
   approval. `createProgressClaimJournalEntry` in auto-journal.ts is DEAD CODE.
2. **Sales invoice JE posted on DRAFT→SENT transition, NOT on creation** —
   P6-CRIT-002 fix prevents DRAFT invoices from inflating GL revenue.
3. **IFRS-15 JEs are tagged by sourceId=projectId, NOT by costCenterId** —
   `getProjectBalances` (which filters by cost center) misses IFRS-15 revenue.
   This is a documentation note: the two SSOT paths (cost-center-tagged revenue
   from sales invoices vs project-level revenue from IFRS-15) coexist and must
   be combined for total project revenue. Future alignment could add
   cost-center tagging to IFRS-15 JEs or extend `getProjectBalances` to also
   include sourceId-tagged revenue.
4. **Idempotency of IFRS-15 recognize** — re-running `autoEntryIFRS15Revenue`
   yields `periodRevenue=0` because `previouslyRecognizedRevenue` is read from
   `JournalLine.credit` where `sourceType='IFRS15_REVENUE'` AND
   `sourceId=projectId`.
5. **Status transition safety guards** (P6-CRIT-007) — PAID/PARTIALLY_PAID
   invoices cannot be reverted to DRAFT or CANCELLED without first reversing
   payments. DELETE on invoices with payments is blocked.

## Verification Results (ALL GREEN)
- **E2E test**: 59/59 passed (0 failed)
- **Lint**: 0 errors
- **Cleanup**: 100% — 0 P3CON-prefixed records remain in DB; all 6 JEs
  soft-deleted; trial balance unchanged from baseline

## Output Files
1. `docs/WORKFLOW-CONSTRUCTION-CYCLE.md` — full workflow documentation
2. `scripts/e2e-construction-cycle.ts` — E2E test script (59 assertions)
3. `agent-ctx/P3-1-construction-cycle-documenter.md` — this file
4. Worklog entry appended to `/home/z/my-project/worklog.md`

## Next Steps for P3 (suggested)
- P3-2: Equipment Rental Cycle (rental contract → delivery order → timesheet →
  rental invoice → collection) — the second hub in the business-flow engine.
- P3-3: Purchase Cycle (request → PO → goods receipt → supplier invoice →
  supplier payment).
- P3-4: Payroll Cycle (advance → deductions → salary payment).
- P3-5: Fixed Assets Cycle (purchase → depreciation).
- P3-6: VAT Cycle (return filing).
- P3-7: Closing Cycle (month → year → new year opening).
