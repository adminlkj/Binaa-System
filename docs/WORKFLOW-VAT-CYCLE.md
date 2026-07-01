# دورة ضريبة القيمة المضافة — VAT Cycle Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.6 (Task ID: P3-6)
>
> This document records the FULL value-added-tax (VAT / ضريبة القيمة المضافة)
> business cycle as actually implemented in the Binaa-System ERP codebase, from
> the posting of output / input VAT via operational source documents through
> quarterly filing, payment, and reversal. Each step lists the API endpoint,
> required input fields, the journal entry (if any) posted, status transitions,
> prerequisites, safety guards, and the reports affected. A companion
> end-to-end test (`scripts/e2e-vat-cycle.ts`) exercises every step against the
> live database and verifies that all JEs are balanced and that the trial
> balance ties.

---

## نظرة عامة — Overview

The VAT cycle in Binaa-System is the chain:

```
┌─────────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│  1. Output VAT (مخرجات)                         │   │  2. Input VAT (مدخلات)                        │
│     Dr CUSTOMER_AR / Cr REVENUE + Cr VAT_OUTPUT │   │  Dr PROJECT_COST/ADMIN_EXPENSE + Dr VAT_INPUT │
│     ─ sales invoice DRAFT→SENT                  │   │     / Cr SUPPLIER_AP                          │
│     ─ subcontractor invoice (Dr SUBCONTRACTOR_  │   │     ─ purchase invoice DRAFT→SENT             │
│        COST + Dr VAT_INPUT / Cr SUBCONTRACTOR_  │   │     ─ subcontractor invoice (same JE)         │
│        AP)  ← also input VAT                    │   │     ─ expense POST (Dr EXPENSE + Dr VAT_INPUT │
│     ─ expense with VAT (Cr VAT_OUTPUT? NO —     │   │        / Cr CASH)                             │
│        expenses book VAT_INPUT, not VAT_OUTPUT) │   │                                               │
└─────────────────────────┬───────────────────────┘   └─────────────────────────┬────────────────────┘
                          │                                                      │
                          └─────────────────────┬────────────────────────────────┘
                                                ↓
              ┌───────────────────────────────────────────────────────────────┐
              │ 3. VAT Calculation (calculateVatForQuarter)                   │
              │    PRIMARY (P1-1 fix): GL-derived                             │
              │       outputVat  = VAT_OUTPUT credits − debits in period      │
              │       inputVat   = VAT_INPUT  debits  − credits in period     │
              │       totalSales = REVENUE credits − debits in period         │
              │       totalPurchases = EXPENSE debits − credits in period     │
              │       netVat = outputVat − inputVat                           │
              │    Supplementary (ZATCA display only): per-invoice breakdown   │
              │       classifyVatCategory(0.15) → STANDARD                    │
              │       classifyVatCategory(0.00) → ZERO                        │
              │       classifyVatCategory(null/other) → EXEMPT                │
              │    Tolerance: 0.01 SAR (1 halala)                             │
              └─────────────────────────┬─────────────────────────────────────┘
                                        ↓
              ┌───────────────────────────────────────────────────────────────┐
              │ 4. VAT Return Creation (POST /api/vat)                       │
              │    Creates VATReturn with status=DRAFT                       │
              │    FREEZES the GL-derived totals (outputVat, inputVat,       │
              │    netVat, totalSales, totalPurchases) as canonical          │
              │    Stores per-invoice breakdown + IDs for ZATCA audit         │
              │    Stores glOutputVat, glInputVat, glMatch flag              │
              │    NO JE POSTED at this stage                                │
              └─────────────────────────┬─────────────────────────────────────┘
                                        ↓
              ┌───────────────────────────────────────────────────────────────┐
              │ 5. VAT Filing (PATCH /api/vat {action:'FILE'})               │
              │    Status: DRAFT → FILED                                     │
              │    POSTS declaration JE (autoEntryVATDeclaration):            │
              │       Dr VAT_OUTPUT  (closes the output-VAT liability)       │
              │       Cr VAT_INPUT   (closes the input-VAT asset)            │
              │       Cr VAT_DUE     (net payable if output > input)         │
              │       — OR —                                                │
              │       Dr VAT_REFUND_RECEIVABLE (if input > output → refund)  │
              │    sourceType='VAT_DECLARATION', sourceId=`VAT-{period}`     │
              │    JE dated to period-end (last day of the quarter)          │
              │    Sets VATReturn.journalEntryId                             │
              └─────────────────────────┬─────────────────────────────────────┘
                                        ↓
              ┌───────────────────────────────────────────────────────────────┐
              │ 6. VAT Payment (PATCH /api/vat {action:'PAY'})               │
              │    Status: FILED → PAID                                      │
              │    POSTS payment JE (autoEntryVATPayment):                    │
              │       Dr VAT_DUE     (clears the payable)                    │
              │       Cr BANK         (cash outflow)                         │
              │    sourceType='VAT_PAYMENT', sourceId=`VTP-{period}`          │
              │    JE dated paymentDate (default = today)                    │
              │    Sets VATReturn.paymentJournalEntryId                       │
              │    Skipped if netVat ≤ 0 (refund scenarios)                  │
              └─────────────────────────┬─────────────────────────────────────┘
                                        ↓
              ┌───────────────────────────────────────────────────────────────┐
              │ 7. VAT Reversal (PATCH /api/vat {action:'REVERSE'})          │
              │    Status: FILED/PAID → CANCELLED                            │
              │    REVERSES the declaration JE (reverseEntry)                │
              │    REVERSES the payment JE if it exists                       │
              │    Sets cancelledAt, cancelledReason                         │
              │    Original JEs stay POSTED (per guard design); reversal     │
              │       JEs carry isReversal=true, reversedEntryId=originalId  │
              │    Allows creating a new VATReturn for the same period       │
              │       (marked isAmendment=true, amendedFromId=cancelled.id)  │
              └───────────────────────────────────────────────────────────────┘
```

**Key design principle** — VAT is a **balance-sheet** tax, not an income-statement
item. The declaration JE **closes** the output-VAT liability and input-VAT
asset accounts by transferring the net position to `VAT_DUE` (a payable).
The payment JE then settles `VAT_DUE` against `BANK`. Neither JE touches
revenue or expense accounts — those were already hit when the operational
source documents (sales invoices, purchase invoices, expenses) were posted.

**SSOT (P1-1-FIX)** — `calculateVatForQuarter` is **GL-primary, operational
supplementary**:

| Field | Primary source | Supplementary (display only) |
|---|---|---|
| `outputVat` | `JournalLine` credits − debits on `VAT_OUTPUT` role accounts | per-invoice `salesInvoice.vatAmount` + `progressClaim.vatAmount` |
| `inputVat` | `JournalLine` debits − credits on `VAT_INPUT` role accounts | per-invoice `purchaseInvoice.vatAmount` + `subcontractorInvoice.vatAmount` + `expense.vatAmount` |
| `totalSales` | `JournalLine` credits − debits on `REVENUE` type accounts | per-invoice `salesInvoice.subtotal` |
| `totalPurchases` | `JournalLine` debits − credits on `EXPENSE` type accounts | per-invoice `purchaseInvoice.subtotal` |
| `netVat` | `outputVat − inputVat` (computed from the GL-derived totals above) | — |

The per-invoice breakdown is kept for ZATCA-line-item display and audit
traceability, but is **NOT** used to compute the return's financial totals.
Tolerance between operational and GL figures is **0.01 SAR (1 halala)**,
tightened from 0.5 SAR in the P1-1 fix.

**Account roles involved** (defined in `src/lib/account-roles.ts`):

| Role | Default codes | Type | Normal balance | Purpose |
|---|---|---|---|---|
| `VAT_OUTPUT` | 3110 | LIABILITY | Credit | Output VAT collected from customers (sales invoice lines `Cr VAT_OUTPUT`) |
| `VAT_INPUT` | 3120 | LIABILITY | Debit (asset-like) | Input VAT paid to suppliers (purchase / sub / expense lines `Dr VAT_INPUT`) |
| `VAT_DUE` | 3130 | LIABILITY | Credit | Net VAT payable to the tax authority after declaration |
| `VAT_REFUND_RECEIVABLE` | 1410 | ASSET | Debit | Net VAT refundable from the tax authority (when input > output) |

> **Naming note**: The task brief mentioned a `TAX_AUTHORITY_PAYABLE` role —
> this role **does not exist** in the codebase. The equivalent function is
> served by `VAT_DUE` (code 3130, "ضريبة القيمة المضافة المستحقة") for
> payables, and `VAT_REFUND_RECEIVABLE` (code 1410, "ضريبة مستحقة
> الاسترداد") for refunds. This documentation uses the actual role names
> throughout.

---

## الخطوة 1: ضريبة المخرجات — Output VAT (from operational sources)

Output VAT is **NOT** posted by a dedicated VAT endpoint. It is the
**aggregate of all `Cr VAT_OUTPUT` lines** posted by other operational
source documents during the period. The primary contributors are:

### 1a. Sales Invoice (DRAFT → SENT)

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/sales-invoices` |
| **API endpoint (status → SENT)** | `PATCH /api/sales-invoices/[id]` with body `{ status: 'SENT' }` |
| **Route files** | `src/app/api/sales-invoices/route.ts`, `src/app/api/sales-invoices/[id]/route.ts` |
| **JE function called** | `createSalesInvoiceJournalEntry(invoiceId, tx)` from `src/lib/auto-journal.ts:26` — called on the DRAFT→SENT transition |
| **sourceType on JE** | `SALES_INVOICE` |

**Journal entry lines** (posted on DRAFT → SENT):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Customer AR | `CUSTOMER_AR` | 1210 | `invoice.totalAmount` | — |
| Cr Project Revenue (or Rental/Service) | `PROJECT_REVENUE` (or `RENTAL_REVENUE`/`SERVICE_REVENUE`) | 6110 (or 6210/6340) | — | `invoice.netAmount` |
| Cr Output VAT | `VAT_OUTPUT` | 3110 | — | `invoice.vatAmount` |

> See `docs/WORKFLOW-CONSTRUCTION-CYCLE.md` Step 6 for full sales-invoice
> workflow details. The VAT-relevant piece is the `Cr VAT_OUTPUT` line.

### 1b. Other Output-VAT contributors

In the current codebase, **only sales invoices** post to `VAT_OUTPUT`. Progress
claims do **not** post a JE (by design — see construction-cycle doc Step 5).
Rental invoices go through the same `createSalesInvoiceJournalEntry` path
with `invoiceType=RENTAL` and post `Cr VAT_OUTPUT`. Service invoices similarly
post `Cr VAT_OUTPUT` with `invoiceType=SERVICE` or `TAX_INVOICE`.

---

## الخطوة 2: ضريبة المدخلات — Input VAT (from operational sources)

Input VAT is the **aggregate of all `Dr VAT_INPUT` lines** posted by other
operational source documents during the period. The primary contributors are:

### 2a. Purchase Invoice (DRAFT → SENT)

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/supplier-invoices` |
| **API endpoint (status → SENT)** | `PATCH /api/supplier-invoices/[id]` with body `{ status: 'SENT' }` (or PUT `approve`) |
| **Route files** | `src/app/api/supplier-invoices/route.ts`, `src/app/api/supplier-invoices/[id]/route.ts` |
| **JE function called** | `createPurchaseInvoiceJournalEntry(invoiceId, tx)` from `src/lib/auto-journal.ts:149` |
| **sourceType on JE** | `PURCHASE_INVOICE` |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Expense / Project Cost | role resolved from `expenseCategory` (default `PROJECT_COST` if projectId, else `ADMIN_EXPENSE`) | 7110 / 8120 / etc. | `invoice.subtotal` | — |
| Dr Input VAT | `VAT_INPUT` | 3120 | `invoice.vatAmount` | — |
| Cr Supplier AP | `SUPPLIER_AP` | 3210 | — | `invoice.totalAmount` |

### 2b. Subcontractor Invoice

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/subcontractor-invoices` |
| **Route file** | `src/app/api/subcontractor-invoices/route.ts` |
| **JE function called** | `autoEntrySubcontractorInvoice(...)` from `src/lib/accounting/engine.ts:698` |
| **sourceType on JE** | `SUBCONTRACTOR_INVOICE` |

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Subcontractor Cost | `SUBCONTRACTOR_COST` | 7130 | `invoice.amount` | — |
| Dr Input VAT | `VAT_INPUT` | 3120 | `invoice.vatAmount` | — |
| Cr Subcontractor AP | `SUBCONTRACTOR_AP` | 3220 | — | `invoice.totalAmount` |

### 2c. Expense (with VAT)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/expenses` |
| **Route file** | `src/app/api/expenses/route.ts` |
| **JE function called** | `createExpenseJournalEntry(expenseId, tx)` from `src/lib/auto-journal.ts:329` |
| **sourceType on JE** | `EXPENSE` |

**Journal entry lines** (when `vatAmount > 0`):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Expense | role resolved from `category` (e.g. `PROJECT_COST`, `ADMIN_EXPENSE`, `FUEL_EXPENSE`, etc.) | varies | `expense.amount` | — |
| Dr Input VAT | `VAT_INPUT` | 3120 | `expense.vatAmount` | — |
| Cr Cash / Bank | role resolved from `payFrom` (TREASURY → `CASH`, BANK → `BANK`, PETTY_CASH → `PETTY_CASH`) | 1110 / 1120 / 1130 | — | `expense.totalAmount` |

---

## الخطوة 3: احتساب ضريبة القيمة المضافة — VAT Calculation

| Field | Value |
|---|---|
| **Library file** | `src/lib/vat-calc.ts` |
| **Function** | `calculateVatForQuarter(year: number, quarter: number, tx?)` — lines 183-462 |
| **Called by** | `GET /api/vat?year=&quarter=` (preview), `POST /api/vat` (freeze), `GET /api/vat/[id]` (live comparison) |
| **Authz on API** | n/a (library function; API layer enforces ADMIN/ACCOUNTANT) |

### Period computation

```ts
const startDate = new Date(year, (quarter - 1) * 3, 1)          // e.g. Q3 2024 → 2024-07-01
const endDate   = new Date(year, quarter * 3, 0, 23, 59, 59, 999) // e.g. Q3 2024 → 2024-09-30 23:59:59.999
```

### GL-derived totals (PRIMARY, P1-1 fix)

The four canonical totals are computed from `JournalLine` on POSTED JEs
(`journalEntry.status='POSTED' AND journalEntry.deletedAt IS NULL`) where
`journalEntry.date BETWEEN startDate AND endDate`. The
`getVatGlBalance(role, startDate, endDate, tx)` helper
(`src/lib/vat-calc.ts:116-166`) explicitly **excludes** VAT_DECLARATION and
VAT_PAYMENT sourceTypes (and `JE-VAT-` / `JE-VTP-`-prefixed entry numbers, and
reversal JEs whose description contains "VAT") so that the comparison reads
the **operational VAT** lines, not the declaration-closing entries:

| Total | Source query | Formula |
|---|---|---|
| `outputVat` | `JournalLine` on `VAT_OUTPUT` role account | `Σ credit − Σ debit` (liability credit-normal) |
| `inputVat` | `JournalLine` on `VAT_INPUT` role account | `Σ debit − Σ credit` (asset debit-normal) |
| `totalSales` | `JournalLine` on all `REVENUE` type accounts | `Σ credit − Σ debit` |
| `totalPurchases` | `JournalLine` on all `EXPENSE` type accounts | `Σ debit − Σ credit` |
| `netVat` | — | `outputVat − inputVat` |

### Operational breakdown (SUPPLEMENTARY, ZATCA display only)

The function also fetches per-source-document details for ZATCA-compliant
line-item display:

- `salesInvoices` — `SalesInvoice` where `date ∈ [start, end]` and
  `status ∈ {SENT, PARTIALLY_PAID, PAID, OVERDUE}`
- `progressClaims` — `ProgressClaim` where `status ∈ {APPROVED, SUBMITTED, PARTIALLY_PAID, PAID}`
- `purchaseInvoices` — `PurchaseInvoice` where `status ∈ {SENT, PARTIALLY_PAID, PAID, OVERDUE}`
- `subcontractorInvoices` — `SubcontractorInvoice` where `status ∈ {SENT, PARTIALLY_PAID, PAID}`
- `expenses` — `Expense` where `vatAmount > 0` (only those that posted input VAT)

Each source line is classified into `STANDARD` (15%), `ZERO` (0%), or `EXEMPT`
via `classifyVatCategory(vatRate)`:

| Input | Output |
|---|---|
| `0.15` (within 0.001 tolerance) | `STANDARD` |
| `0` (exactly) | `ZERO` |
| Any other positive value | `STANDARD` |
| `null`, `undefined`, `NaN`, or negative | `EXEMPT` |

### GL cross-check

The function reports `glDiffOutput = operationalOutputVat − glOutputVat` and
`glDiffInput = operationalInputVat − glInputVat`. `glMatch` is true iff both
diffs are within `0.01 SAR`. **These diffs should converge to 0** when every
operational invoice has been posted to GL; a non-zero diff indicates a
missing or unposted source document.

### Return value

```ts
interface VatCalculationResult {
  totalSales: number          // GL-derived (REVENUE credit − debit)
  totalPurchases: number      // GL-derived (EXPENSE debit − credit)
  outputVat: number           // = glOutputVat (GL-derived)
  inputVat: number            // = glInputVat (GL-derived)
  netVat: number              // outputVat − inputVat
  categories: VatCategoryBreakdown
  sourceLines: VatSourceLine[]           // display only
  salesInvoices: VatSourceLine[]         // display only
  progressClaims: VatSourceLine[]        // display only
  purchaseInvoices: VatSourceLine[]      // display only
  subcontractorInvoices: VatSourceLine[] // display only
  expenses: VatSourceLine[]              // display only
  salesInvoiceIds: string[]              // for VATReturn.salesInvoiceIds
  purchaseInvoiceIds: string[]           // for VATReturn.purchaseInvoiceIds
  subcontractorInvoiceIds: string[]      // for VATReturn.subcontractorInvoiceIds
  expenseIds: string[]                   // for VATReturn.expenseIds
  progressClaimIds: string[]             // for VATReturn.progressClaimIds
  glOutputVat: number
  glInputVat: number
  glMatch: boolean
  glDiffOutput: number
  glDiffInput: number
}
```

---

## الخطوة 4: إنشاء الإقرار الضريبي — VAT Return Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/vat` |
| **Route file** | `src/app/api/vat/route.ts` (lines 100-207) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | No active (non-CANCELLED) VATReturn for the same period; VAT-relevant source documents already posted to GL within the quarter |
| **Required input fields** | `year` (integer), `quarter` (1-4) |
| **Optional fields** | none |
| **JE function called** | **None** — return creation is a freeze, not a financial event |
| **sourceType on JE** | n/a (no JE) |
| **Initial status** | `DRAFT` |

### Validation

1. `year` and `quarter` must be valid integers, with `1 ≤ quarter ≤ 4`.
2. The route computes `period = "${year}-Q${quarter}"` and rejects the
   request with HTTP 409 if a non-CANCELLED VATReturn already exists for
   that period (`existingActive` check at line 119-134).
3. If a CANCELLED VATReturn exists for the same period, the new return is
   marked `isAmendment=true` and `amendedFromId=cancelledForPeriod.id`
   (line 140-143, 182-183).

### Frozen fields (SSOT — P1-1-FIX / M6)

The return freezes the GL-derived totals as canonical — they will NOT change
when later source documents are posted to the same period:

| VATReturn field | Source |
|---|---|
| `totalSales` | `calc.totalSales` (REVENUE credits − debits) |
| `outputVat` | `calc.outputVat` (= `calc.glOutputVat`) |
| `totalPurchases` | `calc.totalPurchases` (EXPENSE debits − credits) |
| `inputVat` | `calc.inputVat` (= `calc.glInputVat`) |
| `netVat` | `calc.netVat` (= `outputVat − inputVat`) |
| `standardRatedSales` / `zeroRatedSales` / `exemptSales` | `calc.categories.*Sales` (operational breakdown, display) |
| `standardRatedPurchases` / `zeroRatedPurchases` / `exemptPurchases` / `importsSubjectToVAT` | `calc.categories.*Purchases` (operational breakdown, display) |
| `glOutputVat` / `glInputVat` / `glMatch` | `calc.gl*` (frozen snapshot of the cross-check) |
| `salesInvoiceIds` / `purchaseInvoiceIds` / `expenseIds` / `subcontractorInvoiceIds` / `progressClaimIds` | JSON-stringified arrays of source-document IDs covered by the return |
| `period`, `year`, `quarter` | from request |
| `status` | `DRAFT` |
| `isAmendment`, `amendedFromId` | from cancelled-previous lookup |

### Safety guards

- **Uniqueness**: one active return per period (enforced by JS check, not DB
  constraint — multiple CANCELLED returns per period are allowed for audit
  history).
- **No JE at creation**: freezing numbers is not a financial event.
- **Atomicity**: the entire `db.vATReturn.create` is one transaction.

---

## الخطوة 5: تقديم الإقرار — VAT Filing (DRAFT → FILED)

| Field | Value |
|---|---|
| **API endpoint** | `PATCH /api/vat` with body `{ id, action: 'FILE' }` |
| **Route file** | `src/app/api/vat/route.ts` (lines 209-269, FILE branch at 234-269) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | VATReturn exists with `status='DRAFT'` |
| **JE function called** | `autoEntryVATDeclaration({ period, outputVat, inputVat, netVat, date }, tx)` from `src/lib/accounting/engine.ts:1255-1297` |
| **sourceType on JE** | `VAT_DECLARATION` |
| **sourceId on JE** | `VAT-${period}` (e.g. `VAT-2024-Q3`) |
| **Status transition** | `DRAFT → FILED` |

### Period-end dating (CRITICAL)

The declaration JE is dated to **the last day of the quarter**
(`getPeriodEndDate(year, quarter)`, lines 21-26):

```ts
function getPeriodEndDate(year: number, quarter: number): Date {
  const endMonth = quarter * 3 // 3, 6, 9, 12
  return new Date(year, endMonth, 0, 23, 59, 59, 999) // last day of the previous month
}
// Q1 2024 → 2024-03-31 23:59:59.999
// Q2 2024 → 2024-06-30 23:59:59.999
// Q3 2024 → 2024-09-30 23:59:59.999
// Q4 2024 → 2024-12-31 23:59:59.999
```

This ensures the closing entry appears in the correct quarter when the
accountant runs `calculateVatForQuarter` for verification or audits the GL
for that period. Without this, a return filed in early January for Q4 of
the prior year would have its declaration JE land in Q1 of the new year —
breaking the period-match check.

### Declaration journal entry lines

`autoEntryVATDeclaration` (lines 1255-1297) resolves the four VAT-related
account codes by role:

```ts
const vatOutputCode  = await requireAccountCodeByRole(AccountRole.VAT_OUTPUT, ...)             // 3110
const vatInputCode   = await requireAccountCodeByRole(AccountRole.VAT_INPUT, ...)              // 3120
const vatDueCode     = await requireAccountCodeByRole(AccountRole.VAT_DUE, ...)                // 3130
const vatRefundCode  = await requireAccountCodeByRole(AccountRole.VAT_REFUND_RECEIVABLE, ...)  // 1410
```

It then builds lines based on the sign of `netVat`:

**Case 1 — netVat > 0 (payable: output exceeds input)**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Output VAT (close) | `VAT_OUTPUT` | 3110 | `outputVat` | — |
| Cr Input VAT (close) | `VAT_INPUT` | 3120 | — | `inputVat` |
| Cr VAT Due (net payable) | `VAT_DUE` | 3130 | — | `netVat` |

Total Dr = `outputVat`. Total Cr = `inputVat + netVat` = `inputVat + (outputVat − inputVat)` = `outputVat`. ✓ Balanced.

**Case 2 — netVat < 0 (refund: input exceeds output)**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Output VAT (close) | `VAT_OUTPUT` | 3110 | `outputVat` | — |
| Dr VAT Refund Receivable | `VAT_REFUND_RECEIVABLE` | 1410 | `|netVat|` | — |
| Cr Input VAT (close) | `VAT_INPUT` | 3120 | — | `inputVat` |

Total Dr = `outputVat + |netVat|` = `outputVat + (inputVat − outputVat)` = `inputVat`. Total Cr = `inputVat`. ✓ Balanced.

**Case 3 — netVat = 0 (exactly offsetting)**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Output VAT (close) | `VAT_OUTPUT` | 3110 | `outputVat` | — |
| Cr Input VAT (close) | `VAT_INPUT` | 3120 | — | `inputVat` |

Total Dr = `outputVat` = `inputVat` = Total Cr. ✓ Balanced.

### Side effects on VATReturn

```ts
{
  status: 'FILED',
  filedDate: new Date(),
  journalEntryId: je.id,  // links the return to its declaration JE
}
```

### Safety guards

- **State guard**: rejects with HTTP 400 if `status !== 'DRAFT'`.
- **Atomicity**: the JE creation + return update are wrapped in a single
  `db.$transaction` — if the JE post fails (e.g. role not mapped, R1-R12
  guard rejects), the entire filing is rolled back. The return stays in
  DRAFT status.
- **Idempotency**: a second FILE on the same return is blocked by the
  state guard above.

### Affected reports

- VAT return list (`GET /api/vat`)
- VAT return detail (`GET /api/vat/[id]`) — `liveCalc` is recomputed and
  compared with the frozen totals (`hasChangedSinceFiling` is `true` if
  the live GL totals differ from the frozen ones by more than 0.01 SAR)
- Trial balance — `VAT_OUTPUT` and `VAT_INPUT` balances go to zero (closed
  by the declaration); `VAT_DUE` increases by `netVat`
- VAT reconciliation (`getVATReconciliation` in `src/lib/accounting/queries.ts`)

---

## الخطوة 6: سداد الضريبة — VAT Payment (FILED → PAID)

| Field | Value |
|---|---|
| **API endpoint** | `PATCH /api/vat` with body `{ id, action: 'PAY', paymentReference, paymentDate? }` |
| **Route file** | `src/app/api/vat/route.ts` (lines 271-314, PAY branch) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | VATReturn exists with `status='FILED'`; `paymentReference` is required |
| **JE function called** | `autoEntryVATPayment({ period, amount, date, reference }, tx)` from `src/lib/accounting/engine.ts:1304-1325` |
| **sourceType on JE** | `VAT_PAYMENT` |
| **sourceId on JE** | `VTP-${period}` (e.g. `VTP-2024-Q3`) |
| **Status transition** | `FILED → PAID` |

### Payment journal entry lines

`autoEntryVATPayment` resolves:

```ts
const vatDueCode = await requireAccountCodeByRole(AccountRole.VAT_DUE, ...)  // 3130
const bankCode   = await resolvePaymentAccountCode('BANK', tx)               // 1120 (or role override)
```

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr VAT Due (clear payable) | `VAT_DUE` | 3130 | `amount` (= `existing.netVat`) | — |
| Cr Bank | `BANK` | 1120 | — | `amount` |

Total Dr = `amount` = Total Cr. ✓ Balanced.

### Side effects on VATReturn

```ts
{
  status: 'PAID',
  paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
  paymentReference,
  paymentJournalEntryId: je.id,
}
```

### Safety guards

- **State guard**: rejects with HTTP 400 if `status !== 'FILED'` (cannot
  pay an unfiled return, and cannot re-pay a PAID return).
- **Required field**: rejects with HTTP 400 if `paymentReference` is missing.
- **Zero-amount skip**: if `netVat ≤ 0` (refund or zero scenario), the
  payment JE is **NOT posted** and `paymentJournalEntryId` stays `null`.
  The status still transitions to PAID. This is intentional — refunds are
  handled outside this flow (the tax authority issues a refund to the
  company's bank account, which would be a separate manual JE).
- **Atomicity**: JE creation + return update in a single transaction.

### Affected reports

- VAT return list / detail — shows `PAID` status, `paymentDate`, `paymentReference`
- Trial balance — `VAT_DUE` returns to zero (cleared by the payment); `BANK` decreases by `netVat`
- Cash flow statement — the payment appears as a financing/operating outflow

---

## الخطوة 7: إلغاء الإقرار — VAT Reversal (FILED/PAID → CANCELLED)

| Field | Value |
|---|---|
| **API endpoint** | `PATCH /api/vat` with body `{ id, action: 'REVERSE', reason? }` |
| **Route file** | `src/app/api/vat/route.ts` (lines 316-354, REVERSE branch) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | VATReturn exists with `status ∈ {FILED, PAID}` |
| **JE function called** | `reverseEntry(journalEntryId, tx)` from `src/lib/accounting/engine.ts:276-279` (proxies to `guardedReverse` in `src/lib/accounting/guard.ts:340-416`) |
| **Status transition** | `FILED` or `PAID → CANCELLED` |

### Reversal behaviour

The route reverses **both** the declaration JE and the payment JE (if it
exists):

```ts
if (existing.journalEntryId) {
  await reverseEntry(existing.journalEntryId, tx)          // reverse the declaration
}
if (existing.paymentJournalEntryId) {
  await reverseEntry(existing.paymentJournalEntryId, tx)   // reverse the payment (if any)
}
```

`reverseEntry` (via `guardedReverse`) creates a **mirror JE** with flipped
debit/credit on every line. The original JE **stays POSTED** (per the guard
design comment at `guard.ts:413`: *"Both entries remain POSTED and net out
to zero in the trial balance"*). The reversal JE carries:

- `entryNo`: a new sequential `JE-NNNNNN` from `getNextEntryNo`
- `date`: `new Date()` (today — reversals land in the current period, with
  `skipPeriodGuard=true` to bypass the closed-period check)
- `description`: `عكس ${original.entryNo} - ${reason || 'إلغاء لإعادة الإنشاء'}`
- `sourceType`: the **original sourceType** (`VAT_DECLARATION` or `VAT_PAYMENT`)
  — preserved so the reversal can be matched to its origin
- `sourceId`: the **original sourceId** (e.g. `VAT-2024-Q3`)
- `isReversal`: `true`
- `reversedEntryId`: `original.id` — links the reversal to its source

The guard enforces **idempotency** (R-rule): a second `reverseEntry` on the
same original throws `ALREADY_REVERSED` (`guard.ts:372-381`).

### Declaration-reversal JE lines (case 1: netVat > 0, payable)

Original declaration was `Dr VAT_OUTPUT / Cr VAT_INPUT / Cr VAT_DUE`.
Reversal flips to:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Cr Output VAT (re-open) | `VAT_OUTPUT` | 3110 | — | `outputVat` |
| Dr Input VAT (re-open) | `VAT_INPUT` | 3120 | `inputVat` | — |
| Dr VAT Due (re-open payable) | `VAT_DUE` | 3130 | `netVat` | — |

### Payment-reversal JE lines

Original payment was `Dr VAT_DUE / Cr BANK`. Reversal flips to:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Cr VAT Due (re-open payable) | `VAT_DUE` | 3130 | — | `amount` |
| Dr Bank (cash back) | `BANK` | 1120 | `amount` | — |

### Side effects on VATReturn

```ts
{
  status: 'CANCELLED',
  cancelledAt: new Date(),
  cancelledReason: reason || 'إلغاء لإعادة الإنشاء',
  // journalEntryId and paymentJournalEntryId are NOT cleared — they still
  // point to the original JEs (which are still POSTED). The reversal JEs
  // are linked to them via reversedEntryId, not stored on the VATReturn.
}
```

### Safety guards

- **State guard**: rejects with HTTP 400 if `status ∉ {FILED, PAID}`.
- **Atomicity**: all reversals + return update in a single transaction.
- **Idempotency**: the guard throws `ALREADY_REVERSED` if the same JE is
  reversed twice. The route catches this implicitly via the transaction
  rollback.
- **Allow re-creation**: after CANCELLED, a new VATReturn can be created
  for the same period (POST /api/vat's `existingActive` check skips
  CANCELLED returns). The new return is marked `isAmendment=true` with
  `amendedFromId` pointing to the cancelled one.

### Affected reports

- VAT return list — CANCELLED returns are included in
  `allDeclarationsForPeriod` for audit history, but excluded from
  `declaration` (the active one).
- Trial balance — the reversal JEs net the originals to zero, so the net
  effect on every account is zero (no residual balance from the cancelled
  return).
- VAT reconciliation — restored to pre-declaration state.

---

## حالات الإقرار — VAT Return Lifecycle States

```
                        POST /api/vat
                              │
                              ↓
                        ┌───────────┐
                        │   DRAFT   │   (no JE; GL totals frozen)
                        └─────┬─────┘
                              │
                  PATCH {action:'FILE'}
                              │
                              ↓
                        ┌───────────┐
              ┌────────→│   FILED   │←────────┐
              │         └─────┬─────┘         │
              │               │               │
              │   PATCH {action:'PAY'}        │
              │               │               │
              │               ↓               │
              │         ┌───────────┐         │
              │         │   PAID    │         │
              │         └─────┬─────┘         │
              │               │               │
              └───────────────┴───────────────┘
                              │
                  PATCH {action:'REVERSE'}
                              │
                              ↓
                        ┌───────────┐
                        │ CANCELLED │   (JEs reversed; new return can be created)
                        └───────────┘
```

State enum (`VATReturnStatus` in `prisma/schema.prisma:246-251`):

| Status | JE posted? | Can transition to |
|---|---|---|
| `DRAFT` | none | `FILED` (via FILE action) — or hard-deleted via `DELETE /api/vat?id=` |
| `FILED` | declaration JE posted | `PAID` (via PAY) or `CANCELLED` (via REVERSE) |
| `PAID` | declaration + payment JEs posted | `CANCELLED` (via REVERSE) |
| `CANCELLED` | declaration (and payment if any) JEs reversed | none — terminal state. New returns for the period can be created as amendments. |

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running the full VAT cycle for a quarter, the following must hold:

### 1. ميزان المراجعة متوازن — Trial Balance Ties

```ts
import { getTrialBalance } from '@/lib/accounting/queries'
const tb = await getTrialBalance()
// tb.totals.totalDebit === tb.totals.totalCredit (within 0.01)
// tb.totals.isBalanced === true
```

### 2. كل القيود المرحَّلة متوازنة — All Posted JEs Balanced

Every JE created during the cycle must satisfy `Σ debit = Σ credit` per
entry. This is enforced by guard rule R2 at post time and verified by
`accountingHealthCheck().checks[0]`.

### 3. أرصدة حسابات الضريبة صحيحة — VAT Account Balances

For a quarter with `outputVat > inputVat > 0` (payable scenario):

| Account role | Expected balance AFTER declaration | AFTER payment |
|---|---|---|
| `VAT_OUTPUT` (3110) | **0** (closed by Dr) | 0 |
| `VAT_INPUT` (3120) | **0** (closed by Cr) | 0 |
| `VAT_DUE` (3130) | `+netVat` (credit balance = payable) | **0** (cleared by Dr) |
| `BANK` (1120) | 0 (unchanged) | `−netVat` (cash outflow) |

For a refund scenario (`inputVat > outputVat`):

| Account role | Expected balance AFTER declaration |
|---|---|
| `VAT_OUTPUT` (3110) | 0 (closed) |
| `VAT_INPUT` (3120) | 0 (closed) |
| `VAT_REFUND_RECEIVABLE` (1410) | `+|netVat|` (debit balance = receivable) |

### 4. الإقرار يجمد الأرقام المعتمدة من GL — Return Freezes GL-Derived Totals

```ts
const calc = await calculateVatForQuarter(year, quarter)
const vatReturn = await db.vATReturn.findFirst({ where: { period, status: 'DRAFT' } })

expect(Number(vatReturn.outputVat)).toBeCloseTo(calc.glOutputVat, 2)
expect(Number(vatReturn.inputVat)).toBeCloseTo(calc.glInputVat, 2)
expect(Number(vatReturn.totalSales)).toBeCloseTo(calc.totalSales, 2)
expect(Number(vatReturn.totalPurchases)).toBeCloseTo(calc.totalPurchases, 2)
expect(Number(vatReturn.netVat)).toBeCloseTo(calc.netVat, 2)
```

### 5. التطابق بين الفواتير ودفتر اليومية — Operational ↔ GL Match

```ts
const calc = await calculateVatForQuarter(year, quarter)
expect(calc.glMatch).toBe(true)  // glDiffOutput < 0.01 AND glDiffInput < 0.01
```

When `glMatch === false`, either a source document hasn't been posted to GL
yet, or a JE has been manually edited outside the guard. Both require
investigation.

### 6. روابط المصدر ↔ القيد سليمة — Source ↔ JE Linkage Integrity

```ts
const vatReturn = await db.vATReturn.findUnique({ where: { id } })
// After FILE:
expect(vatReturn.status).toBe('FILED')
expect(vatReturn.journalEntryId).not.toBeNull()
const je = await db.journalEntry.findUnique({ where: { id: vatReturn.journalEntryId } })
expect(je.sourceType).toBe('VAT_DECLARATION')
expect(je.sourceId).toBe(`VAT-${vatReturn.period}`)

// After PAY (if netVat > 0):
expect(vatReturn.status).toBe('PAID')
expect(vatReturn.paymentJournalEntryId).not.toBeNull()
const payJe = await db.journalEntry.findUnique({ where: { id: vatReturn.paymentJournalEntryId } })
expect(payJe.sourceType).toBe('VAT_PAYMENT')
expect(payJe.sourceId).toBe(`VTP-${vatReturn.period}`)
```

### 7. التحقق الرقمي الشامل — Numerical Consistency (I1-I7)

```ts
import { verifyNumericalConsistency } from '@/lib/accounting/queries'
const nc = await verifyNumericalConsistency()
expect(nc.ok).toBe(true)  // all 7 invariants pass
expect(nc.diffs).toHaveLength(0)
```

This verifies that the trial balance, balance sheet, GL per-account, raw
aggregates, and accounting equation all agree — the canonical
"build-breaking" check.

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source doc | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 1a | SalesInvoice (DRAFT→SENT) | `SALES_INVOICE` | CUSTOMER_AR | REVENUE + VAT_OUTPUT | VAT line only if vatAmount>0 |
| 2a | PurchaseInvoice (DRAFT→SENT) | `PURCHASE_INVOICE` | PROJECT_COST/ADMIN_EXPENSE + VAT_INPUT | SUPPLIER_AP | VAT line only if vatAmount>0 |
| 2b | SubcontractorInvoice | `SUBCONTRACTOR_INVOICE` | SUBCONTRACTOR_COST + VAT_INPUT | SUBCONTRACTOR_AP | status starts at SENT |
| 2c | Expense | `EXPENSE` | EXPENSE + VAT_INPUT | CASH/BANK | VAT line only if vatAmount>0 |
| 3 | — (calculation only) | — | — | — | No JE; GL-derived totals computed |
| 4 | VATReturn (create) | — | — | — | No JE; freeze GL-derived totals as DRAFT |
| 5 | VATReturn (FILE) | `VAT_DECLARATION` | VAT_OUTPUT (+ VAT_REFUND_RECEIVABLE if netVat<0) | VAT_INPUT (+ VAT_DUE if netVat>0) | Closes VAT_OUTPUT/VAT_INPUT; transfers net to VAT_DUE or VAT_REFUND_RECEIVABLE. JE dated to period-end. |
| 6 | VATReturn (PAY) | `VAT_PAYMENT` | VAT_DUE | BANK | Clears the payable. Skipped if netVat ≤ 0. JE dated paymentDate or today. |
| 7 | VATReturn (REVERSE) | `VAT_DECLARATION` (preserved) + `VAT_PAYMENT` (preserved) | mirror of original | mirror of original | Two reversal JEs if both declaration and payment exist; original JEs stay POSTED. `isReversal=true`, `reversedEntryId=originalId`. |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| VAT calculation engine (GL-primary, P1-1 fix) | `src/lib/vat-calc.ts` |
| VAT API (GET list, POST create, PATCH file/pay/reverse, DELETE) | `src/app/api/vat/route.ts` |
| VAT API (GET single return with live comparison) | `src/app/api/vat/[id]/route.ts` |
| VAT declaration JE (autoEntryVATDeclaration) | `src/lib/accounting/engine.ts:1255-1297` |
| VAT payment JE (autoEntryVATPayment) | `src/lib/accounting/engine.ts:1304-1325` |
| Journal entry reversal (reverseEntry → guardedReverse) | `src/lib/accounting/engine.ts:276-279`, `src/lib/accounting/guard.ts:340-416` |
| Account role definitions (VAT_OUTPUT, VAT_INPUT, VAT_DUE, VAT_REFUND_RECEIVABLE) | `src/lib/account-roles.ts:50-53, 183-216` |
| Operation-type → JE mapping (VAT_DECLARATION, VAT_PAYMENT) | `src/lib/accounting/mapping.ts:57-58, 431-460` |
| VAT reconciliation report (output/input/due balances) | `src/lib/accounting/queries.ts:936-961` (`getVATReconciliation`) |
| Numerical consistency verification (I1-I7) | `src/lib/accounting/queries.ts:990+` (`verifyNumericalConsistency`) |
| VAT module UI | `src/components/modules/vat.tsx` |
| Prisma schema (VATReturn model, VATReturnStatus enum) | `prisma/schema.prisma:246-251, 2070-2127` |
| E2E test | `scripts/e2e-vat-cycle.ts` |

---

## النتائج المعمارية الرئيسية — Key Architectural Findings

1. **Single source of truth (P1-1 fix)** — `calculateVatForQuarter` reads
   financial totals from `JournalLine` on POSTED JEs, not from operational
   tables. The operational breakdown (per-invoice lines) is kept for ZATCA
   display only. This means a missing or unposted invoice will NOT silently
   inflate the VAT return — the GL is the canonical source.

2. **Tolerance tightened to 1 halala** — `EPSILON = 0.01` SAR in
   `vat-calc.ts:431` (was 0.5 SAR pre-P1-1). Same tightening in
   `vat/[id]/route.ts:68` for `hasChangedSinceFiling`. Aligns with
   SOCPA/ZATCA standards in `src/lib/safe-money.ts:TOLERANCE`.

3. **Period-end dating** — the declaration JE is dated to the **last day
   of the quarter** (`getPeriodEndDate`), NOT to the filing date. This
   keeps the closing entry in the correct fiscal period and prevents the
   `getVatGlBalance` cross-check from picking up the declaration JE
   itself (which is also excluded by the `NOT sourceType IN
   (VAT_DECLARATION, VAT_PAYMENT)` filter).

4. **Declaration JE excludes itself from GL cross-check** —
   `getVatGlBalance` (lines 138-149) explicitly filters out
   `sourceType='VAT_DECLARATION'`, `sourceType='VAT_PAYMENT'`, entries
   with `entryNo` starting with `JE-VAT-` or `JE-VTP-`, and reversal
   JEs whose description contains "VAT". This is critical — without the
   filter, the declaration JE's `Dr VAT_OUTPUT` line would zero out the
   `outputVat` figure in any subsequent re-calculation, making it
   impossible to verify the original operational VAT.

5. **Three cases for netVat sign** — the declaration JE handles payable
   (`netVat > 0`, credits `VAT_DUE`), refund (`netVat < 0`, debits
   `VAT_REFUND_RECEIVABLE`), and zero (`netVat = 0`, no third line) as
   separate line-set constructions. All three cases produce a balanced JE.

6. **No `TAX_AUTHORITY_PAYABLE` role exists** — the task brief mentioned
   this role, but the codebase uses `VAT_DUE` (code 3130) for the
   payable and `VAT_REFUND_RECEIVABLE` (code 1410) for the refund
   receivable. The role `VAT_REFUND_RECEIVABLE` was added in CRITICAL #14
   fix (engine.ts:1266-1270 comment) — the prior code incorrectly used
   `VAT_INPUT` (which is a liability 3120) as the refund debit account,
   zeroing out the input-VAT liability instead of creating a receivable
   asset.

7. **Payment JE skipped for refunds** — if `netVat ≤ 0` (refund or zero
   scenario), `autoEntryVATPayment` is **not called**
   (`vat/route.ts:292-300`: `if (amount > 0) { ... }`). The status still
   transitions to `PAID`. Refunds are handled outside this flow (the tax
   authority issues a refund, which would be a manual Dr BANK / Cr
   VAT_REFUND_RECEIVABLE entry when received).

8. **Reversal is non-destructive** — `reverseEntry` creates a mirror JE
   but leaves the original POSTED. The two JEs net to zero in the trial
   balance, preserving the full audit trail. The reversal carries
   `isReversal=true` and `reversedEntryId=originalId` — that is the only
   linkage. There is no `REVERSED` status enum value.

9. **Reversal JE preserves the original sourceType** — when the
   declaration JE is reversed, the reversal JE has
   `sourceType='VAT_DECLARATION'` (not `VAT_REVERSAL` or similar). This
   is by design — it allows filtering all VAT_DECLARATION JEs (originals
   + reversals) for audit, and the `isReversal` flag distinguishes them.
   The same applies to VAT_PAYMENT reversals.

10. **`VAT_DUE` is a transient account** — it should have a zero balance
    except between FILE and PAY. After PAY, it's cleared. After REVERSE
    (from PAID), it's re-opened by the payment-reversal JE. The
    accountant should reconcile `VAT_DUE` to zero at each period close
    (any non-zero balance indicates a filed-but-unpaid return).

11. **Idempotency via state machine, not DB constraint** — the
    uniqueness of "one active return per period" is enforced by a JS
    check (`existingActive` at `vat/route.ts:119-134`), not a DB unique
    constraint. This allows multiple CANCELLED returns per period for
    audit history. The trade-off: a race condition between two
    concurrent POSTs for the same period could create two DRAFT returns.
    This is mitigated by the JS check but not eliminated — a future
    enhancement could add a partial unique index on `period` where
    `status != 'CANCELLED'`.

12. **Idempotency via guard** — `reverseEntry` is idempotent: a second
    call on the same original JE throws `ALREADY_REVERSED`
    (`guard.ts:372-381`). The VAT REVERSE route wraps both reversals in
    a single transaction, so a failure on either rolls back both.

13. **Amendment chain** — when a return is cancelled and a new one is
    created for the same period, the new return carries
    `isAmendment=true` and `amendedFromId=<cancelled.id>`. The
    `GET /api/vat/[id]` response includes a `periodChain` array showing
    the full sequence of returns for the period (cancelled + active) so
    the accountant can trace the amendment history.

14. **No "VAT_DECLARATION_REVERSED" status** — the enum only has
    `DRAFT`, `FILED`, `PAID`, `CANCELLED` (per
    `prisma/schema.prisma:246-251`). The task brief mentioned an
    `AMENDED` status — this does **not** exist. After REVERSE, the
    status is `CANCELLED`. The `isAmendment` flag (boolean) is set on
    the **new** return created afterwards, not on the cancelled one.

15. **GL exclusion of `JE-VAT-` / `JE-VTP-` prefixes is legacy defensive**
    — these prefixes were used by an older `entryNo` generation scheme.
    Since the P1-4 fix, all JEs use the unified `JE-NNNNNN` format from
    `getNextEntryNo`, so the prefix filter is redundant with the
    `sourceType` filter. It's kept as defense-in-depth in case any
    legacy data persists with the old format.

---

## الملاحظات النهائية — Final Notes

- **Test coverage** — `scripts/e2e-vat-cycle.ts` exercises the full cycle
  (sales invoice → purchase invoice → VAT calculation → return creation →
  filing → payment → reversal verification) with 40+ assertions,
  including trial-balance-ties, all-JEs-balanced, source↔JE linkage,
  per-account impact, and numerical consistency (I1-I7).

- **Regression safety** — the test is idempotent (cleanup-in-finally
  pattern) and does not interfere with the other 5 phase-3 cycle tests
  (construction, rental, purchase, payroll, fixed-assets).

- **Known gap** — there is no dedicated API endpoint for **re-filing** an
    amended return. The accountant must (1) REVERSE the original, (2)
    create a new DRAFT return (which will pick up any GL changes since
    the original filing), (3) FILE the new return. The
    `hasChangedSinceFiling` flag in `GET /api/vat/[id]` indicates
    whether the live GL totals differ from the frozen ones — if true,
    reversal + re-filing is warranted.

- **No ZATCA e-invoicing integration** — the cycle handles the
  **accounting** side of VAT only. ZATCA Fatoora (e-invoice clearance,
  QR code generation) is a separate workflow that uses
  `SalesInvoice.zatcaQr` (populated by `/api/generate-qr/route.ts`) but
  does not affect the VAT calculation or declaration JE structure.
