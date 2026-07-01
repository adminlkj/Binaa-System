# دورة المشروع التنفيذي — Construction Project Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.1 (Task ID: P3-1)
>
> This document records the FULL construction-project business cycle as actually
> implemented in the Binaa-System ERP codebase, from project creation through
> closing. Each step lists the API endpoint, required input fields, the journal
> entry (if any) posted, status transitions, prerequisites, and the reports
> affected. A companion end-to-end test (`scripts/e2e-construction-cycle.ts`)
> exercises every step against the live database and verifies that all JEs are
> balanced and that the trial balance / project profitability reports tie out.

---

## نظرة عامة — Overview

The construction project cycle in Binaa-System is the chain:

```
┌─────────────┐   ┌────────────┐   ┌─────────┐   ┌──────────────────────────┐
│  1. Project │ → │ 2. Contract│ → │ 3. BOQ  │ → │ 4. Cost Incurrence       │
│  (master)   │   │  (master)  │   │(planning)│   │  4a Expense              │
│  No JE      │   │  No JE     │   │  No JE   │   │  4b Labor Cost           │
│             │   │            │   │          │   │  4c Subcontractor Invoice│
└─────────────┘   └────────────┘   └─────────┘   │  → JE per cost type      │
                                                  └────────────┬─────────────┘
                                                               ↓
       ┌────────────────────────┐   ┌──────────────────────┐   ┌────────────────┐
       │ 8. IFRS 15 Revenue     │ ← │ 7. Client Payment    │ ← │ 6. Sales       │
       │    Recognition (POC)   │   │    (Collection)      │   │    Invoice     │
       │    JE: Dr CONTRACT_ASSET   │    JE: Dr CASH       │   │    (from claim)│
       │    Cr UNBILLED_REVENUE │   │    Cr CUSTOMER_AR    │   │    JE on SENT  │
       └────────────────────────┘   └──────────────────────┘   └───────┬────────┘
                                                                       ↑
                                              ┌────────────────────────┘
                                              │
                                       ┌──────────────┐
                                       │ 5. Progress  │
                                       │    Claim     │
                                       │    (مستخلص)  │
                                       │    No JE     │
                                       │ DRAFT→APPROVE│
                                       └──────────────┘
```

**Key design principle** — a progress claim (`مستخلص`) is a *certification of
work done*, NOT a revenue event. Revenue is recognized in ONE of two places:

1. **Bill-and-hold / invoicing path** — when an APPROVED claim is converted to
   a sales invoice (Step 6) and the invoice transitions `DRAFT → SENT`.
2. **POC / IFRS-15 path** — when the accounting team runs IFRS-15 revenue
   recognition (Step 8) against actual costs to date.

Mixing both would double-count revenue; the system does not call
`createProgressClaimJournalEntry` from any API (it is dead code — kept only for
backward compatibility).

---

## الخطوة 1: إنشاء المشروع — Project Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/projects` |
| **Route file** | `src/app/api/projects/route.ts` (lines 65-126) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Branch` and a `Client` must exist (FK constraints) |
| **Required input fields** | `code` (unique), `name`, `clientId`, `branchId`, `startDate` |
| **Optional fields** | `nameAr`, `location`, `endDate`, `status` (default `PLANNING`), `description`, `contractValue` (default 0), `projectType` (default `CONSTRUCTION`) |
| **Journal entry posted** | **No** — master record, not a financial event |
| **Initial status** | `PLANNING` (default) |
| **Validation** | `code` uniqueness; if `endDate` provided must be ≥ `startDate` |
| **Affected reports** | Project list, project card, project profitability (after costs/invoices exist) |

**Status transitions** (via `PATCH /api/projects/[id]`): `PLANNING → ACTIVE → ON_HOLD → COMPLETED` (or `CANCELLED`). No JE on any transition.

---

## الخطوة 2: إنشاء العقد — Contract Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/contracts` |
| **Route file** | `src/app/api/contracts/route.ts` (lines 37-146) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Project` must exist (FK) |
| **Required input fields** | `projectId`, `date`, `value`, `startDate` |
| **Optional fields** | `contractNo` (auto-generated `CTR-####` if absent), `clientId`, `vatRate` (default 0.15), `endDate`, `status` (default `DRAFT`), `description`, `contractType` (default `PROJECT`), `equipmentId`, `hourlyRate`, `deliveryFees`, `paymentTerms`, `salesOrderNo`, `quotationNo`, `loaNo`, `purchaseOrderNo`, `projectDuration`, `warrantyPeriod`, `maintenancePeriod`, `billingMethod`, `firstClaimNo`, `advancePaymentPercent`, `retentionPercent`, `projectManager`, `projectEngineer`, `projectLocation`, `projectCity`, `projectType` |
| **Journal entry posted** | **No** — contract is a commitment, not a GL event |
| **Initial status** | `DRAFT` (default) |
| **Validation** | `contractNo` uniqueness; VAT computed `vatAmount = value × vatRate`, `totalValue = value + vatAmount` |
| **Affected reports** | Contract list, project card (total contract value), progress-claim cumulative-value check |

**Status transitions**: `DRAFT → UNDER_REVIEW → ACTIVE → EXPIRED / TERMINATED / CANCELLED`. No JE on any transition.

---

## الخطوة 3: جدول الكميات — Bill of Quantities (BOQ)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/boq` |
| **Route file** | `src/app/api/boq/route.ts` (lines 30-75) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Project` must exist |
| **Required input fields** | `projectId`, `code`, `description`, `unit`, `quantity` (≥0), `unitPrice` (≥0) |
| **Optional fields** | `category` |
| **Computed** | `totalPrice = round(quantity × unitPrice, 2)` |
| **Journal entry posted** | **No** — planning data only |
| **Status** | None (BOQ items are stateless planning rows) |
| **Affected reports** | BOQ report, project cost estimation, IFRS-15 POC fallback (when `Project.estimatedTotalCost` is missing, BOQ sum is used) |

**Business-flow gate**: `canCreateExtract(projectId)` requires at least one BOQ
item to exist before a progress claim can be created.

---

## الخطوة 4: تكبد التكاليف — Cost Incurrence

Three operational source documents, each posts a JE immediately on creation.
All three resolve the project's `costCenterId` and tag the Dr line(s) so that
project profitability and IFRS-15 POC calculations work.

### 4a. المصروف العام — Expense

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/expenses` |
| **Route file** | `src/app/api/expenses/route.ts` (lines 191-279) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | Optional `Project` (required if `expenseType='PROJECT'`), optional `CostCenter`, optional `Equipment` |
| **Required input fields** | `amount` (>0), `date`, `description`, `category` |
| **Optional fields** | `projectId`, `equipmentId`, `costCenterId`, `expenseType` (`PROJECT` or `INTERNAL`; auto-inferred from `projectId`), `activityType` (default `GENERAL`), `vatRate` (default 0.15), `vatAmount`, `reference`, `payFrom` (`TREASURY` or `BANK`, default `TREASURY`), `attachmentPath`, `accountId`+`payingAccountId` (explicit-account override) |
| **JE function called** | `createExpenseJournalEntry(expenseId, tx)` (legacy path) OR `buildExpenseJournalEntryWithExplicitAccounts(...)` (when both `accountId` and `payingAccountId` provided) |
| **sourceType** | `EXPENSE` |

**Journal entry lines** (legacy path, role-resolved):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Cost | `PROJECT_COST` (if projectId) or `ADMIN_EXPENSE` | 7110 or 5110 | `expense.amount` | — |
| Dr VAT Input (if vatAmount>0) | `VAT_INPUT` | 3120 | `expense.vatAmount` | — |
| Cr Cash/Bank | `CASH` (if payFrom=TREASURY) or `BANK` (if payFrom=BANK) | 1110 / 1120 | — | `expense.totalAmount` |

All lines tagged with `expense.costCenterId` if set.

**Status** — `Expense` has no status field; the row + JE are immutable except via
the PUT handler (which creates a reversal + new entry if amounts change).

### 4b. تكلفة العمالة — Labor Cost

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/labor-costs` |
| **Route file** | `src/app/api/labor-costs/route.ts` (lines 31-114) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Project` must exist (the route resolves `project.costCenterId`) |
| **Required input fields** | `projectId`, `description`, `workers` (int), `days` (decimal), `dailyRate` (decimal), `date` |
| **Optional fields** | `employeeId`, `paymentSource` (`BANK` or `CASH`), `paymentAccountCode` (explicit account) |
| **Computed** | `totalAmount = workers × days × dailyRate` |
| **JE function called** | `autoEntryLaborCost({ description, amount, date, costCenterId, paymentSource, paymentAccountCode }, tx)` from `src/lib/accounting/engine.ts:1507` |
| **sourceType** | `LABOR_COST` |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Labor Cost | `LABOR_COST` | 7120 | `totalAmount` (with `costCenterId`) | — |
| Cr Cash/Bank | `CASH` (default) or `BANK` (if `paymentSource='BANK'`) or explicit `paymentAccountCode` | 1110 / 1120 | — | `totalAmount` |

### 4c. فاتورة مقاول الباطن — Subcontractor Invoice

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/subcontractor-invoices` |
| **Route file** | `src/app/api/subcontractor-invoices/route.ts` (lines 55-157) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Subcontractor` must exist; optional `Project` (resolves `costCenterId`) |
| **Required input fields** | `subcontractorId`, `invoiceNo` (unique), `date`, `amount` (>0) |
| **Optional fields** | `projectId`, `vatRate` (default 0.15), `vatAmount`, `totalAmount`, `description` |
| **JE function called** | `autoEntrySubcontractorInvoice({ invoiceNo, subcontractorName, amount, vatRate, vatAmount, totalAmount, date, costCenterId }, tx)` from `src/lib/accounting/engine.ts:698` |
| **sourceType** | `SUBCONTRACTOR_INVOICE` |
| **Initial status** | `SENT` (set by route — represents an approved/posted invoice awaiting payment) |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Subcontractor Cost | `SUBCONTRACTOR_COST` | 7130 | `amount` (with `costCenterId`) | — |
| Dr VAT Input (if vatAmount>0) | `VAT_INPUT` | 3120 | `vatAmount` | — |
| Cr Subcontractor AP | `SUBCONTRACTOR_AP` | 3220 | — | `totalAmount` |

**Status transitions** (`InvoiceStatus` enum, via PATCH/PUT — see API): `SENT → PARTIALLY_PAID → PAID` as supplier payments are recorded.

---

## الخطوة 5: المستخلص — Progress Claim

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/progress-claims` |
| **API endpoint (status transition)** | `PUT /api/progress-claims/[id]` with body `{ status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' }` |
| **Route files** | `src/app/api/progress-claims/route.ts` (lines 65-155), `src/app/api/progress-claims/[id]/route.ts` (lines 46-131) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Project` AND a `Contract` (FK); business-flow gate `canCreateExtract(projectId)` requires project + client + contract + at least one BOQ item |
| **Required input fields** | `projectId`, `contractId`, `claimNo` (unique), `date`, `percentage`, `amount` |
| **Optional fields** | `vatRate` (default 0.15), `status` (default `DRAFT`), `approvedDate`, `notes` |
| **Validation** | `claimNo` uniqueness; cumulative claims ≤ `contract.value + Σ approved change orders` (BUG-P2-06 fix) |
| **JE function called** | **None** — `createProgressClaimJournalEntry` exists in `src/lib/auto-journal.ts:386` but is **DEAD CODE** (no API caller). Revenue is recognized at invoicing (Step 6) or via IFRS-15 (Step 8), NOT at claim approval. |
| **Initial status** | `DRAFT` |

**Status transitions** (validated by the route):

```
DRAFT      ──SUBMITTED──→  SUBMITTED
DRAFT      ──REJECTED───→  REJECTED
SUBMITTED  ──APPROVED───→  APPROVED
SUBMITTED  ──REJECTED───→  REJECTED
SUBMITTED  ──DRAFT──────→  DRAFT       (revert)
APPROVED   ──REJECTED───→  REJECTED
REJECTED   ──DRAFT──────→  DRAFT       (re-edit)
```

When transitioning to `APPROVED`, the route sets `approvedDate = new Date()`.
**No JE is posted on any transition.** The `invoiced` flag is set to `true` by
the sales-invoice creation flow (Step 6).

**Affected reports**: progress-claims list, claim detail print, uninvoiced-claims
report (`GET /api/progress-claims?uninvoiced=true`), project card.

---

## الخطوة 6: فاتورة المبيعات من المستخلص — Sales Invoice from Progress Claim

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/sales-invoices` with `sourceType: 'EXTRACT'` |
| **API endpoint (status → SENT)** | `PATCH /api/sales-invoices/[id]` with body `{ status: 'SENT' }` |
| **Route files** | `src/app/api/sales-invoices/route.ts` (lines 149-310), `src/app/api/sales-invoices/[id]/route.ts` (lines 62-271) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `ProgressClaim` with `status='APPROVED'` and `invoiced=false`. Business-flow gate `canCreateInvoice('EXTRACT', claimId)` enforces this. |
| **Required input fields** | `sourceType: 'EXTRACT'`, `progressClaimId`, `date`, `dueDate` |
| **Auto-populated from claim** | `clientId` (from `claim.project.clientId`), `projectId`, `contractId`, `subtotal=claim.amount`, `vatAmount=claim.vatAmount`, `totalAmount=claim.totalAmount`, `vatRate=claim.vatRate`, `contractNo`, `invoiceType='PROGRESS_CLAIM'` |
| **Auto-generated** | `invoiceNo` as `PCL-YYYY-NNNN` (sequential per year) |
| **JE function called** | `createSalesInvoiceJournalEntry(invoiceId, tx)` from `src/lib/auto-journal.ts:26` — called by the PATCH DRAFT→SENT transition (P6-CRIT-002 fix), **NOT** at creation. |
| **sourceType on JE** | `SALES_INVOICE` |
| **Initial status** | `DRAFT` (no JE; `journalEntryId = null`) |

**Journal entry lines** (posted on DRAFT → SENT transition):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Customer AR | `CUSTOMER_AR` | 1210 | `invoice.totalAmount` | — |
| Cr Project Revenue | `PROJECT_REVENUE` (or `RENTAL_REVENUE` for invoiceType=RENTAL) | 6110 (or 6210) | — | `invoice.netAmount` |
| Cr Output VAT | `VAT_OUTPUT` | 3110 | — | `invoice.vatAmount` |

All lines tagged with `invoice.project.costCenter.id` if set (P6-HIGH-001 fix).
If the invoice has taxable delivery fees, additional credit lines for
`revenueAccount` and `outputVatAccount` are added (P3-BUG fix).

**Status transitions** (enforced by PATCH `[id]`):

```
DRAFT        ──(JE created)──→  SENT
SENT         ──(paidAmount>0)──→  PARTIALLY_PAID
PARTIALLY_PAID ──(paidAmount≥total)──→  PAID
SENT / PARTIALLY_PAID / PAID  ──(JE reversed)──→  CANCELLED
CANCELLED    ──(JE re-created if SENT)──→  SENT/DRAFT   (un-cancel)
```

**Safety guards** (P6-CRIT-007 fix):
- `PAID → DRAFT` / `PAID → CANCELLED` forbidden (must reverse payments first).
- `PARTIALLY_PAID → DRAFT` / `PARTIALLY_PAID → CANCELLED` forbidden.
- DELETE forbidden if any payments exist.
- Status updates via PUT forbidden (must use PATCH for proper JE handling).

When the invoice is created from an APPROVED claim, the claim's `invoiced` flag
is set to `true` (preventing duplicate invoices for the same claim).

**Affected reports**: sales-invoice list, invoice detail, ZATCA QR code, AR aging,
project profitability (revenue side), VAT return (output VAT).

---

## الخطوة 7: تحصيل العميل — Client Payment (Collection)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/client-payments` |
| **Route file** | `src/app/api/client-payments/route.ts` (lines 71-201) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Client` must exist (not soft-deleted). If `invoiceId` provided, the linked `SalesInvoice` must NOT be in `DRAFT`, `PAID`, or `CANCELLED` status, and `amount ≤ (invoice.totalAmount − invoice.paidAmount + 0.01)` (overpayment check, P6-CRIT-005 fix). |
| **Required input fields** | `clientId`, `amount` (>0), `date` |
| **Optional fields** | `invoiceId`, `receivedIn` (`TREASURY` or `BANK`, default `TREASURY`), `receivingAccountId`, `receivingAccountCode`, `receivingAccountName`, `reference`, `notes` |
| **JE function called** | `createClientPaymentJournalEntry(paymentId, tx)` from `src/lib/auto-journal.ts:206` |
| **sourceType on JE** | `CLIENT_PAYMENT` |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Cash/Bank | explicit `receivingAccountId`, else `CASH` (role default) | 1110 (or 1120) | `payment.amount` | — |
| Cr Customer AR | `CUSTOMER_AR` | 1210 | — | `payment.amount` |

Both lines tagged with `payment.invoice.project.costCenter.id` if set
(P6-HIGH-002 fix).

**Side effects on linked invoice**:
- `invoice.paidAmount += payment.amount`
- Status transition: if `paidAmount ≥ totalAmount` → `PAID`; else if `paidAmount > 0` → `PARTIALLY_PAID`.

**Affected reports**: client payments list, AR aging, project cash-flow, project
profitability (collection side).

---

## الخطوة 8: اعتراف إيراد IFRS 15 — IFRS 15 Revenue Recognition (POC)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/ifrs15/recognize` |
| **Route file** | `src/app/api/ifrs15/recognize/route.ts` (lines 18-79) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Project` must exist with `contractValue > 0` and a non-zero `estimatedTotalCost` (or a Contract value, or BOQ total — used as fallback). Actual costs must have been posted via JEs tagged to the project's cost center. |
| **Required input fields** | `projectId` |
| **Optional fields** | `date` (default `now()`) |
| **JE function called** | `autoEntryIFRS15Revenue(projectId, asOfDate)` from `src/lib/accounting/ifrs15.ts:182` |
| **sourceType on JE** | `IFRS15_REVENUE` |
| **sourceId on JE** | `projectId` (so cumulative revenue can be queried for re-runs) |

**Algorithm** (Cost-to-Cost, `src/lib/accounting/ifrs15.ts`):

```
totalActualCost       = Σ JournalLine.debit on EXPENSE accounts tagged to
                        project.costCenterId, where JE.status='POSTED' and
                        deletedAt IS NULL (SSOT: getProjectCostBreakdown)
totalEstimatedCost    = project.estimatedTotalCost
                      || project.contracts[0].value
                      || Σ BOQItem.totalPrice
                      || contractValue × 0.8   (last-resort fallback)
percentComplete (POC) = clamp(totalActualCost / totalEstimatedCost, 0, 1)
revenueToDate         = POC × project.contractValue
previouslyRecognized  = Σ JournalLine.credit on UNBILLED_REVENUE where
                        JE.sourceType='IFRS15_REVENUE' AND sourceId=projectId
periodRevenue         = max(0, revenueToDate − previouslyRecognized)
```

If `periodRevenue ≤ 0` (no new revenue to recognize), no JE is posted and the
API returns `{ journalEntryId: null, periodRevenue: 0 }`. This makes the
endpoint **idempotent**: re-running it produces zero additional revenue.

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Contract Asset | `CONTRACT_ASSET` | 1610 | `periodRevenue` | — |
| Cr Unbilled Revenue | `UNBILLED_REVENUE` | 6130 | — | `periodRevenue` |

**Affected reports**: IFRS-15 POC report, project profitability (revenue side
if used), balance sheet (contract asset / unbilled revenue lines), income
statement (unbilled revenue line in revenues).

> **NOTE**: Steps 6 (sales invoice) and 8 (IFRS-15) both credit a revenue
> account. In a pure IFRS-15 setup the sales invoice's revenue line is offset
> by debiting UNBILLED_REVENUE (instead of crediting PROJECT_REVENUE) so the
> two paths don't double-count. Binaa-System currently credits PROJECT_REVENUE
> in the sales-invoice JE — the accountant is expected to choose EITHER the
> invoicing path OR the IFRS-15 POC path per project, not both. This is
> flagged as a documentation note for future alignment.

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running all 8 steps for a single project, the following must hold:

### 1. ميزان المراجعة متوازن — Trial Balance Ties

```ts
import { getTrialBalance } from '@/lib/accounting/queries'
const tb = await getTrialBalance()
// tb.totals.totalDebit === tb.totals.totalCredit (within 0.01)
// tb.totals.isBalanced === true
```

### 2. كل القيود المرحَّلة متوازنة — All Posted JEs Balanced

Every JE created during the cycle must satisfy `Σ debit = Σ credit` per entry.
This is enforced by guard rule R2 at post time and verified by
`accountingHealthCheck().checks[0]`.

### 3. أرصدة حسابات المشروع صحيحة — Project Account Balances

For a project `P` with cost center `CC`:

| Account role | Expected balance (after cycle) |
|---|---|
| `PROJECT_COST` (Dr) | = expense.amount (PROJECT expenses only) |
| `LABOR_COST` (Dr) | = Σ laborCost.totalAmount |
| `SUBCONTRACTOR_COST` (Dr) | = Σ subcontractorInvoice.amount |
| `VAT_INPUT` (Dr) | = Σ expense.vatAmount + Σ subInvoice.vatAmount |
| `CASH` (Cr) | = Σ expense.totalAmount + Σ laborCost.totalAmount |
| `SUBCONTRACTOR_AP` (Cr) | = Σ subInvoice.totalAmount |
| `CUSTOMER_AR` (Dr) | = invoice.totalAmount − payment.amount |
| `PROJECT_REVENUE` (Cr) | = invoice.netAmount (+ IFRS-15 if also run) |
| `VAT_OUTPUT` (Cr) | = invoice.vatAmount |
| `CONTRACT_ASSET` (Dr) | = IFRS-15 periodRevenue (if run) |
| `UNBILLED_REVENUE` (Cr) | = IFRS-15 periodRevenue (if run) |

Use `getProjectCostBreakdown(projectId)` and `getProjectBalances([projectId])`
from `src/lib/accounting/queries.ts` to verify.

### 4. تقارير المشاريع تعكس التكاليف الفعلية — Project Reports Tie to GL

`getProjectBalances([projectId])` returns `{ revenue, costs, costCenterId }`
computed exclusively from posted `JournalLine` rows tagged to the project's
cost center (SSOT). These figures MUST match the sum of operational source
documents (expense + laborCost + subInvoice for costs; salesInvoice.netAmount
for revenue; IFRS-15 periodRevenue if run).

### 5. IFRS 15 Revenue Recognized Correctly — POC Algorithm Consistency

`calculatePOC(projectId)` returns:

```
POC               = totalActualCost / totalEstimatedCost   (clamped 0..1)
revenueToDate     = POC × contractValue
periodRevenue     = revenueToDate − previouslyRecognizedRevenue
```

The `previouslyRecognizedRevenue` is read from `JournalLine.credit` where
`sourceType='IFRS15_REVENUE'` and `sourceId=projectId`. Re-running
`POST /api/ifrs15/recognize` must produce `periodRevenue = 0` (idempotency).

### 6. روابط المصدر ↔ القيد سليمة — Source ↔ JE Linkage Integrity

Every operational source document that posts a JE must have a non-null
`journalEntryId` foreign key:

| Model | Field | Set by |
|---|---|---|
| `Expense` | `journalEntryId` | `createExpenseJournalEntry` / `buildExpenseJournalEntryWithExplicitAccounts` |
| `LaborCost` | `journalEntryId` | `autoEntryLaborCost` (via `tx.laborCost.update`) |
| `SubcontractorInvoice` | `journalEntryId` | `autoEntrySubcontractorInvoice` (via `tx.subcontractorInvoice.update`) |
| `SalesInvoice` | `journalEntryId` | `createSalesInvoiceJournalEntry` (on DRAFT→SENT) |
| `ClientPayment` | `journalEntryId` | `createClientPaymentJournalEntry` |
| `ProgressClaim` | `journalEntryId` | **always NULL** by design (revenue goes through invoice or IFRS-15, not the claim) |

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source doc | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 4a | Expense | `EXPENSE` | PROJECT_COST/ADMIN_EXPENSE + VAT_INPUT | CASH/BANK | VAT line only if vatAmount>0 |
| 4b | LaborCost | `LABOR_COST` | LABOR_COST | CASH/BANK | costCenterId from Project |
| 4c | SubcontractorInvoice | `SUBCONTRACTOR_INVOICE` | SUBCONTRACTOR_COST + VAT_INPUT | SUBCONTRACTOR_AP | status starts at SENT |
| 5 | ProgressClaim | — | — | — | NO JE — claim is a certification, not revenue |
| 6 | SalesInvoice (DRAFT→SENT) | `SALES_INVOICE` | CUSTOMER_AR | PROJECT_REVENUE + VAT_OUTPUT | posted on PATCH transition |
| 7 | ClientPayment | `CLIENT_PAYMENT` | CASH/BANK | CUSTOMER_AR | updates invoice.paidAmount + status |
| 8 | IFRS15 recognize | `IFRS15_REVENUE` | CONTRACT_ASSET | UNBILLED_REVENUE | idempotent — periodRevenue net of previously recognized |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| Project API | `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts` |
| Contract API | `src/app/api/contracts/route.ts`, `src/app/api/contracts/[id]/route.ts` |
| BOQ API | `src/app/api/boq/route.ts` |
| Expense API | `src/app/api/expenses/route.ts` |
| Labor cost API | `src/app/api/labor-costs/route.ts` |
| Subcontractor invoice API | `src/app/api/subcontractor-invoices/route.ts` |
| Progress claim API | `src/app/api/progress-claims/route.ts`, `src/app/api/progress-claims/[id]/route.ts` |
| Sales invoice API | `src/app/api/sales-invoices/route.ts`, `src/app/api/sales-invoices/[id]/route.ts` |
| Client payment API | `src/app/api/client-payments/route.ts` |
| IFRS-15 recognize API | `src/app/api/ifrs15/recognize/route.ts`, `src/app/api/ifrs15/preview/route.ts` |
| Auto-journal (sales/purchase/expense/payment) | `src/lib/auto-journal.ts` |
| Auto-journal (labor/subcontractor/IFRS15) | `src/lib/accounting/engine.ts`, `src/lib/accounting/ifrs15.ts` |
| Posting guard (R1-R12, entryNo) | `src/lib/accounting/guard.ts` |
| Accounting queries (SSOT) | `src/lib/accounting/queries.ts` |
| Business-flow gates | `src/lib/business-flow/engine.ts` (`canCreateExtract`, `canCreateInvoice`) |
| Account-role resolver | `src/lib/account-roles.ts` |
| Prisma schema | `prisma/schema.prisma` |
| E2E test | `scripts/e2e-construction-cycle.ts` |
