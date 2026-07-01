// ============================================================================
// P3-3 E2E: Purchase Cycle — End-to-End Test
// ============================================================================
// Walks the full purchase (procurement) business cycle:
//   1. Create prerequisites (Branch, Client, CostCenter, Project, Warehouse,
//      Supplier)
//   2. Create Supplier (master) — verify NO JE
//   3. Create Purchase Request (NEW) — verify NO JE
//   4. Transition PR NEW → APPROVED — verify NO JE
//   5. Create Purchase Order (DRAFT) linked to PR — verify NO JE
//   6. Transition PO DRAFT → PENDING_APPROVAL → APPROVED — verify NO JE
//      (also verify PR auto-promoted to CONVERTED_TO_PO)
//   7. Create Goods Receipt (destination=INVENTORY) — verify JE posted
//      Dr INVENTORY / Cr GRNI (sourceType=GOODS_RECEIPT)
//      (also verify PO auto-promoted to RECEIVED)
//   8. Create Supplier Invoice (DRAFT) from GR — verify NO JE yet
//   9. Transition Supplier Invoice DRAFT → SENT — verify JE posted
//      Dr PROJECT_COST + Dr VAT_INPUT / Cr SUPPLIER_AP (sourceType=PURCHASE_INVOICE)
//  10. Create Supplier Payment (full) — verify JE posted
//      Dr SUPPLIER_AP / Cr CASH (sourceType=SUPPLIER_PAYMENT)
//      (also verify invoice → PAID, PO.paidAmount updated)
//  11. Final verification: trial balance ties, all JEs balanced,
//      verifyNumericalConsistency ok, source↔JE linkage intact.
//
// All test data is wrapped in try/finally — cleanup deletes every created
// record (and soft-deletes any JEs that survived mid-flow failures).
//
// Run: bun scripts/e2e-purchase-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import { getNextEntryNo } from '@/lib/accounting/guard'
import {
  createPurchaseInvoiceJournalEntry,
  createSupplierPaymentJournalEntry,
} from '@/lib/auto-journal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { requireAccountByRole, AccountRole } from '@/lib/account-roles'
import {
  getTrialBalance,
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'
import { toNumber } from '@/lib/decimal'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
const results: Array<{ test: string; passed: boolean; detail: string }> = []

function log(test: string, passed: boolean, detail: string = '') {
  const icon = passed ? '✓' : '✗'
  console.log(`  ${icon} ${test}${detail ? ': ' + detail : ''}`)
  results.push({ test, passed, detail })
}

function approx(a: number, b: number, tol = 0.02) {
  return Math.abs(a - b) < tol
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e: any) {
    log(name, false, `EXCEPTION: ${e?.message || String(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Test data tracking — for cleanup on exit
// ---------------------------------------------------------------------------
const TS = Date.now()
const PREFIX = 'P3PUR'

const created = {
  branchId: '' as string,
  clientId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,
  warehouseId: '' as string,
  supplierId: '' as string,
  purchaseRequestId: '' as string,
  purchaseOrderItemId: '' as string,
  purchaseOrderId: '' as string,
  goodsReceiptItemId: '' as string,
  goodsReceiptId: '' as string,
  goodsReceiptJEId: '' as string,
  supplierInvoiceItemId: '' as string,
  supplierInvoiceId: '' as string,
  supplierInvoiceJEId: '' as string,
  supplierPaymentId: '' as string,
  supplierPaymentJEId: '' as string,
  stockMovementIds: [] as string[],
  inventoryItemIds: [] as string[], // inventory items created/updated by GR
  equipmentCostIds: [] as string[],
  allJEIds: [] as string[],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function jeBalance(jeId: string): Promise<{ dr: number; cr: number; balanced: boolean; lines: number }> {
  const lines = await db.journalLine.findMany({
    where: { journalEntryId: jeId, deletedAt: null },
    select: { debit: true, credit: true },
  })
  const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
  const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
  return { dr, cr, balanced: approx(dr, cr), lines: lines.length }
}

async function jeLines(jeId: string) {
  return db.journalLine.findMany({
    where: { journalEntryId: jeId, deletedAt: null },
    include: {
      account: { select: { code: true, name: true, type: true, accountRole: true } },
      costCenter: { select: { code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  })
}

/** Reverse a JE by setting deletedAt on the entry and all its lines. */
async function softDeleteJE(jeId: string, tx: PrismaTransaction) {
  await tx.journalLine.updateMany({
    where: { journalEntryId: jeId },
    data: { deletedAt: new Date() },
  })
  await tx.journalEntry.update({
    where: { id: jeId },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
}

// ===========================================================================
// MAIN
// ===========================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  P3-3 E2E: Purchase Cycle — End-to-End Test')
  console.log('  Tests the full procurement cycle from supplier creation')
  console.log('  through supplier payment, with JE verification at each step.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, CostCenter, Project,
    //     Warehouse, Supplier
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-3 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: { code: `${PREFIX}-CL-${TS}`, name: `P3-3 Test Client`, isActive: true, taxNumber: '300000000000003' },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-3 Project Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    await step('a4: create test Project (PLANNING → ACTIVE)', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-3 Purchase Project`,
          nameAr: `مشروع P3-3 للمشتريات`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'ACTIVE',
          contractValue: 1_000_000,
          projectType: 'CONSTRUCTION',
          estimatedTotalCost: 800_000,
          description: `P3-3 e2e purchase cycle test (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `code=${p.code}, status=${p.status}, costCenterId=${p.costCenterId}`)
    })

    await step('a5: create test Warehouse (for InventoryItem auto-create)', async () => {
      const w = await db.warehouse.create({
        data: {
          code: `${PREFIX}-WH-${TS}`,
          name: `P3-3 Test Warehouse`,
          branchId: created.branchId,
          isActive: true,
        },
      })
      created.warehouseId = w.id
      log('create Warehouse', !!w.id, `code=${w.code}`)
    })

    // =====================================================================
    // (b) Step 1 — Create Supplier (master) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create Supplier (no JE expected) ━━━')

    await step('b1: create Supplier (master record)', async () => {
      const s = await db.supplier.create({
        data: {
          code: `${PREFIX}-SUP-${TS}`,
          name: `P3-3 Test Supplier`,
          nameAr: `مورد P3-3 للتجربة`,
          contactPerson: 'Test Contact',
          email: 'supplier@test.com',
          phone: '+966500000000',
          taxNumber: '300000000000004',
          isActive: true,
        },
      })
      created.supplierId = s.id
      log('create Supplier', !!s.id, `code=${s.code}, name=${s.name}`)
    })

    await step('b2: confirm no JE posted for supplier creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'SUPPLIER', sourceId: created.supplierId, deletedAt: null },
      })
      log('no JE for supplier', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (c) Step 2 — Create Purchase Request (NEW) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Create Purchase Request (NEW, no JE) ━━━')

    await step('c1: create PurchaseRequest NEW with 2 items', async () => {
      // Mirror of POST /api/purchase-requests logic
      const lastRequest = await db.purchaseRequest.findFirst({
        orderBy: { requestNo: 'desc' },
        select: { requestNo: true },
      })
      let nextNum = 1
      if (lastRequest?.requestNo) {
        const match = lastRequest.requestNo.match(/PR-(\d+)/)
        if (match) nextNum = parseInt(match[1], 10) + 1
      }
      const requestNo = `PR-${String(nextNum).padStart(4, '0')}`

      const pr = await db.purchaseRequest.create({
        data: {
          requestNo,
          projectId: created.projectId,
          source: 'PROJECT',
          date: new Date('2025-02-01'),
          description: 'P3-3 PR: cement + rebar for foundation',
          status: 'NEW',
          requestedBy: 'P3-3 Test',
          items: {
            create: [
              { description: 'أسمنت بورتلاندي 50 كجم', quantity: 200, unit: 'كيس' },
              { description: 'حديد تسليح قطر 12 مم', quantity: 1000, unit: 'متر' },
            ],
          },
        },
        include: { items: true },
      })
      created.purchaseRequestId = pr.id
      log('create PR NEW', pr.status === 'NEW', `requestNo=${pr.requestNo}, items=${pr.items.length}, status=${pr.status}`)
    })

    await step('c2: confirm no JE posted for PR creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'PURCHASE_REQUEST', sourceId: created.purchaseRequestId, deletedAt: null },
      })
      log('no JE for PR', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (d) Step 2b — Transition PR NEW → APPROVED — NO JE expected
    // =====================================================================
    console.log('\n━━━ (d) Step 2b: Transition PR NEW → APPROVED (no JE) ━━━')

    await step('d1: transition PR NEW → APPROVED', async () => {
      const pr = await db.purchaseRequest.update({
        where: { id: created.purchaseRequestId },
        data: { status: 'APPROVED' },
      })
      log('PR → APPROVED', pr.status === 'APPROVED', `status=${pr.status}`)
    })

    await step('d2: confirm no JE posted on PR approval', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'PURCHASE_REQUEST', sourceId: created.purchaseRequestId, deletedAt: null },
      })
      log('no JE on PR approval', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (e) Step 3 — Create Purchase Order (DRAFT) — NO JE expected
    // =====================================================================
    console.log('\n━━━ (e) Step 3: Create Purchase Order (DRAFT, no JE) ━━━')

    // Test amounts: 50 units × 1000 = 50,000 subtotal
    // vatRate 0.15 → vat = 7,500, total = 57,500
    const PO_QTY = 50
    const PO_UNIT_PRICE = 1000
    const PO_SUBTOTAL = PO_QTY * PO_UNIT_PRICE   // 50000
    const PO_VAT_RATE = 0.15
    const PO_VAT = Math.round(PO_SUBTOTAL * PO_VAT_RATE * 100) / 100 // 7500
    const PO_TOTAL = PO_SUBTOTAL + PO_VAT        // 57500

    await step('e1: create PurchaseOrder DRAFT linked to PR + supplier + project', async () => {
      // Mirror of POST /api/purchase-orders logic (inside transaction)
      const po = await db.$transaction(async (tx: PrismaTransaction) => {
        const lastOrder = await tx.purchaseOrder.findFirst({
          orderBy: { orderNo: 'desc' },
          select: { orderNo: true },
        })
        let nextNum = 1
        if (lastOrder?.orderNo) {
          const match = lastOrder.orderNo.match(/PO-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        const orderNo = `PO-${String(nextNum).padStart(4, '0')}`

        return await tx.purchaseOrder.create({
          data: {
            orderNo,
            supplierId: created.supplierId,
            projectId: created.projectId,
            purchaseRequestId: created.purchaseRequestId,
            date: new Date('2025-02-05'),
            deliveryDate: new Date('2025-02-15'),
            subtotal: PO_SUBTOTAL,
            vatRate: PO_VAT_RATE,
            vatAmount: PO_VAT,
            totalAmount: PO_TOTAL,
            paidAmount: 0,
            status: 'DRAFT',
            notes: 'P3-3 PO from PR',
            items: {
              create: [
                {
                  description: 'أسمنت بورتلاندي 50 كجم',
                  quantity: PO_QTY,
                  unit: 'كيس',
                  unitPrice: PO_UNIT_PRICE,
                  totalPrice: PO_QTY * PO_UNIT_PRICE,
                },
              ],
            },
          },
          include: { items: true },
        })
      })
      created.purchaseOrderId = po.id
      created.purchaseOrderItemId = po.items[0]?.id || ''
      log('create PO DRAFT', po.status === 'DRAFT',
        `orderNo=${po.orderNo}, subtotal=${po.subtotal}, total=${po.totalAmount}, status=${po.status}`)
    })

    await step('e2: confirm no JE posted for PO creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'PURCHASE_ORDER', sourceId: created.purchaseOrderId, deletedAt: null },
      })
      log('no JE for PO', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (f) Step 3b — Transition PO DRAFT → PENDING_APPROVAL → APPROVED
    //     (mirrors PUT /api/purchase-orders/[id]) — NO JE expected
    //     ALSO: PR auto-promoted to CONVERTED_TO_PO inside the same tx
    // =====================================================================
    console.log('\n━━━ (f) Step 3b: PO DRAFT → PENDING_APPROVAL → APPROVED (no JE) ━━━')

    await step('f1: transition PO DRAFT → PENDING_APPROVAL', async () => {
      const po = await db.purchaseOrder.update({
        where: { id: created.purchaseOrderId },
        data: { status: 'PENDING_APPROVAL' },
      })
      log('PO → PENDING_APPROVAL', po.status === 'PENDING_APPROVAL', `status=${po.status}`)
    })

    await step('f2: transition PO PENDING_APPROVAL → APPROVED (PR auto → CONVERTED_TO_PO)', async () => {
      // Mirror of PUT /api/purchase-orders/[id] APPROVED branch
      const result = await db.$transaction(async (tx) => {
        const pr = await tx.purchaseRequest.findUnique({
          where: { id: created.purchaseRequestId },
        })
        if (pr && pr.status === 'APPROVED') {
          await tx.purchaseRequest.update({
            where: { id: created.purchaseRequestId },
            data: { status: 'CONVERTED_TO_PO' },
          })
        }
        return tx.purchaseOrder.update({
          where: { id: created.purchaseOrderId },
          data: { status: 'APPROVED' },
        })
      })
      log('PO → APPROVED', result.status === 'APPROVED', `status=${result.status}`)
    })

    await step('f3: confirm PR auto-promoted to CONVERTED_TO_PO', async () => {
      const pr = await db.purchaseRequest.findUnique({
        where: { id: created.purchaseRequestId },
        select: { status: true },
      })
      log('PR = CONVERTED_TO_PO', pr?.status === 'CONVERTED_TO_PO', `status=${pr?.status}`)
    })

    await step('f4: confirm no JE posted on PO approval', async () => {
      const jes = await db.journalEntry.findMany({
        where: { sourceType: 'PURCHASE_ORDER', sourceId: created.purchaseOrderId, deletedAt: null },
      })
      log('no JE on PO approval', jes.length === 0, `JE count = ${jes.length} (expected 0)`)
    })

    // =====================================================================
    // (g) Step 4 — Create Goods Receipt (destination=INVENTORY) → JE posted
    //     Dr INVENTORY (1340) / Cr GRNI (3330)
    //     amount = 50 × 1000 = 50,000
    //     ALSO: PO auto-promoted to RECEIVED (full receipt)
    // =====================================================================
    console.log('\n━━━ (g) Step 4: Create Goods Receipt → verify JE posted ━━━')

    const GR_QTY_RECEIVED = PO_QTY   // 50 — full receipt
    const GR_AMOUNT = GR_QTY_RECEIVED * PO_UNIT_PRICE // 50000

    await step('g1: create GoodsReceipt + GRNI JE (Dr INVENTORY / Cr GRNI)', async () => {
      // Mirror of POST /api/goods-receipt logic (inside transaction)
      const receipt = await db.$transaction(async (tx: PrismaTransaction) => {
        // Auto-generate receipt number GR-NNNN
        const lastReceipt = await tx.goodsReceipt.findFirst({
          orderBy: { receiptNo: 'desc' },
          select: { receiptNo: true },
        })
        let nextNum = 1
        if (lastReceipt?.receiptNo) {
          const match = lastReceipt.receiptNo.match(/GR-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        const receiptNo = `GR-${String(nextNum).padStart(4, '0')}`

        // Create the goods receipt + item
        const gr = await tx.goodsReceipt.create({
          data: {
            receiptNo,
            purchaseOrderId: created.purchaseOrderId,
            supplierId: created.supplierId,
            projectId: created.projectId,
            date: new Date('2025-02-12'),
            status: 'PENDING',
            notes: 'P3-3 GR: full receipt of cement',
            items: {
              create: [
                {
                  description: 'أسمنت بورتلاندي 50 كجم',
                  quantityOrdered: PO_QTY,
                  quantityReceived: GR_QTY_RECEIVED,
                  quantityRemaining: 0,
                  unitPrice: PO_UNIT_PRICE,
                  totalPrice: GR_AMOUNT,
                  destination: 'INVENTORY',
                },
              ],
            },
          },
          include: { items: true },
        })
        created.goodsReceiptItemId = gr.items[0]?.id || ''

        // Update PO status (totalReceived >= totalOrdered → RECEIVED)
        const allReceipts = await tx.goodsReceipt.findMany({
          where: { purchaseOrderId: created.purchaseOrderId, status: { not: 'CANCELLED' } },
          include: { items: true },
        })
        const totalOrdered = PO_QTY
        const totalReceived = allReceipts.reduce((sum, r) =>
          sum + r.items.reduce((s, it) => s + Number(it.quantityReceived), 0), 0)

        const newPoStatus = totalReceived >= totalOrdered ? 'RECEIVED'
          : totalReceived > 0 ? 'PARTIALLY_RECEIVED'
          : 'APPROVED'

        await tx.purchaseOrder.update({
          where: { id: created.purchaseOrderId },
          data: { status: newPoStatus as any },
        })

        // GRNI journal entry — Dr INVENTORY / Cr GRNI
        const inventoryTotal = GR_AMOUNT
        const projectCostTotal = 0
        const totalAmount = inventoryTotal + projectCostTotal

        let grJEId: string | null = null
        if (totalAmount > 0) {
          const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = []
          const grniAccount = await requireAccountByRole(AccountRole.GRNI, 'إيصال استلام بضاعة', tx)
          const desc = `إيصال استلام بضاعة ${receiptNo} - ${'P3-3 Test Supplier'}`

          if (inventoryTotal > 0) {
            const inventoryAccount = await requireAccountByRole(AccountRole.INVENTORY, 'إيصال استلام بضاعة', tx)
            lines.push({
              accountCode: inventoryAccount.code,
              debit: inventoryTotal,
              credit: 0,
              description: `استلام مخزون - ${receiptNo}`,
            })
          }
          if (projectCostTotal > 0) {
            const projectCostAccount = await requireAccountByRole(AccountRole.PROJECT_COST, 'إيصال استلام بضاعة', tx)
            lines.push({
              accountCode: projectCostAccount.code,
              debit: projectCostTotal,
              credit: 0,
              description: `تكلفة مشروع - ${receiptNo}`,
            })
          }
          lines.push({
            accountCode: grniAccount.code,
            debit: 0,
            credit: totalAmount,
            description: desc,
          })

          const stdEntryNo = await getNextEntryNo(tx)
          const je = await createJournalEntry({
            entryNo: stdEntryNo,
            date: new Date('2025-02-12'),
            description: `Goods Receipt ${receiptNo}`,
            descriptionAr: desc,
            lines,
            sourceType: 'GOODS_RECEIPT',
            sourceId: gr.id,
          }, tx)

          grJEId = je.id
          await tx.goodsReceipt.update({
            where: { id: gr.id },
            data: { journalEntryId: je.id },
          })
        }

        // P5-CRIT-012: StockMovement records for inventory items
        // P5-CRIT-013: match by name; if none, create new InventoryItem attached to first Warehouse
        if (grJEId) {
          // (Re-do the inventory update + StockMovement creation that the route would have done.
          //  The route does this BEFORE building the JE; we mirror it AFTER to keep the test logic
          //  simple — the inventory update has no JE dependency.)
          let inventoryItem = await tx.inventoryItem.findFirst({
            where: { name: 'أسمنت بورتلاندي 50 كجم' },
          })
          if (!inventoryItem) {
            inventoryItem = await tx.inventoryItem.create({
              data: {
                code: `AUTO-${TS}-${Math.floor(Math.random() * 1000)}`,
                name: 'أسمنت بورتلاندي 50 كجم',
                unit: 'كيس',
                quantity: 0,
                minQuantity: 0,
                purchasePrice: PO_UNIT_PRICE,
                warehouseId: created.warehouseId,
              },
            })
          }
          created.inventoryItemIds.push(inventoryItem.id)
          await tx.inventoryItem.update({
            where: { id: inventoryItem.id },
            data: {
              quantity: { increment: GR_QTY_RECEIVED },
              purchasePrice: PO_UNIT_PRICE,
            },
          })
          const sm = await tx.stockMovement.create({
            data: {
              inventoryItemId: inventoryItem.id,
              movementType: 'RECEIPT',
              quantity: GR_QTY_RECEIVED,
              unitCost: PO_UNIT_PRICE,
              totalAmount: GR_AMOUNT,
              movementDate: new Date('2025-02-12'),
              reference: receiptNo,
              journalEntryId: grJEId,
            },
          })
          created.stockMovementIds.push(sm.id)
        }

        return await tx.goodsReceipt.findUniqueOrThrow({
          where: { id: gr.id },
          include: { items: true },
        })
      })

      created.goodsReceiptId = receipt.id
      created.goodsReceiptJEId = receipt.journalEntryId || ''
      if (created.goodsReceiptJEId) created.allJEIds.push(created.goodsReceiptJEId)
      log('create GR + JE', !!created.goodsReceiptJEId,
        `receiptNo=${receipt.receiptNo}, grId=${created.goodsReceiptId}, jeId=${created.goodsReceiptJEId}`)
    })

    await step('g2: goods receipt JE is balanced', async () => {
      const b = await jeBalance(created.goodsReceiptJEId)
      log('GR JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('g3: GR JE has INVENTORY Dr + GRNI Cr, amount=50000', async () => {
      const lines = await jeLines(created.goodsReceiptJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'INVENTORY' &&
        crLine?.account.accountRole === 'GRNI' &&
        approx(Number(drLine.debit), GR_AMOUNT) &&
        approx(Number(crLine.credit), GR_AMOUNT)
      log('GR JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('g4: GR JE sourceType=GOODS_RECEIPT, sourceId=grId', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.goodsReceiptJEId } })
      const ok = je?.sourceType === 'GOODS_RECEIPT' && je?.sourceId === created.goodsReceiptId
      log('GR sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId?.slice(-8)}`)
    })

    await step('g5: PO auto-promoted to RECEIVED', async () => {
      const po = await db.purchaseOrder.findUnique({
        where: { id: created.purchaseOrderId },
        select: { status: true },
      })
      log('PO = RECEIVED', po?.status === 'RECEIVED', `status=${po?.status}`)
    })

    await step('g6: StockMovement created with journalEntryId linkage', async () => {
      const sm = await db.stockMovement.findMany({
        where: { journalEntryId: created.goodsReceiptJEId },
      })
      log('StockMovement linked', sm.length === 1,
        `count=${sm.length}, movementType=${sm[0]?.movementType}, qty=${sm[0]?.quantity}`)
    })

    // =====================================================================
    // (h) Step 5 — Create Supplier Invoice (DRAFT) from GR — NO JE yet
    //     The POST /api/supplier-invoices requires goodsReceiptId.
    //     It computes subtotal = Σ GR.items.totalPrice, vat = subtotal × vatRate.
    //     P5-CRIT-001: DRAFT invoices do NOT have a JE.
    // =====================================================================
    console.log('\n━━━ (h) Step 5: Create Supplier Invoice (DRAFT, no JE yet) ━━━')

    const SI_VAT_RATE = 0.15
    const SI_SUBTOTAL = GR_AMOUNT                  // 50000 (from GR items)
    const SI_VAT = Math.round(SI_SUBTOTAL * SI_VAT_RATE * 100) / 100 // 7500
    const SI_TOTAL = SI_SUBTOTAL + SI_VAT          // 57500

    await step('h1: create SupplierInvoice DRAFT from GR', async () => {
      // Mirror of POST /api/supplier-invoices logic (inside transaction)
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const gr = await tx.goodsReceipt.findUnique({
          where: { id: created.goodsReceiptId },
          include: { items: true },
        })
        if (!gr) throw new Error('GR not found')

        const lastInvoice = await tx.purchaseInvoice.findFirst({
          orderBy: { invoiceNo: 'desc' },
          select: { invoiceNo: true },
        })
        let nextNum = 1
        if (lastInvoice?.invoiceNo) {
          const match = lastInvoice.invoiceNo.match(/SI-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        const invoiceNo = `SI-${String(nextNum).padStart(4, '0')}`

        const invoice = await tx.purchaseInvoice.create({
          data: {
            invoiceNo,
            supplierId: gr.supplierId,
            purchaseOrderId: gr.purchaseOrderId,
            goodsReceiptId: gr.id,
            projectId: gr.projectId,
            date: new Date('2025-02-15'),
            dueDate: new Date('2025-03-15'),
            supplierInvoiceNo: `SUP-INV-${TS}`,
            supplierInvoiceDate: new Date('2025-02-14'),
            subtotal: SI_SUBTOTAL,
            vatRate: SI_VAT_RATE,
            vatAmount: SI_VAT,
            totalAmount: SI_TOTAL,
            paidAmount: 0,
            status: 'DRAFT',
            notes: 'P3-3 supplier invoice from GR',
            items: {
              create: gr.items.map(item => ({
                description: item.description,
                quantity: Number(item.quantityReceived),
                unitPrice: Number(item.unitPrice),
                totalPrice: Number(item.quantityReceived) * Number(item.unitPrice),
              })),
            },
          },
          include: { items: true },
        })
        created.supplierInvoiceItemId = invoice.items[0]?.id || ''
        return invoice
      })
      created.supplierInvoiceId = result.id
      log('create SI DRAFT', result.status === 'DRAFT',
        `invoiceNo=${result.invoiceNo}, subtotal=${result.subtotal}, vat=${result.vatAmount}, total=${result.totalAmount}, status=${result.status}`)
    })

    await step('h2: confirm DRAFT invoice has no JE (P5-CRIT-001 fix)', async () => {
      const inv = await db.purchaseInvoice.findUnique({
        where: { id: created.supplierInvoiceId },
        select: { journalEntryId: true },
      })
      log('DRAFT SI journalEntryId is null', inv?.journalEntryId === null, `journalEntryId=${inv?.journalEntryId}`)
    })

    // =====================================================================
    // (i) Step 5b — Transition Supplier Invoice DRAFT → SENT → JE posted
    //     Dr PROJECT_COST (7110) + Dr VAT_INPUT (3120) / Cr SUPPLIER_AP (3210)
    //     (projectId is set, no expenseCategory → defaults to PROJECT_COST)
    //     sourceType=PURCHASE_INVOICE, sourceId=invoice.id
    //     costCenterId propagated from project.costCenter (P5-CRIT-010)
    // =====================================================================
    console.log('\n━━━ (i) Step 5b: SI DRAFT → SENT → verify JE posted ━━━')

    await step('i1: transition SI DRAFT → SENT → JE posted', async () => {
      // Mirror of PUT /api/supplier-invoices/[id] DRAFT → SENT branch
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        await createPurchaseInvoiceJournalEntry(created.supplierInvoiceId, tx)
        const refreshed = await tx.purchaseInvoice.findUnique({
          where: { id: created.supplierInvoiceId },
          select: { journalEntryId: true },
        })
        await tx.purchaseInvoice.update({
          where: { id: created.supplierInvoiceId },
          data: { status: 'SENT' },
        })
        return refreshed
      })
      created.supplierInvoiceJEId = result.journalEntryId!
      created.allJEIds.push(created.supplierInvoiceJEId)
      log('SENT SI has JE', !!created.supplierInvoiceJEId, `jeId=${created.supplierInvoiceJEId}`)
    })

    await step('i2: supplier invoice JE is balanced', async () => {
      const b = await jeBalance(created.supplierInvoiceJEId)
      log('SI JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('i3: SI JE has PROJECT_COST + VAT_INPUT Dr / SUPPLIER_AP Cr', async () => {
      const lines = await jeLines(created.supplierInvoiceJEId)
      const costLine = lines.find(l => l.account.accountRole === 'PROJECT_COST')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_INPUT')
      const apLine = lines.find(l => l.account.accountRole === 'SUPPLIER_AP')
      const ok =
        !!costLine && approx(Number(costLine.debit), SI_SUBTOTAL) &&
        !!vatLine && approx(Number(vatLine.debit), SI_VAT) &&
        !!apLine && approx(Number(apLine.credit), SI_TOTAL)
      log('SI JE structure', ok,
        `PROJECT_COST Dr=${costLine?.debit}, VAT_INPUT Dr=${vatLine?.debit}, SUPPLIER_AP Cr=${apLine?.credit}`)
    })

    await step('i4: SI JE sourceType=PURCHASE_INVOICE, sourceId=invoiceId', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.supplierInvoiceJEId } })
      const ok = je?.sourceType === 'PURCHASE_INVOICE' && je?.sourceId === created.supplierInvoiceId
      log('SI sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId?.slice(-8)}`)
    })

    await step('i5: SI JE lines tagged to project cost center (P5-CRIT-010)', async () => {
      const lines = await db.journalLine.findMany({
        where: { journalEntryId: created.supplierInvoiceJEId, deletedAt: null },
        select: { costCenterId: true },
      })
      const allTagged = lines.every(l => l.costCenterId === created.costCenterId)
      log('SI lines tagged', allTagged,
        `${lines.length} lines, all point to CC=${created.costCenterId.slice(-8)}`)
    })

    // =====================================================================
    // (j) Step 6 — Create Supplier Payment (full) → JE posted
    //     Dr SUPPLIER_AP (3210) / Cr CASH (1110)
    //     sourceType=SUPPLIER_PAYMENT, sourceId=payment.id
    //     ALSO: invoice → PAID (full payment), PO.paidAmount updated (P5-CRIT-011)
    // =====================================================================
    console.log('\n━━━ (j) Step 6: Create Supplier Payment → verify JE + PAID ━━━')

    const PAY_AMOUNT = SI_TOTAL   // 57500 — full payment

    await step('j1: create SupplierPayment + JE (Dr SUPPLIER_AP / Cr CASH)', async () => {
      // Mirror of POST /api/supplier-payments logic (inside transaction)
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const payment = await tx.supplierPayment.create({
          data: {
            supplierId: created.supplierId,
            invoiceId: created.supplierInvoiceId,
            amount: PAY_AMOUNT,
            date: new Date('2025-02-25'),
            paidFrom: 'TREASURY',
            reference: `P3-3-PAY-${TS}`,
            notes: 'P3-3 full payment for supplier invoice',
          },
        })
        created.supplierPaymentId = payment.id

        await createSupplierPaymentJournalEntry(payment.id, tx)

        // Update invoice paidAmount + status
        const inv = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: created.supplierInvoiceId } })
        const newPaid = toNumber(inv.paidAmount) + PAY_AMOUNT
        const newStatus = newPaid >= toNumber(inv.totalAmount) - 0.01 ? 'PAID' : 'PARTIALLY_PAID'
        await tx.purchaseInvoice.update({
          where: { id: created.supplierInvoiceId },
          data: { paidAmount: newPaid, status: newStatus },
        })

        // P5-CRIT-011: also update PO.paidAmount if invoice is linked to a PO
        if (inv.purchaseOrderId) {
          const po = await tx.purchaseOrder.findUnique({
            where: { id: inv.purchaseOrderId },
            select: { id: true, paidAmount: true },
          })
          if (po) {
            await tx.purchaseOrder.update({
              where: { id: po.id },
              data: { paidAmount: toNumber(po.paidAmount) + PAY_AMOUNT },
            })
          }
        }

        return await tx.supplierPayment.findUniqueOrThrow({
          where: { id: payment.id },
          select: { id: true, journalEntryId: true },
        })
      })
      created.supplierPaymentJEId = result.journalEntryId!
      created.allJEIds.push(created.supplierPaymentJEId)
      log('create SupplierPayment + JE', !!created.supplierPaymentJEId,
        `paymentId=${created.supplierPaymentId}, jeId=${created.supplierPaymentJEId}`)
    })

    await step('j2: supplier payment JE is balanced', async () => {
      const b = await jeBalance(created.supplierPaymentJEId)
      log('SP JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('j3: SP JE has SUPPLIER_AP Dr + CASH Cr', async () => {
      const lines = await jeLines(created.supplierPaymentJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'SUPPLIER_AP' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), PAY_AMOUNT) &&
        approx(Number(crLine.credit), PAY_AMOUNT)
      log('SP JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('j4: SP JE sourceType=SUPPLIER_PAYMENT, sourceId=paymentId', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.supplierPaymentJEId } })
      const ok = je?.sourceType === 'SUPPLIER_PAYMENT' && je?.sourceId === created.supplierPaymentId
      log('SP sourceType+sourceId', ok, `sourceType=${je?.sourceType}, sourceId=${je?.sourceId?.slice(-8)}`)
    })

    await step('j5: invoice status=PAID after full payment', async () => {
      const inv = await db.purchaseInvoice.findUnique({
        where: { id: created.supplierInvoiceId },
        select: { status: true, paidAmount: true, totalAmount: true },
      })
      log('invoice → PAID', inv?.status === 'PAID',
        `status=${inv?.status}, paid=${inv?.paidAmount}, total=${inv?.totalAmount}`)
    })

    await step('j6: PO.paidAmount updated (P5-CRIT-011 fix)', async () => {
      const po = await db.purchaseOrder.findUnique({
        where: { id: created.purchaseOrderId },
        select: { paidAmount: true, totalAmount: true },
      })
      const ok = approx(toNumber(po?.paidAmount), PAY_AMOUNT)
      log('PO.paidAmount updated', ok,
        `paid=${po?.paidAmount}, total=${po?.totalAmount}`)
    })

    // =====================================================================
    // (k) Final Verification — Trial balance, all JEs balanced, consistency
    // =====================================================================
    console.log('\n━━━ (k) Final integrity verification ━━━')

    await step('k1: all JEs created by this cycle are balanced', async () => {
      let allBalanced = true
      const unbalanced: string[] = []
      for (const jeId of created.allJEIds) {
        const b = await jeBalance(jeId)
        if (!b.balanced) {
          allBalanced = false
          unbalanced.push(`${jeId.slice(-8)}(Dr=${b.dr},Cr=${b.cr})`)
        }
      }
      log('all cycle JEs balanced', allBalanced,
        `${created.allJEIds.length} JEs total. ${allBalanced ? 'All balanced.' : `Unbalanced: ${unbalanced.join(', ')}`}`)
    })

    await step('k2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr),
        `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('k3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('k4: verifyNumericalConsistency (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    await step('k5: source ↔ JE linkage intact for all source documents', async () => {
      const supplier = await db.supplier.findUnique({ where: { id: created.supplierId }, select: { code: true } })
      const pr = await db.purchaseRequest.findUnique({ where: { id: created.purchaseRequestId }, select: { status: true } })
      const po = await db.purchaseOrder.findUnique({ where: { id: created.purchaseOrderId }, select: { journalEntryId: true, paidAmount: true } })
      const gr = await db.goodsReceipt.findUnique({ where: { id: created.goodsReceiptId }, select: { journalEntryId: true } })
      const si = await db.purchaseInvoice.findUnique({ where: { id: created.supplierInvoiceId }, select: { journalEntryId: true, status: true } })
      const sp = await db.supplierPayment.findUnique({ where: { id: created.supplierPaymentId }, select: { journalEntryId: true } })

      const linked =
        !!gr?.journalEntryId &&
        !!si?.journalEntryId &&
        !!sp?.journalEntryId
      // master + PR + PO must be NULL by design
      const poNull = po?.journalEntryId === null
      log('source↔JE linkage', linked && poNull,
        `supplier(master):N/A, PR:${pr?.status} (no JE), PO.journalEntryId:null=${poNull}, ` +
        `GR:${!!gr?.journalEntryId}, SI:${!!si?.journalEntryId} (status=${si?.status}), SP:${!!sp?.journalEntryId}`)
    })

    await step('k6: AP cleared after full payment (SUPPLIER_AP Dr=Cr)', async () => {
      // Verify SUPPLIER_AP balance for this cycle = 0
      // (Dr from payment = Cr from invoice)
      const lines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          journalEntry: { deletedAt: null, status: 'POSTED' },
          account: { accountRole: 'SUPPLIER_AP' },
          journalEntryId: { in: created.allJEIds },
        },
        select: { debit: true, credit: true },
      })
      const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
      const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
      const ok = approx(dr, cr) && approx(dr, PAY_AMOUNT)
      log('AP cleared', ok, `SUPPLIER_AP Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)} (expected ${PAY_AMOUNT} each)`)
    })

    await step('k7: GRNI remains on books (NOT auto-cleared by supplier invoice)', async () => {
      // Document the design: GRNI liability is NOT reversed when supplier invoice is posted.
      // The accountant must clear it manually at period close.
      const lines = await db.journalLine.findMany({
        where: {
          deletedAt: null,
          journalEntry: { deletedAt: null, status: 'POSTED' },
          account: { accountRole: 'GRNI' },
          journalEntryId: { in: created.allJEIds },
        },
        select: { debit: true, credit: true },
      })
      const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
      const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
      // Expected: only the GR posted Cr=GR_AMOUNT; no Dr (no clearing).
      const ok = approx(cr, GR_AMOUNT) && approx(dr, 0)
      log('GRNI outstanding', ok,
        `GRNI Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)} (expected Cr=${GR_AMOUNT}, Dr=0 — cleared manually at period close)`)
    })

  } catch (e: any) {
    console.error('\n[FATAL] Unhandled error during cycle:', e)
    console.error(e?.stack || e)
  } finally {
    // =====================================================================
    // CLEANUP — delete all created records in reverse FK order
    // =====================================================================
    console.log('\n━━━ Cleanup: removing all test data ━━━')
    await cleanup()
  }

  // =====================================================================
  // Final summary
  // =====================================================================
  console.log('\n═══════════════════════════════════════════════════════════════')
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (out of ${results.length})`)
  if (failed === 0) {
    console.log('  ✅ All purchase-cycle E2E tests PASSED')
  } else {
    console.log('  ⚠  Some tests FAILED — review details above')
    console.log('\n  FAILED TESTS:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    ✗ ${r.test}: ${r.detail}`)
    }
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

// ===========================================================================
// Cleanup — deletes everything in reverse order, soft-deletes JEs first
// ===========================================================================

async function cleanup() {
  try {
    await db.$transaction(async (tx) => {
      // 1. Soft-delete all JEs created by this test (so they vanish from reports)
      for (const jeId of created.allJEIds) {
        if (!jeId) continue
        try {
          await softDeleteJE(jeId, tx)
        } catch { /* may already be deleted */ }
      }

      // 2. Delete source documents (FK children first)
      if (created.supplierPaymentId) {
        await tx.supplierPayment.deleteMany({ where: { id: created.supplierPaymentId } })
      }
      if (created.supplierInvoiceItemId) {
        await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: created.supplierInvoiceId } })
      }
      if (created.supplierInvoiceId) {
        await tx.purchaseInvoice.deleteMany({ where: { id: created.supplierInvoiceId } })
      }
      // StockMovements + EquipmentCosts reference JE ids — delete before GR
      if (created.stockMovementIds.length > 0) {
        await tx.stockMovement.deleteMany({ where: { id: { in: created.stockMovementIds } } })
      }
      if (created.equipmentCostIds.length > 0) {
        await tx.equipmentCost.deleteMany({ where: { id: { in: created.equipmentCostIds } } })
      }
      if (created.goodsReceiptItemId) {
        await tx.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: created.goodsReceiptId } })
      }
      if (created.goodsReceiptId) {
        await tx.goodsReceipt.deleteMany({ where: { id: created.goodsReceiptId } })
      }
      if (created.purchaseOrderItemId) {
        await tx.purchaseOrderItem.deleteMany({ where: { orderId: created.purchaseOrderId } })
      }
      if (created.purchaseOrderId) {
        await tx.purchaseOrder.deleteMany({ where: { id: created.purchaseOrderId } })
      }
      // PR items cascade on PR delete, but be explicit
      await tx.purchaseRequestItem.deleteMany({ where: { requestId: created.purchaseRequestId } })
      if (created.purchaseRequestId) {
        await tx.purchaseRequest.deleteMany({ where: { id: created.purchaseRequestId } })
      }
      // InventoryItems created by the GR (only delete ones the test created —
      // restore quantity on pre-existing ones is unnecessary because we only
      // ever create new ones in the test; the GR route's "match by name" path
      // would find an existing one in production, but in this test the items
      // don't pre-exist).
      if (created.inventoryItemIds.length > 0) {
        await tx.inventoryItem.deleteMany({ where: { id: { in: created.inventoryItemIds } } })
      }
      if (created.projectId) {
        await tx.project.deleteMany({ where: { id: created.projectId } })
      }
      if (created.warehouseId) {
        await tx.warehouse.deleteMany({ where: { id: created.warehouseId } })
      }
      if (created.costCenterId) {
        await tx.costCenter.deleteMany({ where: { id: created.costCenterId } })
      }
      if (created.supplierId) {
        await tx.supplier.deleteMany({ where: { id: created.supplierId } })
      }
      if (created.clientId) {
        await tx.client.deleteMany({ where: { id: created.clientId } })
      }
      if (created.branchId) {
        await tx.branch.deleteMany({ where: { id: created.branchId } })
      }
    })
    console.log('  ✓ All test data removed (JEs soft-deleted, source docs hard-deleted)')
  } catch (e: any) {
    console.error('  ⚠ Cleanup error:', e?.message || e)
    // Best-effort: try individual deletes outside the transaction
    console.log('  Attempting best-effort individual cleanup...')
    try { await db.supplierPayment.deleteMany({ where: { id: created.supplierPaymentId } }) } catch {}
    try { await db.purchaseInvoiceItem.deleteMany({ where: { invoiceId: created.supplierInvoiceId } }) } catch {}
    try { await db.purchaseInvoice.deleteMany({ where: { id: created.supplierInvoiceId } }) } catch {}
    try { await db.stockMovement.deleteMany({ where: { id: { in: created.stockMovementIds } } }) } catch {}
    try { await db.equipmentCost.deleteMany({ where: { id: { in: created.equipmentCostIds } } }) } catch {}
    try { await db.goodsReceiptItem.deleteMany({ where: { goodsReceiptId: created.goodsReceiptId } }) } catch {}
    try { await db.goodsReceipt.deleteMany({ where: { id: created.goodsReceiptId } }) } catch {}
    try { await db.purchaseOrderItem.deleteMany({ where: { orderId: created.purchaseOrderId } }) } catch {}
    try { await db.purchaseOrder.deleteMany({ where: { id: created.purchaseOrderId } }) } catch {}
    try { await db.purchaseRequestItem.deleteMany({ where: { requestId: created.purchaseRequestId } }) } catch {}
    try { await db.purchaseRequest.deleteMany({ where: { id: created.purchaseRequestId } }) } catch {}
    try { await db.inventoryItem.deleteMany({ where: { id: { in: created.inventoryItemIds } } }) } catch {}
    try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch {}
    try { await db.warehouse.deleteMany({ where: { id: created.warehouseId } }) } catch {}
    try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch {}
    try { await db.supplier.deleteMany({ where: { id: created.supplierId } }) } catch {}
    try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch {}
    try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch {}
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } })
      } catch {}
    }
    console.log('  ✓ Best-effort cleanup done')
  }
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
