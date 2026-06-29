import { db } from '../src/lib/db'

async function main() {
  console.log('Cleaning up leftover test JEs...')
  // Find all JEs from test runs (created in last 2 hours)
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000)
  const testJEs = await db.journalEntry.findMany({
    where: {
      createdAt: { gt: cutoff },
      sourceType: { in: ['SALARY_PAYMENT', 'SALARY_ACCRUAL', 'EMPLOYEE_ADVANCE', 'ADVANCE_SETTLEMENT', 'PETTY_CASH', 'PAYROLL_RUN', 'PAYROLL_PAYMENT'] }
    },
    select: { id: true, entryNo: true, sourceType: true, status: true }
  })
  console.log(`Found ${testJEs.length} recent test JEs`)
  for (const je of testJEs) {
    // Hard delete journal lines then the JE
    await db.journalLine.deleteMany({ where: { journalEntryId: je.id } }).catch(() => {})
    await db.journalEntry.delete({ where: { id: je.id } }).catch(() => {})
  }
  
  // Also delete soft-deleted JEs (they still hold entryNo unique)
  const softDeleted = await db.journalEntry.findMany({ where: { deletedAt: { not: null } }, select: { id: true, entryNo: true } })
  console.log(`Found ${softDeleted.length} soft-deleted JEs to hard-delete`)
  for (const je of softDeleted) {
    await db.journalLine.deleteMany({ where: { journalEntryId: je.id } }).catch(() => {})
    await db.journalEntry.delete({ where: { id: je.id } }).catch(() => {})
  }
  
  // Also clean up soft-deleted salaries, advances, petty cash
  await db.salary.deleteMany({ where: { deletedAt: { not: null } } }).catch(() => {})
  await db.employeeAdvance.deleteMany({ where: { deletedAt: { not: null } } }).catch(() => {})
  await db.pettyCash.deleteMany({ where: { deletedAt: { not: null } } }).catch(() => {})
  
  // Clean up test employees
  const testEmps = await db.employee.findMany({ where: { code: { startsWith: 'TEST-HR-' } } })
  for (const e of testEmps) {
    await db.salary.deleteMany({ where: { employeeId: e.id } }).catch(() => {})
    await db.employee.delete({ where: { id: e.id } }).catch(() => {})
  }
  console.log('Done.')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
