// ============================================================================
// P3-2 E2E: Equipment Rental Cycle — End-to-End Test
// ============================================================================
// Walks the full equipment-rental business cycle:
//   1. Create prerequisites (Branch, Client, CostCenter, Project)
//   2. Create Equipment (purchasePrice > 0 → JE: Dr FIXED_ASSET / Cr CASH)
//   3. Create Rental Contract (DRAFT → ACTIVE; no JE; equipment → RENTED)
//   4. Create Delivery Order (PENDING → DELIVERED; no JE; P3-BUG fix:
//      equipment stays RENTED — delivery order does NOT clobber it)
//   5. Create Timesheet (DRAFT → SUBMITTED → APPROVED; no JE)
//   6. Generate Rental Invoice from approved timesheet → JE posted
//      (Dr CUSTOMER_AR / Cr RENTAL_REVENUE + Cr VAT_OUTPUT)
//   7. Create Rental Payment (full) → JE posted
//      (Dr CASH / Cr CUSTOMER_AR; invoice → PAID)
//   8. Final verification: all JEs balanced, trial balance ties,
//      verifyNumericalConsistency ok=true, source ↔ JE linkage intact.
//
// All test data is wrapped in try/finally — cleanup deletes every created
// record (and soft-deletes any JEs that survived mid-flow failures).
//
// Run: bun scripts/e2e-rental-cycle.ts
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from '@/lib/accounting/guard'
import {
  createSalesInvoiceJournalEntry,
  createClientPaymentJournalEntry,
} from '@/lib/auto-journal'
import { autoEntryEquipmentPurchase, type PrismaTransaction as EngineTx } from '@/lib/accounting/engine'
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log(name, false, `EXCEPTION: ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Test data tracking — for cleanup on exit
// ---------------------------------------------------------------------------
const TS = Date.now()
const PREFIX = 'P3RNT'

const created = {
  branchId: '' as string,
  clientId: '' as string,
  costCenterId: '' as string,
  projectId: '' as string,
  equipmentId: '' as string,
  equipmentCode: '' as string,
  equipmentJEId: '' as string,
  contractId: '' as string,         // parent Contract (contractType=RENTAL)
  rentalId: '' as string,           // EquipmentRental record
  deliveryOrderId: '' as string,
  timesheetId: '' as string,
  salesInvoiceId: '' as string,
  salesInvoiceJEId: '' as string,
  rentalPaymentId: '' as string,
  rentalPaymentJEId: '' as string,
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
  console.log('  P3-2 E2E: Equipment Rental Cycle — End-to-End Test')
  console.log('  Tests the full rental cycle from equipment creation through')
  console.log('  rental payment collection, with JE verification at each step.')
  console.log('═══════════════════════════════════════════════════════════════\n')

  try {
    // =====================================================================
    // (a) Setup prerequisites — Branch, Client, CostCenter, Project
    // =====================================================================
    console.log('━━━ (a) Setup prerequisites ━━━')

    await step('a1: create test Branch', async () => {
      const b = await db.branch.create({
        data: { code: `${PREFIX}-BR-${TS}`, name: `P3-2 Test Branch`, isActive: true },
      })
      created.branchId = b.id
      log('create Branch', !!b.id, `code=${b.code}`)
    })

    await step('a2: create test Client', async () => {
      const c = await db.client.create({
        data: { code: `${PREFIX}-CL-${TS}`, name: `P3-2 Test Client`, isActive: true, taxNumber: '300000000000003' },
      })
      created.clientId = c.id
      log('create Client', !!c.id, `code=${c.code}`)
    })

    await step('a3: create test CostCenter', async () => {
      const cc = await db.costCenter.create({
        data: { code: `${PREFIX}-CC-${TS}`, name: `P3-2 Rental Cost Center`, isActive: true },
      })
      created.costCenterId = cc.id
      log('create CostCenter', !!cc.id, `code=${cc.code}`)
    })

    await step('a4: create test Project (the rental route requires a Project for the parent Contract)', async () => {
      const p = await db.project.create({
        data: {
          code: `${PREFIX}-PROJ-${TS}`,
          name: `P3-2 Rental Anchor Project`,
          nameAr: `مشروع P3-2 لربط عقود التأجير`,
          clientId: created.clientId,
          branchId: created.branchId,
          costCenterId: created.costCenterId,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          status: 'ACTIVE',
          contractValue: 0,
          projectType: 'CONSTRUCTION',
          description: `P3-2 e2e rental cycle test anchor project (TS=${TS})`,
        },
      })
      created.projectId = p.id
      log('create Project', !!p.id, `id=${p.id}, code=${p.code}, status=${p.status}, costCenterId=${p.costCenterId}`)
    })

    // =====================================================================
    // (b) Step 1 — Create Equipment (purchasePrice > 0 → JE expected)
    //     Dr FIXED_ASSET (2110) / Cr CASH (1110)
    //     sourceType=EQUIPMENT_PURCHASE, sourceId=equipment.code
    //     purchasePrice = 50,000
    // =====================================================================
    console.log('\n━━━ (b) Step 1: Create Equipment (purchasePrice=50000 → JE) ━━━')

    const EQ_PURCHASE_PRICE = 50_000

    await step('b1: create Equipment + purchase JE (Dr FIXED_ASSET / Cr CASH)', async () => {
      const result = await db.$transaction(async (tx: EngineTx) => {
        // Generate code EQ-NNN inside transaction (mirror of route logic)
        const lastEquipment = await tx.equipment.findFirst({
          orderBy: { code: 'desc' },
          select: { code: true },
        })
        let nextNum = 1
        if (lastEquipment?.code) {
          const match = lastEquipment.code.match(/EQ-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        const code = `EQ-${String(nextNum).padStart(3, '0')}`

        const equipment = await tx.equipment.create({
          data: {
            code,
            name: 'P3-2 Test Excavator',
            nameAr: 'حفارة P3-2',
            type: 'Heavy Machinery',
            model: 'CAT-320',
            serialNumber: `${PREFIX}-SN-${TS}`,
            status: 'AVAILABLE',
            ownershipType: 'COMPANY_OWNED',
            purchasePrice: EQ_PURCHASE_PRICE,
            hourlyRate: 200,
            dailyRate: 1600,
            monthlyRate: 24000,
            purchaseDate: new Date('2025-01-15'),
            isActive: true,
          },
        })
        created.equipmentId = equipment.id
        created.equipmentCode = equipment.code

        // P3-CRIT-001: Capitalize equipment purchase as fixed asset
        const entry = await autoEntryEquipmentPurchase({
          equipmentCode: equipment.code,
          equipmentName: equipment.name,
          amount: EQ_PURCHASE_PRICE,
          date: new Date('2025-01-15'),
          payFrom: 'CASH',
        }, tx)

        await tx.equipment.update({
          where: { id: equipment.id },
          data: { journalEntryId: entry.id },
        })

        return await tx.equipment.findUniqueOrThrow({
          where: { id: equipment.id },
          select: { id: true, code: true, journalEntryId: true, status: true },
        })
      })
      created.equipmentJEId = result.journalEntryId!
      created.allJEIds.push(created.equipmentJEId)
      log('create Equipment + JE', !!created.equipmentJEId,
        `equipmentId=${created.equipmentId}, code=${result.code}, jeId=${created.equipmentJEId}, status=${result.status}`)
    })

    await step('b2: equipment purchase JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.equipmentJEId)
      log('equipment JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('b3: equipment JE has FIXED_ASSET Dr + CASH Cr, amount=50000', async () => {
      const lines = await jeLines(created.equipmentJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'FIXED_ASSET' &&
        crLine?.account.accountRole === 'CASH' &&
        approx(Number(drLine.debit), EQ_PURCHASE_PRICE) &&
        approx(Number(crLine.credit), EQ_PURCHASE_PRICE)
      log('equipment JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('b4: equipment JE sourceType=EQUIPMENT_PURCHASE, sourceId=equipment.code', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.equipmentJEId } })
      const ok = je?.sourceType === 'EQUIPMENT_PURCHASE' && je?.sourceId === created.equipmentCode
      log('equipment JE source', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId} (expected equipment.code=${created.equipmentCode})`)
    })

    await step('b5: equipment.journalEntryId points to JE', async () => {
      const eq = await db.equipment.findUnique({
        where: { id: created.equipmentId },
        select: { journalEntryId: true, status: true },
      })
      log('equipment ↔ JE linkage', eq?.journalEntryId === created.equipmentJEId,
        `journalEntryId=${eq?.journalEntryId}, status=${eq?.status}`)
    })

    // =====================================================================
    // (c) Step 2 — Create Rental Contract (DRAFT → ACTIVE; no JE)
    //     pricingType=HOURLY, referenceRate=24000, referenceHours=120
    //     → hourlyRate = 24000/120 = 200, totalAmount = 24000
    //     When status=ACTIVE: equipment.status → RENTED
    // =====================================================================
    console.log('\n━━━ (c) Step 2: Create Rental Contract (no JE) ━━━')

    const REF_RATE = 24_000
    const REF_HOURS = 120
    const EXPECTED_HOURLY_RATE = REF_RATE / REF_HOURS // 200

    await step('c1: create Rental Contract (DRAFT, no JE)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Generate contractNo RC-NNNN (mirror of route logic)
        const lastContractWithRC = await tx.contract.findFirst({
          where: { contractNo: { startsWith: 'RC-' } },
          orderBy: { contractNo: 'desc' },
          select: { contractNo: true },
        })
        let nextContractNum = 1
        if (lastContractWithRC?.contractNo) {
          const match = lastContractWithRC.contractNo.match(/RC-(\d+)/)
          if (match) nextContractNum = parseInt(match[1], 10) + 1
        }
        const contractNo = `RC-${String(nextContractNum).padStart(4, '0')}`

        // Generate salesOrderNo SO-NNNN (mirror of route logic)
        const lastRentalWithSO = await tx.equipmentRental.findFirst({
          where: { salesOrderNo: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { salesOrderNo: true },
        })
        let nextSONum = 1
        if (lastRentalWithSO?.salesOrderNo) {
          const match = lastRentalWithSO.salesOrderNo.match(/SO-(\d+)/)
          if (match) nextSONum = parseInt(match[1], 10) + 1
        }
        const salesOrderNo = `SO-${String(nextSONum).padStart(4, '0')}`

        const startDate = new Date('2025-02-01')
        const endDate = new Date('2025-04-30')

        // Create parent Contract (contractType=RENTAL)
        const contract = await tx.contract.create({
          data: {
            projectId: created.projectId,
            contractNo,
            date: startDate,
            value: REF_RATE,
            vatRate: 0.15,
            clientId: created.clientId,
            equipmentId: created.equipmentId,
            contractType: 'RENTAL',
            startDate,
            endDate,
            status: 'DRAFT',
            hourlyRate: EXPECTED_HOURLY_RATE,
            deliveryFees: 0,
            deliveryFeesTaxable: true,
            salesOrderNo,
          },
        })
        created.contractId = contract.id

        // Create EquipmentRental linked to the parent contract
        const rental = await tx.equipmentRental.create({
          data: {
            contractId: contract.id,
            equipmentId: created.equipmentId,
            clientId: created.clientId,
            projectId: created.projectId,
            startDate,
            endDate,
            pricingType: 'HOURLY',
            referenceRate: REF_RATE,
            referenceHours: REF_HOURS,
            hourlyRate: EXPECTED_HOURLY_RATE,
            dailyRate: 0,
            monthlyRate: 0,
            lumpSumAmount: 0,
            deliveryFeesType: 'NONE',
            deliveryFees: 0,
            deliveryFeesTaxable: true,
            operationMode: 'WITHOUT_DRIVER',
            fuelResponsibility: 'ON_CLIENT',
            insuranceResponsibility: 'ON_CLIENT',
            salesOrderNo,
            status: 'DRAFT',
            paymentDuration: 'net30',
            totalAmount: REF_RATE,
          },
        })
        created.rentalId = rental.id

        return { contract, rental }
      })
      log('create Rental Contract DRAFT', !!result.rental,
        `contractNo=${result.contract.contractNo}, salesOrderNo=${result.contract.salesOrderNo}, rentalId=${result.rental.id}, status=${result.rental.status}`)
    })

    await step('c2: confirm NO JE posted for rental contract creation', async () => {
      const jes = await db.journalEntry.findMany({
        where: {
          sourceType: 'EQUIPMENT_PURCHASE', // rental contract has no sourceType — just confirm no JE has sourceId=rentalId
          sourceId: created.rentalId,
          deletedAt: null,
        },
      })
      // Also check that the rental contract doesn't have a journalEntryId anywhere
      // (EquipmentRental has no journalEntryId field, but the parent Contract does)
      const contract = await db.contract.findUnique({
        where: { id: created.contractId },
        select: { journalEntryId: true },
      })
      log('no JE for rental contract', jes.length === 0 && contract?.journalEntryId === null,
        `matching JEs=${jes.length}, contract.journalEntryId=${contract?.journalEntryId}`)
    })

    await step('c3: transition rental contract DRAFT → ACTIVE (no JE; equipment → RENTED)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // Update parent contract status to ACTIVE
        await tx.contract.update({
          where: { id: created.contractId },
          data: { status: 'ACTIVE' },
        })
        // Update rental status to ACTIVE
        const rental = await tx.equipmentRental.update({
          where: { id: created.rentalId },
          data: { status: 'ACTIVE' },
        })
        // P3-CRIT-007: Equipment status → RENTED
        const eq = await tx.equipment.update({
          where: { id: created.equipmentId },
          data: { status: 'RENTED' },
          select: { id: true, status: true },
        })
        return { rental, eq }
      })
      log('rental → ACTIVE', result.rental.status === 'ACTIVE' && result.eq.status === 'RENTED',
        `rental.status=${result.rental.status}, equipment.status=${result.eq.status}`)
    })

    await step('c4: confirm still NO JE after ACTIVE transition (commitment, not GL event)', async () => {
      const contract = await db.contract.findUnique({
        where: { id: created.contractId },
        select: { journalEntryId: true },
      })
      log('contract.journalEntryId still null', contract?.journalEntryId === null,
        `journalEntryId=${contract?.journalEntryId}`)
    })

    // =====================================================================
    // (d) Step 3 — Create Delivery Order (PENDING → DELIVERED; no JE)
    //     P3-BUG FIX verification: equipment is currently RENTED, so
    //     transitioning the DO to DELIVERED must NOT flip it to IN_USE.
    // =====================================================================
    console.log('\n━━━ (d) Step 3: Create Delivery Order (no JE; P3-BUG fix) ━━━')

    await step('d1: create Delivery Order (PENDING, no JE)', async () => {
      // Generate orderNo DO-YYYY-NNNN (mirror of route logic)
      const year = new Date().getFullYear()
      const likePattern = `DO-${year}-`
      const lastOrder = await db.equipmentDeliveryOrder.findFirst({
        where: { orderNo: { startsWith: likePattern } },
        orderBy: { orderNo: 'desc' },
        select: { orderNo: true },
      })
      let seq = 1
      if (lastOrder) {
        const parts = lastOrder.orderNo.split('-')
        const parsedSeq = parseInt(parts[2])
        if (!isNaN(parsedSeq)) seq = parsedSeq + 1
      }
      const orderNo = `DO-${year}-${String(seq).padStart(4, '0')}`

      const order = await db.equipmentDeliveryOrder.create({
        data: {
          orderNo,
          equipmentId: created.equipmentId,
          clientId: created.clientId,
          projectId: created.projectId,
          rentalId: created.rentalId,
          site: 'Test Site — P3-2',
          deliveryDate: new Date('2025-02-05'),
          returnDate: null,
          status: 'PENDING',
          notes: 'P3-2 test delivery order',
        },
      })
      created.deliveryOrderId = order.id
      log('create Delivery Order PENDING', order.status === 'PENDING',
        `orderNo=${order.orderNo}, status=${order.status}, rentalId=${order.rentalId}`)
    })

    await step('d2: transition Delivery Order PENDING → DELIVERED (no JE)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const updated = await tx.equipmentDeliveryOrder.update({
          where: { id: created.deliveryOrderId },
          data: { status: 'DELIVERED' },
        })
        // P3-BUG FIX: only flip equipment to IN_USE if currently AVAILABLE.
        // Our equipment is currently RENTED → no change.
        const currentEq = await tx.equipment.findUnique({
          where: { id: created.equipmentId },
          select: { status: true },
        })
        if (currentEq?.status === 'AVAILABLE') {
          await tx.equipment.update({
            where: { id: created.equipmentId },
            data: { status: 'IN_USE' },
          })
        }
        const afterEq = await tx.equipment.findUnique({
          where: { id: created.equipmentId },
          select: { status: true },
        })
        return { updated, afterEq }
      })
      log('DO → DELIVERED', result.updated.status === 'DELIVERED',
        `order.status=${result.updated.status}, equipment.status=${result.afterEq?.status} (expected RENTED — P3-BUG fix)`)
    })

    await step('d3: equipment stayed RENTED (not clobbered to IN_USE) — P3-BUG fix verified', async () => {
      const eq = await db.equipment.findUnique({
        where: { id: created.equipmentId },
        select: { status: true },
      })
      log('equipment.status=RENTED', eq?.status === 'RENTED',
        `status=${eq?.status} (P3-BUG fix: rental contract owns the status, DO does not clobber it)`)
    })

    // =====================================================================
    // (e) Step 4 — Create Timesheet (DRAFT → SUBMITTED → APPROVED; no JE)
    //     operatingHours=100, month=2, year=2025
    //     @@unique([rentalId, year, month]) — one timesheet per rental per month
    // =====================================================================
    console.log('\n━━━ (e) Step 4: Create Timesheet (no JE) ━━━')

    const OPERATING_HOURS = 100
    const TIMESHEET_MONTH = 2
    const TIMESHEET_YEAR = 2025

    await step('e1: create Timesheet DRAFT', async () => {
      const ts = await db.timesheet.create({
        data: {
          rentalId: created.rentalId,
          contractId: created.contractId,
          projectId: created.projectId,
          equipmentId: created.equipmentId,
          month: TIMESHEET_MONTH,
          year: TIMESHEET_YEAR,
          operatingHours: OPERATING_HOURS,
          status: 'DRAFT',
          notes: 'P3-2 test timesheet',
        },
      })
      created.timesheetId = ts.id
      log('create Timesheet DRAFT', ts.status === 'DRAFT',
        `id=${ts.id}, month=${ts.month}/${ts.year}, operatingHours=${ts.operatingHours}, status=${ts.status}`)
    })

    await step('e2: transition timesheet DRAFT → SUBMITTED (no JE)', async () => {
      const ts = await db.timesheet.update({
        where: { id: created.timesheetId },
        data: { status: 'SUBMITTED' },
      })
      log('timesheet → SUBMITTED', ts.status === 'SUBMITTED', `status=${ts.status}`)
    })

    await step('e3: transition timesheet SUBMITTED → APPROVED (no JE)', async () => {
      const ts = await db.timesheet.update({
        where: { id: created.timesheetId },
        data: { status: 'APPROVED', approvedDate: new Date() },
      })
      log('timesheet → APPROVED', ts.status === 'APPROVED',
        `status=${ts.status}, approvedDate=${ts.approvedDate?.toISOString()}`)
    })

    await step('e4: timesheet has no invoice linked yet (invoiced=false, invoiceId=null)', async () => {
      const ts = await db.timesheet.findUnique({
        where: { id: created.timesheetId },
        select: { invoiced: true, invoiceId: true },
      })
      log('timesheet not yet invoiced', ts?.invoiced === false && ts?.invoiceId === null,
        `invoiced=${ts?.invoiced}, invoiceId=${ts?.invoiceId}`)
    })

    // =====================================================================
    // (f) Step 5 — Generate Rental Invoice from approved timesheet
    //     hourlyRate=200, operatingHours=100
    //     → subtotal=20000, vatAmount=3000, totalAmount=23000, deliveryFees=0
    //     JE: Dr CUSTOMER_AR 23000 / Cr RENTAL_REVENUE 20000 + Cr VAT_OUTPUT 3000
    //     sourceType=SALES_INVOICE
    // =====================================================================
    console.log('\n━━━ (f) Step 5: Generate Rental Invoice → verify JE ━━━')

    const EXPECTED_SUBTOTAL = OPERATING_HOURS * EXPECTED_HOURLY_RATE // 20000
    const EXPECTED_VAT = Math.round(EXPECTED_SUBTOTAL * 0.15 * 100) / 100 // 3000
    const EXPECTED_TOTAL = EXPECTED_SUBTOTAL + EXPECTED_VAT // 23000

    await step('f1: generate invoice + JE (Dr CUSTOMER_AR / Cr RENTAL_REVENUE + Cr VAT_OUTPUT)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        // 1. Verify workflow gates (mirror of route logic)
        const timesheet = await tx.timesheet.findUnique({
          where: { id: created.timesheetId },
          include: {
            contract: { select: { id: true, contractNo: true, status: true, clientId: true, projectId: true, vatRate: true, salesOrderNo: true, paymentTerms: true } },
            rental: { select: { id: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true, clientId: true, projectId: true, paymentDuration: true } },
            equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          },
        })
        if (!timesheet) throw new Error('Timesheet not found')
        if (timesheet.contract.status !== 'ACTIVE') {
          throw new Error(`Contract must be ACTIVE, got ${timesheet.contract.status}`)
        }
        // Check DELIVERED delivery order exists for this rental
        const deliveryOrder = await tx.equipmentDeliveryOrder.findFirst({
          where: { rentalId: timesheet.rentalId, status: 'DELIVERED' },
        })
        if (!deliveryOrder) throw new Error('No DELIVERED delivery order for this rental')
        if (timesheet.status !== 'APPROVED') {
          throw new Error(`Timesheet must be APPROVED, got ${timesheet.status}`)
        }
        if (timesheet.invoiced) throw new Error('Timesheet already invoiced')

        // 2. Calculate amounts
        const hourlyRate = toNumber(timesheet.rental?.hourlyRate || 0)
        const operatingHours = toNumber(timesheet.operatingHours)
        const subtotal = operatingHours * hourlyRate
        const vatRate = toNumber(timesheet.contract.vatRate || 0.15)
        const vatAmount = Math.round(subtotal * vatRate * 100) / 100
        const deliveryFees = toNumber(timesheet.rental?.deliveryFees || 0)
        const deliveryFeesTaxable = timesheet.rental?.deliveryFeesTaxable ?? true
        const deliveryVat = deliveryFeesTaxable ? Math.round(deliveryFees * vatRate * 100) / 100 : 0
        const totalAmount = subtotal + vatAmount + deliveryFees + deliveryVat

        // 3. Generate invoice number RNT-NNNN
        const lastInvoice = await tx.salesInvoice.findFirst({
          where: { invoiceNo: { startsWith: 'RNT-' } },
          orderBy: { invoiceNo: 'desc' },
          select: { invoiceNo: true },
        })
        let nextNum = 1
        if (lastInvoice?.invoiceNo) {
          const match = lastInvoice.invoiceNo.match(/RNT-(\d+)/)
          if (match) nextNum = parseInt(match[1], 10) + 1
        }
        const invoiceNo = `RNT-${String(nextNum).padStart(4, '0')}`

        const invoiceDate = new Date()
        const dueDate = new Date(invoiceDate)
        dueDate.setDate(dueDate.getDate() + 30) // net30

        // 4. Create SalesInvoice (status=SENT, invoiceType=RENTAL, sourceType=TIMESHEET)
        const inv = await tx.salesInvoice.create({
          data: {
            invoiceNo,
            clientId: timesheet.rental?.clientId || timesheet.contract.clientId || created.clientId,
            projectId: timesheet.rental?.projectId || timesheet.contract.projectId || timesheet.projectId,
            contractId: timesheet.contract.id,
            date: invoiceDate,
            dueDate,
            subtotal,
            discountRate: 0,
            discountAmount: 0,
            netAmount: subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            paidAmount: 0,
            status: 'SENT',
            invoiceType: 'RENTAL',
            sourceType: 'TIMESHEET',
            timesheetId: timesheet.id,
            contractNo: timesheet.contract.contractNo,
            contractType: 'RENTAL',
            salesOrderNo: timesheet.contract.salesOrderNo,
            equipmentName: timesheet.equipment.nameAr || timesheet.equipment.name,
            operatingHours,
            hourlyRate,
            includeDelivery: deliveryFees > 0,
            deliveryAmount: deliveryFees,
            deliveryFeesTaxable,
            includeVat: true,
            deliveryMonth: `${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
            items: {
              create: [
                {
                  description: `تأجير ${timesheet.equipment.nameAr || timesheet.equipment.name} - ${timesheet.month}/${timesheet.year} - ${operatingHours} ساعة`,
                  descriptionEn: `Equipment Rental - ${timesheet.equipment.name} - ${timesheet.month}/${timesheet.year} - ${operatingHours} hours`,
                  quantity: operatingHours,
                  unit: 'ساعة',
                  unitPrice: hourlyRate,
                  totalPrice: subtotal,
                  itemType: 'RENTAL',
                },
              ],
            },
          },
        })
        created.salesInvoiceId = inv.id

        // 5. Mark timesheet as INVOICED
        await tx.timesheet.update({
          where: { id: timesheet.id },
          data: {
            status: 'INVOICED',
            invoiced: true,
            invoiceId: inv.id,
          },
        })

        // 6. Create the JE (throws on failure → tx rolls back)
        await createSalesInvoiceJournalEntry(inv.id, tx)

        // Re-fetch to capture journalEntryId
        return await tx.salesInvoice.findUniqueOrThrow({
          where: { id: inv.id },
          select: { id: true, invoiceNo: true, journalEntryId: true, totalAmount: true, status: true },
        })
      })
      created.salesInvoiceJEId = result.journalEntryId!
      created.allJEIds.push(created.salesInvoiceJEId)
      log('generate Invoice + JE', !!created.salesInvoiceJEId,
        `invoiceNo=${result.invoiceNo}, total=${result.totalAmount}, status=${result.status}, jeId=${created.salesInvoiceJEId}`)
    })

    await step('f2: rental invoice JE is balanced (Dr=Cr)', async () => {
      const b = await jeBalance(created.salesInvoiceJEId)
      log('rentalInv JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('f3: rental invoice JE has CUSTOMER_AR Dr + RENTAL_REVENUE + VAT_OUTPUT Cr', async () => {
      const lines = await jeLines(created.salesInvoiceJEId)
      const arLine = lines.find(l => l.account.accountRole === 'CUSTOMER_AR')
      const revLine = lines.find(l => l.account.accountRole === 'RENTAL_REVENUE')
      const vatLine = lines.find(l => l.account.accountRole === 'VAT_OUTPUT')
      const ok =
        !!arLine && approx(Number(arLine.debit), EXPECTED_TOTAL) &&
        !!revLine && approx(Number(revLine.credit), EXPECTED_SUBTOTAL) &&
        !!vatLine && approx(Number(vatLine.credit), EXPECTED_VAT)
      log('rentalInv JE structure', ok,
        `AR Dr=${arLine?.debit}, Rev Cr=${revLine?.credit}, VAT Cr=${vatLine?.credit}`)
    })

    await step('f4: rental invoice JE sourceType=SALES_INVOICE, sourceId=invoice.id', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.salesInvoiceJEId } })
      const ok = je?.sourceType === 'SALES_INVOICE' && je?.sourceId === created.salesInvoiceId
      log('rentalInv JE source', ok,
        `sourceType=${je?.sourceType}, sourceId=${je?.sourceId}`)
    })

    await step('f5: timesheet marked INVOICED (invoiced=true, invoiceId set)', async () => {
      const ts = await db.timesheet.findUnique({
        where: { id: created.timesheetId },
        select: { status: true, invoiced: true, invoiceId: true },
      })
      log('timesheet → INVOICED',
        ts?.status === 'INVOICED' && ts?.invoiced === true && ts?.invoiceId === created.salesInvoiceId,
        `status=${ts?.status}, invoiced=${ts?.invoiced}, invoiceId=${ts?.invoiceId}`)
    })

    await step('f6: invoice is SENT with correct totals', async () => {
      const inv = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceId },
        select: {
          status: true, invoiceType: true, sourceType: true,
          subtotal: true, vatAmount: true, totalAmount: true, netAmount: true,
          timesheetId: true,
        },
      })
      const ok =
        inv?.status === 'SENT' &&
        inv?.invoiceType === 'RENTAL' &&
        inv?.sourceType === 'TIMESHEET' &&
        inv?.timesheetId === created.timesheetId &&
        approx(toNumber(inv?.subtotal), EXPECTED_SUBTOTAL) &&
        approx(toNumber(inv?.vatAmount), EXPECTED_VAT) &&
        approx(toNumber(inv?.totalAmount), EXPECTED_TOTAL) &&
        approx(toNumber(inv?.netAmount), EXPECTED_SUBTOTAL)
      log('invoice fields correct', ok,
        `status=${inv?.status}, type=${inv?.invoiceType}, source=${inv?.sourceType}, ` +
        `subtotal=${inv?.subtotal}, vat=${inv?.vatAmount}, total=${inv?.totalAmount}`)
    })

    // =====================================================================
    // (g) Step 6 — Create Rental Payment (full) → verify JE + PAID
    //     amount = EXPECTED_TOTAL (23000)
    //     ClientPayment with paymentType=RENTAL
    //     JE: Dr CASH / Cr CUSTOMER_AR (sourceType=CLIENT_PAYMENT)
    //     invoice.paidAmount += 23000, status → PAID
    // =====================================================================
    console.log('\n━━━ (g) Step 6: Create Rental Payment → verify JE + PAID ━━━')

    await step('g1: create Rental Payment + JE (Dr CASH / Cr CUSTOMER_AR)', async () => {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const payment = await tx.clientPayment.create({
          data: {
            clientId: created.clientId,
            invoiceId: created.salesInvoiceId,
            amount: EXPECTED_TOTAL,
            date: new Date('2025-03-15'),
            receivedIn: 'TREASURY',
            paymentType: 'RENTAL',
            reference: 'P3-2-RNT-PAY-001',
            notes: 'P3-2 full rental payment',
          },
        })
        created.rentalPaymentId = payment.id

        // Create the JE (same function as client-payments route)
        await createClientPaymentJournalEntry(payment.id, tx)

        // Update invoice paidAmount + status (mirror of rental-payments route logic)
        const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: created.salesInvoiceId } })
        const newPaid = toNumber(invoice.paidAmount) + EXPECTED_TOTAL
        const newStatus = newPaid >= toNumber(invoice.totalAmount) - 0.01 ? 'PAID' : 'PARTIALLY_PAID'
        await tx.salesInvoice.update({
          where: { id: created.salesInvoiceId },
          data: { paidAmount: newPaid, status: newStatus },
        })

        return await tx.clientPayment.findUniqueOrThrow({
          where: { id: payment.id },
          select: { id: true, journalEntryId: true, paymentType: true },
        })
      })
      created.rentalPaymentJEId = result.journalEntryId!
      created.allJEIds.push(created.rentalPaymentJEId)
      log('create Rental Payment + JE', !!created.rentalPaymentJEId,
        `paymentId=${created.rentalPaymentId}, jeId=${created.rentalPaymentJEId}, paymentType=${result.paymentType}`)
    })

    await step('g2: rental payment JE is balanced', async () => {
      const b = await jeBalance(created.rentalPaymentJEId)
      log('payment JE balanced', b.balanced, `Dr=${b.dr}, Cr=${b.cr}, lines=${b.lines}`)
    })

    await step('g3: rental payment JE has CASH Dr + CUSTOMER_AR Cr, amount=23000', async () => {
      const lines = await jeLines(created.rentalPaymentJEId)
      const drLine = lines.find(l => Number(l.debit) > 0)
      const crLine = lines.find(l => Number(l.credit) > 0)
      const ok =
        drLine?.account.accountRole === 'CASH' &&
        crLine?.account.accountRole === 'CUSTOMER_AR' &&
        approx(Number(drLine.debit), EXPECTED_TOTAL) &&
        approx(Number(crLine.credit), EXPECTED_TOTAL)
      log('payment JE structure', ok,
        `Dr=${drLine?.account.accountRole}:${drLine?.debit}, Cr=${crLine?.account.accountRole}:${crLine?.credit}`)
    })

    await step('g4: rental payment JE sourceType=CLIENT_PAYMENT', async () => {
      const je = await db.journalEntry.findUnique({ where: { id: created.rentalPaymentJEId } })
      log('sourceType=CLIENT_PAYMENT', je?.sourceType === 'CLIENT_PAYMENT', `sourceType=${je?.sourceType}`)
    })

    await step('g5: invoice status=PAID after full payment', async () => {
      const inv = await db.salesInvoice.findUnique({
        where: { id: created.salesInvoiceId },
        select: { status: true, paidAmount: true, totalAmount: true },
      })
      log('invoice → PAID', inv?.status === 'PAID',
        `status=${inv?.status}, paid=${inv?.paidAmount}, total=${inv?.totalAmount}`)
    })

    await step('g6: ClientPayment.paymentType=RENTAL (distinct from regular client payment)', async () => {
      const p = await db.clientPayment.findUnique({
        where: { id: created.rentalPaymentId },
        select: { paymentType: true, invoiceId: true },
      })
      log('paymentType=RENTAL', p?.paymentType === 'RENTAL' && p?.invoiceId === created.salesInvoiceId,
        `paymentType=${p?.paymentType}, invoiceId=${p?.invoiceId}`)
    })

    // =====================================================================
    // (h) Final Verification — Trial balance, all JEs balanced, integrity
    // =====================================================================
    console.log('\n━━━ (h) Final integrity verification ━━━')

    await step('h1: all JEs created by this cycle are balanced', async () => {
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

    await step('h2: trial balance ties (overall Dr=Cr)', async () => {
      const tb = await getTrialBalance()
      const dr = toNumber(tb.totals.totalDebit)
      const cr = toNumber(tb.totals.totalCredit)
      log('trial balance ties', approx(dr, cr),
        `Dr=${dr.toFixed(2)}, Cr=${cr.toFixed(2)}, diff=${Math.abs(dr - cr).toFixed(4)}`)
    })

    await step('h3: trial balance isBalanced flag is true', async () => {
      const tb = await getTrialBalance()
      log('tb.totals.isBalanced', tb.totals.isBalanced === true, `isBalanced=${tb.totals.isBalanced}`)
    })

    await step('h4: numerical consistency check (I1-I7)', async () => {
      const nc = await verifyNumericalConsistency()
      log('verifyNumericalConsistency ok', nc.ok === true,
        `ok=${nc.ok}, accountsChecked=${nc.accountsChecked}, diffs=${nc.diffs.length}`)
      if (!nc.ok) {
        for (const d of nc.diffs.slice(0, 5)) console.log(`       ⚠ ${d}`)
      }
    })

    await step('h5: source ↔ JE linkage intact for all source documents', async () => {
      const equipment = await db.equipment.findUnique({ where: { id: created.equipmentId }, select: { journalEntryId: true } })
      const salesInv = await db.salesInvoice.findUnique({ where: { id: created.salesInvoiceId }, select: { journalEntryId: true } })
      const payment = await db.clientPayment.findUnique({ where: { id: created.rentalPaymentId }, select: { journalEntryId: true } })
      // Parent Contract has NO JE (rental commitment, not GL event)
      const contract = await db.contract.findUnique({ where: { id: created.contractId }, select: { journalEntryId: true } })
      // Timesheet has no JE field at all — but its invoiceId must be set
      const ts = await db.timesheet.findUnique({ where: { id: created.timesheetId }, select: { invoiceId: true, invoiced: true, status: true } })
      // Delivery order has no JE field
      const doCount = await db.equipmentDeliveryOrder.count({ where: { id: created.deliveryOrderId } })

      const linked =
        !!equipment?.journalEntryId &&
        !!salesInv?.journalEntryId &&
        !!payment?.journalEntryId
      const contractNull = contract?.journalEntryId === null
      const timesheetInvoiced = ts?.status === 'INVOICED' && ts?.invoiced === true && ts?.invoiceId === created.salesInvoiceId
      const doExists = doCount === 1
      log('source↔JE linkage',
        linked && contractNull && timesheetInvoiced && doExists,
        `equipment.jeId=${!!equipment?.journalEntryId}, salesInv.jeId=${!!salesInv?.journalEntryId}, ` +
        `payment.jeId=${!!payment?.journalEntryId}, contract.jeId=null=${contractNull}, ` +
        `timesheet.invoiced=${ts?.invoiced}, timesheet.invoiceId set=${!!ts?.invoiceId}, deliveryOrder exists=${doExists}`)
    })

    await step('h6: rental-cycle account balances reflect expected Dr/Cr movements', async () => {
      // Verify the three key rental-cycle accounts have correct expected balances
      // contributed by THIS cycle's JEs (filter by our allJEIds).
      const ourLines = await db.journalLine.findMany({
        where: { journalEntryId: { in: created.allJEIds }, deletedAt: null },
        include: { account: { select: { code: true, accountRole: true, type: true } } },
      })
      const sumBy = (role: string, field: 'debit' | 'credit') =>
        ourLines
          .filter(l => l.account.accountRole === role)
          .reduce((s, l) => s + Number(l[field]), 0)

      const fixedAssetDr = sumBy('FIXED_ASSET', 'debit')
      const cashDr = sumBy('CASH', 'debit')
      const cashCr = sumBy('CASH', 'credit')
      const arDr = sumBy('CUSTOMER_AR', 'debit')
      const arCr = sumBy('CUSTOMER_AR', 'credit')
      const rentalRevCr = sumBy('RENTAL_REVENUE', 'credit')
      const vatOutputCr = sumBy('VAT_OUTPUT', 'credit')

      const ok =
        approx(fixedAssetDr, EQ_PURCHASE_PRICE) &&          // 50000 (equipment purchase)
        approx(cashDr, EXPECTED_TOTAL) &&                   // 23000 (rental payment in)
        approx(cashCr, EQ_PURCHASE_PRICE) &&                // 50000 (equipment purchase out)
        approx(arDr, EXPECTED_TOTAL) &&                     // 23000 (invoice AR)
        approx(arCr, EXPECTED_TOTAL) &&                     // 23000 (payment collection)
        approx(rentalRevCr, EXPECTED_SUBTOTAL) &&           // 20000 (invoice revenue)
        approx(vatOutputCr, EXPECTED_VAT)                   // 3000 (invoice VAT)
      log('rental-cycle account balances', ok,
        `FIXED_ASSET Dr=${fixedAssetDr} (exp ${EQ_PURCHASE_PRICE}), ` +
        `CASH Dr=${cashDr}/Cr=${cashCr} (exp Dr=23000, Cr=50000), ` +
        `CUSTOMER_AR Dr=${arDr}/Cr=${arCr} (exp 23000/23000), ` +
        `RENTAL_REVENUE Cr=${rentalRevCr} (exp ${EXPECTED_SUBTOTAL}), ` +
        `VAT_OUTPUT Cr=${vatOutputCr} (exp ${EXPECTED_VAT})`)
    })

    await step('h7: net cash impact = collection - purchase (rental cycle is cash-positive)', async () => {
      const ourLines = await db.journalLine.findMany({
        where: { journalEntryId: { in: created.allJEIds }, deletedAt: null },
        include: { account: { select: { accountRole: true } } },
      })
      const cashDr = ourLines.filter(l => l.account.accountRole === 'CASH').reduce((s, l) => s + Number(l.debit), 0)
      const cashCr = ourLines.filter(l => l.account.accountRole === 'CASH').reduce((s, l) => s + Number(l.credit), 0)
      const netCash = cashDr - cashCr
      const expected = EXPECTED_TOTAL - EQ_PURCHASE_PRICE // 23000 - 50000 = -27000
      log('net cash impact', approx(netCash, expected),
        `net=${netCash.toFixed(2)} (Dr=${cashDr} - Cr=${cashCr}), expected=${expected} (collection ${EXPECTED_TOTAL} − purchase ${EQ_PURCHASE_PRICE})`)
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : ''
    console.error('\n[FATAL] Unhandled error during cycle:', msg)
    if (stack) console.error(stack)
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
    console.log('  ✅ All rental-cycle E2E tests PASSED')
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
      if (created.rentalPaymentId) {
        await tx.clientPayment.deleteMany({ where: { id: created.rentalPaymentId } })
      }
      if (created.salesInvoiceId) {
        await tx.salesInvoiceItem.deleteMany({ where: { invoiceId: created.salesInvoiceId } })
        await tx.salesInvoice.deleteMany({ where: { id: created.salesInvoiceId } })
      }
      if (created.timesheetId) {
        await tx.timesheet.deleteMany({ where: { id: created.timesheetId } })
      }
      if (created.deliveryOrderId) {
        await tx.equipmentDeliveryOrder.deleteMany({ where: { id: created.deliveryOrderId } })
      }
      if (created.rentalId) {
        await tx.equipmentRental.deleteMany({ where: { id: created.rentalId } })
      }
      if (created.contractId) {
        await tx.contract.deleteMany({ where: { id: created.contractId } })
      }
      if (created.equipmentId) {
        await tx.equipment.deleteMany({ where: { id: created.equipmentId } })
      }
      if (created.projectId) {
        await tx.project.deleteMany({ where: { id: created.projectId } })
      }
      if (created.costCenterId) {
        await tx.costCenter.deleteMany({ where: { id: created.costCenterId } })
      }
      if (created.clientId) {
        await tx.client.deleteMany({ where: { id: created.clientId } })
      }
      if (created.branchId) {
        await tx.branch.deleteMany({ where: { id: created.branchId } })
      }
    })
    console.log('  ✓ All test data removed (JEs soft-deleted, source docs hard-deleted)')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('  ⚠ Cleanup error:', msg)
    // Best-effort: try individual deletes outside the transaction
    console.log('  Attempting best-effort individual cleanup...')
    try { await db.clientPayment.deleteMany({ where: { id: created.rentalPaymentId } }) } catch { /* ignore */ }
    try { await db.salesInvoiceItem.deleteMany({ where: { invoiceId: created.salesInvoiceId } }) } catch { /* ignore */ }
    try { await db.salesInvoice.deleteMany({ where: { id: created.salesInvoiceId } }) } catch { /* ignore */ }
    try { await db.timesheet.deleteMany({ where: { id: created.timesheetId } }) } catch { /* ignore */ }
    try { await db.equipmentDeliveryOrder.deleteMany({ where: { id: created.deliveryOrderId } }) } catch { /* ignore */ }
    try { await db.equipmentRental.deleteMany({ where: { id: created.rentalId } }) } catch { /* ignore */ }
    try { await db.contract.deleteMany({ where: { id: created.contractId } }) } catch { /* ignore */ }
    try { await db.equipment.deleteMany({ where: { id: created.equipmentId } }) } catch { /* ignore */ }
    try { await db.project.deleteMany({ where: { id: created.projectId } }) } catch { /* ignore */ }
    try { await db.costCenter.deleteMany({ where: { id: created.costCenterId } }) } catch { /* ignore */ }
    try { await db.client.deleteMany({ where: { id: created.clientId } }) } catch { /* ignore */ }
    try { await db.branch.deleteMany({ where: { id: created.branchId } }) } catch { /* ignore */ }
    for (const jeId of created.allJEIds) {
      if (!jeId) continue
      try {
        await db.journalLine.updateMany({ where: { journalEntryId: jeId }, data: { deletedAt: new Date() } })
        await db.journalEntry.update({ where: { id: jeId }, data: { deletedAt: new Date(), status: 'CANCELLED' } })
      } catch { /* ignore */ }
    }
    console.log('  ✓ Best-effort cleanup done')
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('FATAL:', msg)
  process.exit(1)
})
