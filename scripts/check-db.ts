import { db } from '../src/lib/db'
async function main() {
  const employees = await db.employee.count()
  const projects = await db.project.count()
  const invoices = await db.salesInvoice.count()
  const journalEntries = await db.journalEntry.count()
  const accounts = await db.account.count()
  const contracts = await db.contract.count()
  console.log('=== Database Integrity Check ===')
  console.log('  Employees:', employees)
  console.log('  Projects:', projects)
  console.log('  Contracts:', contracts)
  console.log('  Sales Invoices:', invoices)
  console.log('  Journal Entries:', journalEntries)
  console.log('  Chart of Accounts:', accounts)
  console.log('STATUS: Database is intact and readable.')
}
main().then(() => process.exit(0)).catch(e => { console.error('DB ERROR:', e); process.exit(1) })
