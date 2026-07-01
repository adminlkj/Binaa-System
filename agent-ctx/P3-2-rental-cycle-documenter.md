# Task ID: P3-2
# Agent: P3.2 — Rental Cycle Documenter & E2E Tester

## Task
Phase 3 — Workflow Integrity, Cycle 2: Document the FULL equipment-rental
business cycle from start to finish, then test it end-to-end against the live
database. The cycle is:
`Equipment (master) → Rental Contract → Delivery Order → Timesheet → Rental Invoice (from timesheet) → Rental Payment → (optional return)`

## Work Log

### Code Reading
- Read all 6 API route files:
  - `src/app/api/equipment/route.ts` (POST) — equipment creation + JE
  - `src/app/api/equipment/rental-contracts/route.ts` (POST) — rental contract
  - `src/app/api/delivery-orders/route.ts` (POST + PATCH) — delivery order
  - `src/app/api/equipment/timesheets/route.ts` (POST + PUT) — timesheet
  - `src/app/api/equipment/timesheets/[id]/generate-invoice/route.ts` (POST) — generate invoice
  - `src/app/api/rental-payments/route.ts` (POST) — rental payment
- Read `src/lib/auto-journal.ts`:
  - `createSalesInvoiceJournalEntry` — used by generate-invoice endpoint;
    chooses RENTAL_REVENUE (not PROJECT_REVENUE) when invoiceType='RENTAL'
  - `createClientPaymentJournalEntry` — same function used by client-payments
    and rental-payments routes; the rental route just sets paymentType='RENTAL'
- Read `src/lib/accounting/engine.ts`:
  - `autoEntryEquipmentPurchase` — posts Dr FIXED_ASSET / Cr CASH (or Cr
    SUPPLIER_AP when supplierId is provided); sourceType=EQUIPMENT_PURCHASE,
    sourceId=equipment.code (NOT equipment.id)
  - `autoEntryRentalInvoice` exists but is DEAD CODE — actual rental
    invoices are created via `createSalesInvoiceJournalEntry` (called by
    the generate-invoice endpoint), NOT via this engine function
- Read `src/lib/business-flow/engine.ts`:
  - `canCreateDeliveryOrder(rentalId)` — requires rental + client +
    equipment + contract ACTIVE/DRAFT + salesOrderNo
  - `canCreateTimesheet(rentalId)` — requires rental + client + at least
    one DELIVERED or PENDING delivery order
  - `canCreateInvoice('TIMESHEET', timesheetId)` — requires APPROVED
    status and no existing invoice
- Read Prisma schema models:
  - Equipment (with `journalEntryId` linking to the purchase JE)
  - EquipmentRental (with `pricingType`, `referenceRate`, `referenceHours`,
    `hourlyRate`, `operationMode`, `@@unique` on `contractId` — one-to-one
    with parent Contract)
  - EquipmentDeliveryOrder (status PENDING/DELIVERED/RETURNED/CANCELLED)
  - Timesheet (with `@@unique([rentalId, year, month])` — one per rental
    per month; `invoiced` boolean + `invoiceId` FK)
  - SalesInvoice (with `invoiceType='RENTAL'`, `sourceType='TIMESHEET'`,
    `timesheetId @unique` — one invoice per timesheet)
  - ClientPayment (with `paymentType` — 'PAYMENT' or 'RENTAL')
  - Contract (parent of EquipmentRental, contractType='RENTAL')

### Documentation
- Wrote `docs/WORKFLOW-RENTAL-CYCLE.md` — comprehensive Arabic+English
  documentation with:
  - ASCII flow diagram of the full cycle (7 steps including optional return)
  - For each step: API endpoint, route file path+lines, authz, prerequisites,
    required/optional input fields, JE function called, sourceType,
    Dr/Cr account roles with codes, status transitions, affected reports
  - Confirmation that `autoEntryRentalInvoice` is DEAD CODE — actual
    rental invoices go through `createSalesInvoiceJournalEntry` which
    selects RENTAL_REVENUE when invoiceType='RENTAL'
  - Confirmation that rental contract creation posts NO JE — it's a
    commitment, not a GL event
  - Documentation of the P3-BUG fix in delivery-order status transition:
    when the equipment is currently RENTED, transitioning a DO to
    DELIVERED does NOT clobber the equipment status (the rental contract
    owns the status). Verified by E2E test step d3.
  - Documentation of P3-HIGH-009 fix: rental invoices are created directly
    as SENT (not DRAFT) because the JE is posted immediately
  - Documentation of the 4 enforced workflow gates in the generate-invoice
    endpoint: contract ACTIVE, DELIVERED delivery order exists, timesheet
    APPROVED, timesheet.invoiced=false AND no existing invoice
  - JE summary table (6 rows — Steps 1, 2, 3, 4, 5, 6, 7)
  - Uniqueness constraints table (5 constraints)
  - Business-flow validation gates table (4 gates)
  - File map of all relevant code paths
  - Final integrity verification checklist (6 points)

### E2E Test Script
- Wrote `scripts/e2e-rental-cycle.ts` — 39 assertions across 8 sections:
  - (a) Setup: creates test Branch, Client, CostCenter, Project (anchor
    project — required because the parent Contract model has a non-null
    projectId FK)
  - (b) Step 1: Equipment (purchasePrice=50000) → JE verified
        (Dr FIXED_ASSET 50000 / Cr CASH 50000, sourceType=EQUIPMENT_PURCHASE,
        sourceId=equipment.code, equipment.journalEntryId set)
  - (c) Step 2: Rental Contract DRAFT → ACTIVE (no JE) → equipment
        status → RENTED (P3-CRIT-007). pricingType=HOURLY,
        referenceRate=24000, referenceHours=120 → hourlyRate=200,
        totalAmount=24000
  - (d) Step 3: Delivery Order PENDING → DELIVERED (no JE; P3-BUG fix
        verified — equipment stays RENTED, not clobbered to IN_USE)
  - (e) Step 4: Timesheet DRAFT → SUBMITTED → APPROVED (no JE;
        operatingHours=100, month=2, year=2025)
  - (f) Step 5: Generate Invoice from timesheet → SalesInvoice SENT + JE
        posted (Dr CUSTOMER_AR 23000 / Cr RENTAL_REVENUE 20000 +
        Cr VAT_OUTPUT 3000, sourceType=SALES_INVOICE, sourceId=invoice.id,
        timesheet.status=INVOICED, timesheet.invoiced=true,
        timesheet.invoiceId set, invoice.invoiceType=RENTAL,
        invoice.sourceType=TIMESHEET, invoice.timesheetId set)
  - (g) Step 6: Rental Payment (full 23000) → ClientPayment with
        paymentType=RENTAL + JE posted (Dr CASH 23000 / Cr CUSTOMER_AR 23000,
        sourceType=CLIENT_PAYMENT, invoice.paidAmount=23000,
        invoice status → PAID)
  - (h) Final integrity:
        - All 3 cycle JEs balanced ✓
        - Trial balance ties (Dr=122600.00 = Cr=122600.00) ✓
        - tb.totals.isBalanced=true ✓
        - verifyNumericalConsistency (I1-I7) ok=true, 7 accounts checked,
          0 diffs ✓
        - Source ↔ JE linkage intact:
          - equipment.journalEntryId set ✓
          - salesInvoice.journalEntryId set ✓
          - clientPayment.journalEntryId set ✓
          - contract.journalEntryId null by design ✓
          - timesheet.invoiceId set + invoiced=true + status=INVOICED ✓
          - deliveryOrder exists (no JE field by design) ✓
        - Rental-cycle account balances verified:
          - FIXED_ASSET Dr=50000 (equipment purchase) ✓
          - CASH Dr=23000 (collection) / Cr=50000 (purchase) ✓
          - CUSTOMER_AR Dr=23000 (invoice) / Cr=23000 (collection) ✓
          - RENTAL_REVENUE Cr=20000 (invoice revenue) ✓
          - VAT_OUTPUT Cr=3000 (invoice VAT) ✓
        - Net cash impact = -27000 (collection 23000 − purchase 50000) ✓
  - try/finally cleanup: all 12 source docs hard-deleted, all 3 JEs
    soft-deleted (status=CANCELLED, deletedAt=now). Verified 0
    P3RNT-prefixed records remain in DB after cleanup.

### Architectural Findings Documented
1. **`autoEntryRentalInvoice` in engine.ts is DEAD CODE** — the actual
   rental-invoice JE is posted by `createSalesInvoiceJournalEntry` (in
   auto-journal.ts) which is called by the generate-invoice endpoint.
   `createSalesInvoiceJournalEntry` selects RENTAL_REVENUE vs
   PROJECT_REVENUE based on `invoice.invoiceType` ('RENTAL' vs others).
   The standalone `autoEntryRentalInvoice` is never called from any API
   route.
2. **Rental contract creates a parent `Contract` record** — the
   equipment-rental flow has a one-to-one relationship between
   `EquipmentRental` and `Contract` (contractType='RENTAL'). The parent
   contract carries the `contractNo` (RC-NNNN) and `salesOrderNo`
   (SO-NNNN) for documentation/printing. Both are auto-generated inside
   the same atomic transaction as the rental record (P3-CRIT-006 fix).
3. **The parent Contract requires a Project** — `Contract.projectId` is
   a non-null FK. The rental-contracts route auto-resolves a projectId
   if not provided (first the client's most-recent project, then any
   project). The E2E test creates an explicit anchor Project to avoid
   ambiguity.
4. **The P3-BUG fix in delivery-order status transition is critical**
   for the rental cycle — without it, transitioning a DO to DELIVERED
   would clobber the equipment's RENTED state (set by the rental
   contract) back to IN_USE, breaking the rental cycle's equipment-status
   invariant. The E2E test explicitly verifies this fix in step d3.
5. **Rental invoices are created directly as SENT, not DRAFT** — the
   generate-invoice endpoint posts the JE in the same transaction as
   creating the invoice, so a DRAFT invoice with a posted JE would be
   inconsistent. P3-HIGH-009 fix.
6. **The Timesheet `@@unique([rentalId, year, month])` constraint**
   enforces "one timesheet per rental per month" at the DB level. The
   timesheets route also double-checks this in JS before relying on the
   DB constraint (P3-MED-003 fix).
7. **Rental payments are stored as `ClientPayment` rows with
   `paymentType='RENTAL'`** — the rental-payments route is a thin wrapper
   around the client-payments pipeline. The JE function
   (`createClientPaymentJournalEntry`) is identical. This means rental
   collections and project collections share the same AR-aging and
   client-balance reports; the `paymentType` field distinguishes them
   for filtering.
8. **Idempotency is NOT enforced at the generate-invoice endpoint** —
   the route checks `timesheet.invoiced` and `timesheet.invoice` relation,
   but if a second concurrent request races past both checks, the
   `SalesInvoice.timesheetId @unique` constraint would catch the
   duplicate at the DB level. This is a defense-in-depth pattern.

## Verification Results (ALL GREEN)
- **E2E test**: 39/39 passed (0 failed)
- **Lint**: 0 errors
- **Cleanup**: 100% — 0 P3RNT-prefixed records remain in DB; all 3 JEs
  soft-deleted (status=CANCELLED, deletedAt=now); trial balance
  unchanged from baseline (122600.00 Dr = 122600.00 Cr was the
  pre-existing baseline; post-test the DB is back to that state with
  our 3 JEs soft-deleted and 0 active test rows)

## Key Numbers Verified End-to-End
- Equipment Purchase JE: Dr=FIXED_ASSET 50000 / Cr=CASH 50000
- Rental Invoice JE: Dr=CUSTOMER_AR 23000 / Cr=RENTAL_REVENUE 20000 +
  Cr=VAT_OUTPUT 3000 (hourlyRate 200 × 100 hours = 20000, VAT 15%)
- Rental Payment JE: Dr=CASH 23000 / Cr=CUSTOMER_AR 23000
- Trial balance total: Dr=122600.00 = Cr=122600.00 (balanced)
- Net cash impact: -27000 (collection 23000 − purchase 50000)
- All 3 cycle JEs balanced ✓
- All source↔JE linkages intact ✓
- verifyNumericalConsistency (I1-I7) ok=true ✓

## Output Files
1. `docs/WORKFLOW-RENTAL-CYCLE.md` — full workflow documentation
2. `scripts/e2e-rental-cycle.ts` — E2E test script (39 assertions)
3. `agent-ctx/P3-2-rental-cycle-documenter.md` — this file
4. Worklog entry appended to `/home/z/my-project/worklog.md`

## Next Steps for P3 (suggested)
- P3-3: Purchase Cycle (request → PO → goods receipt → supplier invoice →
  supplier payment).
- P3-4: Payroll Cycle (advance → deductions → salary payment).
- P3-5: Fixed Assets Cycle (purchase → depreciation).
- P3-6: VAT Cycle (return filing).
- P3-7: Closing Cycle (month → year → new year opening).
