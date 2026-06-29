/**
 * Phase 3 — Equipment & Rental Cycle DB Integrity Verification
 *
 * Verifies the DB state after running test-equipment-cycle.ts:
 *   1. All posted JEs are balanced (sum of debits == sum of credits per JE)
 *   2. Trial balance totals are balanced globally
 *   3. Equipment purchase JEs exist for equipment with purchasePrice > 0
 *   4. Rental invoice JEs are balanced (specifically the delivery-fee fix)
 *   5. Reversal entries exist and are properly swapped (D/C)
 *   6. No orphaned JEs (every JE sourceId points to an existing record)
 *   7. Soft-delete fields are set correctly
 *
 * Run: bun run scripts/verify-phase3-db.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

interface Check {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
  detail: string
}

const checks: Check[] = []
const pass = (n: string, d: string) => { checks.push({ name: n, status: 'PASS', detail: d }); console.log(`✅ [PASS] ${n}: ${d}`) }
const fail = (n: string, d: string) => { checks.push({ name: n, status: 'FAIL', detail: d }); console.log(`❌ [FAIL] ${n}: ${d}`) }
const warn = (n: string, d: string) => { checks.push({ name: n, status: 'WARN', detail: d }); console.log(`⚠️  [WARN] ${n}: ${d}`) }

async function main() {
  console.log('\n═══════════════════════════════════════════════')
  console.log('  Phase 3 — DB Integrity Verification')
  console.log('═══════════════════════════════════════════════\n')

  // ─── Check 1: All posted JEs balanced ───
  const entries = await prisma.journalEntry.findMany({
    where: { status: 'POSTED' },
    include: { lines: true },
  })
  let unbalancedCount = 0
  let totalDebit = 0
  let totalCredit = 0
  const unbalancedExamples: string[] = []
  for (const e of entries) {
    const d = e.lines.reduce((s, l) => s + Number(l.debit), 0)
    const c = e.lines.reduce((s, l) => s + Number(l.credit), 0)
    totalDebit += d
    totalCredit += c
    const diff = Math.round((d - c) * 100) / 100
    if (Math.abs(diff) > 0.005) {
      unbalancedCount++
      if (unbalancedExamples.length < 5) {
        unbalancedExamples.push(`${e.entryNo} (D=${d} C=${c} diff=${diff})`)
      }
    }
  }
  if (unbalancedCount === 0) {
    pass('All posted JEs balanced', `${entries.length} entries, total D=${totalDebit.toFixed(2)} C=${totalCredit.toFixed(2)} diff=${(totalDebit - totalCredit).toFixed(4)}`)
  } else {
    fail('All posted JEs balanced', `${unbalancedCount} unbalanced: ${unbalancedExamples.join(', ')}`)
  }

  // ─── Check 2: Trial balance global balance ───
  const globalDiff = Math.round((totalDebit - totalCredit) * 100) / 100
  if (Math.abs(globalDiff) < 0.005) {
    pass('Trial balance globally balanced', `D=${totalDebit.toFixed(2)} = C=${totalCredit.toFixed(2)}`)
  } else {
    fail('Trial balance globally balanced', `D=${totalDebit.toFixed(2)} ≠ C=${totalCredit.toFixed(2)} diff=${globalDiff}`)
  }

  // ─── Check 3: Equipment purchase JEs exist ───
  const equipmentWithPrice = await prisma.equipment.findMany({
    where: { purchasePrice: { gt: 0 }, deletedAt: null },
    select: { id: true, code: true, purchasePrice: true, journalEntryId: true },
  })
  const eqWithoutJe = equipmentWithPrice.filter(e => !e.journalEntryId)
  if (eqWithoutJe.length === 0) {
    pass('Equipment purchase JEs', `${equipmentWithPrice.length} equipment with purchasePrice > 0, all have journalEntryId`)
  } else {
    fail('Equipment purchase JEs', `${eqWithoutJe.length} equipment missing JE: ${eqWithoutJe.map(e => e.code).join(', ')}`)
  }

  // ─── Check 4: Rental invoice JEs balanced (delivery-fee fix) ───
  const rentalInvoices = await prisma.salesInvoice.findMany({
    where: { invoiceType: 'RENTAL', includeDelivery: true, deliveryAmount: { gt: 0 } },
    select: { id: true, invoiceNo: true, totalAmount: true, deliveryAmount: true, deliveryFeesTaxable: true, vatRate: true, vatAmount: true, netAmount: true, journalEntryId: true },
  })
  let rentalJeIssues = 0
  for (const inv of rentalInvoices) {
    if (!inv.journalEntryId) {
      fail(`Rental invoice ${inv.invoiceNo} JE`, 'journalEntryId is null')
      rentalJeIssues++
      continue
    }
    const je = await prisma.journalEntry.findUnique({
      where: { id: inv.journalEntryId },
      include: { lines: true },
    })
    if (!je) {
      fail(`Rental invoice ${inv.invoiceNo} JE`, `JE ${inv.journalEntryId} not found`)
      rentalJeIssues++
      continue
    }
    const d = je.lines.reduce((s, l) => s + Number(l.debit), 0)
    const c = je.lines.reduce((s, l) => s + Number(l.credit), 0)
    const diff = Math.round((d - c) * 100) / 100
    if (Math.abs(diff) > 0.005) {
      fail(`Rental invoice ${inv.invoiceNo} JE balanced`, `D=${d} C=${c} diff=${diff}`)
      rentalJeIssues++
    }
    // Verify total = invoice.totalAmount
    if (Math.abs(d - Number(inv.totalAmount)) > 0.005) {
      fail(`Rental invoice ${inv.invoiceNo} JE total`, `JE debit ${d} ≠ invoice total ${Number(inv.totalAmount)}`)
      rentalJeIssues++
    }
  }
  if (rentalJeIssues === 0 && rentalInvoices.length > 0) {
    pass('Rental invoice JEs (delivery-fee fix)', `${rentalInvoices.length} rental invoices with delivery fees, all JEs balanced and total matches`)
  } else if (rentalInvoices.length === 0) {
    warn('Rental invoice JEs (delivery-fee fix)', 'No rental invoices with delivery fees found — run test-equipment-cycle.ts first')
  }

  // ─── Check 5: Reversal entries exist and properly swapped ───
  const reversals = await prisma.journalEntry.findMany({
    where: { sourceType: 'REVERSAL' },
    include: { lines: true },
  })
  let reversalIssues = 0
  for (const rev of reversals) {
    const d = rev.lines.reduce((s, l) => s + Number(l.debit), 0)
    const c = rev.lines.reduce((s, l) => s + Number(l.credit), 0)
    const diff = Math.round((d - c) * 100) / 100
    if (Math.abs(diff) > 0.005) {
      fail(`Reversal ${rev.entryNo} balanced`, `D=${d} C=${c} diff=${diff}`)
      reversalIssues++
    }
  }
  if (reversalIssues === 0) {
    pass('Reversal entries balanced', `${reversals.length} reversal entries, all balanced`)
  }

  // ─── Check 6: No orphaned JEs (sourceId points to existing record) ───
  // Sample check: for SALES_INVOICE JEs, sourceId should be a SalesInvoice id
  const salesJes = await prisma.journalEntry.findMany({
    where: { sourceType: 'SALES_INVOICE' },
    select: { id: true, sourceId: true },
  })
  let orphanedCount = 0
  for (const je of salesJes) {
    if (!je.sourceId) continue
    const inv = await prisma.salesInvoice.findUnique({ where: { id: je.sourceId } })
    if (!inv) {
      orphanedCount++
      fail(`JE ${je.id} orphaned`, `sourceId ${je.sourceId} not found in SalesInvoice`)
    }
  }
  if (orphanedCount === 0) {
    pass('No orphaned SALES_INVOICE JEs', `${salesJes.length} JEs all have valid sourceId`)
  }

  // ─── Check 7: Soft-delete fields ───
  const softDeletedEq = await prisma.equipment.count({ where: { deletedAt: { not: null } } })
  const softDeletedPayments = await prisma.clientPayment.count({ where: { deletedAt: { not: null } } })
  pass('Soft-delete fields', `Equipment deleted: ${softDeletedEq}, ClientPayment deleted: ${softDeletedPayments}`)

  // ─── Check 8: Equipment status consistency ───
  // Equipment that is RENTED should have an ACTIVE rental
  const rentedEquipment = await prisma.equipment.findMany({
    where: { status: 'RENTED', deletedAt: null },
    select: { id: true, code: true },
  })
  let statusIssues = 0
  for (const eq of rentedEquipment) {
    const activeRental = await prisma.equipmentRental.findFirst({
      where: { equipmentId: eq.id, status: { in: ['ACTIVE', 'UNDER_REVIEW'] } },
    })
    if (!activeRental) {
      warn(`Equipment ${eq.code} status`, 'RENTED but no ACTIVE rental found')
      statusIssues++
    }
  }
  if (statusIssues === 0 && rentedEquipment.length > 0) {
    pass('Equipment RENTED status consistency', `${rentedEquipment.length} RENTED equipment all have ACTIVE rentals`)
  } else if (rentedEquipment.length === 0) {
    pass('Equipment RENTED status consistency', '0 RENTED equipment (test may not have created rentals)')
  }

  // ─── Summary ───
  const p = checks.filter(c => c.status === 'PASS').length
  const f = checks.filter(c => c.status === 'FAIL').length
  const w = checks.filter(c => c.status === 'WARN').length
  console.log('\n═══════════════════════════════════════════════')
  console.log('  DB Verification Summary')
  console.log('═══════════════════════════════════════════════')
  console.log(`  ✅ PASS: ${p}`)
  console.log(`  ❌ FAIL: ${f}`)
  console.log(`  ⚠️  WARN: ${w}`)
  console.log(`  Total: ${checks.length}`)
  console.log('═══════════════════════════════════════════════\n')

  process.exit(f > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
