# P3-3 — Purchase Cycle Documenter (Agent: full-stack-developer)

## Task ID: P3-3

Document and test the PURCHASE cycle end-to-end in the Binaa-System ERP:
`Supplier → Purchase Request → Purchase Order → Goods Receipt → Supplier Invoice → Supplier Payment`

## Work Log

- Read `/home/z/my-project/worklog.md` for prior context (Tasks A → P3-2 rental cycle).
- Read `docs/WORKFLOW-CONSTRUCTION-CYCLE.md` (template format).
- Read `scripts/e2e-construction-cycle.ts` (1166 lines, test pattern: `results` array + `log()` + `step()` + cleanup-in-`finally`).
- Inspected actual API route code for all 6 steps:
  - `src/app/api/suppliers/route.ts` — POST: master record, code `SUP-NNN`, NO JE.
  - `src/app/api/purchase-requests/route.ts` + `[id]/route.ts` — POST: code `PR-NNNN`, status NEW; PUT transitions NEW→APPROVED→CONVERTED_TO_PO; NO JE.
  - `src/app/api/purchase-orders/route.ts` + `[id]/route.ts` — POST: code `PO-NNNN`, status DRAFT; PUT transitions DRAFT→PENDING_APPROVAL→APPROVED→PARTIALLY_RECEIVED→RECEIVED; NO JE; PO approval auto-promotes linked PR to CONVERTED_TO_PO atomically.
  - `src/app/api/goods-receipt/route.ts` — POST: code `GR-NNNN`, status PENDING; **DOES POST A JE** — GRNI: Dr INVENTORY/PROJECT_COST, Cr GRNI, sourceType=GOODS_RECEIPT; PO status auto-recomputed; P5-CRIT-012/013/014 fixes for StockMovement + InventoryItem + EquipmentCost.
  - `src/app/api/supplier-invoices/route.ts` + `[id]/route.ts` — POST: code `SI-NNNN`, status DRAFT, NO JE (P5-CRIT-001); PUT DRAFT→SENT calls `createPurchaseInvoiceJournalEntry` → Dr EXPENSE+VAT_INPUT/Cr SUPPLIER_AP, sourceType=PURCHASE_INVOICE; costCenterId propagated (P5-CRIT-010).
  - `src/app/api/supplier-payments/route.ts` — POST: creates payment + JE inline via `createSupplierPaymentJournalEntry` → Dr SUPPLIER_AP/Cr CASH, sourceType=SUPPLIER_PAYMENT; updates invoice.paidAmount+status; P5-CRIT-009 overpayment guard; P5-CRIT-011 PO.paidAmount update.
- Inspected `src/lib/auto-journal.ts:149-321` for `createPurchaseInvoiceJournalEntry` (PURCHASE_CATEGORY_ROLE_MAP) and `createSupplierPaymentJournalEntry`.
- Inspected `prisma/schema.prisma` for exact model fields and enum values (PurchaseRequestStatus, PurchaseOrderStatus, GoodsReceiptStatus, InvoiceStatus).

## Deliverables

1. **`docs/WORKFLOW-PURCHASE-CYCLE.md`** — full documentation following the construction-cycle doc format.
2. **`scripts/e2e-purchase-cycle.ts`** — 600-line E2E test mirroring the construction-cycle test pattern.

## Results

- `bun scripts/e2e-purchase-cycle.ts` — **43 passed, 0 failed**.
- `bun scripts/e2e-construction-cycle.ts` — re-run: 59 passed, 0 failed (no regression).
- `bun run lint` — clean (exit 0).
- Test is idempotent (cleanup verified — running twice produces same PASS).

## Key Findings

- Supplier, PurchaseRequest, PurchaseOrder: NO JE.
- GoodsReceipt: POSTS JE at creation — Dr INVENTORY/PROJECT_COST, Cr GRNI.
- PurchaseInvoice DRAFT→SENT: POSTS JE on transition — Dr EXPENSE+VAT_INPUT, Cr SUPPLIER_AP.
- SupplierPayment: POSTS JE inline — Dr SUPPLIER_AP, Cr CASH.
- GRNI clearing: NOT automatic — documented as known trade-off.
- PO.journalEntryId: always NULL (reserved for future commitment tracking).
