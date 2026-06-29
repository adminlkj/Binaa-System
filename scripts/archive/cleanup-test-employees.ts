import { db } from '../src/lib/db'

async function main() {
  console.log('Cleaning up test employees (name = "Test HR Employee")...')
  const testEmps = await db.employee.findMany({ where: { name: 'Test HR Employee' } })
  console.log(`Found ${testEmps.length} test employees`)
  for (const e of testEmps) {
    // Hard-delete related salary records first
    await db.salary.deleteMany({ where: { employeeId: e.id } }).catch(() => {})
    await db.employee.delete({ where: { id: e.id } }).catch((err) => {
      console.log(`Could not delete ${e.code}: ${String(err).slice(0, 100)}`)
    })
  }
  console.log('Done.')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
