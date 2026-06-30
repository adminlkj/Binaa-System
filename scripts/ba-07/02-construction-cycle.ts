// ============================================================================
// BA-07.2 — Construction Cycle Acceptance Test (READ-ONLY audit, throwaway harness)
// ============================================================================
// السيناريو (حسب طلب المستخدم):
//   إنشاء مشروع → إعداد الميزانية (BOQ) → إنشاء عقد → أمر شراء → استلام مواد
//   → إصدار مستخلص → تسجيل التكاليف → تسجيل الإيرادات (IFRS15 POC) → احتساب
//   نسبة الإنجاز → إقفال المشروع → مراجعة الربحية والقيود الناتجة.
//
// يستخدم السكربت DIRECT engine/DB calls (لا HTTP) لتفادي تعقيد auth/header
// (لا auth أصلاً في النظام — راجع BA-07.3).
//
// Run: cd /home/z/my-project && bun run scripts/ba-07/02-construction-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createJournalEntry, autoEntryManualCost, type PrismaTransaction } from '@/lib/accounting/engine'
import { requireAccountByRole, AccountRole, getAccountCodeByRole } from '@/lib/account-roles'
import { calculatePOC, calculatePeriodRevenue, autoEntryIFRS15Revenue } from '@/lib/accounting/ifrs15'
import { getProjectBalances, getProjectCostBreakdown, getAccountBalance } from '@/lib/accounting/queries'
import { getNextEntryNo } from '@/lib/accounting/guard'

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------
let passed = 0
let failed = 0
const failures: string[] = []
const warnings: string[] = []
const stepResults: { step: string; result: 'PASS' | 'FAIL' | 'WARN' | 'GAP'; detail: string }[] = []

function approx(a: number, b: number, tol = 0.5) {
  return Math.abs(a - b) < tol
}

function record(step: string, result: 'PASS' | 'FAIL' | 'WARN' | 'GAP', detail: string) {
  stepResults.push({ step, result, detail })
  const sym = result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : result === 'GAP' ? '○' : '⚠'
  console.log(`  ${sym} [${result}] ${step}: ${detail}`)
  if (result === 'PASS') passed++
  else if (result === 'FAIL') { failed++; failures.push(`${step}: ${detail}`) }
  else if (result === 'WARN') warnings.push(`${step}: ${detail}`)
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e: any) {
    record(name, 'FAIL', `EXCEPTION: ${e.message}`)
  }
}

const TS = Date.now()
const PREFIX = 'BA07CON'

// IDs collected during the cycle
const ctx: {
  branchId?: string
  clientId?: string
  supplierId?: string
  warehouseId?: string
  costCenterId?: string
  projectId?: string
  contractId?: string
  boqItemIds?: string[]
  poId?: string
  poItemIds?: string[]
  goodsReceiptId?: string
  goodsReceiptJEId?: string
  costEntryIds?: string[]
  costEntryJEIds?: string[]
  progressClaimId?: string
  ifrs15JEId?: string | null
  totalCostToDate?: number
  pocResult?: any
  periodRevenue?: number
  totalEstimatedCost?: number
  contractValue?: number
} = {}

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
    include: { account: { select: { code: true, name: true, type: true, accountRole: true } }, costCenter: { select: { code: true, name: true } } },
    orderBy: { id: 'asc' },
  })
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BA-07.2 — Construction Cycle Acceptance Test')
  console.log('  (Direct engine/DB calls; read-only on production code)')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // =========================================================================
  // (a) Setup prerequisites: Branch, Client, Supplier, Warehouse, CostCenter
  // =========================================================================
  console.log('━━━ (a) Setup prerequisites ━━━')

  await step('a1: create test Branch', async () => {
    const branch = await db.branch.create({
      data: { code: `${PREFIX}-BR-${TS}`, name: `BA-07.2 Test Branch`, address: 'Test', isActive: true },
    })
    ctx.branchId = branch.id
    record('a1: create test Branch', 'PASS', `id=${branch.id}, code=${branch.code}`)
  })

  await step('a2: create test Warehouse (needed by goods-receipt flow)', async () => {
    const w = await db.warehouse.create({
      data: { code: `${PREFIX}-WH-${TS}`, name: `BA-07.2 Test Warehouse`, branchId: ctx.branchId!, isActive: true },
    })
    ctx.warehouseId = w.id
    record('a2: create test Warehouse', 'PASS', `id=${w.id}, code=${w.code}`)
  })

  await step('a3: create test Client', async () => {
    const c = await db.client.create({
      data: { code: `${PREFIX}-CL-${TS}`, name: `BA-07.2 Test Client`, isActive: true },
    })
    ctx.clientId = c.id
    record('a3: create test Client', 'PASS', `id=${c.id}, code=${c.code}`)
  })

  await step('a4: create test Supplier', async () => {
    const s = await db.supplier.create({
      data: { code: `${PREFIX}-SP-${TS}`, name: `BA-07.2 Test Supplier`, isActive: true },
    })
    ctx.supplierId = s.id
    record('a4: create test Supplier', 'PASS', `id=${s.id}, code=${s.code}`)
  })

  await step('a5: create test CostCenter', async () => {
    const cc = await db.costCenter.create({
      data: { code: `${PREFIX}-CC-${TS}`, name: `BA-07.2 Project Cost Center`, isActive: true },
    })
    ctx.costCenterId = cc.id
    record('a5: create test CostCenter', 'PASS', `id=${cc.id}, code=${cc.code}`)
  })

  // =========================================================================
  // (b) Create project (PLANNING → ACTIVE)
  // =========================================================================
  console.log('\n━━━ (b) Create project ━━━')

  await step('b1: create project (PLANNING) with contractValue=1,000,000', async () => {
    const p = await db.project.create({
      data: {
        code: `${PREFIX}-PROJ-${TS}`,
        name: `BA-07.2 Acceptance Project`,
        nameAr: `مشروع قبول BA-07.2`,
        clientId: ctx.clientId!,
        branchId: ctx.branchId!,
        costCenterId: ctx.costCenterId!,
        startDate: new Date('2025-02-01'),
        endDate: new Date('2025-12-31'),
        status: 'PLANNING',
        contractValue: 1_000_000,
        projectType: 'CONSTRUCTION',
        estimatedTotalCost: 800_000, // for POC: 160k / 800k = 20%
        description: `BA-07.2 construction cycle acceptance test (timestamp ${TS})`,
      },
    })
    ctx.projectId = p.id
    ctx.totalEstimatedCost = Number(p.estimatedTotalCost)
    ctx.contractValue = Number(p.contractValue)
    record('b1: create project', 'PASS',
      `id=${p.id}, code=${p.code}, contractValue=${ctx.contractValue}, estimatedTotalCost=${ctx.totalEstimatedCost}, costCenterId=${p.costCenterId}`)
  })

  await step('b2: transition project PLANNING → ACTIVE', async () => {
    const p = await db.project.update({ where: { id: ctx.projectId! }, data: { status: 'ACTIVE' } })
    record('b2: project → ACTIVE', p.status === 'ACTIVE' ? 'PASS' : 'FAIL', `status=${p.status}`)
  })

  // =========================================================================
  // (c) Budget (BOQ): 4 items totaling ~1,000,000
  // =========================================================================
  console.log('\n━━━ (c) Budget (BOQ) ━━━')

  const boqItems = [
    { code: 'EX-001', description: 'أعمال الحفر', unit: 'م³', quantity: 5000, unitPrice: 30, category: 'EARTHWORK' },     // 150,000
    { code: 'CO-001', description: 'خرسانة مسلحة', unit: 'م³', quantity: 1000, unitPrice: 500, category: 'CONCRETE' },   // 500,000
    { code: 'EL-001', description: 'أعمال كهربائية', unit: 'نقطة', quantity: 500, unitPrice: 200, category: 'ELECTRICAL' }, // 100,000
    { code: 'FN-001', description: 'تشطيبات', unit: 'م²', quantity: 2500, unitPrice: 100, category: 'FINISHES' },         // 250,000
  ] // total = 1,000,000

  await step('c1: create 4 BOQ items (total ~1,000,000)', async () => {
    ctx.boqItemIds = []
    let boqTotal = 0
    for (const b of boqItems) {
      const item = await db.bOQItem.create({
        data: {
          projectId: ctx.projectId!,
          code: b.code,
          description: b.description,
          unit: b.unit,
          quantity: b.quantity,
          unitPrice: b.unitPrice,
          totalPrice: b.quantity * b.unitPrice,
          category: b.category,
        },
      })
      ctx.boqItemIds.push(item.id)
      boqTotal += b.quantity * b.unitPrice
    }
    const result = approx(boqTotal, 1_000_000) ? 'PASS' : 'FAIL'
    record('c1: BOQ items', result, `4 items, boqTotal=${boqTotal} (expected 1,000,000)`)
  })

  // =========================================================================
  // (d) Contract (1,000,000)
  // =========================================================================
  console.log('\n━━━ (d) Contract ━━━')

  await step('d1: create contract (value=1,000,000)', async () => {
    const c = await db.contract.create({
      data: {
        projectId: ctx.projectId!,
        contractNo: `${PREFIX}-CTR-${TS}`,
        date: new Date('2025-02-01'),
        value: 1_000_000,
        vatRate: 0.0, // exclude VAT to keep numbers round; revenue recognition uses pre-VAT
        vatAmount: 0,
        totalValue: 1_000_000,
        startDate: new Date('2025-02-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        contractType: 'PROJECT',
        clientId: ctx.clientId!,
        billingMethod: 'PROGRESS_CLAIMS',
        projectLocation: 'Test Site',
      },
    })
    ctx.contractId = c.id
    const result = Number(c.value) === 1_000_000 && c.status === 'ACTIVE' ? 'PASS' : 'FAIL'
    record('d1: contract', result, `id=${c.id}, contractNo=${c.contractNo}, value=${c.value}, status=${c.status}`)
  })

  // =========================================================================
  // (e) Purchase Order (concrete 200m³ @ 500 = 100,000)
  // =========================================================================
  console.log('\n━━━ (e) Purchase Order ━━━')

  await step('e1: create PO (concrete 200m³ @ 500 = 100,000)', async () => {
    const items = [{ description: 'خرسانة جاهزة', quantity: 200, unit: 'م³', unitPrice: 500 }]
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const vatRate = 0.0
    const vatAmount = subtotal * vatRate
    const totalAmount = subtotal + vatAmount

    const order = await db.$transaction(async (tx: PrismaTransaction) => {
      const lastOrder = await tx.purchaseOrder.findFirst({ orderBy: { orderNo: 'desc' }, select: { orderNo: true } })
      let nextNum = 1
      if (lastOrder?.orderNo) {
        const m = lastOrder.orderNo.match(/PO-(\d+)/)
        if (m) nextNum = parseInt(m[1]) + 1
      }
      const orderNo = `PO-${String(nextNum).padStart(4, '0')}`
      return await tx.purchaseOrder.create({
        data: {
          orderNo,
          supplierId: ctx.supplierId!,
          projectId: ctx.projectId!,
          date: new Date('2025-02-10'),
          deliveryDate: new Date('2025-02-15'),
          subtotal,
          vatRate,
          vatAmount,
          totalAmount,
          paidAmount: 0,
          status: 'DRAFT',
          notes: 'BA-07.2 test PO',
          items: {
            create: items.map(i => ({
              description: i.description, quantity: i.quantity, unit: i.unit,
              unitPrice: i.unitPrice, totalPrice: i.quantity * i.unitPrice,
            })),
          },
        },
        include: { items: true },
      })
    })
    ctx.poId = order.id
    ctx.poItemIds = order.items.map(i => i.id)
    const result = Number(order.subtotal) === 100_000 ? 'PASS' : 'FAIL'
    record('e1: create PO', result, `id=${order.id}, orderNo=${order.orderNo}, subtotal=${order.subtotal}, status=${order.status}`)
  })

  await step('e2: walk PO DRAFT → PENDING_APPROVAL → APPROVED', async () => {
    await db.purchaseOrder.update({ where: { id: ctx.poId! }, data: { status: 'PENDING_APPROVAL' } })
    const approved = await db.purchaseOrder.update({ where: { id: ctx.poId! }, data: { status: 'APPROVED' } })
    const result = approved.status === 'APPROVED' ? 'PASS' : 'FAIL'
    record('e2: PO → APPROVED', result, `status=${approved.status}`)
  })

  // =========================================================================
  // (f) Goods Receipt — Dr Inventory / Cr GRNI
  // =========================================================================
  console.log('\n━━━ (f) Goods Receipt (material receipt) ━━━')

  await step('f1: create goods receipt (inventory destination) → verify GRNI JE', async () => {
    // Replicate the goods-receipt POST route logic (lines 39-330 of route.ts).
    const po = await db.purchaseOrder.findUnique({
      where: { id: ctx.poId! },
      include: { items: true, goodsReceipts: { include: { items: true } } },
    })
    if (!po) { record('f1: goods receipt', 'FAIL', 'PO not found'); return }
    if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
      record('f1: goods receipt', 'FAIL', `PO status not APPROVED (=${po.status})`)
      return
    }

    const itemsInput = po.items.map(i => ({
      description: i.description,
      quantityOrdered: Number(i.quantity),
      quantityReceived: Number(i.quantity),
      quantityRemaining: 0,
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.quantity) * Number(i.unitPrice),
      destination: 'INVENTORY' as const,
    }))

    const receipt = await db.$transaction(async (tx: PrismaTransaction) => {
      const lastReceipt = await tx.goodsReceipt.findFirst({ orderBy: { receiptNo: 'desc' }, select: { receiptNo: true } })
      let nextNum = 1
      if (lastReceipt?.receiptNo) {
        const m = lastReceipt.receiptNo.match(/GR-(\d+)/)
        if (m) nextNum = parseInt(m[1]) + 1
      }
      const receiptNo = `GR-${String(nextNum).padStart(4, '0')}`

      const created = await tx.goodsReceipt.create({
        data: {
          receiptNo,
          purchaseOrderId: ctx.poId!,
          supplierId: ctx.supplierId!,
          projectId: ctx.projectId!,
          date: new Date('2025-02-15'),
          status: 'PENDING',
          notes: 'BA-07.2 test receipt',
          items: { create: itemsInput },
        },
        include: { items: true, supplier: { select: { name: true } } },
      })

      // Update PO status
      const allReceipts = await tx.goodsReceipt.findMany({
        where: { purchaseOrderId: ctx.poId!, status: { not: 'CANCELLED' } },
        include: { items: true },
      })
      const totalOrdered = po.items.reduce((s, i) => s + Number(i.quantity), 0)
      const totalReceived = allReceipts.reduce((s, gr) => s + gr.items.reduce((a, i) => a + Number(i.quantityReceived), 0), 0)
      let newPoStatus: string
      if (totalReceived >= totalOrdered) newPoStatus = 'RECEIVED'
      else if (totalReceived > 0) newPoStatus = 'PARTIALLY_RECEIVED'
      else newPoStatus = po.status
      await tx.purchaseOrder.update({ where: { id: ctx.poId! }, data: { status: newPoStatus as any } })

      // Handle inventory items + GRNI JE
      let inventoryTotal = 0
      let projectCostTotal = 0
      const inventoryItemUpdates: { inventoryItemId: string; quantity: number; unitPrice: number; description: string }[] = []
      const projectCostItems: { description: string; quantity: number; unitPrice: number; totalCost: number; inventoryItemId?: string }[] = []

      for (const item of itemsInput) {
        if (item.destination === 'INVENTORY' && item.quantityReceived > 0) {
          const itemCost = item.quantityReceived * item.unitPrice
          inventoryTotal += itemCost
          let inventoryItem: { id: string } | null = null
          inventoryItem = await tx.inventoryItem.findFirst({ where: { name: item.description } })
          if (!inventoryItem) {
            const warehouse = await tx.warehouse.findFirst()
            if (!warehouse) throw new Error('لا يوجد مخزون مسجل — أنشئ مستودعاً أولاً')
            const newItemCode = 'AUTO-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
            inventoryItem = await tx.inventoryItem.create({
              data: {
                code: newItemCode,
                name: item.description,
                unit: 'pcs',
                quantity: 0,
                minQuantity: 0,
                purchasePrice: item.unitPrice,
                warehouseId: warehouse.id,
              },
            })
          }
          const foundItem = inventoryItem as { id: string }
          await tx.inventoryItem.update({
            where: { id: foundItem.id },
            data: { quantity: { increment: item.quantityReceived }, purchasePrice: item.unitPrice },
          })
          inventoryItemUpdates.push({ inventoryItemId: foundItem.id, quantity: item.quantityReceived, unitPrice: item.unitPrice, description: item.description })
        } else if (item.destination === 'PROJECT' && ctx.projectId && item.quantityReceived > 0) {
          const totalItemCost = item.quantityReceived * item.unitPrice
          projectCostTotal += totalItemCost
          projectCostItems.push({ description: item.description, quantity: item.quantityReceived, unitPrice: item.unitPrice, totalCost: totalItemCost })
        }
      }

      // GRNI journal entry — Dr Inventory / Dr Project Cost / Cr GRNI
      const totalAmount = inventoryTotal + projectCostTotal
      let grJEId: string | null = null
      if (totalAmount > 0) {
        const lines: { accountCode: string; debit: number; credit: number; description?: string }[] = []
        const grniAccount = await requireAccountByRole(AccountRole.GRNI, 'إيصال استلام بضاعة', tx)
        const desc = `إيصال استلام بضاعة ${receiptNo} - ${created.supplier?.name || ''}`
        if (inventoryTotal > 0) {
          const inventoryAccount = await requireAccountByRole(AccountRole.INVENTORY, 'إيصال استلام بضاعة', tx)
          lines.push({ accountCode: inventoryAccount.code, debit: inventoryTotal, credit: 0, description: `استلام مخزون - ${receiptNo}` })
        }
        if (projectCostTotal > 0) {
          const projectCostAccount = await requireAccountByRole(AccountRole.PROJECT_COST, 'إيصال استلام بضاعة', tx)
          lines.push({ accountCode: projectCostAccount.code, debit: projectCostTotal, credit: 0, description: `تكلفة مشروع - ${receiptNo}` })
        }
        lines.push({ accountCode: grniAccount.code, debit: 0, credit: totalAmount, description: desc })

        const stdEntryNo = await getNextEntryNo(tx)
        const je = await createJournalEntry({
          entryNo: stdEntryNo,
          date: new Date('2025-02-15'),
          description: `Goods Receipt ${receiptNo}`,
          descriptionAr: desc,
          lines,
          sourceType: 'GOODS_RECEIPT',
          sourceId: created.id,
        }, tx)
        grJEId = je.id

        await tx.goodsReceipt.update({ where: { id: created.id }, data: { journalEntryId: je.id } })
      }

      // StockMovement + EquipmentCost
      if (grJEId) {
        for (const inv of inventoryItemUpdates) {
          await tx.stockMovement.create({
            data: {
              inventoryItemId: inv.inventoryItemId,
              movementType: 'RECEIPT',
              quantity: inv.quantity,
              unitCost: inv.unitPrice,
              totalAmount: inv.quantity * inv.unitPrice,
              movementDate: new Date('2025-02-15'),
              reference: receiptNo,
              journalEntryId: grJEId,
            },
          })
        }
        for (const projItem of projectCostItems) {
          await tx.equipmentCost.create({
            data: {
              projectId: ctx.projectId!,
              description: `استلام بضاعة: ${projItem.description} (${receiptNo})`,
              amount: projItem.totalCost,
              date: new Date('2025-02-15'),
              journalEntryId: grJEId,
            },
          })
        }
      }

      return tx.goodsReceipt.findUniqueOrThrow({ where: { id: created.id }, include: { items: true } })
    })

    ctx.goodsReceiptId = receipt.id
    ctx.goodsReceiptJEId = receipt.journalEntryId

    // Verify the JE
    if (!ctx.goodsReceiptJEId) {
      record('f1: goods receipt JE', 'FAIL', 'No JE created')
      return
    }
    const bal = await jeBalance(ctx.goodsReceiptJEId)
    const lines = await jeLines(ctx.goodsReceiptJEId)
    const drInventory = lines.find(l => l.account.accountRole === 'INVENTORY')
    const crGRNI = lines.find(l => l.account.accountRole === 'GRNI')
    const costCenterLines = lines.filter(l => l.costCenterId)
    const result =
      bal.balanced &&
      bal.lines === 2 &&
      drInventory && approx(Number(drInventory.debit), 100_000) &&
      crGRNI && approx(Number(crGRNI.credit), 100_000)
      ? 'PASS' : 'FAIL'
    record('f1: GRNI JE', result as any,
      `JE=${ctx.goodsReceiptJEId.slice(-8)}, dr=${bal.dr}, cr=${bal.cr}, balanced=${bal.balanced}, lines=${bal.lines}, ` +
      `DrInventory=${drInventory ? Number(drInventory.debit) : 'MISSING'}, CrGRNI=${crGRNI ? Number(crGRNI.credit) : 'MISSING'}, ` +
      `costCenterTagged=${costCenterLines.length}/${lines.length} (NOTE: goods-receipt JE does NOT tag project cost center)`)
  })

  // =========================================================================
  // (g) Record costs: labor 50,000 + equipment 30,000 + materials 80,000 = 160,000
  // =========================================================================
  console.log('\n━━━ (g) Record cost entries (total 160,000) ━━━')

  const costEntries = [
    { costType: 'LABOR', description: 'أجور عمالة — فبراير 2025', amount: 50_000, payFrom: 'CASH' as const },
    { costType: 'EQUIPMENT', description: 'تشغيل معدات — فبراير 2025', amount: 30_000, payFrom: 'CASH' as const },
    { costType: 'MATERIALS', description: 'مواد مستهلكة من المخزون — فبراير 2025', amount: 80_000, payFrom: 'CASH' as const },
  ]

  ctx.costEntryIds = []
  ctx.costEntryJEIds = []
  ctx.totalCostToDate = 0

  for (const ce of costEntries) {
    await step(`g: cost entry (${ce.costType} ${ce.amount.toLocaleString()})`, async () => {
      const amt = new Prisma.Decimal(ce.amount)
      const date = new Date('2025-02-20')
      const entry = await db.$transaction(async (tx: PrismaTransaction) => {
        const created = await tx.costEntry.create({
          data: {
            projectId: ctx.projectId!,
            costType: ce.costType,
            sourceType: 'MANUAL',
            sourceDocument: ce.description,
            description: ce.description,
            quantity: 1,
            unitCost: ce.amount,
            amount: amt,
            date,
            periodYear: 2025,
            periodMonth: 2,
            isCommitted: false,
            costCenterId: ctx.costCenterId!,
          },
        })
        const je = await autoEntryManualCost({
          description: ce.description,
          amount: ce.amount,
          date,
          costType: ce.costType,
          payFrom: ce.payFrom,
          costCenterId: ctx.costCenterId!,
        }, tx)
        await tx.costEntry.update({ where: { id: created.id }, data: { journalEntryId: je.id } })
        return { created, je }
      })
      ctx.costEntryIds!.push(entry.created.id)
      ctx.costEntryJEIds!.push(entry.je.id)
      ctx.totalCostToDate! += ce.amount

      // Verify JE: Dr PROJECT_COST / Cr CASH, balanced, 2 lines, costCenterId tagged
      const bal = await jeBalance(entry.je.id)
      const lines = await jeLines(entry.je.id)
      const drCost = lines.find(l => l.account.accountRole === 'PROJECT_COST')
      const crCash = lines.find(l => l.account.accountRole === 'CASH')
      const drHasCC = drCost?.costCenterId === ctx.costCenterId
      const result =
        bal.balanced && bal.lines === 2 &&
        drCost && approx(Number(drCost.debit), ce.amount) &&
        crCash && approx(Number(crCash.credit), ce.amount) &&
        drHasCC ? 'PASS' : 'FAIL'
      record(`g: cost entry (${ce.costType})`, result as any,
        `JE=${entry.je.id.slice(-8)}, dr=${bal.dr}, cr=${bal.cr}, balanced=${bal.balanced}, ` +
        `DrPROJECT_COST=${drCost ? Number(drCost.debit) : 'MISSING'} (costCenter=${drCost?.costCenterId === ctx.costCenterId ? '✓' : '✗'}), ` +
        `CrCASH=${crCash ? Number(crCash.credit) : 'MISSING'}. NOTE: autoEntryManualCost IGNORES costType — all 3 entries hit PROJECT_COST(7110).`)
    })
  }

  await step('g: total cost-to-date = 160,000', async () => {
    const result = approx(ctx.totalCostToDate!, 160_000) ? 'PASS' : 'FAIL'
    record('g: total cost-to-date', result, `totalCostToDate=${ctx.totalCostToDate} (expected 160,000)`)
  })

  // =========================================================================
  // (h) Progress claim (20% = 200,000) — note: NO JE per design
  // =========================================================================
  console.log('\n━━━ (h) Progress claim (20% = 200,000) ━━━')

  await step('h1: create progress claim (20%, amount=200,000)', async () => {
    const claimNo = `${PREFIX}-CLM-${TS}`
    const rate = 0.0
    const amount = 200_000
    const vatAmount = Math.round(amount * rate * 100) / 100
    const totalAmount = amount + vatAmount

    // Validate (mirror route): cumulativeSoFar + newAmount <= effectiveContractValue
    const contract = await db.contract.findUnique({ where: { id: ctx.contractId! } })
    if (!contract) { record('h1: claim', 'FAIL', 'Contract not found'); return }
    const approvedCOs = await db.changeOrder.findMany({ where: { contractId: ctx.contractId!, status: 'APPROVED' }, select: { changeValue: true } })
    const effectiveContractValue = Number(contract.value) + approvedCOs.reduce((s, co) => s + Number(co.changeValue), 0)
    const existingClaims = await db.progressClaim.findMany({ where: { contractId: ctx.contractId!, deletedAt: null, status: { not: 'REJECTED' } }, select: { amount: true } })
    const cumulativeSoFar = existingClaims.reduce((s, c) => s + Number(c.amount), 0)
    if (cumulativeSoFar + amount > effectiveContractValue) {
      record('h1: claim', 'FAIL', `Cumulative ${cumulativeSoFar + amount} > effectiveContractValue ${effectiveContractValue}`)
      return
    }

    const claim = await db.progressClaim.create({
      data: {
        projectId: ctx.projectId!,
        contractId: ctx.contractId!,
        claimNo,
        date: new Date('2025-02-28'),
        percentage: 20,
        amount,
        vatRate: rate,
        vatAmount,
        totalAmount,
        status: 'APPROVED',
        approvedDate: new Date('2025-02-28'),
        notes: 'BA-07.2 test claim 20%',
        invoiced: false,
      },
    })
    ctx.progressClaimId = claim.id
    const result = claim.journalEntryId === null ? 'PASS' : 'FAIL'
    record('h1: claim created', 'PASS',
      `id=${claim.id}, claimNo=${claim.claimNo}, amount=${claim.amount}, percentage=${claim.percentage}, status=${claim.status}, journalEntryId=${claim.journalEntryId}`)
  })

  await step('h2: verify progress claim does NOT create a journal entry (by design)', async () => {
    const claim = await db.progressClaim.findUnique({ where: { id: ctx.progressClaimId! } })
    // Per route.ts line 113-116: "Create claim ONLY — no journal entry."
    // Per engine.ts autoEntryProgressClaim (line 427-442): explicitly THROWS.
    const result = claim?.journalEntryId === null ? 'GAP' : 'FAIL'
    record('h2: claim has NO JE (by design)', result as any,
      `claim.journalEntryId=${claim?.journalEntryId}. This is a DESIGN GAP for acceptance: ` +
      `the user's scenario expects "إصدار مستخلص" to recognize revenue, but the system ` +
      `treats a claim as a request-for-payment only — revenue is recognized later via IFRS15 ` +
      `engine OR via sales-invoice generation. autoEntryProgressClaim() explicitly throws.`)
  })

  // =========================================================================
  // (i) Calculate POC → verify ~20%
  // =========================================================================
  console.log('\n━━━ (i) IFRS15 POC calculation ━━━')

  await step('i1: calculatePOC(projectId) → expect 20%', async () => {
    const asOf = new Date('2025-02-28T23:59:59Z')
    const poc = await calculatePOC(ctx.projectId!, asOf)
    ctx.pocResult = poc
    const expectedPOC = 0.20 // 160k / 800k
    const expectedRevenue = 200_000 // 20% × 1,000,000
    const result =
      approx(poc.totalActualCost, 160_000) &&
      approx(poc.totalEstimatedCost, 800_000) &&
      approx(poc.percentComplete, expectedPOC, 0.005) &&
      approx(poc.revenueToDate, expectedRevenue)
      ? 'PASS' : 'FAIL'
    record('i1: calculatePOC', result as any,
      `actualCost=${poc.totalActualCost}, estimatedCost=${poc.totalEstimatedCost}, ` +
      `POC=${(poc.percentComplete * 100).toFixed(2)}% (expected 20%), ` +
      `revenueToDate=${poc.revenueToDate} (expected 200,000), ` +
      `grossProfitToDate=${poc.grossProfitToDate}, grossProfit%=${poc.grossProfitPercent.toFixed(2)}%. ` +
      `Formula: POC = totalActualCost / estimatedTotalCost (cost-to-cost method).`)
  })

  // =========================================================================
  // (j) Verify revenue recognition: calculatePeriodRevenue + autoEntryIFRS15Revenue
  // =========================================================================
  console.log('\n━━━ (j) IFRS15 revenue recognition (auto-entry) ━━━')

  await step('j1: calculatePeriodRevenue → expect periodRevenue=200,000', async () => {
    const asOf = new Date('2025-02-28T23:59:59Z')
    const pr = await calculatePeriodRevenue(ctx.projectId!, asOf)
    ctx.periodRevenue = pr.periodRevenue
    const result =
      approx(pr.revenueToDate, 200_000) &&
      approx(pr.previouslyRecognizedRevenue, 0) &&
      approx(pr.periodRevenue, 200_000) &&
      approx(pr.percentComplete, 0.20, 0.005)
      ? 'PASS' : 'FAIL'
    record('j1: calculatePeriodRevenue', result as any,
      `revenueToDate=${pr.revenueToDate}, previouslyRecognized=${pr.previouslyRecognizedRevenue}, ` +
      `periodRevenue=${pr.periodRevenue} (expected 200,000), POC=${(pr.percentComplete * 100).toFixed(2)}%. ` +
      `NOTE: periodCost=${pr.periodCost} (full cost-to-date, not period delta).`)
  })

  await step('j2: autoEntryIFRS15Revenue → creates IFRS15 JE (Dr CONTRACT_ASSET / Cr UNBILLED_REVENUE)', async () => {
    const asOf = new Date('2025-02-28T23:59:59Z')
    const r = await autoEntryIFRS15Revenue(ctx.projectId!, asOf)
    ctx.ifrs15JEId = r.journalEntryId
    if (!r.journalEntryId) {
      record('j2: IFRS15 JE', 'FAIL', `No JE created. periodRevenue=${r.periodRevenue}, POC=${r.percentComplete}`)
      return
    }
    const bal = await jeBalance(r.journalEntryId)
    const lines = await jeLines(r.journalEntryId)
    const drContractAsset = lines.find(l => l.account.accountRole === 'CONTRACT_ASSET')
    const crUnbilled = lines.find(l => l.account.accountRole === 'UNBILLED_REVENUE')
    const drHasCC = drContractAsset?.costCenterId
    const crHasCC = crUnbilled?.costCenterId

    const result =
      bal.balanced && bal.lines === 2 &&
      drContractAsset && approx(Number(drContractAsset.debit), 200_000) &&
      crUnbilled && approx(Number(crUnbilled.credit), 200_000)
      ? 'PASS' : 'FAIL'
    record('j2: IFRS15 JE', result as any,
      `JE=${r.journalEntryId.slice(-8)}, dr=${bal.dr}, cr=${bal.cr}, balanced=${bal.balanced}, ` +
      `DrCONTRACT_ASSET=${drContractAsset ? Number(drContractAsset.debit) : 'MISSING'} (costCenter=${drHasCC || 'NULL'}), ` +
      `CrUNBILLED_REVENUE=${crUnbilled ? Number(crUnbilled.credit) : 'MISSING'} (costCenter=${crHasCC || 'NULL'}). ` +
      `CRITICAL GAP: IFRS15 JE lines do NOT carry costCenterId → project profitability via getProjectBalances will be BLIND to this revenue.`)
  })

  // Verify previouslyRecognizedRevenue now reflects the JE
  await step('j3: re-run calculatePeriodRevenue → previouslyRecognized=200,000, periodRevenue=0', async () => {
    const asOf = new Date('2025-02-28T23:59:59Z')
    const pr = await calculatePeriodRevenue(ctx.projectId!, asOf)
    const result =
      approx(pr.previouslyRecognizedRevenue, 200_000) &&
      approx(pr.periodRevenue, 0)
      ? 'PASS' : 'FAIL'
    record('j3: re-run periodRevenue', result as any,
      `previouslyRecognized=${pr.previouslyRecognizedRevenue} (expected 200,000), ` +
      `periodRevenue=${pr.periodRevenue} (expected 0 — idempotent after first run).`)
  })

  // =========================================================================
  // (k) Cross-verify project profitability vs GL
  // =========================================================================
  console.log('\n━━━ (k) Cross-verify project profitability vs GL ━━━')

  await step('k1: getProjectBalances(projectId) — costs via cost-center', async () => {
    const map = await getProjectBalances([ctx.projectId!])
    const r = map.get(ctx.projectId!)
    if (!r) { record('k1: project balances', 'FAIL', 'no entry'); return }
    // Expected from cost-center-tagged JEs:
    //   costs = 160,000 (3 manual cost entries tagged costCenter)
    //   revenue = 0 (IFRS15 JE did NOT tag costCenter)
    const result =
      approx(r.costs, 160_000) &&
      approx(r.revenue, 0) &&
      r.costCenterId === ctx.costCenterId
      ? 'WARN' : 'FAIL'
    record('k1: project balances', result as any,
      `costs=${r.costs} (expected 160,000 ✓), revenue=${r.revenue} (expected 200,000 ✗ — IFRS15 JE missing costCenterId), ` +
      `costCenterId=${r.costCenterId}. Project profitability from this view = revenue(0) - costs(160k) = -160,000 (WRONG; should be +40,000).`)
  })

  await step('k2: getProjectCostBreakdown(projectId)', async () => {
    const bd = await getProjectCostBreakdown(ctx.projectId!)
    const byRoleEntries = [...bd.byRole.entries()]
    const result = approx(bd.total, 160_000) && approx(bd.revenue, 0) ? 'WARN' : 'FAIL'
    record('k2: project cost breakdown', result as any,
      `costCenterId=${bd.costCenterId}, total=${bd.total} (expected 160,000 ✓), ` +
      `revenue=${bd.revenue} (expected 200,000 ✗ — same root cause), ` +
      `byRole=${JSON.stringify(byRoleEntries.map(([k, v]) => [k, v]))}. ` +
      `All 3 cost entries hit PROJECT_COST role (costType is IGNORED by autoEntryManualCost — see engine.ts:1489).`)
  })

  await step('k3: GL verification — sum of posted lines on project cost-center', async () => {
    // Direct GL aggregate: all posted JournalLines tagged with our costCenterId
    const glLines = await db.journalLine.findMany({
      where: {
        deletedAt: null,
        costCenterId: ctx.costCenterId!,
        journalEntry: { status: 'POSTED', deletedAt: null },
      },
      include: { account: { select: { type: true, accountRole: true } } },
    })
    let costs = 0, revenue = 0
    for (const l of glLines) {
      const dr = Number(l.debit), cr = Number(l.credit)
      if (l.account.type === 'EXPENSE') costs += dr - cr
      else if (l.account.type === 'REVENUE') revenue += cr - dr
    }
    const result = approx(costs, 160_000) && approx(revenue, 0) ? 'WARN' : 'FAIL'
    record('k3: GL aggregate for cost-center', result as any,
      `lines=${glLines.length}, costs=${costs} (expected 160,000 ✓), revenue=${revenue} (expected 200,000 ✗). ` +
      `GL ties to getProjectBalances (both blind to IFRS15 revenue because IFRS15 JE lines have no costCenterId).`)
  })

  // getAccountBalance returns a NUMBER directly (sign-adjusted for account type):
  //   ASSET/EXPENSE: dr - cr (positive = normal debit balance)
  //   LIABILITY/REVENUE/EQUITY: cr - dr (positive = normal credit balance)

  await step('k4: GL account-level check — UNBILLED_REVENUE credit balance = 200,000', async () => {
    // IFRS15 revenue IS in the GL at the account level — just not attributed to the project cost center.
    const unbilledAccount = await db.account.findFirst({ where: { accountRole: 'UNBILLED_REVENUE' } })
    if (!unbilledAccount) { record('k4: UNBILLED_REVENUE GL', 'FAIL', 'no account mapped'); return }
    const bal = await getAccountBalance(unbilledAccount.code, { from: new Date('2025-02-01'), to: new Date('2025-02-28T23:59:59Z') })
    // REVENUE account → signForType returns -1 * (dr - cr) = cr - dr
    const result = approx(bal, 200_000) ? 'PASS' : 'FAIL'
    record('k4: UNBILLED_REVENUE GL balance', result as any,
      `accountCode=${unbilledAccount.code}, accountRole=UNBILLED_REVENUE, signedBalance=${bal} (expected 200,000). ` +
      `IFRS15 revenue IS in the GL — but NOT visible in project reports (k1/k2/k3) because the JE lines lack costCenterId.`)
  })

  await step('k5: GL account-level check — CONTRACT_ASSET debit balance = 200,000', async () => {
    const caAccount = await db.account.findFirst({ where: { accountRole: 'CONTRACT_ASSET' } })
    if (!caAccount) { record('k5: CONTRACT_ASSET GL', 'FAIL', 'no account mapped'); return }
    const bal = await getAccountBalance(caAccount.code, { from: new Date('2025-02-01'), to: new Date('2025-02-28T23:59:59Z') })
    // ASSET account → signForType returns +1 * (dr - cr)
    const result = approx(bal, 200_000) ? 'PASS' : 'FAIL'
    record('k5: CONTRACT_ASSET GL balance', result as any,
      `accountCode=${caAccount.code}, accountRole=CONTRACT_ASSET, signedBalance=${bal} (expected 200,000).`)
  })

  await step('k6: GL account-level check — PROJECT_COST debit balance = 160,000', async () => {
    const pcAccount = await db.account.findFirst({ where: { accountRole: 'PROJECT_COST' } })
    if (!pcAccount) { record('k6: PROJECT_COST GL', 'FAIL', 'no account mapped'); return }
    const bal = await getAccountBalance(pcAccount.code, { from: new Date('2025-02-01'), to: new Date('2025-02-28T23:59:59Z') })
    const result = approx(bal, 160_000) ? 'PASS' : 'FAIL'
    record('k6: PROJECT_COST GL balance', result as any,
      `accountCode=${pcAccount.code}, accountRole=PROJECT_COST, signedBalance=${bal} (expected 160,000).`)
  })

  await step('k7: GL account-level check — GRNI liability = 100,000', async () => {
    const grniAccount = await db.account.findFirst({ where: { accountRole: 'GRNI' } })
    if (!grniAccount) { record('k7: GRNI GL', 'FAIL', 'no account mapped'); return }
    const bal = await getAccountBalance(grniAccount.code, { from: new Date('2025-02-01'), to: new Date('2025-02-28T23:59:59Z') })
    // LIABILITY → signForType returns -1 * (dr - cr) = cr - dr
    const result = approx(bal, 100_000) ? 'PASS' : 'FAIL'
    record('k7: GRNI GL balance', result as any,
      `accountCode=${grniAccount.code}, accountRole=GRNI, signedBalance=${bal} (expected 100,000).`)
  })

  await step('k8: GL account-level check — INVENTORY asset = 100,000', async () => {
    const invAccount = await db.account.findFirst({ where: { accountRole: 'INVENTORY' } })
    if (!invAccount) { record('k8: INVENTORY GL', 'FAIL', 'no account mapped'); return }
    const bal = await getAccountBalance(invAccount.code, { from: new Date('2025-02-01'), to: new Date('2025-02-28T23:59:59Z') })
    const result = approx(bal, 100_000) ? 'PASS' : 'FAIL'
    record('k8: INVENTORY GL balance', result as any,
      `accountCode=${invAccount.code}, accountRole=INVENTORY, signedBalance=${bal} (expected 100,000).`)
  })

  await step('k9: GL account-level check — CASH credit = 160,000 (paid for 3 cost entries)', async () => {
    const cashAccount = await db.account.findFirst({ where: { accountRole: 'CASH' } })
    if (!cashAccount) { record('k9: CASH GL', 'FAIL', 'no account mapped'); return }
    // JournalLine uses accountId, not accountCode (the engine's `accountCode` in template lines is resolved by guard).
    // We sum credit on 2025-02-20 MANUAL_COST entries to verify cash outflow = 160,000.
    const cashLines = await db.journalLine.findMany({
      where: {
        deletedAt: null,
        accountId: cashAccount.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          date: { gte: new Date('2025-02-20T00:00:00Z'), lte: new Date('2025-02-20T23:59:59Z') },
          sourceType: 'MANUAL_COST',
        },
      },
      select: { debit: true, credit: true },
    })
    const totalCredit = cashLines.reduce((s, l) => s + Number(l.credit), 0)
    const result = approx(totalCredit, 160_000) ? 'PASS' : 'FAIL'
    record('k9: CASH GL credit on 2025-02-20', result as any,
      `accountCode=${cashAccount.code}, accountRole=CASH, totalCredit=${totalCredit} across ${cashLines.length} MANUAL_COST lines (expected 160,000).`)
  })

  // =========================================================================
  // (l) Close project — verify guard
  // =========================================================================
  console.log('\n━━━ (l) Close project + verify guard ━━━')

  await step('l1: transition project ACTIVE → COMPLETED', async () => {
    const p = await db.project.update({ where: { id: ctx.projectId! }, data: { status: 'COMPLETED' } })
    const result = p.status === 'COMPLETED' ? 'PASS' : 'FAIL'
    record('l1: project → COMPLETED', result, `status=${p.status}`)
  })

  await step('l2: verify NO guard prevents posting to a COMPLETED project', async () => {
    // Attempt to post a new cost entry to the closed project (mirrors cost-entries POST route)
    let posted = false
    let errMsg = ''
    try {
      await db.$transaction(async (tx: PrismaTransaction) => {
        const ce = await tx.costEntry.create({
          data: {
            projectId: ctx.projectId!,
            costType: 'MATERIALS',
            sourceType: 'MANUAL',
            description: 'BA-07.2 POST-CLOSE attempt (should be rejected)',
            quantity: 1,
            unitCost: 1,
            amount: new Prisma.Decimal(1),
            date: new Date('2025-03-15'),
            periodYear: 2025,
            periodMonth: 3,
            isCommitted: false,
            costCenterId: ctx.costCenterId!,
          },
        })
        const je = await autoEntryManualCost({
          description: 'POST-CLOSE attempt',
          amount: 1,
          date: new Date('2025-03-15'),
          costType: 'MATERIALS',
          payFrom: 'CASH',
          costCenterId: ctx.costCenterId!,
        }, tx)
        await tx.costEntry.update({ where: { id: ce.id }, data: { journalEntryId: je.id } })
        posted = true
        // Cleanup immediately so we don't pollute the ledger
        await tx.journalLine.deleteMany({ where: { journalEntryId: je.id } })
        await tx.journalEntry.delete({ where: { id: je.id } })
        await tx.costEntry.delete({ where: { id: ce.id } })
      })
    } catch (e: any) {
      errMsg = e.message
    }
    // System DOES NOT guard against posting to COMPLETED projects.
    const result = posted ? 'GAP' : 'FAIL'
    record('l2: COMPLETED project guard', result as any,
      posted
        ? `POSTED successfully to COMPLETED project (no guard). Test entry was immediately cleaned up. ` +
          `This is a GAP: there is no business rule preventing further accounting on a closed project. ` +
          `The accounting guard.ts R1-R12 enforces period-open + balance + immutability, but NOT project-status.`
        : `Posting threw: ${errMsg}`)
  })

  await step('l3: verify project can be set back to ACTIVE (no guard)', async () => {
    const p = await db.project.update({ where: { id: ctx.projectId! }, data: { status: 'ACTIVE' } })
    const result = p.status === 'ACTIVE' ? 'GAP' : 'FAIL'
    record('l3: project COMPLETED → ACTIVE (no guard)', result as any,
      `status=${p.status}. Reopening a closed project is allowed without audit trail — GAP.`)
    // Set back to COMPLETED to leave the test data in a sensible end-state
    await db.project.update({ where: { id: ctx.projectId! }, data: { status: 'COMPLETED' } })
  })

  // =========================================================================
  // Final integrity rollup
  // =========================================================================
  console.log('\n━━━ (m) Final integrity rollup ━━━')

  await step('m1: all JEs created by this cycle are balanced', async () => {
    const allJEIds = [...(ctx.costEntryJEIds || []), ctx.goodsReceiptJEId, ctx.ifrs15JEId].filter(Boolean) as string[]
    let allBalanced = true
    let detail = ''
    for (const jeId of allJEIds) {
      const b = await jeBalance(jeId)
      if (!b.balanced) {
        allBalanced = false
        detail += `${jeId.slice(-8)}(dr=${b.dr},cr=${b.cr}) `
      }
    }
    const result = allBalanced ? 'PASS' : 'FAIL'
    record('m1: all JEs balanced', result, `${allJEIds.length} JEs total. ${allBalanced ? 'All balanced.' : `Unbalanced: ${detail}`}`)
  })

  await step('m2: trial balance ties (Dr == Cr) for BA-07.2 entries', async () => {
    const allJEIds = [...(ctx.costEntryJEIds || []), ctx.goodsReceiptJEId, ctx.ifrs15JEId].filter(Boolean) as string[]
    const lines = await db.journalLine.findMany({
      where: { journalEntryId: { in: allJEIds }, deletedAt: null },
      select: { debit: true, credit: true },
    })
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0)
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0)
    const result = approx(dr, cr) ? 'PASS' : 'FAIL'
    record('m2: trial balance ties', result, `totalDr=${dr}, totalCr=${cr}, diff=${dr - cr}`)
  })

  await step('m3: verify CostEntry ↔ JournalEntry linkage', async () => {
    const entries = await db.costEntry.findMany({
      where: { id: { in: ctx.costEntryIds } },
      select: { id: true, journalEntryId: true },
    })
    const unlinked = entries.filter(e => !e.journalEntryId)
    const result = unlinked.length === 0 ? 'PASS' : 'FAIL'
    record('m3: CostEntry ↔ JE linkage', result, `${entries.length} cost entries, ${unlinked.length} unlinked`)
  })

  await step('m4: verify GoodsReceipt ↔ JournalEntry linkage', async () => {
    const gr = await db.goodsReceipt.findUnique({ where: { id: ctx.goodsReceiptId! }, select: { journalEntryId: true } })
    const result = gr?.journalEntryId ? 'PASS' : 'FAIL'
    record('m4: GR ↔ JE linkage', result, `journalEntryId=${gr?.journalEntryId}`)
  })

  await step('m5: verify ProgressClaim ↔ JournalEntry linkage (expected NULL by design)', async () => {
    const claim = await db.progressClaim.findUnique({ where: { id: ctx.progressClaimId! }, select: { journalEntryId: true } })
    const result = claim?.journalEntryId === null ? 'GAP' : 'FAIL'
    record('m5: claim ↔ JE linkage', result as any, `journalEntryId=${claim?.journalEntryId} (NULL by design — revenue goes through IFRS15 engine, not claim)`)
  })

  // =========================================================================
  // Print summary
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  const counts = stepResults.reduce((m, r) => { m[r.result] = (m[r.result] || 0) + 1; return m }, {} as Record<string, number>)
  console.log(`  PASS: ${counts.PASS || 0}  |  WARN: ${counts.WARN || 0}  |  GAP: ${counts.GAP || 0}  |  FAIL: ${counts.FAIL || 0}`)
  console.log(`  Total steps: ${stepResults.length}`)
  console.log(`  Test data prefix: ${PREFIX}-${TS} (left in DB — legitimate test data)`)
  console.log(`  Project ID: ${ctx.projectId}`)
  console.log(`  Project code: ${PREFIX}-PROJ-${TS}`)
  if (failures.length > 0) {
    console.log('\n  FAILURES:')
    for (const f of failures) console.log(`    ✗ ${f}`)
  }
  if (warnings.length > 0) {
    console.log('\n  WARNINGS:')
    for (const w of warnings) console.log(`    ⚠ ${w}`)
  }
  console.log('═══════════════════════════════════════════════════════════════\n')

  await db.$disconnect()
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
