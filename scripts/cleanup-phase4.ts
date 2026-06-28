import { db } from '../src/lib/db'

async function main() {
  console.log('Cleaning up Phase 4 test records...')
  // Find test salaries, advances, etc by description/code patterns
  const testSalaries = await db.salary.findMany({ where: { OR: [{ month: 11, year: 2025 }, { month: 2, year: 2025 }, { month: 3, year: 2025 }], employee: { code: { startsWith: 'EMP-001' } } }, select: { id: true, journalEntryId: true } })
  console.log(`Found ${testSalaries.length} test salaries`)
  for (const s of testSalaries) {
    if (s.journalEntryId) {
      // soft-reverse: mark deleted
      await db.journalEntry.update({ where: { id: s.journalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: s.journalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    await db.salary.update({ where: { id: s.id }, data: { deletedAt: new Date() } }).catch(() => {})
  }
  
  // Test salary payments (also salaries with status PAID for those months)
  const paidSalaries = await db.salary.findMany({ where: { status: 'PAID', month: { in: [3, 11] }, year: 2025 }, select: { id: true, journalEntryId: true } })
  for (const s of paidSalaries) {
    if (s.journalEntryId) {
      await db.journalEntry.update({ where: { id: s.journalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: s.journalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    await db.salary.update({ where: { id: s.id }, data: { deletedAt: new Date() } }).catch(() => {})
  }
  
  // Test advances
  const testAdvances = await db.employeeAdvance.findMany({ where: { description: 'Test advance' } })
  console.log(`Found ${testAdvances.length} test advances`)
  for (const a of testAdvances) {
    if (a.journalEntryId) {
      await db.journalEntry.update({ where: { id: a.journalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: a.journalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    await db.employeeAdvance.update({ where: { id: a.id }, data: { deletedAt: new Date() } }).catch(() => {})
  }
  
  // Test petty cash
  const testPC = await db.pettyCash.findMany({ where: { description: 'Test petty cash disbursement' } })
  console.log(`Found ${testPC.length} test petty cash`)
  for (const p of testPC) {
    if (p.journalEntryId) {
      await db.journalEntry.update({ where: { id: p.journalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: p.journalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    await db.pettyCash.update({ where: { id: p.id }, data: { deletedAt: new Date() } }).catch(() => {})
  }
  
  // Test labor costs
  const testLC = await db.laborCost.findMany({ where: { description: 'Test labor cost' } })
  console.log(`Found ${testLC.length} test labor costs`)
  for (const l of testLC) {
    await db.laborCost.delete({ where: { id: l.id } }).catch(() => {})
  }
  
  // Test payroll runs (month=11 year=2025)
  const testPR = await db.payrollRun.findMany({ where: { month: 11, year: 2025 } })
  console.log(`Found ${testPR.length} test payroll runs`)
  for (const p of testPR) {
    if (p.journalEntryId) {
      await db.journalEntry.update({ where: { id: p.journalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: p.journalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    if (p.paymentJournalEntryId) {
      await db.journalEntry.update({ where: { id: p.paymentJournalEntryId }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: p.paymentJournalEntryId }, data: { deletedAt: new Date() } }).catch(() => {})
    }
    await db.payrollRunLine.deleteMany({ where: { payrollRunId: p.id } }).catch(() => {})
    await db.payrollRun.delete({ where: { id: p.id } }).catch(() => {})
  }
  
  // Test employee (code starts with TEST-HR-)
  const testEmps = await db.employee.findMany({ where: { code: { startsWith: 'TEST-HR-' } } })
  console.log(`Found ${testEmps.length} test employees`)
  for (const e of testEmps) {
    // delete related salary first
    await db.salary.deleteMany({ where: { employeeId: e.id } }).catch(() => {})
    await db.employee.delete({ where: { id: e.id } }).catch(() => {})
  }
  
  // Test salary payment JEs that might be orphaned
  const orphanedSP = await db.journalEntry.findMany({ where: { sourceType: 'SALARY_PAYMENT', deletedAt: null }, select: { id: true, createdAt: true } })
  // Recent ones (last hour) are likely from tests
  const cutoff = new Date(Date.now() - 3600 * 1000)
  for (const je of orphanedSP) {
    if (je.createdAt > cutoff) {
      await db.journalEntry.update({ where: { id: je.id }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: je.id }, data: { deletedAt: new Date() } }).catch(() => {})
    }
  }
  
  // Also ADVANCE_SETTLEMENT orphans
  const orphanedAS = await db.journalEntry.findMany({ where: { sourceType: 'ADVANCE_SETTLEMENT', deletedAt: null }, select: { id: true, createdAt: true } })
  for (const je of orphanedAS) {
    if (je.createdAt > cutoff) {
      await db.journalEntry.update({ where: { id: je.id }, data: { status: 'DRAFT', deletedAt: new Date() } }).catch(() => {})
      await db.journalLine.updateMany({ where: { journalEntryId: je.id }, data: { deletedAt: new Date() } }).catch(() => {})
    }
  }
  
  console.log('Cleanup done.')
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
