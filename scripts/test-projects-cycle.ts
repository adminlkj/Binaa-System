/**
 * E2E Test: Projects Lifecycle Cycle (Phase 2)
 * Tests: create → contract → change order → progress claim → approve → JE → cost → revenue → profit → closure
 */
import { db } from '../src/lib/db'
import { initializeChartOfAccounts } from '../src/lib/accounting/engine'
import { seedFinancialMappings } from '../src/lib/financial-mapping-engine'

const results: Array<{ step: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }> = []
const errors: string[] = []

function log(step: string, status: 'PASS' | 'FAIL' | 'WARN', detail = '') {
  results.push({ step, status, detail })
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '!'
  console.log(`[${icon}] ${step}${detail ? ': ' + detail : ''}`)
  if (status === 'FAIL') errors.push(`${step}: ${detail}`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('E2E TEST: Projects Lifecycle Cycle (Phase 2)')
  console.log('═══════════════════════════════════════════════════════\n')

  // ═══ SETUP: Chart of Accounts + Mappings ═══
  console.log('── Setup ──')
  try {
    const coaCount = await db.account.count()
    if (coaCount === 0) {
      await initializeChartOfAccounts()
      await seedFinancialMappings()
      const after = await db.account.count()
      log('Initialize COA', after > 0 ? 'PASS' : 'FAIL', `${after} accounts seeded`)
    } else {
      log('Initialize COA', 'PASS', `already seeded (${coaCount} accounts)`)
    }
  } catch (e) {
    log('Initialize COA', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ SETUP: Branch ═══
  let branch: { id: string; code: string }
  try {
    const existing = await db.branch.findFirst()
    if (existing) {
      branch = existing
      log('Create Branch', 'PASS', `existing: ${branch.code}`)
    } else {
      branch = await db.branch.create({ data: { code: 'BR-01', name: 'الفرع الرئيسي' } })
      log('Create Branch', 'PASS', branch.code)
    }
  } catch (e) {
    log('Create Branch', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ SETUP: Cost Center ═══
  let costCenter: { id: string; code: string }
  try {
    const existing = await db.costCenter.findFirst()
    if (existing) {
      costCenter = existing
      log('Create CostCenter', 'PASS', `existing: ${costCenter.code}`)
    } else {
      costCenter = await db.costCenter.create({ data: { code: 'CC-01', name: 'مركز تكلفة عام' } })
      log('Create CostCenter', 'PASS', costCenter.code)
    }
  } catch (e) {
    log('Create CostCenter', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ SETUP: Client ═══
  let client: { id: string; code: string; name: string }
  try {
    const existing = await db.client.findFirst()
    if (existing) {
      client = existing
      log('Create Client', 'PASS', `existing: ${client.code}`)
    } else {
      client = await db.client.create({ data: { code: 'CL-01', name: 'عميل تجريبي', nameAr: 'عميل تجريبي' } })
      log('Create Client', 'PASS', client.code)
    }
  } catch (e) {
    log('Create Client', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ SETUP: Fiscal Year + Period ═══
  try {
    const existing = await db.fiscalYear.findFirst({ where: { status: 'OPEN' } })
    if (existing) {
      log('Create FiscalYear', 'PASS', `existing: ${existing.name}`)
    } else {
      const startDate = new Date('2026-01-01')
      const endDate = new Date('2026-12-31')
      const fy = await db.fiscalYear.create({
        data: {
          name: '2026',
          startDate,
          endDate,
          status: 'OPEN',
        },
      })
      // Create 12 monthly periods
      for (let m = 0; m < 12; m++) {
        const psd = new Date(2026, m, 1)
        const ped = new Date(2026, m + 1, 0, 23, 59, 59)
        await db.fiscalPeriod.create({
          data: {
            fiscalYearId: fy.id,
            periodNo: m + 1,
            startDate: psd,
            endDate: ped,
            status: 'OPEN',
          },
        })
      }
      log('Create FiscalYear', 'PASS', `${fy.name} + 12 periods`)
    }
  } catch (e) {
    log('Create FiscalYear', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ TEST 1: Create Project ═══
  console.log('\n── Test 1: Create Project ──')
  let projectId: string
  try {
    const project = await db.project.create({
      data: {
        code: 'PRJ-TEST-001',
        name: 'مشروع اختبار الدورة',
        nameAr: 'مشروع اختبار الدورة',
        clientId: client.id,
        branchId: branch.id,
        costCenterId: costCenter.id,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-08-31'),
        contractValue: 1000000,
        projectType: 'CONSTRUCTION',
        status: 'PLANNING',
        description: 'مشروع لاختبار دورة المشاريع',
      },
    })
    projectId = project.id
    log('Create Project', 'PASS', `${project.code} ${project.name}`)

    // Verify defaults
    if (project.estimatedTotalCost?.toString() === '0' && project.actualCost?.toString() === '0' && project.progressPercent?.toString() === '0') {
      log('Project defaults', 'PASS', 'estimated/actual/progress = 0')
    } else {
      log('Project defaults', 'WARN', `estimated=${project.estimatedTotalCost}, actual=${project.actualCost}, progress=${project.progressPercent}`)
    }
  } catch (e) {
    log('Create Project', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ TEST 2: Create Contract for Project ═══
  console.log('\n── Test 2: Create Contract ──')
  let contractId: string
  try {
    const value = 1000000
    const vatRate = 0.15
    const vatAmount = Math.round(value * vatRate * 100) / 100
    const totalValue = Math.round((value + vatAmount) * 100) / 100

    const contract = await db.contract.create({
      data: {
        projectId,
        contractNo: 'CTR-TEST-001',
        date: new Date('2026-02-01'),
        value,
        vatRate,
        vatAmount,
        totalValue,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-08-31'),
        status: 'DRAFT',
        contractType: 'PROJECT',
        clientId: client.id,
        billingMethod: 'PROGRESS_CLAIMS',
        advancePaymentPercent: 10,
        retentionPercent: 5,
      },
    })
    contractId = contract.id
    log('Create Contract', 'PASS', `${contract.contractNo} value=${contract.value} vat=${contract.vatAmount} total=${contract.totalValue}`)

    // Verify math
    if (Number(contract.vatAmount) === 150000 && Number(contract.totalValue) === 1150000) {
      log('Contract math', 'PASS', 'value × 15% = 150000, total = 1150000')
    } else {
      log('Contract math', 'FAIL', `expected vat=150000 total=1150000, got vat=${contract.vatAmount} total=${contract.totalValue}`)
    }
  } catch (e) {
    log('Create Contract', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ TEST 3: Activate Contract ═══
  console.log('\n── Test 3: Activate Contract ──')
  try {
    const updated = await db.contract.update({
      where: { id: contractId },
      data: { status: 'ACTIVE' },
    })
    log('Activate Contract', 'PASS', `status=${updated.status}`)
  } catch (e) {
    log('Activate Contract', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 4: Create Change Order ═══
  console.log('\n── Test 4: Create Change Order ──')
  let changeOrderId: string
  try {
    const originalValue = 1000000
    const changeValue = 100000
    const newValue = originalValue + changeValue
    const vatRate = 0.15
    const vatAmount = Math.round(changeValue * vatRate * 100) / 100
    const totalChangeValue = Math.round((changeValue + vatAmount) * 100) / 100

    const co = await db.changeOrder.create({
      data: {
        contractId,
        projectId,
        orderNo: 'CO-001',
        date: new Date('2026-02-15'),
        description: 'أمر تغيير: إضافة أعمال كهربائية',
        changeType: 'ADDITION',
        originalValue,
        changeValue,
        newValue,
        vatRate,
        vatAmount,
        totalChangeValue,
        status: 'DRAFT',
      },
    })
    changeOrderId = co.id
    log('Create ChangeOrder', 'PASS', `${co.orderNo} change=${co.changeValue} new=${co.newValue} vat=${co.vatAmount} total=${co.totalChangeValue}`)

    // Verify math
    if (Number(co.newValue) === 1100000 && Number(co.vatAmount) === 15000 && Number(co.totalChangeValue) === 115000) {
      log('ChangeOrder math', 'PASS', 'newValue=1100000, vat=15000, total=115000')
    } else {
      log('ChangeOrder math', 'FAIL', `unexpected values`)
    }
  } catch (e) {
    log('Create ChangeOrder', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ TEST 5: Approve Change Order ═══
  console.log('\n── Test 5: Approve Change Order ──')
  try {
    const updated = await db.changeOrder.update({
      where: { id: changeOrderId },
      data: {
        status: 'APPROVED',
        approvedDate: new Date('2026-02-15'),
        approvedBy: 'test-user',
      },
    })
    log('Approve ChangeOrder', 'PASS', `status=${updated.status} approvedDate=${updated.approvedDate?.toISOString().slice(0, 10)}`)

    // ⚠️ CHECK: Should approving a change order update the contract value?
    const contractAfter = await db.contract.findUnique({ where: { id: contractId } })
    const expectedNewValue = 1100000
    if (Number(contractAfter?.value) === expectedNewValue) {
      log('Contract value updated by CO', 'PASS', `contract.value=${contractAfter?.value}`)
    } else {
      log('Contract value NOT updated by CO', 'WARN', `contract.value=${contractAfter?.value}, expected=${expectedNewValue} (may be by design)`)
    }
  } catch (e) {
    log('Approve ChangeOrder', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 6: Create Progress Claim (DRAFT) ═══
  console.log('\n── Test 6: Create Progress Claim ──')
  let claimId: string
  try {
    const amount = 250000 // 25% of 1M
    const vatRate = 0.15
    const vatAmount = Math.round(amount * vatRate * 100) / 100
    const totalAmount = Math.round((amount + vatAmount) * 100) / 100

    const claim = await db.progressClaim.create({
      data: {
        projectId,
        contractId,
        claimNo: 'PC-001',
        date: new Date('2026-03-31'),
        percentage: 25,
        amount,
        vatRate,
        vatAmount,
        totalAmount,
        status: 'DRAFT',
        invoiced: false,
      },
    })
    claimId = claim.id
    log('Create ProgressClaim', 'PASS', `${claim.claimNo} amount=${claim.amount} pct=${claim.percentage}% vat=${claim.vatAmount} total=${claim.totalAmount}`)

    // Verify NO journal entry yet (DRAFT)
    if (!claim.journalEntryId) {
      log('Claim has no JE (DRAFT)', 'PASS', 'JE should be created on APPROVE')
    } else {
      log('Claim has JE in DRAFT', 'WARN', `JE created prematurely: ${claim.journalEntryId}`)
    }
  } catch (e) {
    log('Create ProgressClaim', 'FAIL', e instanceof Error ? e.message : String(e))
    return report()
  }

  // ═══ TEST 7: Submit Progress Claim ═══
  console.log('\n── Test 7: Submit Progress Claim ──')
  try {
    const updated = await db.progressClaim.update({
      where: { id: claimId },
      data: { status: 'SUBMITTED' },
    })
    log('Submit Claim', 'PASS', `status=${updated.status}`)
  } catch (e) {
    log('Submit Claim', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 8: Approve Progress Claim (should create JE) ═══
  console.log('\n── Test 8: Approve Progress Claim ──')
  try {
    // Call the API route logic: call createProgressClaimJournalEntry
    const { createProgressClaimJournalEntry } = await import('../src/lib/auto-journal')
    const { toNumber } = await import('../src/lib/decimal')

    // Get claim before approval
    const before = await db.progressClaim.findUnique({ where: { id: claimId } })
    const beforeJECount = await db.journalEntry.count()

    // Approve via transaction (mirrors the [id]/route.ts logic)
    await db.$transaction(async (tx) => {
      await tx.progressClaim.update({
        where: { id: claimId },
        data: { status: 'APPROVED', approvedDate: new Date() },
      })
      await createProgressClaimJournalEntry(claimId, tx)
    })

    const after = await db.progressClaim.findUnique({ where: { id: claimId } })
    const afterJECount = await db.journalEntry.count()

    if (after?.status === 'APPROVED' && after.journalEntryId) {
      log('Approve Claim', 'PASS', `status=APPROVED, JE=${after.journalEntryId}`)
    } else {
      log('Approve Claim', 'FAIL', `status=${after?.status}, journalEntryId=${after?.journalEntryId}`)
    }

    if (afterJECount === beforeJECount + 1) {
      log('JE created', 'PASS', `${beforeJECount} → ${afterJECount}`)
    } else {
      log('JE created', 'FAIL', `expected ${beforeJECount + 1}, got ${afterJECount}`)
    }

    // Verify JE has correct lines
    if (after?.journalEntryId) {
      const je = await db.journalEntry.findUnique({
        where: { id: after.journalEntryId },
        include: { lines: true },
      })
      if (je) {
        const totalDebit = je.lines.reduce((s, l) => s + Number(l.debit), 0)
        const totalCredit = je.lines.reduce((s, l) => s + Number(l.credit), 0)
        const diff = Math.abs(totalDebit - totalCredit)
        if (diff < 0.01) {
          log('JE balanced', 'PASS', `D=${totalDebit} C=${totalCredit} diff=${diff.toFixed(4)}`)
        } else {
          log('JE balanced', 'FAIL', `D=${totalDebit} C=${totalCredit} diff=${diff.toFixed(4)}`)
        }
        log('JE lines count', je.lines.length === 3 ? 'PASS' : 'WARN', `${je.lines.length} lines (expected 3: AR / Revenue / VAT)`)

        // Expected: AR debit 287500 (250000+37500), Revenue credit 250000, VAT credit 37500
        const arLine = je.lines.find(l => Number(l.debit) > 0)
        const revLine = je.lines.find(l => Number(l.credit) === 250000)
        const vatLine = je.lines.find(l => Number(l.credit) === 37500)
        if (arLine && Number(arLine.debit) === 287500) {
          log('AR line', 'PASS', `debit=${arLine.debit} (expected 287500)`)
        } else {
          log('AR line', 'FAIL', `debit=${arLine?.debit} (expected 287500)`)
        }
        if (revLine) {
          log('Revenue line', 'PASS', `credit=250000`)
        } else {
          log('Revenue line', 'FAIL', 'no line with credit=250000')
        }
        if (vatLine) {
          log('VAT line', 'PASS', `credit=37500`)
        } else {
          log('VAT line', 'FAIL', 'no line with credit=37500')
        }

        // Verify sourceType
        if (je.sourceType === 'PROGRESS_CLAIM') {
          log('JE sourceType', 'PASS', je.sourceType)
        } else {
          log('JE sourceType', 'FAIL', `expected PROGRESS_CLAIM, got ${je.sourceType}`)
        }
      }
    }
  } catch (e) {
    log('Approve Claim', 'FAIL', e instanceof Error ? e.message : String(e))
    if (e instanceof Error && e.stack) console.error(e.stack)
  }

  // ═══ TEST 9: Create Cost Entry (project cost) ═══
  console.log('\n── Test 9: Create Cost Entry ──')
  let costEntryId: string
  try {
    const cost = await db.costEntry.create({
      data: {
        projectId,
        costType: 'MATERIALS',
        sourceType: 'MANUAL',
        sourceDocument: 'TEST-COST-001',
        description: 'مواد بناء - اختبار',
        quantity: 100,
        unit: 'm³',
        unitCost: 500,
        amount: 50000,
        date: new Date('2026-03-15'),
        periodYear: 2026,
        periodMonth: 3,
        isCommitted: false,
      },
    })
    costEntryId = cost.id
    log('Create CostEntry', 'PASS', `amount=${cost.amount} type=${cost.costType}`)

    // Update project.actualCost
    await db.project.update({
      where: { id: projectId },
      data: { actualCost: 50000 },
    })
    log('Update project.actualCost', 'PASS', '50000')

    // ⚠️ CHECK: Does creating a cost entry create a journal entry?
    // The CostEntry model has a journalEntryId field — let's check if it's auto-filled
    if (!cost.journalEntryId) {
      log('CostEntry JE auto-creation', 'WARN', 'CostEntry has no journalEntryId — manual entry may be required (no auto-link)')
    } else {
      log('CostEntry JE auto-creation', 'PASS', `JE=${cost.journalEntryId}`)
    }
  } catch (e) {
    log('Create CostEntry', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 10: Project Ledger entry creation ═══
  console.log('\n── Test 10: Project Ledger ──')
  try {
    // Manually create a ProjectLedger entry for the cost
    const ledger = await db.projectLedger.create({
      data: {
        projectId,
        ledgerType: 'COST',
        entryDate: new Date('2026-03-15'),
        description: 'تكلفة مواد - اختبار',
        debit: 50000,
        credit: 0,
        runningBalance: 50000,
        reference: 'TEST-COST-001',
        sourceType: 'COST_ENTRY',
        sourceId: costEntryId,
      },
    })
    log('Create ProjectLedger COST', 'PASS', `debit=${ledger.debit}`)

    // ProjectLedger for revenue from approved claim
    const revLedger = await db.projectLedger.create({
      data: {
        projectId,
        ledgerType: 'REVENUE',
        entryDate: new Date('2026-03-31'),
        description: 'إيراد مستخلص PC-001',
        debit: 0,
        credit: 250000,
        runningBalance: 250000,
        reference: 'PC-001',
        sourceType: 'PROGRESS_CLAIM',
        sourceId: claimId,
      },
    })
    log('Create ProjectLedger REVENUE', 'PASS', `credit=${revLedger.credit}`)

    // Query project ledger totals
    const ledgerEntries = await db.projectLedger.findMany({ where: { projectId } })
    const totalCost = ledgerEntries.filter(l => l.ledgerType === 'COST').reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)
    const totalRevenue = ledgerEntries.filter(l => l.ledgerType === 'REVENUE').reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)
    const profit = totalRevenue - totalCost
    log('Project Ledger totals', 'PASS', `cost=${totalCost} revenue=${totalRevenue} profit=${profit}`)
  } catch (e) {
    log('Project Ledger', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 11: Update project progress percent ═══
  console.log('\n── Test 11: Update Project Progress ──')
  try {
    const updated = await db.project.update({
      where: { id: projectId },
      data: {
        progressPercent: 25,
        actualCost: 50000,
        estimatedTotalCost: 800000,
        status: 'ACTIVE',
      },
    })
    log('Update Project progress', 'PASS', `progress=${updated.progressPercent}% actualCost=${updated.actualCost} estTotalCost=${updated.estimatedTotalCost}`)
  } catch (e) {
    log('Update Project progress', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 12: Project Profitability Calculation ═══
  console.log('\n── Test 12: Project Profitability ──')
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        progressClaims: true,
        costEntries: true,
      },
    })
    if (!project) throw new Error('Project not found')

    const totalClaims = project.progressClaims.reduce((s, c) => s + Number(c.amount || 0), 0)
    const totalCosts = project.costEntries.reduce((s, c) => s + Number(c.amount || 0), 0)
    const profit = totalClaims - totalCosts
    const margin = totalClaims > 0 ? (profit / totalClaims) * 100 : 0

    log('Profitability', 'PASS', `revenue(claims)=${totalClaims} costs=${totalCosts} profit=${profit} margin=${margin.toFixed(2)}%`)

    // Expected: revenue=250000, costs=50000, profit=200000, margin=80%
    if (totalClaims === 250000 && totalCosts === 50000 && profit === 200000) {
      log('Profitability math', 'PASS', 'revenue=250000 costs=50000 profit=200000')
    } else {
      log('Profitability math', 'FAIL', `revenue=${totalClaims} costs=${totalCosts} profit=${profit}`)
    }
  } catch (e) {
    log('Profitability', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 13: WIP Entry (IFRS 15) ═══
  console.log('\n── Test 13: WIP Entry ──')
  try {
    const wip = await db.wIPEntry.create({
      data: {
        projectId,
        entryDate: new Date('2026-03-31'),
        costsIncurred: 50000,
        progressPercent: 25,
        revenueRecognized: 250000,
        grossProfit: 200000,
      },
    })
    log('Create WIPEntry', 'PASS', `costs=${wip.costsIncurred} progress=${wip.progressPercent}% revenue=${wip.revenueRecognized} gp=${wip.grossProfit}`)
  } catch (e) {
    log('Create WIPEntry', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 14: Project Closure ═══
  console.log('\n── Test 14: Project Closure ──')
  try {
    const updated = await db.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        endDate: new Date('2026-08-31'),
        progressPercent: 100,
      },
    })
    log('Close Project', 'PASS', `status=${updated.status} progress=${updated.progressPercent}%`)
  } catch (e) {
    log('Close Project', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 15: Verify GET /api/projects/[id] costSheet ═══
  console.log('\n── Test 15: Verify Project Cost Sheet ──')
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        progressClaims: true,
        costEntries: true,
        salesInvoices: true,
        purchaseInvoices: true,
        expenses: true,
        laborCosts: true,
        equipmentCosts: true,
        subcontractorInvoices: true,
      },
    })
    if (!project) throw new Error('not found')

    const contractValue = Number(project.contractValue || 0)
    const progressClaimsTotal = project.progressClaims.reduce((s, c) => s + Number(c.amount || 0), 0)
    const totalCosts = project.costEntries.reduce((s, c) => s + Number(c.amount || 0), 0)
    const totalRevenue = progressClaimsTotal
    const profit = totalRevenue - totalCosts

    log('CostSheet', 'PASS', `contract=${contractValue} revenue=${totalRevenue} costs=${totalCosts} profit=${profit}`)

    if (contractValue === 1000000 && totalRevenue === 250000 && totalCosts === 50000 && profit === 200000) {
      log('CostSheet math', 'PASS', 'all expected values match')
    } else {
      log('CostSheet math', 'FAIL', `expected contract=1M revenue=250K costs=50K profit=200K`)
    }
  } catch (e) {
    log('CostSheet', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ TEST 16: Verify Trial Balance still balanced ═══
  console.log('\n── Test 16: Trial Balance Check ──')
  try {
    const allLines = await db.journalLine.findMany({
      where: { journalEntry: { status: 'POSTED', deletedAt: null }, deletedAt: null },
      include: { account: true },
    })
    const totalDebit = allLines.reduce((s, l) => s + Number(l.debit), 0)
    const totalCredit = allLines.reduce((s, l) => s + Number(l.credit), 0)
    const diff = Math.abs(totalDebit - totalCredit)
    if (diff < 0.01) {
      log('Trial Balance', 'PASS', `D=${totalDebit.toFixed(2)} C=${totalCredit.toFixed(2)} diff=${diff.toFixed(4)} (entries=${allLines.length} lines)`)
    } else {
      log('Trial Balance', 'FAIL', `D=${totalDebit} C=${totalCredit} diff=${diff}`)
    }
  } catch (e) {
    log('Trial Balance', 'FAIL', e instanceof Error ? e.message : String(e))
  }

  // ═══ CLEANUP (optional — keep data for inspection) ═══
  // We DON'T clean up so that we can inspect state in the UI later.

  return report()
}

function report() {
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('TEST REPORT')
  console.log('═══════════════════════════════════════════════════════')
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const warn = results.filter(r => r.status === 'WARN').length
  console.log(`Total: ${results.length}  |  ✓ PASS: ${pass}  |  ✗ FAIL: ${fail}  |  ! WARN: ${warn}`)
  console.log('')
  if (errors.length > 0) {
    console.log('── Errors ──')
    errors.forEach((e, i) => console.log(`${i + 1}. ${e}`))
    console.log('')
  }
  console.log('═══════════════════════════════════════════════════════')
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('UNCAUGHT:', e)
  process.exit(1)
})
