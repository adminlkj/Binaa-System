# دورة تأجير المعدات — Equipment Rental Workflow

> **Phase 3 — Workflow Integrity** — Agent P3.2 (Task ID: P3-2)
>
> This document records the FULL equipment-rental business cycle as actually
> implemented in the Binaa-System ERP codebase, from equipment master creation
> through final collection (with optional return). Each step lists the API
> endpoint, required input fields, the journal entry (if any) posted, status
> transitions, prerequisites, business-flow validation gates, and the reports
> affected. A companion end-to-end test (`scripts/e2e-rental-cycle.ts`)
> exercises every step against the live database and verifies that all JEs are
> balanced and that the trial balance / rental-revenue reports tie out.

---

## نظرة عامة — Overview

The equipment rental cycle in Binaa-System is the chain:

```
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐
│ 1. Equipment │ → │ 2. Rental        │ → │ 3. Delivery      │ → │ 4. Timesheet   │
│    (master)  │   │    Contract      │   │    Order         │   │    (DRAFT →    │
│ JE if        │   │    (commitment)  │   │ PENDING→DELIVERED│   │    APPROVED)   │
│ purchasePrice│   │    No JE         │   │    No JE         │   │    No JE       │
│ > 0          │   │                  │   │                  │   │                │
└──────────────┘   └──────────────────┘   └──────────────────┘   └───────┬────────┘
                                                                          ↓
   ┌────────────────────────┐   ┌──────────────────────┐   ┌────────────────────────┐
   │ 6. Rental Payment      │ ← │ 5. Rental Invoice    │ ← │ 5b. generate-invoice   │
   │    (ClientPayment +    │   │    (SalesInvoice     │   │     endpoint           │
   │     JE Dr CASH /       │   │      invoiceType     │   │     JE Dr CUSTOMER_AR  │
   │     Cr CUSTOMER_AR)    │   │      =RENTAL)        │   │     / Cr RENTAL_REV    │
   │ paymentType=RENTAL     │   │                      │   │     + Cr VAT_OUTPUT    │
   └────────────────────────┘   └──────────────────────┘   └────────────────────────┘
              │                                                          ↑
              ↓                                                          │
   ┌────────────────────────┐                                  ┌─────────────────┐
   │ 7. (optional) Return   │                                  │ Timesheet       │
   │    Delivery Order      │                                  │ @@unique        │
   │    DELIVERED→RETURNED  │                                  │ [rentalId,year, │
   │    equipment →         │                                  │  month]         │
   │    AVAILABLE           │                                  │ one per month   │
   └────────────────────────┘                                  └─────────────────┘
```

**Key design principles**

1. **Equipment is a fixed asset** — When `purchasePrice > 0`, creating the
   equipment master immediately capitalizes it on the balance sheet
   (Step 1 posts a `Dr FIXED_ASSET / Cr CASH` JE). Equipment with
   `purchasePrice = 0` (e.g. customer-owned) creates no JE.
2. **A rental contract is a commitment, not a GL event** — Step 2 creates
   a parent `Contract` (contractType=RENTAL) plus an `EquipmentRental`
   record. No JE is posted. The equipment status changes to `RENTED` only
   when the rental contract is created with `status='ACTIVE'` (P3-CRIT-007).
3. **A delivery order is operational** — Step 3 records that the equipment
   has been handed over to the client site. No JE is posted. The equipment
   status flips to `IN_USE` only when the order transitions `PENDING →
   DELIVERED` **AND** the equipment is currently `AVAILABLE` (P3-BUG fix —
   if the equipment is already `RENTED`, the rental contract owns the
   status and the delivery order does not clobber it).
4. **A timesheet is the source of revenue** — Step 4 captures the
   operating hours for a single rental-month. The `@@unique([rentalId,
   year, month])` constraint enforces "one timesheet per rental per
   month". Timesheets start `DRAFT`, transition to `SUBMITTED` →
   `APPROVED`. No JE is posted on any timesheet transition (the timesheet
   is a measurement, not a revenue event).
5. **Rental invoices are ONLY generated from approved timesheets** —
   Step 5 calls `POST /api/equipment/timesheets/[id]/generate-invoice`.
   The endpoint is the **only** way to create a rental invoice. Manual
   creation of `SalesInvoice` with `invoiceType=RENTAL` is not exposed.
   The invoice is created directly as `SENT` (P3-HIGH-009 fix — since the
   JE is posted immediately, a `DRAFT` invoice with a posted JE would be
   inconsistent), and the JE is posted in the same transaction:
   `Dr CUSTOMER_AR / Cr RENTAL_REVENUE + Cr VAT_OUTPUT`.
6. **Rental payment reuses the client-payment pipeline** — Step 6 stores
   the collection as a `ClientPayment` row with `paymentType='RENTAL'`
   and calls the same `createClientPaymentJournalEntry` function used by
   the construction cycle: `Dr CASH / Cr CUSTOMER_AR`. The linked
   invoice's `paidAmount` is incremented and its status transitions to
   `PARTIALLY_PAID` or `PAID` as appropriate.

---

## الخطوة 1: إنشاء المعدة — Equipment Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/equipment` |
| **Route file** | `src/app/api/equipment/route.ts` (lines 69-165) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | None (supplier is optional; if `supplierId` is provided, the credit side of the purchase JE becomes `SUPPLIER_AP` instead of `CASH`) |
| **Required input fields** | `name` |
| **Optional fields** | `nameAr`, `type`, `model`, `serialNumber`, `status` (default `AVAILABLE`), `ownershipType` (default `COMPANY_OWNED` — one of `COMPANY_OWNED`, `LEASED_ASSET`, `CUSTOMER_OWNED`), `supplierId`, `ownerId`, `purchasePrice` (default 0), `sellingPrice`, `hourlyRate`, `dailyRate`, `monthlyRate`, `purchaseDate`, `warrantyExpiry`, `assetAccountId`, `assetAccountCode` |
| **Auto-generated** | `code` as `EQ-NNN` (atomic, race-safe via retry-on-P2002 — P3-CRIT-009) |
| **JE function called** | `autoEntryEquipmentPurchase({ equipmentCode, equipmentName, amount: purchasePrice, date, payFrom }, tx)` from `src/lib/accounting/engine.ts:779` — **only when `purchasePrice > 0`** |
| **sourceType on JE** | `EQUIPMENT_PURCHASE` |
| **sourceId on JE** | `equipment.code` (NOT `equipment.id`) |
| **Initial status** | `AVAILABLE` (default) |

**Journal entry lines** (only when `purchasePrice > 0`):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Fixed Asset | `FIXED_ASSET` | 2110 | `purchasePrice` | — |
| Cr Cash (if no supplier) | `CASH` | 1110 | — | `purchasePrice` |
| Cr Supplier AP (if supplier provided) | `SUPPLIER_AP` | 3210 | — | `purchasePrice` |

**Status transitions** (via equipment life-cycle):
- `AVAILABLE` (initial) — owned by the company, ready to rent.
- `RENTED` — set automatically when an `EquipmentRental` is created with
  `status='ACTIVE'` (Step 2). The equipment stays `RENTED` for the
  duration of the contract.
- `IN_USE` — set by a delivery-order transition to `DELIVERED` only if
  the equipment is currently `AVAILABLE` (P3-BUG fix). If already
  `RENTED`, the rental contract owns the status and the delivery order
  leaves it alone.
- `MAINTENANCE` — set by `POST /api/equipment/maintenance` when a
  maintenance job is opened.
- `OUT_OF_SERVICE` — manually set.
- Back to `AVAILABLE` — when the rental contract ends OR when a delivery
  order transitions to `RETURNED` (only if not currently `RENTED`).

**Affected reports**: equipment list, equipment card, fixed-asset register
(balance sheet), IFRS-15 POC fallback (equipment `purchasePrice` is part
of fixed-asset base for depreciation).

---

## الخطوة 2: إنشاء عقد التأجير — Rental Contract Creation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/equipment/rental-contracts` |
| **Route file** | `src/app/api/equipment/rental-contracts/route.ts` (lines 54-273) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Client` must exist. An `Equipment` must exist (not soft-deleted, must be active). A `Project` must exist somewhere in the system — if `body.projectId` is not provided, the route auto-resolves to the client's most-recent project, else to any project; if no project exists at all, the route returns 400 (FK constraint: the parent `Contract` model requires `projectId`). Overlap check (P3-HIGH-004): no other ACTIVE/UNDER_REVIEW/DRAFT rental on the same equipment may overlap the requested date range. |
| **Required input fields** | `equipmentId`, `clientId`, `startDate` |
| **Optional fields** | `endDate`, `pricingType` (default `HOURLY` — one of `HOURLY`, `DAILY`, `MONTHLY`, `LUMP_SUM`), `referenceRate`, `referenceHours`, `hourlyRate` (auto-computed when HOURLY + referenceHours>0: `hourlyRate = referenceRate / referenceHours`), `dailyRate`, `monthlyRate`, `lumpSumAmount`, `deliveryFees`, `deliveryFeesType` (default `NONE`), `deliveryFeesTaxable` (default true), `operationMode` (default `WITHOUT_DRIVER`), `fuelResponsibility` (default `ON_CLIENT`), `insuranceResponsibility` (default `ON_CLIENT`), `workCity`, `workLocation`, `siteSupervisor`, `siteSupervisorPhone`, `salesOrderNo` (auto-generated `SO-NNNN`), `purchaseOrderNo`, `quotationNo`, `paymentDuration` (`immediate`, `net15`, `net30`, `net60`, `net90`, or a number-as-string of days), `additionalTerms`, `notes`, `totalAmount` (auto-computed `referenceRate + deliveryFees` if not provided), `status` (default `DRAFT`) |
| **Auto-generated** | Parent `Contract.contractNo` as `RC-NNNN`, `EquipmentRental.salesOrderNo` as `SO-NNNN` |
| **JE function called** | **None** — a rental contract is a commitment, not a GL event |
| **Initial status** | `DRAFT` (default) — or `ACTIVE` if explicitly requested |

**Side effects** (P3-CRIT-006 atomic transaction):

1. A parent `Contract` record is created with `contractType='RENTAL'`,
   `value=referenceRate`, `vatRate=0.15`, `clientId`, `equipmentId`,
   `hourlyRate`, `deliveryFees`, `deliveryFeesTaxable`, `salesOrderNo`,
   `purchaseOrderNo`, `quotationNo`, and the requested `startDate`/`endDate`.
   The parent contract's status is set to `ACTIVE` if the rental status is
   `ACTIVE`, else `DRAFT`.
2. The `EquipmentRental` record is created and linked to the parent
   contract via `contractId` (one-to-one, `@unique`).
3. If the rental status is `ACTIVE`, the equipment is updated to
   `status='RENTED'` (P3-CRIT-007).

**Status transitions** (rental contract):
- `DRAFT` (initial) → `UNDER_REVIEW` → `ACTIVE` → `EXPIRED` / `CANCELLED`.
- The transition to `ACTIVE` is what flips the equipment to `RENTED`.
- No JE on any transition.

**Affected reports**: rental-contracts list, rental-contract detail print,
uninvoiced-rentals report, equipment card (current rental status), AR aging
(after invoices exist).

---

## الخطوة 3: أمر التوصيل — Delivery Order

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/delivery-orders` |
| **API endpoint (status transition)** | `PATCH /api/delivery-orders` with body `{ id, status }` |
| **Route files** | `src/app/api/delivery-orders/route.ts` (lines 109-262) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `Equipment` must exist. A `rentalId` is optional but recommended — when provided, the delivery order is linked to the rental contract and shows up in the rental-card timeline. Business-flow gate `canCreateDeliveryOrder(rentalId)` (when a rental is provided): client exists, equipment exists, contract status is `ACTIVE` or `DRAFT`, `salesOrderNo` is set (auto-generated by Step 2). |
| **Required input fields** | `equipmentId`, `deliveryDate` |
| **Optional fields** | `clientId`, `projectId`, `rentalId`, `site`, `returnDate`, `notes` |
| **Auto-generated** | `orderNo` as `DO-YYYY-NNNN` |
| **JE function called** | **None** — delivery is an operational event, not a financial one |
| **Initial status** | `PENDING` |

**Status transitions** (via PATCH):

```
PENDING  ──→  DELIVERED     (equipment → IN_USE if currently AVAILABLE; if RENTED, no change)
DELIVERED ──→  RETURNED      (equipment → AVAILABLE if not currently RENTED)
DELIVERED ──→  CANCELLED     (equipment → AVAILABLE if not currently RENTED)
PENDING  ──→  CANCELLED      (no equipment-status change — equipment was never moved)
```

**P3-BUG FIX (documented inline in the route)**: An earlier implementation
blindly set `equipment.status='IN_USE'` whenever a delivery order became
`DELIVERED`. This clobbered the `RENTED` state set by an active rental
contract, breaking the rental cycle's equipment-status invariant. The fix:
when transitioning to `DELIVERED`, only flip the equipment to `IN_USE` if
it is currently `AVAILABLE`. If it is already `RENTED` (or any other
state), the rental contract owns the status and the delivery order leaves
it alone. The same logic applies to `RETURNED` and `CANCELLED` — the
equipment is only returned to `AVAILABLE` if it is not currently `RENTED`.

**Business-flow gate**: `canCreateTimesheet(rentalId)` requires that at
least one delivery order in status `DELIVERED` or `PENDING` exists for
the rental. The `generate-invoice` endpoint (Step 5) is stricter: it
requires at least one delivery order in status `DELIVERED` (not just
`PENDING`).

**Affected reports**: delivery-order list, rental-card timeline, equipment
movement history.

---

## الخطوة 4: التايم شيت — Timesheet

| Field | Value |
|---|---|
| **API endpoint (create)** | `POST /api/equipment/timesheets` |
| **API endpoint (update / status transition)** | `PUT /api/equipment/timesheets` with body `{ id, status, approvedDate, ... }` |
| **Route files** | `src/app/api/equipment/timesheets/route.ts` (lines 112-276) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | An `EquipmentRental` with `status='ACTIVE'` (the route 400s if the rental is not active). A parent `Contract` must exist. **Duplicate check (P3-MED-003)**: no other timesheet may exist for the same `(rentalId, year, month)` — this is enforced at the database level by the `@@unique([rentalId, year, month])` constraint. |
| **Required input fields** | `rentalId`, `contractId`, `month` (1-12), `year` (4-digit), `operatingHours` (decimal) |
| **Optional fields** | `notes` |
| **Auto-populated** | `projectId` (from `rental.projectId` or `contract.projectId`), `equipmentId` (from `rental.equipmentId`) |
| **JE function called** | **None** — a timesheet is a measurement, not a revenue event |
| **Initial status** | `DRAFT` |

**Status transitions** (via PUT):

```
DRAFT       ──→  SUBMITTED
SUBMITTED   ──→  APPROVED     (sets approvedDate)
APPROVED    ──→  INVOICED     (only via the generate-invoice endpoint — Step 5)
```

Modifications are blocked once `status='INVOICED'` (the route returns 403
with `لا يمكن تعديل تايم شيت تم إصدار فاتورة له. يجب إلغاء الفاتورة أولاً`).
The transition `APPROVED → INVOICED` is normally not done via PUT — it is
done by the `generate-invoice` endpoint, which atomically (a) creates the
`SalesInvoice`, (b) flips the timesheet to `INVOICED` and sets
`invoiced=true` + `invoiceId`, and (c) posts the JE.

**Business-flow gate**: `canCreateInvoice('TIMESHEET', timesheetId)`
requires `timesheet.status='APPROVED'` AND no existing invoice linked to
the timesheet.

**Affected reports**: timesheet list (filter by status, by rental, by
year, by uninvoiced=APPROVED-only), rental-card timeline, equipment
utilization report.

---

## الخطوة 5: توليد فاتورة التأجير من التايم شيت — Rental Invoice Generation

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/equipment/timesheets/[id]/generate-invoice` |
| **Route file** | `src/app/api/equipment/timesheets/[id]/generate-invoice/route.ts` (lines 9-298) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | Four enforced workflow gates (all 400 if not met):<br>1. Parent `Contract.status='ACTIVE'`.<br>2. A delivery order with `status='DELIVERED'` exists for this rental (not just `PENDING`).<br>3. `Timesheet.status='APPROVED'` (if already `INVOICED`, returns 400 with `تم إصدار فاتورة لهذا التايم شيت بالفعل`).<br>4. `Timesheet.invoiced === false` AND no existing `SalesInvoice` linked via `timesheetId`. |
| **Required input fields** | None (the timesheet id is in the URL path; all data is pulled from the timesheet + rental + contract) |
| **JE function called** | `createSalesInvoiceJournalEntry(invoiceId, tx)` from `src/lib/auto-journal.ts:26` — called in the same transaction as the invoice creation. Because `invoice.invoiceType='RENTAL'`, the revenue line resolves to `RENTAL_REVENUE` (not `PROJECT_REVENUE`). |
| **sourceType on JE** | `SALES_INVOICE` |
| **Initial invoice status** | `SENT` (P3-HIGH-009 fix — the JE is posted immediately, so the invoice cannot stay in `DRAFT`) |

**Amount calculation** (lines 122-131 of the route):

```
hourlyRate      = timesheet.rental.hourlyRate || contract.hourlyRate || 0
operatingHours  = timesheet.operatingHours
subtotal        = operatingHours × hourlyRate
vatRate         = contract.vatRate || 0.15
vatAmount       = round(subtotal × vatRate, 2)
deliveryFees    = timesheet.rental.deliveryFees || contract.deliveryFees || 0
deliveryVat     = deliveryFeesTaxable ? round(deliveryFees × vatRate, 2) : 0
totalAmount     = subtotal + vatAmount + deliveryFees + deliveryVat
```

**Auto-generated**:
- `invoiceNo` as `RNT-NNNN` (sequential per RNT prefix)
- `invoiceType='RENTAL'`, `sourceType='TIMESHEET'`, `timesheetId=timesheet.id`
- One `SalesInvoiceItem` for the rental hours: `description="تأيجير {equipment} - {month} {year} - {hours} ساعة"`, `unit="ساعة"`, `quantity=operatingHours`, `unitPrice=hourlyRate`, `totalPrice=subtotal`, `itemType='RENTAL'`.
- A second `SalesInvoiceItem` for delivery fees (only if `deliveryFees > 0`): `unit="خدمة"`, `quantity=1`, `unitPrice=deliveryFees`, `totalPrice=deliveryFees`, `itemType='DELIVERY'`.

**Side effects** (atomic transaction):

1. The `SalesInvoice` is created with status `SENT`.
2. The `Timesheet` is updated: `status='INVOICED'`, `invoiced=true`,
   `invoiceId=invoice.id`.
3. The JE is posted via `createSalesInvoiceJournalEntry`.

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Customer AR | `CUSTOMER_AR` | 1210 | `invoice.totalAmount` | — |
| Cr Rental Revenue | `RENTAL_REVENUE` | 6210 | — | `invoice.netAmount` (= subtotal) |
| Cr Output VAT | `VAT_OUTPUT` | 3110 | — | `invoice.vatAmount` |

If the invoice has taxable delivery fees, additional credit lines are
added (P3-BUG fix in `createSalesInvoiceJournalEntry`):

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Cr Rental Revenue (delivery) | `RENTAL_REVENUE` | 6210 | — | `deliveryAmount` |
| Cr Output VAT (delivery) | `VAT_OUTPUT` | 3110 | — | `deliveryVat` |

All JE lines are tagged with `invoice.project.costCenter.id` if the
invoice is linked to a project with a cost center (P6-HIGH-001 fix). For
rental invoices the project link is optional — when the rental contract
has no `projectId`, the JE lines have `costCenterId=null`.

**Affected reports**: rental-invoice list, invoice detail, ZATCA QR code,
AR aging, rental profitability (revenue side), VAT return (output VAT),
rental-card timeline.

---

## الخطوة 6: تحصيل الإيجار — Rental Payment (Collection)

| Field | Value |
|---|---|
| **API endpoint** | `POST /api/rental-payments` |
| **Route file** | `src/app/api/rental-payments/route.ts` (lines 71-176) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `Client` must exist. If `invoiceId` is provided, the linked `SalesInvoice` must have `invoiceType='RENTAL'` AND `clientId === payment.clientId` (the route 400s if either check fails — "الفاتورة المحددة ليست فاتورة إيجار" or "فاتورة الإيجار لا تنتمي لهذا العميل"). No status guard on the invoice (a `DRAFT` invoice would still be accepted, but in practice rental invoices are always created as `SENT`). |
| **Required input fields** | `clientId`, `amount` (>0), `date` |
| **Optional fields** | `invoiceId`, `receivedIn` (default `TREASURY`), `reference`, `notes` |
| **JE function called** | `createClientPaymentJournalEntry(paymentId, tx)` from `src/lib/auto-journal.ts:206` — the **same** function used by the construction cycle's `POST /api/client-payments`. The rental-payments route merely sets `paymentType='RENTAL'` on the `ClientPayment` row to distinguish the two API entry points; the JE logic is identical. |
| **sourceType on JE** | `CLIENT_PAYMENT` |

**Side effects** (atomic transaction):

1. A `ClientPayment` row is created with `paymentType='RENTAL'`.
2. `createClientPaymentJournalEntry` posts the JE.
3. If `invoiceId` was provided, the linked `SalesInvoice.paidAmount` is
   incremented by `payment.amount` and the status transitions:
   - `paidAmount >= totalAmount` → `PAID`
   - `0 < paidAmount < totalAmount` → `PARTIALLY_PAID`

**Journal entry lines**:

| Line | Account role | Account code | Dr | Cr |
|---|---|---|---|---|
| Dr Cash/Bank | explicit `receivingAccountId`, else `CASH` (role default) | 1110 (or 1120) | `payment.amount` | — |
| Cr Customer AR | `CUSTOMER_AR` | 1210 | — | `payment.amount` |

Both lines tagged with `payment.invoice.project.costCenter.id` if the
linked invoice has a project with a cost center (P6-HIGH-002 fix). For
rental invoices without a project link, the lines have `costCenterId=null`.

**Affected reports**: rental-payments list, client-payments list (combined
view — `paymentType` distinguishes), AR aging, rental cash-flow, rental
profitability (collection side).

---

## الخطوة 7 (اختياري): إرجاع المعدة — Optional Return

| Field | Value |
|---|---|
| **API endpoint** | `PATCH /api/delivery-orders` with body `{ id, status: 'RETURNED' }` |
| **Route file** | `src/app/api/delivery-orders/route.ts` (lines 172-262) |
| **Authz** | `requireRoleApi('ADMIN', 'ACCOUNTANT')` |
| **Prerequisites** | A `DELIVERED` delivery order exists for the equipment. |
| **JE function called** | **None** |
| **Side effect** | If the equipment is not currently `RENTED`, its status flips back to `AVAILABLE`. If it is still `RENTED` (the rental contract has not been cancelled/expired), the equipment status is left alone — the rental contract owns the status until the contract itself is cancelled or expires. |

The return step is optional in the sense that a rental contract may have
multiple delivery orders over its lifetime (e.g. equipment retrieved for
maintenance and re-delivered). Each delivery order independently
transitions `PENDING → DELIVERED → RETURNED`. The rental contract itself
ends when its status is set to `EXPIRED` or `CANCELLED` (no JE on either
transition).

---

## التحقق من اكتمال الدورة — Cycle Completion Verification

After running all 6 steps for a single rental cycle, the following must hold:

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

### 3. أرصدة دورة التأجير صحيحة — Rental Cycle Account Balances

For a rental with `purchasePrice=P`, `hourlyRate=H`, `operatingHours=OH`,
`vatRate=V`:

| Account role | Expected balance (after cycle) |
|---|---|
| `FIXED_ASSET` (Dr) | + P (only if equipment had purchasePrice>0) |
| `CASH` (Dr) | + payment.amount − P (collection in, purchase out) |
| `CUSTOMER_AR` (Dr) | = invoice.totalAmount − payment.amount (zero after full collection) |
| `RENTAL_REVENUE` (Cr) | + invoice.netAmount (= OH × H) |
| `VAT_OUTPUT` (Cr) | + invoice.vatAmount (= OH × H × V) |

### 4. روابط المصدر ↔ القيد سليمة — Source ↔ JE Linkage Integrity

Every operational source document that posts a JE must have a non-null
`journalEntryId`:

| Model | Field | Set by |
|---|---|---|
| `Equipment` | `journalEntryId` | `autoEntryEquipmentPurchase` (only when `purchasePrice > 0`) |
| `EquipmentRental` | (none) | NO JE — rental contract is a commitment |
| `EquipmentDeliveryOrder` | (none) | NO JE — delivery is operational |
| `Timesheet` | (none) | NO JE — timesheet is a measurement |
| `SalesInvoice` | `journalEntryId` | `createSalesInvoiceJournalEntry` (called by `generate-invoice`) |
| `ClientPayment` | `journalEntryId` | `createClientPaymentJournalEntry` |

### 5. التحقق العددي الشامل — Numerical Consistency (I1-I7)

`verifyNumericalConsistency()` returns `{ ok: true, diffs: [] }` — the
trial balance ties, the accounting equation holds, GL closing balances
match trial-balance signed balances per account, and the raw aggregate
matches the trial-balance totals (no orphan lines).

### 6. قيد شراء المعدة يُحدِّث `equipment.journalEntryId` — Equipment Purchase JE Linked

When `purchasePrice > 0`, the equipment row's `journalEntryId` foreign
key must point to the posted JE. The JE's `sourceType='EQUIPMENT_PURCHASE'`
and `sourceId=equipment.code` (NOT `equipment.id`) — this is a quirk of
the engine.ts helper.

---

## ملخص القيود اليومية — Journal Entry Summary

| Step | Source doc | sourceType | Dr | Cr | Notes |
|---|---|---|---|---|---|
| 1 | Equipment (purchasePrice>0) | `EQUIPMENT_PURCHASE` | FIXED_ASSET | CASH (or SUPPLIER_AP if supplier provided) | Only posted when purchasePrice>0; sourceId=equipment.code |
| 2 | EquipmentRental | — | — | — | NO JE — commitment only; equipment status → RENTED if status=ACTIVE |
| 3 | EquipmentDeliveryOrder | — | — | — | NO JE — operational; equipment status → IN_USE only if currently AVAILABLE |
| 4 | Timesheet | — | — | — | NO JE — measurement; transitions DRAFT→SUBMITTED→APPROVED |
| 5 | SalesInvoice (from timesheet) | `SALES_INVOICE` | CUSTOMER_AR | RENTAL_REVENUE + VAT_OUTPUT (+ extra lines if delivery fees) | Invoice created directly as SENT; JE posted in same tx |
| 6 | ClientPayment (paymentType=RENTAL) | `CLIENT_PAYMENT` | CASH (or BANK) | CUSTOMER_AR | Reuses createClientPaymentJournalEntry; updates invoice.paidAmount + status |
| 7 | DeliveryOrder RETURNED | — | — | — | NO JE — optional; equipment → AVAILABLE only if not RENTED |

---

## قيود التفرد — Uniqueness Constraints

| Constraint | Scope | Effect |
|---|---|---|
| `Equipment.code` | system-wide | Two equipment records cannot share the same `EQ-NNN` code. The route retries 3× on P2002 before failing (P3-CRIT-009). |
| `EquipmentRental.contractId` | system-wide | One-to-one with `Contract` — each rental has exactly one parent contract. |
| `Timesheet @@unique([rentalId, year, month])` | per-rental | One timesheet per rental per month. The route also double-checks this in JS before relying on the DB constraint (P3-MED-003). |
| `SalesInvoice.timesheetId` | system-wide | One-to-one with `Timesheet` — each approved timesheet produces at most one rental invoice. |
| `SalesInvoice.invoiceNo` | system-wide | Two invoices cannot share the same `RNT-NNNN` number. |

---

## بوابات سير العمل — Business-Flow Validation Gates

| Gate | Function | Required for | Checks |
|---|---|---|---|
| `canCreateDeliveryOrder(rentalId)` | `src/lib/business-flow/engine.ts:425` | Step 3 (when rentalId provided) | Rental exists, client exists, equipment exists, contract is ACTIVE or DRAFT, salesOrderNo is set |
| `canCreateTimesheet(rentalId)` | `src/lib/business-flow/engine.ts:362` | Step 4 (called by UI; route does its own ACTIVE check) | Rental exists, client exists, at least one delivery order in DELIVERED or PENDING status |
| `canCreateInvoice('TIMESHEET', timesheetId)` | `src/lib/business-flow/engine.ts:243` | Step 5 (called by UI; generate-invoice endpoint does its own 4-gate check) | Timesheet status=APPROVED, no existing invoice linked |
| Inline 4-gate check in `generate-invoice` | `src/app/api/equipment/timesheets/[id]/generate-invoice/route.ts:53-107` | Step 5 (server-side enforcement) | Contract ACTIVE, DELIVERED delivery order exists, timesheet APPROVED, timesheet.invoiced=false, no existing invoice |

---

## خريطة الملفات — File Map

| Concern | Path |
|---|---|
| Equipment API | `src/app/api/equipment/route.ts`, `src/app/api/equipment/[id]/route.ts` |
| Rental-contract API | `src/app/api/equipment/rental-contracts/route.ts`, `src/app/api/equipment/rental-contracts/[id]/route.ts` |
| Delivery-order API | `src/app/api/delivery-orders/route.ts`, `src/app/api/delivery-orders/[id]/route.ts` |
| Timesheet API | `src/app/api/equipment/timesheets/route.ts`, `src/app/api/equipment/timesheets/[id]/route.ts` |
| Generate-invoice API | `src/app/api/equipment/timesheets/[id]/generate-invoice/route.ts` |
| Rental-payment API | `src/app/api/rental-payments/route.ts`, `src/app/api/rental-payments/[id]/route.ts` |
| Auto-journal (sales invoice + client payment) | `src/lib/auto-journal.ts` (`createSalesInvoiceJournalEntry`, `createClientPaymentJournalEntry`) |
| Auto-journal (equipment purchase) | `src/lib/accounting/engine.ts` (`autoEntryEquipmentPurchase`) |
| Posting guard (R1-R12, entryNo) | `src/lib/accounting/guard.ts` |
| Accounting queries (SSOT) | `src/lib/accounting/queries.ts` |
| Business-flow gates | `src/lib/business-flow/engine.ts` (`canCreateDeliveryOrder`, `canCreateTimesheet`, `canCreateInvoice`) |
| Account-role resolver | `src/lib/account-roles.ts` |
| Prisma schema | `prisma/schema.prisma` (Equipment, EquipmentRental, EquipmentDeliveryOrder, Timesheet, SalesInvoice, ClientPayment, Contract) |
| E2E test | `scripts/e2e-rental-cycle.ts` |
