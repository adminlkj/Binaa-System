# دورة المشتريات — Purchase Cycle Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.3 (Task ID: P3-3)
>
> This document records the FULL purchase (procurement) business cycle as
> actually implemented in the Binaa-System ERP codebase, from supplier master
> creation through final supplier payment. Each step lists the API endpoint,
> required input fields, the journal entry (if any) posted, status transitions,
> prerequisites, and the reports affected. A companion end-to-end test
> (`scripts/e2e-purchase-cycle.ts`) exercises every step against the live
> database and verifies that all JEs are balanced and that the trial balance
> ties.

---

## نظرة عامة — Overview

The purchase cycle in Binaa-System is the chain:

```
┌─────────────┐   ┌──────────────────┐   ┌────────────────┐   ┌─────────────────┐
│ 1. Supplier │ → │ 2. Purchase      │ → │ 3. Purchase    │ → │ 4. Goods        │
│  (master)   │   │    Request       │   │    Order       │   │    Receipt      │
│  No JE      │   │  No JE (intent)  │   │  No JE (commit)│   │  JE: Dr INV     │
│             │   │  NEW→APPROVED    │   │  DRAFT→APPROVED│   │      Cr GRNI    │
│             │   │  →CONVERTED_TO_PO│   │  →PARTIALLY_   │   │                 │
│             │   │                  │   │   RECEIVED     │   │                 │
│             │   │                  │   │  →RECEIVED     │   │                 │
└─────────────┘   └──────────────────┘   └────────────────┘   └────────┬────────┘
                                                                         ↓
                                       ┌──────────────────────┐   ┌────────────────────┐
                                       │ 6. Supplier Payment  │ ← │ 5. Supplier Invoice│
                                       │    JE: Dr SUPPLIER_AP│   │  JE on DRAFT→SENT: │
                                       │    Cr CASH/BANK      │   │  Dr EXPENSE+VAT_IN │
                                       │    (clears AP)       │   │  Cr SUPPLIER_AP    │
                                       └──────────────────────┘   └────────────────────┘
```

**Key design principle** — only **two** operations in the purchase cycle post a
financial journal entry (R1 enforced by `src/lib/accounting/guard.ts`):

1. **Goods Receipt (Step 4)** — posts a **GRNI** (Goods Received Not Invoiced)
   journal entry at creation. This recognises the asset/inventory value and
   books a temporary liability (`GRNI`) that will be cleared when the supplier
   invoice is matched. Accounts: `Dr INVENTORY / Dr PROJECT_COST / Cr GRNI`.
2. **Supplier Invoice approval (Step 5, DRAFT → SENT transition)** — posts the
   supplier-invoice journal entry. Accounts: `Dr PROJECT_COST (or
   expense-category role) + Dr VAT_INPUT / Cr SUPPLIER_AP`.

The supplier **payment** (Step 6) then clears the AP liability: `Dr SUPPLIER_AP
/ Cr CASH`. The GRNI liability is *not* reversed at invoice time in the current
implementation — the accountant is expected to reconcile GRNI ↔ SUPPLIER_AP at
period close (or to post a manual clearing entry). This is flagged as a known
design trade-off, not a defect.

All other operations (supplier creation, purchase request, purchase order) are
master/planning/commitment records — **no JE** is posted.

---

## الخطوة 1: إنشاء المورد — Supplier Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/suppliers` |
| **Route file** | `src/app/api/suppliers/route.ts` (lines 63-107) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | None (master record) |
| **Required input fields** | `name` (non-empty string) |
| **Optional fields** | `nameAr`, `contactPerson`, `email`, `phone`, `address`, `taxNumber`, `isActive` (default `true`) |
| **Auto-generated** | `code` as `SUP-NNN` (sequential — looks up last supplier code matching `SUP-(\d+)` and increments) |
| **Journal entry posted** | **No** — master record, not a financial event |
| **Soft-delete** | `deletedAt DateTime?` field (set by DELETE on `/api/suppliers/[id]`) |
| **Affected reports** | Supplier list, supplier card, AP aging (after invoices exist) |

**Status** — `Supplier` has no status enum; the `isActive` boolean controls
availability for new transactions.

---

## الخطوة 2: طلب الشراء — Purchase Request

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/purchase-requests` |
| **API endpoint (status transition)** | `PUT /api/purchase-requests/[id]` with body `{ status: 'APPROVED' \| 'CONVERTED_TO_PO' \| 'CANCELLED' }` |
| **Route files** | `src/app/api/purchase-requests/route.ts` (lines 35-89), `src/app/api/purchase-requests/[id]/route.ts` (lines 45-154) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | Optional `Project` (FK; `projectId` nullable) |
| **Required input fields** | `date`, `items` (non-empty array) |
| **Optional fields** | `projectId`, `source` (default `'PROJECT'`; one of `PROJECT`, `INVENTORY`, `WORKSHOP`, `ADMIN`), `description`, `requestedBy` |
| **Item fields** | `description`, `quantity`, `unit?`, `notes?` |
| **Auto-generated** | `requestNo` as `PR-NNNN` (sequential) |
| **Validation** | `date` and `items.length > 0` required (HTTP 400 otherwise) |
| **Journal entry posted** | **No** — internal request, not a financial event |
| **Initial status** | `NEW` |

**Status transitions** (validated by PUT `[id]`):

```
NEW              ──APPROVED──→  APPROVED
NEW              ──CANCELLED──→ CANCELLED
APPROVED         ──CONVERTED_TO_PO──→  CONVERTED_TO_PO   (set automatically when a PO is approved — see Step 3)
APPROVED         ──CANCELLED──→ CANCELLED
CONVERTED_TO_PO  (terminal — cannot change further)
CANCELLED        (terminal)
```

> The `CONVERTED_TO_PO` transition is normally triggered automatically by the
> PurchaseOrder approve flow (see Step 3) inside the same transaction, not by a
> direct API call.

**Affected reports**: purchase-request list, PR detail, source-of-PO trace.

---

## الخطوة 3: أمر الشراء — Purchase Order

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/purchase-orders` |
| **API endpoint (status transition)** | `PUT /api/purchase-orders/[id]` with body `{ status: 'PENDING_APPROVAL' \| 'APPROVED' \| 'CANCELLED' }` |
| **Route files** | `src/app/api/purchase-orders/route.ts` (lines 67-156), `src/app/api/purchase-orders/[id]/route.ts` (lines 52-214) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Supplier` must exist (FK, `onDelete: Restrict`). Optional `Project`, optional `PurchaseRequest` (must be `APPROVED` if provided — HTTP 400 otherwise). |
| **Required input fields** | `supplierId`, `date`, `items` (non-empty) |
| **Optional fields** | `projectId`, `purchaseRequestId`, `deliveryDate`, `notes`, `vatRate` (default `0.15`) |
| **Item fields** | `description`, `quantity`, `unit?`, `unitPrice` |
| **Computed** | `subtotal = Σ (quantity × unitPrice)`, `vatAmount = subtotal × vatRate`, `totalAmount = subtotal + vatAmount` |
| **Auto-generated** | `orderNo` as `PO-NNNN` (sequential, inside transaction) |
| **Validation** | If `purchaseRequestId` provided, it must be `APPROVED` (HTTP 400 otherwise) |
| **Journal entry posted** | **No** — purchase order is a *commitment*, not a GL event. (A `Commitment` row may be created by separate commitment-tracking logic; this is not part of the standard GL.) |
| **Initial status** | `DRAFT` |

**Status transitions** (validated by PUT `[id]`):

```
DRAFT               ──PENDING_APPROVAL──→  PENDING_APPROVAL
DRAFT               ──CANCELLED──→         CANCELLED
PENDING_APPROVAL    ──APPROVED──→          APPROVED
PENDING_APPROVAL    ──DRAFT──→             DRAFT             (revert)
PENDING_APPROVAL    ──CANCELLED──→         CANCELLED
APPROVED            ──PARTIALLY_RECEIVED──→ PARTIALLY_RECEIVED   (set automatically by Goods Receipt flow — see Step 4)
APPROVED            ──CANCELLED──→         CANCELLED
PARTIALLY_RECEIVED  ──RECEIVED──→          RECEIVED              (set automatically by Goods Receipt flow)
PARTIALLY_RECEIVED  ──CANCELLED──→         CANCELLED
RECEIVED            (terminal)
CANCELLED           (terminal)
```

> The `APPROVED` transition also updates the linked `PurchaseRequest.status` to
> `CONVERTED_TO_PO` atomically (single transaction) when the PR is in
> `APPROVED` status.

**Affected reports**: PO list, PO detail, PO-to-GR matching, supplier card
(`_count.purchaseOrders`), commitment register (if enabled).

---

## الخطوة 4: إيصال استلام البضاعة — Goods Receipt (GRNI)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/goods-receipt` |
| **Route file** | `src/app/api/goods-receipt/route.ts` (lines 43-337) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `PurchaseOrder` must exist AND be in `APPROVED` or `PARTIALLY_RECEIVED` status (HTTP 400 otherwise). A `Supplier` must exist. Optional `Project`. At least one `Warehouse` must exist (required only if items have `destination='INVENTORY'` and no matching `InventoryItem` is found — a new one is created and attached to the first warehouse). |
| **Required input fields** | `purchaseOrderId`, `supplierId`, `date`, `items` (non-empty) |
| **Optional fields** | `projectId`, `notes` |
| **Item fields** | `description`, `quantityOrdered`, `quantityReceived`, `quantityRemaining`, `unitPrice`, `totalPrice?` (default `quantityReceived × unitPrice`), `destination?` (default `'INVENTORY'`; one of `INVENTORY`, `PROJECT`), `inventoryItemId?` (explicit link, P5-CRIT-013 fix) |
| **Auto-generated** | `receiptNo` as `GR-NNNN` (sequential, inside transaction) |
| **Validation** | PO must exist and be `APPROVED` or `PARTIALLY_RECEIVED`. PO status is recomputed after the receipt based on cumulative received vs ordered quantities. |
| **JE function called** | `createJournalEntry(...)` from `src/lib/accounting/engine.ts:288` (which delegates to `postJournalEntry` from `guard.ts`) — called **inline** inside the same transaction as the GR creation. R1 enforced. |
| **sourceType on JE** | `GOODS_RECEIPT` |
| **sourceId on JE** | `goodsReceipt.id` |
| **Initial status** | `PENDING` (`GoodsReceiptStatus` enum: `PENDING`, `PARTIAL`, `COMPLETED`, `CANCELLED`) |

**Side effects (all in the same transaction):**

1. The `GoodsReceipt` + `GoodsReceiptItem[]` rows are created.
2. PO status is recomputed: if `Σ quantityReceived ≥ Σ quantity` across all
   non-cancelled GRs for the PO → `RECEIVED`; else if `Σ > 0` →
   `PARTIALLY_RECEIVED`; else unchanged.
3. For items with `destination='INVENTORY'`:
   - Match an existing `InventoryItem` by `inventoryItemId` (preferred) or by
     `name` (P5-CRIT-013 fix); if none, **create** a new InventoryItem
     attached to the first Warehouse (P5-CRIT-013 fix — previously this path
     silently skipped the line).
   - Increment `InventoryItem.quantity` by `quantityReceived` and update
     `purchasePrice`.
   - Track for `StockMovement` creation (RECEIPT type) after the JE is built
     (P5-CRIT-012 fix).
4. For items with `destination='PROJECT'`:
   - Accumulate the project cost (no `InventoryItem` update).
   - Track for `EquipmentCost` creation after the JE is built (P5-CRIT-014 fix).
5. Build the GRNI journal entry:
   - `Dr INVENTORY` (account role `INVENTORY`, code 1340) for the
     inventory-destination total.
   - `Dr PROJECT_COST` (account role `PROJECT_COST`, code 7110) for the
     project-destination total.
   - `Cr GRNI` (account role `GRNI`, code 3330) for the grand total.
   - Skip the JE if `totalAmount === 0` (no items received).
6. After JE is created:
   - `StockMovement` rows are created for each inventory-destination item,
     linked to `journalEntryId` (P5-CRIT-012 fix).
   - `EquipmentCost` rows are created for each project-destination item,
     linked to `journalEntryId` (P5-CRIT-014 fix).
   - `GoodsReceipt.journalEntryId` is set to the new JE id.

**Journal entry lines** (posted at creation, R1):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Inventory (if inventoryTotal > 0) | `INVENTORY` | 1340 | `inventoryTotal` | — |
| Dr Project Cost (if projectCostTotal > 0) | `PROJECT_COST` | 7110 | `projectCostTotal` | — |
| Cr GRNI | `GRNI` | 3330 | — | `inventoryTotal + projectCostTotal` |

> **Note on GRNI clearing**: In a full 3-way-match design, the supplier
> invoice would post `Dr GRNI / Cr SUPPLIER_AP` (clearing the GRNI liability
> and replacing it with the formal AP). Binaa-System's
> `createPurchaseInvoiceJournalEntry` instead posts
> `Dr EXPENSE + Dr VAT_INPUT / Cr SUPPLIER_AP` — the EXPENSE debit duplicates
> the INVENTORY/PROJECT_COST debit posted by the GR (though with different
> account roles when `expenseCategory` is set). The accountant must reconcile
> GRNI ↔ SUPPLIER_AP at period close or post a manual clearing entry. This
> trade-off is documented for future alignment.

**Affected reports**: GR list, GR detail, inventory valuation (StockMovement
audit trail), project cost (EquipmentCost for PROJECT-destination items), AP
aging (via GRNI liability), trial balance (INVENTORY/PROJECT_COST debit,
GRNI credit).

---

## الخطوة 5: فاتورة المورد — Supplier Invoice

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/supplier-invoices` |
| **API endpoint (status transition)** | `PUT /api/supplier-invoices/[id]` with body `{ status: 'SENT' \| 'CANCELLED' }` |
| **Route files** | `src/app/api/supplier-invoices/route.ts` (lines 78-249), `src/app/api/supplier-invoices/[id]/route.ts` (lines 50-280) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `GoodsReceipt` must exist and NOT already be linked to another `PurchaseInvoice` (the `goodsReceiptId` is `@unique` — HTTP 400 if already linked). |
| **Required input fields** | `goodsReceiptId`, `date`, `dueDate` |
| **Optional fields** | `supplierInvoiceNo`, `supplierInvoiceDate`, `attachmentPath`, `notes`, `vatRate` (default = `getDefaultVatRate()` from settings) |
| **Auto-populated from GR** | `supplierId`, `projectId`, `purchaseOrderId` |
| **Computed** | `subtotal = Σ GR.items.totalPrice`, `vatAmount = subtotal × vatRate`, `totalAmount = subtotal + vatAmount` |
| **Invoice items** | Auto-built from GR items: `description`, `quantity` (= `quantityReceived`), `unitPrice`, `totalPrice` |
| **Auto-generated** | `invoiceNo` as `SI-NNNN` (sequential, inside transaction) |
| **Validation** | GR must exist (HTTP 404); GR must not already be linked (HTTP 400); `date` and `dueDate` required (HTTP 400) |
| **ZATCA QR** | Generated and stored on `zatcaQr` field after invoice creation (best-effort — does not fail the request if QR generation throws) |
| **JE function called** | `createPurchaseInvoiceJournalEntry(invoiceId, tx)` from `src/lib/auto-journal.ts:149` — called **by the PUT route** when transitioning `DRAFT → SENT` (NOT at POST — P5-CRIT-001 fix). |
| **sourceType on JE** | `PURCHASE_INVOICE` |
| **sourceId on JE** | `purchaseInvoice.id` |
| **Initial status** | `DRAFT` (no JE; `journalEntryId = null`) |

**Status transitions** (validated by PUT `[id]`):

```
DRAFT            ──(JE created)──→  SENT
SENT             ──(paidAmount>0)──→ PARTIALLY_PAID
PARTIALLY_PAID   ──(paidAmount≥total)──→ PAID        (set automatically by Supplier Payment flow — see Step 6)
SENT / PARTIALLY_PAID / PAID  ──(JE reversed)──→ CANCELLED
DRAFT            ──CANCELLED──→     CANCELLED
PAID             (terminal — no further transitions)
CANCELLED        (terminal)
```

**Safety guards** (P5-CRIT-002/003 fixes):
- DRAFT → SENT is the only transition that creates a JE.
- Any transition to CANCELLED reverses the linked JE (if any) via
  `reverseEntry(...)`.
- DELETE on `/api/supplier-invoices/[id]` is only allowed for `DRAFT` status
  and reverses the JE (if any) before hard-deleting.
- PUT modifications to a SENT invoice's amounts trigger a reversal + new JE
  creation (re-using `createPurchaseInvoiceJournalEntry` so POST and PUT
  produce identical account mapping — P5-CRIT-006 fix).

**Journal entry lines** (posted on DRAFT → SENT transition):

The expense account role is resolved from `invoice.expenseCategory` via the
`PURCHASE_CATEGORY_ROLE_MAP`. If no category is set, the role defaults to
`PROJECT_COST` when `projectId` is present, else `ADMIN_EXPENSE`. All lines
are tagged with `invoice.project.costCenter.id` if set (P5-CRIT-010 fix).

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Expense (category-aware role) | `PROJECT_COST` (default if projectId) / `ADMIN_EXPENSE` (default if no project) / `MAINTENANCE_EXPENSE` / `FUEL_EXPENSE` / `SUBCONTRACTOR_COST` / `TRANSPORT_EXPENSE` / etc. | 7110 / 5110 / 7310 / 7320 / 7130 / 7330 / etc. | `invoice.subtotal` | — |
| Dr VAT Input | `VAT_INPUT` | 3120 | `invoice.vatAmount` | — |
| Cr Supplier AP | `SUPPLIER_AP` | 3210 | — | `invoice.totalAmount` |

**Category → role map** (mirrors `PURCHASE_CATEGORY_ROLE_MAP` in
`auto-journal.ts`):

| Category | Account role |
|---|---|
| `CONSUMABLES`, `INSURANCE`, `PERMITS` | `PROJECT_COST` |
| `SERVICES` | `SUBCONTRACTOR_COST` |
| `MAINTENANCE` | `MAINTENANCE_EXPENSE` |
| `FUEL` | `FUEL_EXPENSE` |
| `DRIVERS` | `DRIVER_EXPENSE` |
| `TRANSPORT`, `DELIVERY` | `TRANSPORT_EXPENSE` |
| `RENT`, `OFFICE`, `INTERNET`, `ELECTRICITY`, `WATER`, `HOSPITALITY`, `MANAGEMENT_CARS`, `OTHER` | `ADMIN_EXPENSE` |
| `SALARIES` | `PAYROLL_EXPENSE` |

**Affected reports**: supplier-invoice list, invoice detail, ZATCA QR, AP aging
(SUPPLIER_AP credit side), project profitability (PROJECT_COST debit side if
tagged to a cost center), VAT return (input VAT), trial balance.

---

## الخطوة 6: سداد المورد — Supplier Payment

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/supplier-payments` |
| **Route file** | `src/app/api/supplier-payments/route.ts` (lines 67-212) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Supplier` must exist (not soft-deleted). Optional `PurchaseInvoice` (linked via `invoiceId`); if provided, the invoice must NOT be in `DRAFT`, `PAID`, or `CANCELLED` status (HTTP 400) and `amount ≤ invoice.totalAmount − invoice.paidAmount + 0.01` (overpayment check, P5-CRIT-009 fix). The invoice must belong to the same supplier (HTTP 400 otherwise). |
| **Required input fields** | `supplierId`, `amount` (>0), `date` |
| **Optional fields** | `invoiceId`, `paidFrom` (default `'TREASURY'`), `payingAccountId`, `payingAccountCode`, `payingAccountName`, `bankAccount`, `paymentMethod`, `reference`, `notes` |
| **JE function called** | `createSupplierPaymentJournalEntry(paymentId, tx)` from `src/lib/auto-journal.ts:268` — called **inline** in the same transaction as the payment creation. R1 enforced. |
| **sourceType on JE** | `SUPPLIER_PAYMENT` |
| **sourceId on JE** | `supplierPayment.id` |

**Side effects (all in the same transaction):**

1. The `SupplierPayment` row is created.
2. `createSupplierPaymentJournalEntry(paymentId, tx)` creates the JE:
   - Resolves `SUPPLIER_AP` account via `requireAccountByRole`.
   - Resolves the paying account: explicit `payingAccountId` if provided,
     else `getDefaultAccountByRole(AccountRole.CASH, tx)`.
   - Resolves `costCenterId` from `payment.invoice.project.costCenter.id` if
     the payment is linked to an invoice with a project (P5-CRIT-010 fix).
3. If `invoiceId` is provided:
   - `invoice.paidAmount += payment.amount`
   - `invoice.status` recomputed: `PAID` if `paidAmount ≥ totalAmount − 0.01`,
     else `PARTIALLY_PAID`.
   - If the invoice is linked to a `PurchaseOrder`, `PO.paidAmount += payment.amount` (P5-CRIT-011 fix).

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Supplier AP | `SUPPLIER_AP` | 3210 | `payment.amount` | — |
| Cr Cash/Bank | explicit `payingAccountId`, else `CASH` (role default) | 1110 (or 1120) | — | `payment.amount` |

Both lines tagged with `payment.invoice.project.costCenter.id` if set
(P5-CRIT-010 fix).

**Affected reports**: supplier payments list, AP aging (SUPPLIER_AP debit side
— reduces the liability), cash flow, project cash-flow (if cost-center tagged),
trial balance.

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running all 6 steps for a single supplier + PO + GR + invoice + payment,
the following must hold:

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

### 3. أرصدة حسابات المشتريات صحيحة — Purchase Account Balances

For a supplier `S` with cost center `CC` (project-linked invoice):

| Account role | Expected balance (after cycle) |
|---|---|
| `INVENTORY` (Dr) | = Σ GR items (destination=INVENTORY) totalPrice |
| `PROJECT_COST` (Dr) | = Σ GR items (destination=PROJECT) totalPrice + supplier-invoice subtotal (if no `expenseCategory` and `projectId` set) |
| `GRNI` (Cr) | = Σ GR items totalPrice (NOT cleared by supplier invoice in current implementation) |
| `VAT_INPUT` (Dr) | = supplier-invoice vatAmount |
| `SUPPLIER_AP` (Cr) | = supplier-invoice totalAmount − supplier-payment amount (zero if fully paid) |
| `CASH` (Cr) | = supplier-payment amount |

### 4. روابط المصدر ↔ القيد سليمة — Source ↔ JE Linkage Integrity

Every operational source document that posts a JE must have a non-null
`journalEntryId` foreign key:

| Model | Field | Set by |
|---|---|---|
| `Supplier` | — | **always NULL** by design (master record, no JE) |
| `PurchaseRequest` | — | **always NULL** by design (internal request, no JE) |
| `PurchaseOrder` | `journalEntryId` field exists on the model but is **always NULL** in the current implementation (PO is a commitment, not a GL event — the field is reserved for future commitment-tracking integration) |
| `GoodsReceipt` | `journalEntryId` | `createJournalEntry(...)` (inline in POST route) |
| `PurchaseInvoice` | `journalEntryId` | `createPurchaseInvoiceJournalEntry(invoiceId, tx)` (on DRAFT → SENT transition) |
| `SupplierPayment` | `journalEntryId` | `createSupplierPaymentJournalEntry(paymentId, tx)` (inline in POST route) |

### 5. تكامل الأرقام — Numerical Consistency (I1-I7)

`verifyNumericalConsistency()` from `src/lib/accounting/queries.ts:990` checks
seven cross-cutting invariants (trial balance ties, net columns tie, raw
aggregate matches TB, accounting equation A=L+E holds, GL closing balances
match TB signed balances, etc.). Must return `{ ok: true, diffs: [] }`.

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source doc | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 1 | Supplier | — | — | — | NO JE — master record |
| 2 | PurchaseRequest | — | — | — | NO JE — internal request |
| 3 | PurchaseOrder | — | — | — | NO JE — commitment only |
| 4 | GoodsReceipt | `GOODS_RECEIPT` | INVENTORY + PROJECT_COST | GRNI | Posted at creation; GRNI cleared at period close (manual) |
| 5 | PurchaseInvoice (DRAFT→SENT) | `PURCHASE_INVOICE` | EXPENSE (category-aware role) + VAT_INPUT | SUPPLIER_AP | Posted on PATCH/PUT transition |
| 6 | SupplierPayment | `SUPPLIER_PAYMENT` | SUPPLIER_AP | CASH/BANK | Clears AP; updates invoice + PO paidAmount |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| Supplier API | `src/app/api/suppliers/route.ts`, `src/app/api/suppliers/[id]/route.ts` |
| Purchase request API | `src/app/api/purchase-requests/route.ts`, `src/app/api/purchase-requests/[id]/route.ts` |
| Purchase order API | `src/app/api/purchase-orders/route.ts`, `src/app/api/purchase-orders/[id]/route.ts` |
| Goods receipt API | `src/app/api/goods-receipt/route.ts`, `src/app/api/goods-receipt/[id]/route.ts` |
| Supplier invoice API | `src/app/api/supplier-invoices/route.ts`, `src/app/api/supplier-invoices/[id]/route.ts` |
| Supplier payment API | `src/app/api/supplier-payments/route.ts`, `src/app/api/supplier-payments/[id]/route.ts` |
| Auto-journal (supplier invoice / supplier payment) | `src/lib/auto-journal.ts` |
| Auto-journal (goods-receipt GRNI — inline in route) | `src/app/api/goods-receipt/route.ts` |
| Posting guard (R1-R12, entryNo) | `src/lib/accounting/guard.ts` |
| Accounting queries (SSOT) | `src/lib/accounting/queries.ts` |
| Account-role resolver | `src/lib/account-roles.ts` |
| ZATCA QR generator | `src/lib/zatca-qr.ts` |
| Default VAT rate | `src/lib/settings.ts` (`getDefaultVatRate`) |
| Prisma schema | `prisma/schema.prisma` |
| E2E test | `scripts/e2e-purchase-cycle.ts` |
