# Phase 5 Audit — Supply Chain Cycle (سلسلة التوريد)

**Auditor:** Supply Chain Cycle Deep Auditor (Task 5-a, READ-ONLY)
**Scope:** Supplier, PurchaseRequest, PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, PurchaseInvoice, PurchaseInvoiceItem, SupplierPayment, Warehouse, InventoryItem, StockMovement, EquipmentCost (project-destination leg of GR) — all API routes + accounting integration + UI data-fetching correctness + dead-code inventory.
**Method:** Static code analysis + schema review + JE-flow tracing + cross-reference with `src/lib/accounting/{engine,guard,period-guard}.ts`, `src/lib/account-roles.ts`, `src/lib/auto-journal.ts`, `src/app/api/{suppliers,purchase-requests,purchase-orders,purchase-invoices,supplier-invoices,goods-receipt,supplier-payments,inventory,warehouses,dashboard,account-statement/supplier,reports/supplier-balances,reports/aging}/route.ts`. Cross-checked with prior phase reports (01–04) to avoid duplicating already-fixed issues. Grep-verified every "zero writer", "no caller", "hardcoded code" claim.
**Note:** No source files modified — read-only audit. Phase 1–4 fixes (e.g. unified `reverseEntry`, period guard, salary-payment idempotency, LaborCost JE link) are explicitly excluded.

---

## Executive Summary

| Severity | Count |
|---|---|
| CRITICAL | 15 |
| HIGH | 16 |
| MEDIUM | 16 |
| LOW | 10 |
| **Total** | **57** |

- **Files audited:** 13 schema models + 22 API route files (11 entities × ~2 routes) + 8 UI modules + 6 lib files cross-referenced + dashboard + supplier account-statement + 2 report endpoints.
- **Top architectural finding:** The PurchaseInvoice model has **two parallel JE generators** (`createPurchaseInvoiceJournalEntry` in `auto-journal.ts` vs `autoEntryPurchaseInvoice` in `engine.ts`) with **divergent account-mapping logic** — POST-time uses simple `projectId ? PROJECT_COST : MAINTENANCE_EXPENSE`, PUT-time uses a 17-category `expenseCategory` role map. Editing an invoice's amounts after creation can flip the debit account from `7110` to `7220` (or vice versa) with no audit warning.
- **Top accounting-integrity finding:** Both PurchaseInvoice POST routes (`/api/purchase-invoices` and `/api/supplier-invoices`) call `createPurchaseInvoiceJournalEntry` **at DRAFT creation** — meaning a DRAFT, un-approved invoice has a posted JE in the GL. Combined with `supplier-invoices/[id] DELETE` doing a hard-delete without reversing that JE, the GL accumulates orphaned JEs that reference deleted invoices.
- **Top state-machine finding:** `supplier-payments` POST allows paying **any** purchase invoice regardless of status (DRAFT, PAID, CANCELLED) — there is no status guard and no overpayment check. A direct API call can un-CANCEL an invoice by paying it, or double-pay a PAID invoice.
- **Top dead-infrastructure finding:** The `StockMovement` model (with `journalEntryId`, `movementType`, `reference` fields) has **zero writers and zero API endpoints** anywhere in the codebase. Inventory receipts/issues/transfers/adjustments are never recorded — the entire inventory audit trail is dark. Same for `Material` / `MaterialIssue` (models don't even exist).
- **Top missing-JE-link finding:** `EquipmentCost` records created by the goods-receipt flow (project-destination items) have `journalEntryId String?` on the schema but the route never sets it — exact mirror of the Phase-4 `LaborCost` bug (P4-CRIT-005).
- **Top FK-crash finding:** `/api/suppliers/[id]/accounting/route.ts` filters `db.journalEntry.findMany({where: {supplierId: id}})` — but `JournalEntry` has **no `supplierId` field**. This is a hard Prisma runtime crash ("Unknown argument `supplierId`") on every call.

---

## CRITICAL Issues (must fix before any production use)

### P5-CRIT-001: DRAFT Purchase Invoices have posted JEs in the GL
- **Severity:** CRITICAL
- **Location:**
  - `src/app/api/purchase-invoices/route.ts:131` — `await createPurchaseInvoiceJournalEntry(invoice.id, tx)` called inside the POST `$transaction`, immediately after `tx.purchaseInvoice.create({data: {..., status: 'DRAFT'}})` (line 110).
  - `src/app/api/supplier-invoices/route.ts:186` — same call, same pattern (status='DRAFT' at line 170, JE created at line 186).
- **Description:** Both POST routes create the PurchaseInvoice with `status: 'DRAFT'` AND immediately call `createPurchaseInvoiceJournalEntry(invoice.id, tx)` inside the same transaction. The JE is posted to the GL while the invoice is still in DRAFT state — meaning:
  - Trial balance and P&L include un-approved purchase costs.
  - Supplier AP balance includes un-approved invoices.
  - Input VAT (3120) is claimed before the invoice is approved — VAT compliance issue.
  - The `supplier-invoices/[id]/route.ts:91-114` DRAFT→SENT branch checks `if (!journalEntryId)` and skips JE creation — but `journalEntryId` is already set from POST, so the "approval" transition is a no-op for accounting. The UI toast at `supplier-invoices.tsx:298` says "تم اعتماد الفاتورة وإنشاء القيد المحاسبي" (invoice approved and accounting entry created) but no new JE is created.
- **Accounting impact:** R1 violated in spirit (DRAFT ≠ financial operation). GL inflates expenses, AP, and input VAT for every DRAFT invoice. Auditor cannot distinguish approved vs unapproved purchases in the GL.
- **Evidence:**
  ```bash
  $ rg -n "status: 'DRAFT'" src/app/api/purchase-invoices/route.ts src/app/api/supplier-invoices/route.ts
  src/app/api/purchase-invoices/route.ts:110:          status: 'DRAFT',
  src/app/api/supplier-invoices/route.ts:170:          status: 'DRAFT',
  $ rg -n "createPurchaseInvoiceJournalEntry" src/app/api/purchase-invoices/route.ts src/app/api/supplier-invoices/route.ts
  src/app/api/purchase-invoices/route.ts:131:      await createPurchaseInvoiceJournalEntry(invoice.id, tx)
  src/app/api/supplier-invoices/route.ts:186:      await createPurchaseInvoiceJournalEntry(invoice.id, tx)
  ```
- **How to verify practically:**
  ```bash
  # Create a DRAFT purchase invoice (no GR, no approval)
  curl -X POST http://localhost:3000/api/purchase-invoices -H 'Content-Type: application/json' -d '{
    "supplierId":"<SUP-001-id>","date":"2025-01-15","dueDate":"2025-02-15",
    "items":[{"description":"test","quantity":1,"unitPrice":1000}],"vatRate":0.15
  }'
  # DB check: invoice is DRAFT but has journalEntryId
  sqlite3 prisma/dev.db "SELECT invoiceNo, status, journalEntryId FROM PurchaseInvoice ORDER BY createdAt DESC LIMIT 1;"
  # Expect: PI-XXXX|DRAFT|<non-null-JE-id>
  sqlite3 prisma/dev.db "SELECT je.entryNo, je.status, SUM(jl.debit), SUM(jl.credit)
                          FROM JournalEntry je JOIN JournalLine jl ON jl.journalEntryId=je.id
                          WHERE je.sourceType='PURCHASE_INVOICE' GROUP BY je.id ORDER BY je.date DESC LIMIT 1;"
  # Expect: JE-NNNNNN|POSTED|1150.00|1150.00  ← JE exists for a DRAFT invoice
  ```
- **Recommended fix:** Remove the `createPurchaseInvoiceJournalEntry(invoice.id, tx)` call from both POST routes. Move JE creation to the DRAFT→SENT transition in `supplier-invoices/[id]/route.ts:91-114` (which already has the correct `if (!journalEntryId)` guard). For `/api/purchase-invoices`, add a similar PUT-with-status handler or merge with `/api/supplier-invoices/[id]` PUT. A DRAFT invoice must never have a `journalEntryId`.

### P5-CRIT-002: supplier-invoices/[id] DELETE hard-deletes DRAFT invoice without reversing its JE
- **Severity:** CRITICAL
- **Location:** `src/app/api/supplier-invoices/[id]/route.ts:256-290` (DELETE handler)
- **Description:** The DELETE handler checks `if (existing.status !== 'DRAFT') return 400` (line 272) — so only DRAFT invoices can be deleted. But because of P5-CRIT-001, DRAFT invoices already have a posted JE (`journalEntryId` is set). The DELETE handler then:
  ```ts
  await db.$transaction(async (tx) => {
    await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
    await tx.purchaseInvoice.delete({ where: { id } })
  })
  ```
  No `reverseEntry(existing.journalEntryId, tx)` call. The JE remains POSTED in the GL, but its `sourceId` (the invoice ID) no longer exists. The journal lines still debit Cost / Input VAT and credit Supplier AP — the GL permanently overstates expenses, AP, and input VAT.
- **Accounting impact:** R1 + R9 violated. Orphaned JEs accumulate in GL with `sourceId` pointing to deleted records. Trial balance inflates forever. Auditor cannot reconcile GL to operational data.
- **Evidence:**
  ```bash
  $ rg -n "reverseEntry|journalEntryId" src/app/api/supplier-invoices/[id]/route.ts
  # (no matches in DELETE handler — only in PUT handler)
  $ rg -n "tx.purchaseInvoice.delete" src/app/api/supplier-invoices/[id]/route.ts
  282:      await tx.purchaseInvoice.delete({ where: { id } })
  ```
  Contrast with `/api/purchase-invoices/[id]/route.ts:67-84` which correctly reverses the JE before cancelling.
- **How to verify practically:**
  ```bash
  # 1. Create a supplier invoice (becomes DRAFT with JE per P5-CRIT-001)
  INV_ID=$(curl -s -X POST http://localhost:3000/api/supplier-invoices -H 'Content-Type: application/json' -d '{...}' | jq -r .id)
  JE_ID=$(sqlite3 prisma/dev.db "SELECT journalEntryId FROM PurchaseInvoice WHERE id='$INV_ID';")
  # 2. Delete the DRAFT invoice
  curl -X DELETE http://localhost:3000/api/supplier-invoices/$INV_ID
  # 3. DB check: invoice is gone, but JE still POSTED
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM PurchaseInvoice WHERE id='$INV_ID';"  # 0
  sqlite3 prisma/dev.db "SELECT entryNo, status FROM JournalEntry WHERE id='$JE_ID';"  # JE-NNNNNN|POSTED  ← orphaned
  ```
- **Recommended fix:** Mirror `/api/purchase-invoices/[id]/route.ts` DELETE — soft-cancel (status=CANCELLED) + `reverseEntry(existing.journalEntryId, tx)` inside the transaction. Or, if hard-delete is required for DRAFT, reverse the JE first:
  ```ts
  await db.$transaction(async (tx) => {
    if (existing.journalEntryId) {
      await reverseEntry(existing.journalEntryId, tx)
    }
    await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: id } })
    await tx.purchaseInvoice.delete({ where: { id } })
  })
  ```

### P5-CRIT-003: supplier-invoices/[id] PUT with status=CANCELLED does not reverse JE
- **Severity:** CRITICAL
- **Location:** `src/app/api/supplier-invoices/[id]/route.ts:136-149` (the "Other status changes" branch)
- **Description:** The status-change branch handles `PARTIALLY_PAID`, `PAID`, and `CANCELLED` identically — a single `db.purchaseInvoice.update({where: {id}, data: {status: body.status}})` call. For `CANCELLED`, this leaves the original JE POSTED. The invoice is marked CANCELLED (operationally invisible) but the GL still shows the full Dr Cost / Dr Input VAT / Cr Supplier AP.
- **Accounting impact:** R1 + R12 violated. Cancelled invoices keep their GL impact. Supplier AP overstated. Input VAT claimed on a cancelled purchase (VAT compliance issue — VAT cannot be claimed on cancelled invoices).
- **Evidence:**
  ```bash
  $ rg -n "CANCELLED" src/app/api/supplier-invoices/[id]/route.ts
  7:  CANCELLED: [], // Terminal state
  78:        if (existing.status === 'CANCELLED') {
  153:      return NextResponse.json({ error: 'لا يمكن تعديل فاتورة ملغاة' }, { status: 400 })
  272:      if (existing.status !== 'DRAFT') {  # DELETE only allows DRAFT
  # Line 137-147 — the "Other status changes" branch — has NO reverseEntry call for CANCELLED
  ```
- **How to verify practically:**
  ```bash
  # 1. Create + approve a supplier invoice (SENT status, JE posted)
  # 2. Cancel it via PUT
  curl -X PUT http://localhost:3000/api/supplier-invoices/$INV_ID -H 'Content-Type: application/json' -d '{"status":"CANCELLED"}'
  # 3. DB check: invoice status=CANCELLED, but JE still POSTED (no reversal entry)
  sqlite3 prisma/dev.db "SELECT status, journalEntryId FROM PurchaseInvoice WHERE id='$INV_ID';"  # CANCELLED|<je-id>
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM JournalEntry WHERE reversedEntryId='$JE_ID';"  # 0 — no reversal
  ```
- **Recommended fix:** In the `body.status === 'CANCELLED'` branch, wrap the update in `$transaction` and call `reverseEntry(existing.journalEntryId, tx)` if `journalEntryId` is set.

### P5-CRIT-004: goods-receipt/[id] DELETE does not reverse the GRNI journal entry
- **Severity:** CRITICAL
- **Location:** `src/app/api/goods-receipt/[id]/route.ts:157-200` (DELETE handler)
- **Description:** The DELETE handler checks `existing.status === 'COMPLETED'` (returns 400) and `linkedInvoice` (returns 400). For PENDING/PARTIAL receipts without a linked invoice, it hard-deletes:
  ```ts
  await db.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } })
  await db.goodsReceipt.delete({ where: { id } })
  ```
  But the POST handler (`goods-receipt/route.ts:184-233`) creates a GRNI journal entry (Dr Inventory / Dr Project Cost / Cr GRNI) and stores `journalEntryId` on the receipt. The DELETE handler does NOT call `reverseEntry`. The JE remains POSTED — Inventory (1340) and GRNI (3330) are permanently overstated.
- **Accounting impact:** R1 + R12 violated. Inventory asset overstated. GRNI liability overstated. Trial balance appears balanced (Dr and Cr both over by the same amount) but the underlying subledgers are wrong. If a project-cost leg was used, PROJECT_COST (7110) is also overstated.
- **Evidence:**
  ```bash
  $ rg -n "reverseEntry|journalEntryId" src/app/api/goods-receipt/[id]/route.ts
  # (no matches in DELETE or PUT handlers)
  $ rg -n "journalEntryId" src/app/api/goods-receipt/route.ts
  231:          data: { journalEntryId: je.id },  # POST sets it
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a goods receipt (creates GRNI JE)
  GR_ID=$(curl -s -X POST http://localhost:3000/api/goods-receipt -H 'Content-Type: application/json' -d '{...}' | jq -r .id)
  JE_ID=$(sqlite3 prisma/dev.db "SELECT journalEntryId FROM GoodsReceipt WHERE id='$GR_ID';")
  # 2. Delete the PENDING receipt
  curl -X DELETE http://localhost:3000/api/goods-receipt/$GR_ID
  # 3. DB check: receipt gone, JE still POSTED
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM GoodsReceipt WHERE id='$GR_ID';"  # 0
  sqlite3 prisma/dev.db "SELECT entryNo, status FROM JournalEntry WHERE id='$JE_ID';"  # JE-GR-...|POSTED  ← orphaned
  # 4. Inventory quantity was incremented at POST but never decremented at DELETE
  sqlite3 prisma/dev.db "SELECT code, quantity FROM InventoryItem WHERE name='<item-description>';"  # still incremented
  ```
- **Recommended fix:** Wrap DELETE in `$transaction`:
  ```ts
  await db.$transaction(async (tx) => {
    if (existing.journalEntryId) {
      await reverseEntry(existing.journalEntryId, tx)
    }
    // Reverse inventory increments (need to re-read items and decrement)
    const items = await tx.goodsReceiptItem.findMany({ where: { goodsReceiptId: id } })
    for (const item of items) {
      if (item.destination === 'INVENTORY') {
        const inv = await tx.inventoryItem.findFirst({ where: { name: item.description } })
        if (inv) await tx.inventoryItem.update({ where: { id: inv.id }, data: { quantity: { decrement: item.quantityReceived } } })
      }
    }
    await tx.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: id } })
    await tx.goodsReceipt.delete({ where: { id } })
  })
  ```

### P5-CRIT-005: goods-receipt/[id] PUT allows item edits without reversing inventory increments or GRNI JE
- **Severity:** CRITICAL
- **Location:** `src/app/api/goods-receipt/[id]/route.ts:37-155` (PUT handler, general update path at lines 109-148)
- **Description:** The PUT handler has three paths:
  1. `status === 'COMPLETED' && body.status === 'CANCELLED'` (line 56-67) — sets status to CANCELLED, **no JE reversal, no inventory decrement**.
  2. `body.status === 'COMPLETED'` (line 95-107) — sets status to COMPLETED, no other action.
  3. General update (line 109-148) — updates notes/date/status, and if `body.items` is provided (only allowed when no linked invoice), it `deleteMany: {}` + `create: items` — but does NOT:
     - Decrement inventory by the OLD `quantityReceived` values.
     - Increment inventory by the NEW `quantityReceived` values.
     - Reverse the original GRNI JE.
     - Create a new GRNI JE with the new totals.
  The result: inventory quantity drifts further from reality on every edit, and the GRNI JE reflects the original receipt totals, not the edited ones.
- **Accounting impact:** R1 violated (JE doesn't match operational reality). Inventory subledger diverges from GL. Project costs (if PROJECT destination) don't match actual receipt.
- **Evidence:**
  ```bash
  $ rg -n "deleteMany|create: body.items" src/app/api/goods-receipt/[id]/route.ts
  121:          items: {
  122:            deleteMany: {},
  123:            create: body.items.map(...)
  # No reverseEntry, no inventoryItem.update, no createJournalEntry in the PUT handler
  ```
- **How to verify practically:**
  ```bash
  # 1. Create GR with item: quantityReceived=100, unitPrice=10 → inventory +100, GRNI JE=1000
  # 2. Edit the GR: change quantityReceived from 100 to 50
  curl -X PUT http://localhost:3000/api/goods-receipt/$GR_ID -H 'Content-Type: application/json' -d '{
    "items":[{"description":"...","quantityReceived":50,"unitPrice":10,...}]
  }'
  # 3. DB check: inventory still +100 (not decremented to 50), GRNI JE still 1000 (not 500)
  sqlite3 prisma/dev.db "SELECT quantity FROM InventoryItem WHERE name='...';"  # 100 (wrong, should be 50)
  sqlite3 prisma/dev.db "SELECT SUM(credit) FROM JournalLine WHERE journalEntryId='$JE_ID';"  # 1000 (wrong)
  ```
- **Recommended fix:** Forbid item edits after the GRNI JE is posted (require DELETE + recreate). Or, in the PUT, mirror the POST's logic: reverse old JE, decrement old inventory, apply new items, create new JE.

### P5-CRIT-006: Two divergent JE generators for PurchaseInvoice produce different account mappings
- **Severity:** CRITICAL
- **Location:**
  - `src/lib/auto-journal.ts:116-160` — `createPurchaseInvoiceJournalEntry`: uses `accountId`, selects cost account by `projectId ? PROJECT_COST : MAINTENANCE_EXPENSE` only. No `expenseCategory` awareness. No `costCenterId` on lines.
  - `src/lib/accounting/engine.ts:532-592` — `autoEntryPurchaseInvoice`: uses `accountCode`, selects cost account via a 17-entry `categoryRoleMap` keyed by `expenseCategory` (CONSUMABLES→PROJECT_COST, SERVICES→SUBCONTRACTOR_COST, MAINTENANCE→MAINTENANCE_EXPENSE, FUEL→FUEL_EXPENSE, etc.). Includes `costCenterId` if provided. Has hardcoded fallback codes (`|| '8630'`, `|| '3210'`, `|| '3120'`).
  - Callers:
    - POST `/api/purchase-invoices` (line 131) → `createPurchaseInvoiceJournalEntry`
    - POST `/api/supplier-invoices` (line 186) → `createPurchaseInvoiceJournalEntry`
    - PUT `/api/supplier-invoices/[id]` (lines 99, 185) → `autoEntryPurchaseInvoice`
- **Description:** Depending on whether you CREATE or EDIT a purchase invoice, a different JE generator runs. A purchase invoice with `expenseCategory='FUEL'`, `projectId=null`:
  - **POST** (createPurchaseInvoiceJournalEntry): Dr MAINTENANCE_EXPENSE (7220) — because `projectId` is null.
  - **PUT** (autoEntryPurchaseInvoice, on amount edit): Dr FUEL_EXPENSE (7210) — because `expenseCategory='FUEL'`.
  The reversal+recreate flow in `supplier-invoices/[id]/route.ts:166-225` reverses the POST-time JE (which debited 7220) and creates a new PUT-time JE (which debits 7210). The net effect on 7220 is `-subtotal`, the net effect on 7210 is `+subtotal`. Trial balance moves money between expense accounts silently.
- **Accounting impact:** Inconsistent account mapping. Auditor cannot predict which account a purchase invoice hits based on its data alone — must also know whether it was ever edited. Project profitability reports that filter by specific expense accounts will be wrong.
- **Evidence:**
  ```bash
  $ rg -n "projectId.*PROJECT_COST.*MAINTENANCE_EXPENSE|expenseCategory.*categoryRoleMap" src/lib/auto-journal.ts src/lib/accounting/engine.ts
  src/lib/auto-journal.ts:128:  const costAccount = invoice.projectId
  src/lib/auto-journal.ts:129:    ? await getDefaultAccountByRole(AccountRole.PROJECT_COST, tx)
  src/lib/auto-journal.ts:130:    : await getDefaultAccountByRole(AccountRole.MAINTENANCE_EXPENSE, tx)
  src/lib/accounting/engine.ts:546:  const categoryRoleMap: Record<string, string> = {
  src/lib/accounting/engine.ts:567:  const expenseRole = data.expenseCategory ? (categoryRoleMap[data.expenseCategory] || AccountRole.ADMIN_EXPENSE) : AccountRole.ADMIN_EXPENSE
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a purchase invoice with expenseCategory=FUEL, no projectId
  curl -X POST http://localhost:3000/api/purchase-invoices -H 'Content-Type: application/json' -d '{
    "supplierId":"...","date":"2025-01-15","dueDate":"2025-02-15",
    "expenseCategory":"FUEL",
    "items":[{"description":"diesel","quantity":100,"unitPrice":10}],"vatRate":0.15
  }'
  # POST JE: Dr 7220 (MAINTENANCE_EXPENSE) 1000 / Dr 3120 150 / Cr 3210 1150
  # 2. Edit the invoice amount (triggers PUT autoEntryPurchaseInvoice)
  curl -X PUT http://localhost:3000/api/purchase-invoices -H 'Content-Type: application/json' -d '{
    "id":"<inv-id>","subtotal":2000,"vatAmount":300,"totalAmount":2300
  }'
  # PUT reversal: Cr 7220 1000 / Cr 3120 150 / Dr 3210 1150
  # PUT new JE: Dr 7210 (FUEL_EXPENSE) 2000 / Dr 3120 300 / Cr 3210 2300
  # Net: 7220 = -1000, 7210 = +2000, 3120 = +150, 3210 = +1150
  sqlite3 prisma/dev.db "SELECT a.code, SUM(jl.debit)-SUM(jl.credit) FROM JournalLine jl JOIN Account a ON a.id=jl.accountId WHERE jl.journalEntryId IN (SELECT id FROM JournalEntry WHERE sourceId='<inv-id>' OR sourceId='PI-XXXX') GROUP BY a.code;"
  # Expect: 7210|2000, 7220|-1000, 3120|150, 3210|1150  ← split across two expense accounts
  ```
- **Recommended fix:** Pick ONE generator. Migrate `autoEntryPurchaseInvoice` (engine.ts) to use the same `accountId`-based, `expenseCategory`-aware logic, OR migrate `createPurchaseInvoiceJournalEntry` (auto-journal.ts) to accept `expenseCategory` and use the role map. Delete the other. All callers (POST + PUT) must use the same function. Strip the hardcoded `|| '8630'` / `|| '3210'` / `|| '3120'` fallbacks — use `requireAccountByRole` which throws a descriptive error if no role-mapped account exists.

### P5-CRIT-007: suppliers/[id]/accounting filters JournalEntry by non-existent `supplierId` field → runtime crash
- **Severity:** CRITICAL
- **Location:** `src/app/api/suppliers/[id]/accounting/route.ts:40-49`
- **Description:** The route executes:
  ```ts
  const journalCount = await db.journalEntry.count({
    where: { supplierId: id, deletedAt: null },
  })
  const lastEntry = await db.journalEntry.findFirst({
    where: { supplierId: id, deletedAt: null },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  ```
  But the `JournalEntry` model (schema.prisma:1800-1824) has **no `supplierId` field**. Prisma throws `Unknown argument 'supplierId'` at runtime → the entire route returns 500. The "supplier accounting summary" card in the UI is permanently broken.
- **Accounting impact:** Supplier accounting summary (current balance, JE count, last transaction date) is unreachable. The `currentBalance` is computed from PurchaseInvoice + SupplierPayment aggregates (lines 27-37), so it actually works — but `journalEntryCount` and `lastTransactionDate` always crash.
- **Evidence:**
  ```bash
  $ rg -n "^  supplierId" prisma/schema.prisma | head
  # (no match on JournalEntry — only on PurchaseOrder, GoodsReceipt, PurchaseInvoice, SupplierPayment, Equipment, EquipmentMaintenance)
  $ rg -n "model JournalEntry" prisma/schema.prisma
  1800:model JournalEntry {
  # Read fields: id, entryNo, date, description, status, sourceType, sourceId, isReversal, reversedEntryId, isSystem, createdAt, updatedAt, deletedAt — NO supplierId
  $ rg -n "supplierId" src/app/api/suppliers/[id]/accounting/route.ts
  41:      where: { supplierId: id, deletedAt: null },
  46:      where: { supplierId: id, deletedAt: null },
  ```
- **How to verify practically:**
  ```bash
  curl -s http://localhost:3000/api/suppliers/<any-supplier-id>/accounting
  # Expect: 500 with "Unknown argument 'supplierId'" in dev server log
  ```
- **Recommended fix:** Either (a) add a `supplierId String?` field on `JournalEntry` and set it from `createPurchaseInvoiceJournalEntry` / `createSupplierPaymentJournalEntry`, OR (b) query JEs by `sourceType IN ('PURCHASE_INVOICE','SUPPLIER_PAYMENT')` joined to PurchaseInvoice/SupplierPayment tables filtered by `supplierId`. Option (b) is a single SQL query:
  ```ts
  const journalCount = await db.journalEntry.count({
    where: {
      OR: [
        { sourceType: 'PURCHASE_INVOICE', sourceId: { in: invoiceIds } },
        { sourceType: 'SUPPLIER_PAYMENT', sourceId: { in: paymentIds } },
      ],
      deletedAt: null,
    },
  })
  ```

### P5-CRIT-008: suppliers/[id] DELETE hard-deletes with no FK pre-flight → 500 on any supplier with related records
- **Severity:** CRITICAL
- **Location:** `src/app/api/suppliers/[id]/route.ts:48-57`
- **Description:** The DELETE handler does:
  ```ts
  await db.supplier.delete({ where: { id } })
  ```
  No pre-flight check. The schema has 6 relations with `onDelete: Restrict` on Supplier:
  - `PurchaseOrder.supplier` (line 1135)
  - `PurchaseInvoice.supplier` (line 1242)
  - `GoodsReceipt.supplier` (line 1180)
  - `SupplierPayment.supplier` (line 1958)
  - `Equipment.supplier` (line ~1426)
  - `EquipmentMaintenance.supplier`
  Any of these existing → Prisma throws `Foreign key constraint failed on the field: supplierId` → 500. The user sees only "فشل في حذف المورد" with no actionable info.
- **Accounting impact:** Not directly an accounting issue, but operationally the route is unusable for any supplier that has ever transacted. Combined with the absence of soft-delete, this means suppliers cannot be retired — only deactivated via `isActive: false` (which the PUT route does support).
- **Evidence:**
  ```bash
  $ rg -n "onDelete: Restrict" prisma/schema.prisma | rg -i supplier
  1135:  supplier        Supplier            @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  1180:  supplier        Supplier           @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  1242:  supplier      Supplier              @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  1958:  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  $ rg -n "db.supplier.delete" src/app/api/suppliers/[id]/route.ts
  51:    await db.supplier.delete({ where: { id } })
  # No pre-flight _count check, no try/catch on P2003
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a supplier, then create a PO for it
  # 2. Try to delete the supplier
  curl -X DELETE http://localhost:3000/api/suppliers/<supplier-with-po-id>
  # Expect: 500 "فشل في حذف المورد" — dev log shows P2003 foreign-key constraint
  ```
- **Recommended fix:** Mirror the Phase-4 Employee soft-delete pattern (P4-CRIT-012 fix):
  - Add `deletedAt DateTime?` to Supplier schema.
  - Pre-flight check: count POs, PIs, GRs, payments. If any exist → 400 with counts in Arabic ("لا يمكن الحذف: المورد مرتبط بـ X أمر شراء، Y فاتورة، ...").
  - If no relations → soft-delete (`deletedAt = now`, `isActive = false`).
  - GET routes filter `deletedAt: null`.

### P5-CRIT-009: supplier-payments POST allows paying DRAFT / PAID / CANCELLED invoices + no overpayment check
- **Severity:** CRITICAL (state machine hole + idempotency gap)
- **Location:** `src/app/api/supplier-payments/route.ts:62-160` (POST handler)
- **Description:** The POST handler validates:
  - `supplierId`, `amount`, `date` are present (line 67).
  - Supplier exists (line 72-77).
  - If `invoiceId` provided: invoice exists AND `invoice.supplierId === supplierId` (line 80-93).
  
  It does NOT validate:
  - **Invoice status** — a DRAFT, PAID, OVERDUE, or CANCELLED invoice can be paid.
  - **Amount vs remaining** — `amount` can exceed `invoice.totalAmount - invoice.paidAmount`.
  
  Then at lines 122-143, it unconditionally increments `paidAmount` and flips status to PARTIALLY_PAID/PAID. So:
  - Paying a CANCELLED invoice **un-cancels** it (status becomes PAID).
  - Paying a DRAFT invoice (which per P5-CRIT-001 already has a JE) adds another payment JE on top.
  - Paying a PAID invoice creates a duplicate payment JE — `paidAmount` exceeds `totalAmount`.
  - Paying more than the remaining creates a negative "remaining" — supplier owes the company money, but no UI or report reflects this.
- **Accounting impact:** R1 (every payment creates a JE) is technically honored, but the JEs are for invalid business operations. AP goes negative. Auditor cannot trust the supplier subledger.
- **Evidence:**
  ```bash
  $ rg -n "invoice.status|invoice\.status" src/app/api/supplier-payments/route.ts
  # (no matches — no status check anywhere)
  $ rg -n "amount.*remaining|amount.*totalAmount|amount.*paidAmount" src/app/api/supplier-payments/route.ts
  # (no matches — no overpayment check)
  ```
- **How to verify practically:**
  ```bash
  # 1. Create + cancel a supplier invoice
  curl -X PUT http://localhost:3000/api/supplier-invoices/$INV_ID -d '{"status":"CANCELLED"}'
  # 2. Pay the CANCELLED invoice
  curl -X POST http://localhost:3000/api/supplier-payments -d '{
    "supplierId":"...","invoiceId":"$INV_ID","amount":500,"date":"2025-01-20"
  }'
  # Expect: 201 (payment created) — invoice status flips from CANCELLED to PAID
  sqlite3 prisma/dev.db "SELECT status, paidAmount, totalAmount FROM PurchaseInvoice WHERE id='$INV_ID';"
  # PAID|500|1000  ← CANCELLED invoice is now PAID with paidAmount=500
  ```
  Also for double-payment:
  ```bash
  # Pay an already-PAID invoice again
  curl -X POST http://localhost:3000/api/supplier-payments -d '{"supplierId":"...","invoiceId":"<paid-inv>","amount":100,"date":"..."}'
  # paidAmount goes from totalAmount (1000) to 1100 — overpayment not blocked
  ```
- **Recommended fix:**
  ```ts
  if (invoiceId) {
    const invoice = await db.purchaseInvoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) return 400
    if (invoice.supplierId !== supplierId) return 400
    if (invoice.status === 'CANCELLED') return 400('لا يمكن الدفع لفاتورة ملغاة')
    if (invoice.status === 'DRAFT') return 400('لا يمكن الدفع لفاتورة مسودة — اعتمد الفاتورة أولاً')
    if (invoice.status === 'PAID') return 400('الفاتورة مدفوعة بالكامل')
    const remaining = toNumber(invoice.totalAmount) - toNumber(invoice.paidAmount)
    if (parseFloat(amount) > remaining + 0.01) return 400('المبلغ يتجاوز المتبقي على الفاتورة')
  }
  ```

### P5-CRIT-010: createPurchaseInvoiceJournalEntry + createSupplierPaymentJournalEntry do not propagate costCenterId
- **Severity:** CRITICAL
- **Location:**
  - `src/lib/auto-journal.ts:142-156` (`createPurchaseInvoiceJournalEntry`) — `lines` array has no `costCenterId` field on any line.
  - `src/lib/auto-journal.ts:249-262` (`createSupplierPaymentJournalEntry`) — same, no `costCenterId`.
  - Contrast: `createExpenseJournalEntry` at lines 298-306 DOES set `costCenterId: expense.costCenterId || undefined` on every line.
- **Description:** When a purchase invoice or supplier payment is linked to a project (via `projectId`), the corresponding JE lines have `costCenterId = null`. The dashboard's "Project Profitability" calculation (`/api/dashboard/route.ts:243-269`) filters `JournalLine` by `costCenterId IN (project cost center IDs)` — so purchase costs and AP payments linked to projects are **invisible** in project profitability reports.
- **Accounting impact:** Project P&L understates costs. A SAR 1M purchase invoice for Project A hits PROJECT_COST (7110) at the GL level, but no cost center is tagged — Project A's profitability report shows zero purchase costs, overstating margin by SAR 1M.
- **Evidence:**
  ```bash
  $ rg -n "costCenterId" src/lib/auto-journal.ts
  299:      costCenterId: expense.costCenterId || undefined,  # createExpenseJournalEntry only
  303:      costCenterId: expense.costCenterId || undefined,
  306:      costCenterId: expense.costCenterId || undefined,
  # createPurchaseInvoiceJournalEntry (116-160): zero costCenterId mentions
  # createSupplierPaymentJournalEntry (220-266): zero costCenterId mentions
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a purchase invoice linked to a project (project.costCenter exists)
  # 2. Check the JE lines
  sqlite3 prisma/dev.db "SELECT a.code, jl.debit, jl.credit, jl.costCenterId
                          FROM JournalLine jl JOIN Account a ON a.id=jl.accountId
                          WHERE jl.journalEntryId IN (
                            SELECT journalEntryId FROM PurchaseInvoice WHERE projectId IS NOT NULL
                          );"
  # Expect: costCenterId is NULL on all lines — should be the project's cost center ID
  ```
- **Recommended fix:** In `createPurchaseInvoiceJournalEntry`, fetch the project's costCenter:
  ```ts
  let costCenterId: string | null = null
  if (invoice.projectId) {
    const project = await tx.project.findUnique({
      where: { id: invoice.projectId },
      select: { costCenter: { select: { id: true } } }
    })
    costCenterId = project?.costCenter?.id ?? null
  }
  // pass costCenterId on every line
  ```
  Same for `createSupplierPaymentJournalEntry` (resolve costCenter from the linked invoice's project, if any).

### P5-CRIT-011: PurchaseOrder.paidAmount is never updated — UI shows "paid: 0" forever
- **Severity:** CRITICAL
- **Location:**
  - Schema: `prisma/schema.prisma:1127` — `paidAmount Decimal @default(0)` on PurchaseOrder.
  - Writers: `rg -n "purchaseOrder.*paidAmount.*increment|data:.*paidAmount.*purchaseOrder" src/` → **zero matches**.
  - Reader: `src/components/modules/purchase-orders.tsx:434` — `<MoneyDisplay value={order.paidAmount} .../>` and line 440 `order.totalAmount - order.paidAmount`.
- **Description:** The PurchaseOrder model has a `paidAmount` field, presumably to track how much has been paid against the order. But no code ever increments it. The supplier-payments flow updates `PurchaseInvoice.paidAmount` (not `PurchaseOrder.paidAmount`). The purchase-orders UI displays `paidAmount` (always 0) and `totalAmount - paidAmount` (always equals totalAmount) — misleading the user into thinking nothing has been paid on any PO, even when invoices have been fully paid.
- **Accounting impact:** Not a GL issue, but operational reporting is wrong. PO "remaining" is always 100% of total.
- **Evidence:**
  ```bash
  $ rg -n "paidAmount" src/app/api/purchase-orders/ src/app/api/supplier-payments/ src/app/api/purchase-invoices/
  src/app/api/supplier-payments/route.ts:127:          const newPaidAmount = toNumber(invoice.paidAmount) + (parseFloat(amount) || 0)
  src/app/api/supplier-payments/route.ts:139:              paidAmount: newPaidAmount,
  src/app/api/supplier-payments/[id]/route.ts:67:          const reversedPaidAmount = toNumber(invoice.paidAmount) - toNumber(existing.amount)
  src/app/api/supplier-payments/[id]/route.ts:79:              paidAmount: Math.max(0, reversedPaidAmount),
  src/app/api/supplier-payments/[id]/route.ts:120:          const newPaidAmount = toNumber(invoice.paidAmount) + Number(newAmount)
  src/app/api/supplier-payments/[id]/route.ts:131:              paidAmount: newPaidAmount,
  # All updates target PurchaseInvoice.paidAmount — none touch PurchaseOrder.paidAmount
  $ rg -n "order.paidAmount|po.paidAmount" src/components/modules/purchase-orders.tsx
  434:            <MoneyDisplay value={order.paidAmount} mode="system" lang={lang} bold size="lg" className="text-teal-700" />
  440:            <MoneyDisplay value={order.totalAmount - order.paidAmount} mode="system" lang={lang} bold size="lg" className="text-amber-700" />
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a PO + a supplier invoice linked to the PO + pay the invoice in full
  # 2. Check the PO's paidAmount
  sqlite3 prisma/dev.db "SELECT orderNo, totalAmount, paidAmount FROM PurchaseOrder WHERE id='<po-id>';"
  # Expect: PO-XXXX|1000|0  ← paidAmount never moved, even though the linked invoice is PAID
  ```
- **Recommended fix:** Either (a) drop the `paidAmount` column from PurchaseOrder (it's derivable from `SUM(PurchaseInvoice.paidAmount WHERE purchaseOrderId = po.id)`), OR (b) in `supplier-payments/route.ts` POST, when the linked invoice has a `purchaseOrderId`, also increment the PO's `paidAmount` by the payment amount. Option (a) is cleaner.

### P5-CRIT-012: StockMovement model has zero writers and zero API endpoints — inventory audit trail is dark
- **Severity:** CRITICAL
- **Location:**
  - Schema: `prisma/schema.prisma:2729-2745` — `StockMovement` model with `movementType` (RECEIPT/ISSUE/TRANSFER/ADJUSTMENT/RETURN), `quantity`, `unitCost`, `totalAmount`, `journalEntryId`, `reference`.
  - Writers: `rg -n "db.stockMovement\.(create|update|upsert)" src/` → **zero matches**.
  - API: no `/api/stock-movements` route exists.
  - The goods-receipt POST increments `InventoryItem.quantity` directly (line 167) without creating a StockMovement record.
- **Description:** The entire inventory movement history is never recorded. When 100 units of cement are received via GR-0001, the `InventoryItem.quantity` goes from 0 to 100, but there's no record of:
  - When it was received.
  - From which supplier.
  - At what unit cost.
  - Against which GR/PO.
  - The corresponding JE (the `journalEntryId` field on StockMovement is unused).
  Same for issues (when material is consumed by a project), transfers (between warehouses), adjustments (stock counts). The dashboard's "lowInventoryItems" count works (it queries `InventoryItem.quantity <= minQuantity`), but there's no way to answer "why is the quantity 50?".
- **Accounting impact:** Inventory subledger cannot be audited. Auditor cannot tie inventory balance to receipts/issues. No traceability for cost-of-goods movements.
- **Evidence:**
  ```bash
  $ rg -n "db.stockMovement" src/
  # (no matches — zero writers, zero readers in src/)
  $ rg -n "StockMovement" prisma/schema.prisma
  2729:model StockMovement {
  # Only the model definition — no relations, no API, no UI
  $ rg -n "stockMovement|StockMovement" src/components/
  # (no matches)
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a goods receipt that increments inventory
  # 2. Check StockMovement table
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM StockMovement;"
  # Expect: 0 — no movement recorded despite inventory going up
  ```
- **Recommended fix:** In `goods-receipt/route.ts` POST, inside the inventory-increment loop, also create a StockMovement:
  ```ts
  await tx.stockMovement.create({
    data: {
      inventoryItemId: inventoryItem.id,
      movementType: 'RECEIPT',
      quantity: item.quantityReceived,
      unitCost: item.unitPrice,
      totalAmount: item.quantityReceived * item.unitPrice,
      movementDate: new Date(date),
      reference: receiptNo,
      journalEntryId: je.id,  // link to the GRNI JE
    },
  })
  ```
  Add similar calls in: inventory adjustment (PUT), future material-issue endpoint, future warehouse-transfer endpoint.

### P5-CRIT-013: Goods-receipt inventory matching by exact `name` match — silently skips inventory update when names don't match
- **Severity:** CRITICAL
- **Location:** `src/app/api/goods-receipt/route.ts:161-169`
- **Description:** For items with `destination === 'INVENTORY'`, the route does:
  ```ts
  const inventoryItem = await tx.inventoryItem.findFirst({
    where: { name: item.description },
  })
  if (inventoryItem) {
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { quantity: { increment: item.quantityReceived } },
    })
  }
  ```
  - The match is by **exact string equality** on `name` (case-sensitive, whitespace-sensitive).
  - If the GR item description is "اسمنت بورتلاندي" but the InventoryItem name is "اسمنت بورتلاند" (different ending), the match fails silently.
  - If no match: the item is still in the GRNI JE (Dr Inventory / Cr GRNI) — so the GL shows inventory going up, but the `InventoryItem.quantity` field doesn't change. The GL and the inventory subledger diverge.
  - There is no logging, no error, no warning. The user sees a "successful" receipt but the inventory page shows the same quantity.
- **Accounting impact:** GL inventory balance (account 1340) ≠ sum of `InventoryItem.quantity * unitCost`. Auditor cannot reconcile. Also, the GRNI liability (3330) is cleared when the supplier invoice arrives (via the PI JE), but the inventory asset was never actually incremented in the subledger — so the net inventory asset is overstated in the subledger but correct in the GL, or vice versa.
- **Evidence:**
  ```bash
  $ rg -n "findFirst.*name.*description|where:.*name:.*item.description" src/app/api/goods-receipt/route.ts
  162:          const inventoryItem = await tx.inventoryItem.findFirst({
  163:            where: { name: item.description },
  164:          })
  ```
- **How to verify practically:**
  ```bash
  # 1. Create an InventoryItem with name "Cement"
  # 2. Create a GR with item.description = "cement" (lowercase)
  # 3. Check: GRNI JE created (Dr Inventory 1000 / Cr GRNI 1000), but InventoryItem.quantity unchanged
  sqlite3 prisma/dev.db "SELECT name, quantity FROM InventoryItem WHERE name LIKE '%ement%';"
  # Cement|0  ← quantity not incremented (case mismatch)
  sqlite3 prisma/dev.db "SELECT a.code, SUM(jl.debit) FROM JournalLine jl JOIN Account a ON a.id=jl.accountId WHERE a.accountRole='INVENTORY' GROUP BY a.code;"
  # 1340|1000  ← GL inventory went up by 1000
  # Divergence: GL says +1000, subledger says +0
  ```
- **Recommended fix:** Either (a) require `inventoryItemId` on each GR item (the UI must select an existing inventory item, not type a free-text description), or (b) if no match, create a new InventoryItem automatically (with a warning), or (c) throw an error if no match — never silently skip.

### P5-CRIT-014: Goods-receipt POST creates EquipmentCost records without journalEntryId link
- **Severity:** CRITICAL (mirror of P4-CRIT-005 LaborCost bug)
- **Location:** `src/app/api/goods-receipt/route.ts:170-181`
- **Description:** For items with `destination === 'PROJECT'`, the route creates an `EquipmentCost` record:
  ```ts
  await tx.equipmentCost.create({
    data: {
      projectId,
      description: `استلام بضاعة: ${item.description} (${receiptNo})`,
      amount: totalItemCost,
      date: new Date(date),
    },
  })
  ```
  The `EquipmentCost` schema (`prisma/schema.prisma:1528-1545`) has a `journalEntryId String?` field — but the route never sets it. The corresponding JE line is created (Dr PROJECT_COST in the GRNI JE at lines 203-211), but the operational `EquipmentCost` record has no link back to that JE.
- **Accounting impact:** Same as P4-CRIT-005: GL and operational subledger cannot be joined. Reports that aggregate `EquipmentCost` cannot tie back to GL. Reversal of the GRNI JE (on GR delete/cancel — see P5-CRIT-004/005) won't find the linked `EquipmentCost` to delete.
- **Evidence:**
  ```bash
  $ rg -n "equipmentCost.create" src/app/api/goods-receipt/route.ts
  173:          await tx.equipmentCost.create({
  # data block (174-180) has no journalEntryId field
  $ rg -n "journalEntryId" prisma/schema.prisma | rg -i equipmentcost
  1536:  journalEntryId String?
  ```
- **How to verify practically:**
  ```bash
  # 1. Create a GR with a PROJECT-destination item
  # 2. Check EquipmentCost record
  sqlite3 prisma/dev.db "SELECT id, projectId, amount, journalEntryId FROM EquipmentCost ORDER BY createdAt DESC LIMIT 1;"
  # Expect: <id>|<projectId>|<amount>|(null)  ← journalEntryId is NULL
  ```
- **Recommended fix:** Capture the JE ID from the GRNI JE creation and set it on the EquipmentCost:
  ```ts
  // After the GRNI JE is created (je.id available):
  await tx.equipmentCost.create({
    data: { projectId, description: ..., amount: totalItemCost, date: ..., journalEntryId: je.id }
  })
  ```
  (Requires restructuring the loop — currently EquipmentCost is created inside the per-item loop, but the JE is created after the loop. Move EquipmentCost creation to after the JE, or accumulate and bulk-create.)

### P5-CRIT-015: autoEntryPurchaseInvoice (engine.ts) uses non-standard entryNo format + hardcoded fallback account codes
- **Severity:** CRITICAL
- **Location:** `src/lib/accounting/engine.ts:567-591`
- **Description:** Two sub-issues:
  1. **Non-standard entryNo** (line 584): `entryNo: \`JE-PI-${Date.now()}\`` — bypasses `getNextEntryNo()` from guard.ts. The standard format is `JE-NNNNNN` (6 digits). The guard's `getNextEntryNo` (guard.ts:392-407) iterates all JEs starting with `JE-` and applies the regex `^JE-(\d+)$` — `JE-PI-1737000000000` doesn't match the regex, so it's skipped. This pollutes the `JE-` namespace and risks collisions if two edits happen in the same millisecond.
  2. **Hardcoded fallback codes** (lines 567, 570, 571):
     ```ts
     const expenseCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
     const apCode = await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210'
     const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'
     ```
     If no role-mapped account exists (e.g. chart of accounts not yet seeded, or role-mapping screen cleared), the function silently falls back to hardcoded codes. This bypasses the entire role-mapping system. The `createPurchaseInvoiceJournalEntry` in auto-journal.ts uses `getDefaultAccountByRole` (which returns null) + explicit null-check + throw — the correct pattern.
- **Accounting impact:** Hardcoded codes can post to wrong accounts if the chart is reconfigured. Non-standard entryNo breaks sequence assumptions in other tools (e.g. the `getNextEntryNo` counter won't see these JEs, so the next standard JE number might collide if a user manually types `JE-PI-...`).
- **Evidence:**
  ```bash
  $ rg -n "JE-PI-|JE-EXP-|JE-SP-|JE-GR-" src/lib/accounting/engine.ts src/app/api/goods-receipt/route.ts
  src/lib/accounting/engine.ts:584:    entryNo: `JE-PI-${Date.now()}`,
  src/lib/accounting/engine.ts:682:    entryNo: `JE-EXP-${Date.now()}`,
  src/lib/accounting/engine.ts:711:    entryNo: `JE-CP-${Date.now()}`,
  src/lib/accounting/engine.ts:739:    entryNo: `JE-SP-${Date.now()}`,
  src/app/api/goods-receipt/route.ts:220:        entryNo: `JE-GR-${receiptNo}-${Date.now()}`,
  $ rg -n "\|\| '8630'|\|\| '3210'|\|\| '3120'|\|\| '1210'|\|\| '1110'" src/lib/accounting/engine.ts
  567:  const expenseCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
  570:  const apCode = await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210'
  571:  const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'
  665:  const expenseAccountCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
  667:  const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'
  706:  const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR, tx) || '1210'
  735:  const apCode = await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210'
  736:  const cashAccountCode = await resolvePaymentAccountCode(data.paidFrom === 'BANK' ? 'BANK' : 'TREASURY', tx)
  ```
- **How to verify practically:**
  ```bash
  # 1. Edit a supplier invoice's amount (triggers autoEntryPurchaseInvoice in PUT)
  # 2. Check the entryNo format of the new JE
  sqlite3 prisma/dev.db "SELECT entryNo FROM JournalEntry WHERE sourceType='PURCHASE_INVOICE' ORDER BY date DESC LIMIT 5;"
  # Expect: JE-NNNNNN (from POST) AND JE-PI-1737... (from PUT) — two formats coexisting
  ```
  For hardcoded fallback:
  ```bash
  # 1. Delete the SUPPLIER_AP role mapping (set accountRole=null on account 3210)
  sqlite3 prisma/dev.db "UPDATE Account SET accountRole=NULL WHERE code='3210';"
  # 2. Edit a supplier invoice's amount (triggers autoEntryPurchaseInvoice)
  # 3. Check: JE is created with accountCode='3210' (hardcoded fallback) instead of throwing
  sqlite3 prisma/dev.db "SELECT a.code, jl.credit FROM JournalLine jl JOIN Account a ON a.id=jl.accountId WHERE jl.journalEntryId='<new-je-id>' AND jl.credit>0;"
  # 3210|2300  ← hardcoded fallback worked, no error — silent bypass of role mapping
  ```
- **Recommended fix:** Replace `|| '8630'` etc. with `requireAccountByRole(role, 'فاتورة مشتريات', tx)` which throws a descriptive Arabic error. Replace `entryNo: \`JE-PI-${Date.now()}\`` with `entryNo: await getNextEntryNo(tx)`.

---

## HIGH Issues

### P5-HIGH-001: Dead code — `autoEntryExpense` (engine.ts:634-690) has zero callers
- **Severity:** HIGH (dead code)
- **Location:** `src/lib/accounting/engine.ts:634-690`
- **Description:** The function is exported but never called anywhere in `src/`. The expenses flow uses `createExpenseJournalEntry` (auto-journal.ts:274-323) instead.
- **Evidence:**
  ```bash
  $ rg -n "autoEntryExpense\(" src/ scripts/
  # (no matches — only the function definition at engine.ts:634)
  ```
- **Fix:** Delete the function (~57 lines), or mark deprecated with a JSDoc tag.

### P5-HIGH-002: Dead code — `autoEntrySupplierPayment` (engine.ts:727-758) has zero callers
- **Severity:** HIGH (dead code)
- **Location:** `src/lib/accounting/engine.ts:727-758`
- **Description:** Same as P5-HIGH-001 — supplier-payments flow uses `createSupplierPaymentJournalEntry` (auto-journal.ts:220-266).
- **Evidence:**
  ```bash
  $ rg -n "autoEntrySupplierPayment\(" src/ scripts/
  # (no matches)
  ```
- **Fix:** Delete the function.

### P5-HIGH-003: InventoryItem DELETE hard-delete — no soft-delete, no pre-flight check
- **Severity:** HIGH
- **Location:** `src/app/api/inventory/[id]/route.ts:56-65`
- **Description:** `await db.inventoryItem.delete({ where: { id } })` — no soft-delete (schema has no `deletedAt`), no pre-flight check for `StockMovement` records (zero writers, so currently moot) or for `GoodsReceiptItem` records (which reference inventory by name, not FK — so no cascade). The hard-delete is silent and irreversible.
- **Impact:** If an inventory item is deleted after being referenced by a GR (matched by name), the GR's items still exist but the inventory no longer exists. Future GRs that match the same name will create a new InventoryItem with quantity starting from 0 + the new receipt — losing the historical quantity.
- **Fix:** Add `deletedAt DateTime?` to InventoryItem schema. Soft-delete in API (set `deletedAt`, `isActive=false`). Filter `deletedAt: null` in GET.

### P5-HIGH-004: InventoryItem PUT directly updates quantity — no StockMovement, no adjustment JE
- **Severity:** HIGH
- **Location:** `src/app/api/inventory/[id]/route.ts:23-54`
- **Description:** Line 36: `if (body.quantity !== undefined) data.quantity = parseFloat(body.quantity) || 0` — directly overwrites the quantity. No StockMovement record (movementType=ADJUSTMENT). No JE for the inventory adjustment (Dr/Cr Inventory / Cr/Dr Inventory Variance). The quantity on hand becomes whatever the user types, with zero audit trail.
- **Impact:** Inventory shrinkage/overshipage is invisible. GL inventory (1340) diverges from subledger.
- **Fix:** Forbid direct quantity edits on PUT. Require a separate "inventory adjustment" endpoint that creates a StockMovement + a JE.

### P5-HIGH-005: InventoryItem POST creates with initial quantity — no StockMovement for opening balance
- **Severity:** HIGH
- **Location:** `src/app/api/inventory/route.ts:49-69`
- **Description:** Line 58: `quantity: parseFloat(body.quantity) || 0` — sets the opening quantity directly. No StockMovement (movementType=RECEIPT, reference="OPENING_BALANCE"). No JE for the opening balance (Dr Inventory / Cr Retained Earnings or Opening Balance Equity).
- **Impact:** Opening inventory hits the subledger but not the GL. From day 1, GL ≠ subledger.
- **Fix:** If `quantity > 0` on create, also create a StockMovement + an opening-balance JE.

### P5-HIGH-006: Suppliers UI doesn't expose `paymentTerms`, `creditLimit`, `commercialReg` fields
- **Severity:** HIGH (UI/API contract mismatch)
- **Location:**
  - Schema: `prisma/schema.prisma:448,449,447` — `paymentTerms String?`, `creditLimit Decimal @default(0)`, `commercialReg String?`.
  - API: `src/app/api/suppliers/route.ts:76-88` (POST) — doesn't read `paymentTerms`, `creditLimit`, `commercialReg` from body.
  - API: `src/app/api/suppliers/[id]/route.ts:28-40` (PUT) — doesn't update these fields.
  - UI: `src/components/modules/suppliers.tsx:34-37` — `SupplierFormData` interface has no `paymentTerms`, `creditLimit`, `commercialReg`.
- **Description:** Three schema fields are permanently null/zero. The `creditLimit` is meant to enforce a credit ceiling (presumably in supplier-payments or purchase-orders POST), but no code reads it.
- **Fix:** Add fields to the UI form, API POST/PUT, and enforce `creditLimit` in purchase-invoices POST (block if `SUM(outstanding invoices) + new invoice total > creditLimit`).

### P5-HIGH-007: supplier-payments/[id] PUT crashes if JE was already reversed manually
- **Severity:** HIGH
- **Location:** `src/app/api/supplier-payments/[id]/route.ts:50-53`
- **Description:** The PUT handler calls `await reverseEntry(existing.journalEntryId!, tx)` unconditionally. If the user already reversed the JE via `/api/journal-entries/[id]/reverse`, `reverseEntry` throws `AccountingGuardError('ALREADY_REVERSED')`. The catch at line 173 returns 500 with the raw error message. The payment is now un-editable.
- **Fix:** Before calling `reverseEntry`, check if the JE is already reversed:
  ```ts
  const alreadyReversed = await tx.journalEntry.findFirst({
    where: { reversedEntryId: existing.journalEntryId, deletedAt: null, status: 'POSTED' }
  })
  if (alreadyReversed) {
    // Skip reversal, just create a new JE for the updated payment
  } else {
    await reverseEntry(existing.journalEntryId!, tx)
  }
  ```

### P5-HIGH-008: supplier-payments/[id] DELETE returns 400 for posted payments — UI still shows delete button
- **Severity:** HIGH (UX mismatch)
- **Location:**
  - API: `src/app/api/supplier-payments/[id]/route.ts:195-201` — returns 400 "لا يمكن حذف دفعة مورد مرحلة محاسبياً" if `journalEntryId` is set.
  - UI: `src/components/modules/supplier-payments.tsx` — delete button is shown unconditionally (need to verify).
- **Description:** Every successful payment POST creates a JE → `journalEntryId` is set → DELETE always returns 400. The delete button is effectively dead.
- **Fix:** Either (a) hide the delete button in the UI when `journalEntryId` is set, or (b) change DELETE to reverse the JE + soft-delete the payment (mirror the salary-payments pattern from Phase 4).

### P5-HIGH-009: supplier-payments UI JePreview hardcodes accountCode '3210'
- **Severity:** HIGH (UI bypasses role mapping in preview)
- **Location:** `src/components/modules/supplier-payments.tsx:259-263`
- **Description:** The JePreview component hardcodes:
  ```tsx
  { accountCode: '3210', accountNameAr: 'موردون', debit: parseFloat(form.amount) || 0, credit: 0 }
  ```
  If the SUPPLIER_AP role is re-mapped to a different code (e.g. 3215), the preview shows the wrong account. The actual JE (via `createSupplierPaymentJournalEntry`) uses the correct role-mapped account.
- **Fix:** Fetch the role-mapped account code via `/api/accounts/by-role?role=SUPPLIER_AP` and use it in the preview.

### P5-HIGH-010: createPurchaseInvoiceJournalEntry ignores `expenseCategory`, `equipmentId`, `activityType`
- **Severity:** HIGH (inconsistent with autoEntryPurchaseInvoice)
- **Location:** `src/lib/auto-journal.ts:128-130`
- **Description:** The cost account is selected purely by `projectId ? PROJECT_COST : MAINTENANCE_EXPENSE`. A purchase invoice with `expenseCategory='FUEL'` and `equipmentId` set (a fuel purchase for a specific equipment) hits PROJECT_COST (if projectId set) or MAINTENANCE_EXPENSE (if not) — never FUEL_EXPENSE (7210). The Phase-3 audit established that fuel costs should hit 7210 for accurate rental-cycle P&L.
- **Fix:** Mirror `autoEntryPurchaseInvoice`'s `categoryRoleMap` logic. Or, better, collapse the two functions into one (see P5-CRIT-006).

### P5-HIGH-011: ZATCA QR generation runs outside the $transaction
- **Severity:** HIGH
- **Location:** `src/app/api/supplier-invoices/route.ts:201-222`
- **Description:** After the `$transaction` commits (line 199), the route does a separate `db.purchaseInvoice.update` to store the ZATCA QR (line 214). If this update fails (e.g. DB connection blip), the invoice exists without a QR code. The QR is supposed to be a compliance requirement for Saudi e-invoicing — a missing QR is a regulatory issue.
- **Fix:** Move the QR generation inside the `$transaction` (compute the QR before the tx, store it in the same `tx.purchaseInvoice.create` call).

### P5-HIGH-012: /api/purchase-invoices PUT doesn't handle status transitions
- **Severity:** HIGH
- **Location:** `src/app/api/purchase-invoices/route.ts:153-238` (PUT handler)
- **Description:** The PUT handler at `/api/purchase-invoices` only handles amount updates (with JE reversal+recreate). It does NOT handle status changes (DRAFT→SENT→PAID→CANCELLED). The only way to transition status is via `/api/supplier-invoices/[id]` PUT. This is confusing because the two endpoints operate on the same model — users (and frontend devs) don't know which one to call.
- **Fix:** Either (a) merge the two PUT handlers (move status logic into `/api/purchase-invoices/[id]` PUT), or (b) document clearly that status transitions go through `/api/supplier-invoices/[id]` only.

### P5-HIGH-013: Dashboard has no supply-chain operational metrics
- **Severity:** HIGH
- **Location:** `src/app/api/dashboard/route.ts` (entire file)
- **Description:** The dashboard returns ~60 fields but none of them are:
  - Supplier count
  - Active PO count / total PO value
  - Pending GR count
  - Outstanding purchase invoices total
  - Supplier payment total (this period)
  - Inventory item count / total inventory value
  
  Only `lowInventoryItems` (count of items below min) and `overduePayables` (from purchase invoices) are supply-chain-adjacent. The dashboard is blind to the rest of the supply chain.
- **Fix:** Add the missing counts/sums to the dashboard response.

### P5-HIGH-014: supplier-invoices POST doesn't validate GR status (can create invoice from PENDING/CANCELLED GR)
- **Severity:** HIGH
- **Location:** `src/app/api/supplier-invoices/route.ts:91-101`
- **Description:** The route checks GR exists (line 91-97) but doesn't check `gr.status === 'COMPLETED'`. A user can create a supplier invoice from a PENDING GR (where receipt isn't finalized). The UI at `supplier-invoices.tsx:99` filters out only CANCELLED GRs — so PENDING GRs appear in the dropdown.
- **Fix:** Add `if (gr.status !== 'COMPLETED') return 400('يجب إكمال إيصال الاستلام أولاً')`.

### P5-HIGH-015: supplier-payments POST uses `parseFloat(amount)` without validation
- **Severity:** HIGH
- **Location:** `src/app/api/supplier-payments/route.ts:102, 127`
- **Description:** `amount: parseFloat(amount) || 0` — if `amount` is a non-numeric string, `parseFloat` returns NaN, then `|| 0` makes it 0. A payment of amount 0 then passes validation (line 67: `!amount` is true for 0, but the check is `!supplierId || !amount || !date` → 0 is falsy → returns 400). Actually wait — `!0` is true, so amount=0 returns 400. But `amount="abc"` → `parseFloat("abc")=NaN` → `NaN || 0 = 0` → returns 400. OK so non-numeric strings are caught. But `amount="1e308*1e308"` → `parseFloat=Infinity` → passes. Then `createSupplierPaymentJournalEntry` with `amount=Infinity` → guard R5 (negative) doesn't catch Infinity, but the DB write would store Infinity as a Decimal → Prisma may throw or store garbage.
- **Fix:** Validate `typeof amount === 'number' && amount > 0 && isFinite(amount)` before parsing.

### P5-HIGH-016: suppliers/route.ts POST auto-generates code outside $transaction
- **Severity:** HIGH (race condition)
- **Location:** `src/app/api/suppliers/route.ts:63-74`
- **Description:** The code reads `db.supplier.findFirst({orderBy: {code: 'desc'}})` (line 63) outside any transaction, then uses the result to compute the next code (line 74: `SUP-001`, `SUP-002`, ...), then creates the supplier (line 76). Two concurrent POSTs can read the same last code and both try to create `SUP-005` → the second fails with `@unique` violation → 500.
- **Fix:** Move the code-generation inside a `$transaction` (mirror `purchase-orders/route.ts:96-142` which does this correctly).

---

## MEDIUM Issues

### P5-MED-001: Supplier has no `deletedAt` field — soft-delete impossible
- **Location:** `prisma/schema.prisma:436-462`
- **Description:** Unlike Employee (which has `deletedAt` from Phase 4), Supplier has no soft-delete field. Combined with P5-CRIT-008, suppliers can never be removed from the system.
- **Fix:** Add `deletedAt DateTime?` and follow the Employee pattern.

### P5-MED-002: SupplierPayment has `deletedAt` but no route filters by it
- **Location:** `prisma/schema.prisma:1956` (`deletedAt DateTime?`); `src/app/api/supplier-payments/route.ts:36-41` (GET without `deletedAt: null` filter)
- **Description:** The schema has `deletedAt` but GET doesn't filter it. Since DELETE hard-deletes (doesn't set `deletedAt`), the field is always null — but if a future fix changes DELETE to soft-delete, the GET won't filter correctly without updating.
- **Fix:** Add `deletedAt: null` to GET `where` clause.

### P5-MED-003: PurchaseInvoice has `deletedAt` but GET routes don't filter by it
- **Location:** `prisma/schema.prisma:1238` (`deletedAt DateTime?`); `src/app/api/purchase-invoices/route.ts:40-44` and `src/app/api/supplier-invoices/route.ts:47-51` — neither filters `deletedAt: null`.
- **Fix:** Add `deletedAt: null` to GET `where` clause.

### P5-MED-004: SupplierPayment DELETE hard-deletes instead of setting `deletedAt`
- **Location:** `src/app/api/supplier-payments/[id]/route.ts:228`
- **Description:** `await db.supplierPayment.delete({ where: { id } })` — hard-delete. Schema has `deletedAt` field but it's unused.
- **Fix:** Soft-delete (`deletedAt = now()`) + reverse JE (already blocked for posted payments, so this only affects unposted payments).

### P5-MED-005: suppliers/[id] PUT doesn't allow updating `paymentTerms`, `creditLimit`, `commercialReg`
- **Location:** `src/app/api/suppliers/[id]/route.ts:28-40`
- **Description:** The PUT handler only updates `name, nameAr, contactPerson, email, phone, address, taxNumber, isActive`. Three schema fields (`paymentTerms`, `creditLimit`, `commercialReg`) are permanently stuck at their default values.
- **Fix:** Add the missing fields to the update data.

### P5-MED-006: supplier-payments/[id] PUT sets invoice status to DRAFT when reversed payment leaves paidAmount ≤ 0
- **Location:** `src/app/api/supplier-payments/[id]/route.ts:70-72`
- **Description:** When reversing a payment, if `reversedPaidAmount <= 0`, the invoice status is set to `'DRAFT'`. But the invoice was previously `SENT` or `PARTIALLY_PAID` — going back to DRAFT is a state-machine regression. An invoice that was ever SENT should not return to DRAFT (per the `VALID_SI_TRANSITIONS` in `supplier-invoices/[id]/route.ts:6-12`, DRAFT→SENT is one-way).
- **Fix:** Set status to `'SENT'` (not DRAFT) when reversed payment leaves paidAmount ≤ 0.

### P5-MED-007: goods-receipt POST doesn't validate `quantityReceived ≤ quantityOrdered`
- **Location:** `src/app/api/goods-receipt/route.ts:84-119`
- **Description:** The route accepts any `quantityReceived` value, including values exceeding the ordered quantity. Over-receiving is allowed silently.
- **Fix:** Add per-item validation: `if (item.quantityReceived > item.quantityOrdered) return 400`.

### P5-MED-008: purchase-orders POST doesn't validate supplierId exists
- **Location:** `src/app/api/purchase-orders/route.ts:68-86`
- **Description:** Only checks `!supplierId` (truthy). Doesn't verify the supplier exists in the DB. If a non-existent supplierId is passed, the `tx.purchaseOrder.create` throws a Prisma FK error → 500.
- **Fix:** `const supplier = await db.supplier.findUnique({where: {id: supplierId}}); if (!supplier) return 404`.

### P5-MED-009: Supplier model has no `branchId` field
- **Location:** `prisma/schema.prisma:436-462`
- **Description:** Unlike Employee (`branchId String` required) and Warehouse (`branchId String` required), Supplier has no branch scoping. A multi-branch company cannot restrict which suppliers each branch sees.
- **Fix:** Add `branchId String?` (optional for backward compat) + filter in GET.

### P5-MED-010: PurchaseOrder has no `deletedAt` field
- **Location:** `prisma/schema.prisma:1114-1147`
- **Description:** Cannot soft-delete POs. DELETE handler hard-deletes DRAFT POs only (correct, but no soft-delete path for approved POs that need to be retired).
- **Fix:** Add `deletedAt DateTime?`. Approved POs that need to be retired can be CANCELLED (already supported).

### P5-MED-011: GoodsReceipt has no `deletedAt` field
- **Location:** `prisma/schema.prisma:1166-1190`
- **Fix:** Add `deletedAt DateTime?`.

### P5-MED-012: InventoryItem has no `deletedAt` field
- **Location:** `prisma/schema.prisma:1736-1759`
- **Fix:** Add `deletedAt DateTime?`.

### P5-MED-013: goods-receipt POST uses `as any` for status update
- **Location:** `src/app/api/goods-receipt/route.ts:143`
- **Description:** `data: { status: newPoStatus as any }` — bypasses TypeScript type checking. `newPoStatus` is a `string`, but `status` expects `PurchaseOrderStatus` enum. If `newPoStatus` is a typo (e.g. `'RECEVIED'`), the DB write succeeds (SQLite is permissive) but the enum constraint is violated.
- **Fix:** Type `newPoStatus` as `PurchaseOrderStatus` explicitly, or use a typed const.

### P5-MED-014: purchase-invoices POST doesn't validate `items` array structure
- **Location:** `src/app/api/purchase-invoices/route.ts:68-73`
- **Description:** Only checks `!items?.length`. Doesn't validate that each item has `description`, `quantity`, `unitPrice`. A malformed item (e.g. `quantity: "abc"`) would cause `quantity * unitPrice = NaN` → subtotal = NaN → JE creation would throw on R5 (NaN debit).
- **Fix:** Validate each item's shape before computing subtotal.

### P5-MED-015: supplier-invoices POST auto-generates invoiceNo with mixed PI/SI pattern matching
- **Location:** `src/app/api/supplier-invoices/route.ts:135-150`
- **Description:** The code tries to match `SI-(\d+)` first, then falls back to `PI-(\d+)` if the last invoice was a PI. This can produce collisions: if the last invoice is `PI-0005`, the next SI becomes `SI-0006`. But if someone then creates a `PI-0006` via `/api/purchase-invoices`, both `SI-0006` and `PI-0006` exist (different prefixes, no collision). However, the `findFirst({orderBy: {invoiceNo: 'desc'}})` sorts lexicographically — `SI-` > `PI-` > `JE-` etc. — so the "last invoice" depends on prefix ordering, not creation order. This produces surprising invoice numbers.
- **Fix:** Use a sequence table or a per-prefix counter.

### P5-MED-016: supplier-payments UI doesn't expose PETTY_CASH as a paidFrom option
- **Location:** `src/components/modules/supplier-payments.tsx:209` (`roles={['CASH', 'BANK']}`) and line 218 (`paidFrom: account.accountRole === 'BANK' ? 'BANK' : 'TREASURY'`)
- **Description:** The AccountSelector filters by CASH and BANK roles only. If the user selects a PETTY_CASH account (role=PETTY_CASH, code=1130), it won't appear in the dropdown. The `paidFrom` mapping only produces 'BANK' or 'TREASURY' — never 'PETTY_CASH'.
- **Fix:** Add 'PETTY_CASH' to the roles array and map `account.accountRole === 'PETTY_CASH' ? 'PETTY_CASH' : ...`.

---

## LOW Issues

### P5-LOW-001: Two API paths for the same PurchaseInvoice model with divergent semantics
- **Location:** `/api/purchase-invoices/*` vs `/api/supplier-invoices/*`
- **Description:** Both operate on the same `PurchaseInvoice` model. `/api/purchase-invoices` is the "manual" path (no GR required), `/api/supplier-invoices` is the "from GR" path. They have different POST validation, different PUT capabilities, different DELETE semantics (P5-CRIT-002 vs the correct cancel+reverse in purchase-invoices/[id]). Confusing for developers and inconsistent for the data model.
- **Fix:** Merge into one route with a `?source=GR` query param, or clearly document the two paths.

### P5-LOW-002: suppliers/[id]/accounting hardcodes accountCode '3210'
- **Location:** `src/app/api/suppliers/[id]/accounting/route.ts:57`
- **Description:** `accountCode: '3210'` is hardcoded. Should use `getAccountCodeByRole(AccountRole.SUPPLIER_AP)`.
- **Fix:** Resolve via role mapping.

### P5-LOW-003: suppliers/route.ts GET doesn't filter by `deletedAt` (no soft-delete field)
- **Location:** `src/app/api/suppliers/route.ts:29-35`
- **Description:** Moot until P5-MED-001 is fixed, but noted for completeness.

### P5-LOW-004: engine.ts autoEntryPurchaseInvoice uses `Date.now()` in entryNo
- **Location:** `src/lib/accounting/engine.ts:584`
- **Description:** See P5-CRIT-015 — entryNo format is non-standard.
- **Fix:** Use `getNextEntryNo(tx)`.

### P5-LOW-005: createPurchaseInvoiceJournalEntry missing `descriptionAr`
- **Location:** `src/lib/auto-journal.ts:142-156`
- **Description:** The `postJournalEntry` call has `description: \`فاتورة مورد ${invoice.invoiceNo}\`` (Arabic text in the Latin field) but no `descriptionAr`. The `autoEntryPurchaseInvoice` (engine.ts) has both `description` and `descriptionAr`. Inconsistent.
- **Fix:** Add `descriptionAr` to the postJournalEntry call.

### P5-LOW-006: Suppliers UI doesn't show `_count.supplierPayments`
- **Location:** `src/components/modules/suppliers.tsx:31`
- **Description:** `SupplierItem._count` has `purchaseOrders` and `purchaseInvoices` but not `supplierPayments`. The API include (line 32 of suppliers/route.ts) also only selects `purchaseOrders` and `purchaseInvoices`.
- **Fix:** Add `supplierPayments: true` to the `_count.select`.

### P5-LOW-007: supplier-payments GET doesn't include the linked invoice relation
- **Location:** `src/app/api/supplier-payments/route.ts:28-30`
- **Description:** The `include` only has `supplier`. The `invoiceId` is returned as a bare string — the UI can't show "Payment for invoice PI-0005" without a second fetch.
- **Fix:** Add `invoice: { select: { id: true, invoiceNo: true, totalAmount: true } }` to the include.

### P5-LOW-008: GoodsReceipt schema missing compound index `[purchaseOrderId, status]`
- **Location:** `prisma/schema.prisma:1185-1189`
- **Description:** Has `@@index([purchaseOrderId])` and `@@index([status])` separately, but the goods-receipt POST queries `where: { purchaseOrderId, status: { not: 'CANCELLED' } }` (line 122-124) — a compound index would be more efficient.
- **Fix:** Add `@@index([purchaseOrderId, status])`.

### P5-LOW-009: SupplierPayment has no `status` field
- **Location:** `prisma/schema.prisma:1939-1963`
- **Description:** Unlike PurchaseInvoice (DRAFT/SENT/PAID/CANCELLED), SupplierPayment has no status. Every payment is immediately posted (JE created). There's no concept of a "draft" or "pending" payment that needs approval before hitting the GL.
- **Fix:** Add `status SupplierPaymentStatus @default(POSTED)` with enum `{DRAFT, POSTED, CANCELLED}` if business needs approval workflow.

### P5-LOW-010: engine.ts autoEntryPurchaseInvoice `sourceId` is the invoiceNo string, not the invoice ID
- **Location:** `src/lib/accounting/engine.ts:590`
- **Description:** `sourceId: data.invoiceNo` (e.g. "PI-0001"). Contrast with `createPurchaseInvoiceJournalEntry` (auto-journal.ts:148) which uses `sourceId: invoice.id` (the cuid). The dashboard's "recent transactions" and the journal-entries by-source endpoint join on `sourceId` — mixing cuids and human-readable codes breaks the join.
- **Fix:** Pass the invoice `id` (cuid) as `sourceId`, not the `invoiceNo`.

---

## Dead Code Inventory

| Item | Location | Status | Recommendation |
|---|---|---|---|
| `autoEntryExpense` | `engine.ts:634-690` | 0 callers in src/ + scripts/ | Delete |
| `autoEntrySupplierPayment` | `engine.ts:727-758` | 0 callers in src/ + scripts/ | Delete |
| `autoEntryClientPayment` | `engine.ts:697-720` | 0 callers (verify) — `createClientPaymentJournalEntry` is used instead | Verify + delete |
| `StockMovement` model | `schema.prisma:2729-2745` | 0 writers, 0 readers, 0 API routes | Either implement (P5-CRIT-012) or drop the model |
| `Material` / `MaterialIssue` models | n/a | Don't exist in schema | Out of scope — not dead code, just absent |
| `supplier-invoices/[id]/route.ts:91-114` (DRAFT→SENT branch with `if (!journalEntryId)`) | `supplier-invoices/[id]/route.ts:91-114` | Unreachable from UI — POST always sets journalEntryId, so the `if (!journalEntryId)` check always fails | Fix P5-CRIT-001 first, then this branch becomes reachable |
| `supplier-invoices/[id]/route.ts:166-225` (amount-edit branch with reversal+recreate via autoEntryPurchaseInvoice) | `supplier-invoices/[id]/route.ts:166-225` | Unreachable from UI — UI only calls PUT with `{status: 'SENT'}` | Either expose amount-edit in UI or delete the branch |
| `PurchaseOrder.paidAmount` field | `schema.prisma:1127` | 0 writers — always 0 | Drop column or implement (P5-CRIT-011) |
| `PurchaseOrder.journalEntryId` field | `schema.prisma:1130` | 0 writers — POs never create JEs (correct — PO is a commitment, not a financial event) | Drop column (misleading — suggests POs have JEs) |
| `InventoryItem.purchasePrice` / `sellingPrice` | `schema.prisma:1743-1744` | Read by inventory UI, never written by goods-receipt (GR uses item.unitPrice, doesn't update InventoryItem.purchasePrice) | Either auto-update from GR or document as manual-only |
| `SupplierPayment.payingAccountCode` / `payingAccountName` | `schema.prisma:1947-1948` | Written by API, but redundant with `payingAccountId` (could be joined) | Acceptable denormalization |
| `Supplier.creditLimit` | `schema.prisma:449` | 0 readers — never enforced | Implement (P5-HIGH-006) or drop |
| `Supplier.paymentTerms` | `schema.prisma:448` | 0 readers — never displayed or enforced | Implement or drop |
| `Supplier.commercialReg` | `schema.prisma:447` | 0 readers | Implement or drop |
| `GoodsReceiptItem.quantityRemaining` | `schema.prisma:1198` | Written by POST (passed through from body), never read | Drop or use for partial-receipt tracking |

---

## Verified-Working Items (do NOT re-fix)

The following were explicitly verified as correct during this audit:

1. **Purchase Order state machine** (`purchase-orders/[id]/route.ts:5-12`): `VALID_PO_TRANSITIONS` is correctly defined — DRAFT→PENDING_APPROVAL→APPROVED→PARTIALLY_RECEIVED→RECEIVED is one-way. RECEIVED and CANCELLED are terminal. ✅
2. **Purchase Order DELETE** (`purchase-orders/[id]/route.ts:199-217`): blocks deletion of non-DRAFT POs and POs with linked goods receipts. ✅
3. **Purchase Request state machine** (`purchase-requests/[id]/route.ts:5-10`): `VALID_PR_TRANSITIONS` is correct — NEW→APPROVED→CONVERTED_TO_PO is one-way. ✅
4. **Goods Receipt POST validation**: requires `purchaseOrderId`, `supplierId`, `date`, `items`; validates PO exists and is APPROVED/PARTIALLY_RECEIVED. ✅
5. **Goods Receipt POST GRNI JE**: creates a balanced JE (Dr Inventory + Dr Project Cost = Cr GRNI) via `createJournalEntry` which goes through `postJournalEntry` (R1-R12 enforced). ✅
6. **Goods Receipt DELETE pre-flight**: blocks deletion of COMPLETED receipts and receipts linked to a purchase invoice. ✅ (But see P5-CRIT-004 — doesn't reverse the JE.)
7. **Supplier Payment JE balance**: `createSupplierPaymentJournalEntry` creates Dr SUPPLIER_AP / Cr Cash for `amount` — balanced. ✅
8. **Supplier Payment PUT reversal+recreate**: correctly reverses the old JE, unlinks it, updates the payment, creates a new JE, and re-links — all inside a `$transaction`. ✅ (But see P5-HIGH-007 for the ALREADY_REVERSED edge case.)
9. **Supplier Invoice state machine** (`supplier-invoices/[id]/route.ts:6-12`): `VALID_SI_TRANSITIONS` is correct — DRAFT→SENT is one-way, PAID and CANCELLED are terminal. ✅
10. **Purchase Invoice DELETE (cancel)** in `/api/purchase-invoices/[id]/route.ts:47-94`: correctly reverses the JE via `reverseEntry` inside a `$transaction` and sets status to CANCELLED. ✅ (This is the correct pattern — the issue is that `/api/supplier-invoices/[id]` DELETE doesn't follow it, per P5-CRIT-002.)
11. **Account role mappings** (`account-roles.ts`): SUPPLIER_AP→3210, INVENTORY→1340, GRNI→3330, VAT_INPUT→3120, PROJECT_COST→7110, MAINTENANCE_EXPENSE→7220, FUEL_EXPENSE→7210 — all correct (post Phase-1 audit fixes). ✅
12. **Period guard** (`period-guard.ts`): `assertPeriodOpen` is called by `postJournalEntry` for every JE — including supply-chain JEs. ✅
13. **Guard R1-R12**: all supply-chain JE creation paths go through `postJournalEntry` (via `createJournalEntry` in engine.ts or directly via `postJournalEntry` in auto-journal.ts). No `db.journalEntry.create` bypass calls found. ✅
14. **Supplier aging report** (`reports/aging/route.ts:65-149`): correctly includes both PurchaseInvoices and SubcontractorInvoices, with proper date bucketing. ✅
15. **Supplier balance report** (`reports/supplier-balances/route.ts`): correctly aggregates totalPurchased - totalPaid with aging buckets. ✅ (But relies on `PurchaseInvoice.paidAmount` which is correctly maintained by supplier-payments POST.)
16. **Supplier account statement** (`account-statement/supplier/route.ts`): correctly builds running balance from invoices (credits) and payments (debits). ✅
17. **Dashboard `overduePayables`** (`dashboard/route.ts:352-361`): correctly queries PurchaseInvoice with `status IN ['SENT','PARTIALLY_PAID','OVERDUE']` and `dueDate < now`. ✅
18. **ZATCA QR generation** (`supplier-invoices/route.ts:201-222`): correctly uses company settings (sellerName, vatNumber) and invoice data. ✅ (But see P5-HIGH-011 — runs outside tx.)

---

## Practical Test Plan (for the next agent)

To verify the top 5 CRITICAL issues practically (per the user's mandatory E2E methodology):

```bash
# Setup: ensure dev server running on localhost:3000, DB at prisma/dev.db

# === P5-CRIT-001: DRAFT invoice has posted JE ===
SUP_ID=$(curl -s http://localhost:3000/api/suppliers | jq -r '.[0].id')
curl -s -X POST http://localhost:3000/api/purchase-invoices \
  -H 'Content-Type: application/json' \
  -d "{\"supplierId\":\"$SUP_ID\",\"date\":\"2025-01-15\",\"dueDate\":\"2025-02-15\",\"items\":[{\"description\":\"test\",\"quantity\":1,\"unitPrice\":1000}],\"vatRate\":0.15}" \
  | jq '.invoiceNo, .status, .journalEntryId'
# Expect: "PI-XXXX", "DRAFT", "<non-null>" ← BUG: DRAFT has JE

# === P5-CRIT-002: DELETE DRAFT invoice orphans JE ===
INV_ID=$(curl -s http://localhost:3000/api/purchase-invoices | jq -r '.[0].id')
JE_ID=$(sqlite3 prisma/dev.db "SELECT journalEntryId FROM PurchaseInvoice WHERE id='$INV_ID';")
curl -s -X DELETE http://localhost:3000/api/supplier-invoices/$INV_ID
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM PurchaseInvoice WHERE id='$INV_ID';"  # 0
sqlite3 prisma/dev.db "SELECT status FROM JournalEntry WHERE id='$JE_ID';"  # POSTED ← orphaned

# === P5-CRIT-007: suppliers/[id]/accounting crashes ===
curl -s http://localhost:3000/api/suppliers/$SUP_ID/accounting
# Expect: 500 error

# === P5-CRIT-008: suppliers/[id] DELETE 500s on FK restrict ===
# (Assuming SUP_ID has at least one PO/PI/payment)
curl -s -X DELETE http://localhost:3000/api/suppliers/$SUP_ID
# Expect: 500 "فشل في حذف المورد"

# === P5-CRIT-009: pay a CANCELLED invoice ===
# (Create + cancel a supplier invoice, then pay it)
curl -s -X POST http://localhost:3000/api/supplier-payments \
  -H 'Content-Type: application/json' \
  -d "{\"supplierId\":\"$SUP_ID\",\"invoiceId\":\"$CANCELLED_INV_ID\",\"amount\":500,\"date\":\"2025-01-20\"}"
# Expect: 201 — invoice un-cancels to PAID

# === P5-CRIT-012: StockMovement has 0 rows ===
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM StockMovement;"
# Expect: 0 — even after creating goods receipts
```

---

## Top 5 CRITICAL Issues (for the final report message)

1. **P5-CRIT-001**: DRAFT Purchase Invoices have posted JEs in the GL — both `/api/purchase-invoices` POST (line 131) and `/api/supplier-invoices` POST (line 186) call `createPurchaseInvoiceJournalEntry` inside the same `$transaction` that sets `status: 'DRAFT'`. The DRAFT→SENT transition in `supplier-invoices/[id]/route.ts:91-114` then no-ops because `journalEntryId` is already set.

2. **P5-CRIT-002**: `supplier-invoices/[id] DELETE` hard-deletes DRAFT invoices without reversing the JE — orphaned JEs accumulate in GL with `sourceId` pointing to deleted records. The parallel endpoint `purchase-invoices/[id] DELETE` correctly reverses the JE, so the two endpoints have divergent semantics on the same model.

3. **P5-CRIT-006**: Two divergent JE generators for PurchaseInvoice — `createPurchaseInvoiceJournalEntry` (auto-journal.ts, used by POST) selects cost account by `projectId` only; `autoEntryPurchaseInvoice` (engine.ts, used by PUT) uses a 17-category `expenseCategory` role map. Editing an invoice's amounts after creation can silently flip the debit account from 7220 to 7210.

4. **P5-CRIT-007**: `suppliers/[id]/accounting/route.ts:40-49` filters `JournalEntry` by `supplierId` — a field that doesn't exist on the `JournalEntry` model. Prisma throws "Unknown argument `supplierId`" at runtime → the supplier accounting summary card is permanently broken (500 on every call).

5. **P5-CRIT-009**: `supplier-payments POST` allows paying DRAFT / PAID / CANCELLED invoices with no overpayment check — direct API call can un-CANCEL an invoice by paying it, double-pay a PAID invoice (paidAmount exceeds totalAmount), or pay a DRAFT invoice that already has a JE from creation.
