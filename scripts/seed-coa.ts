import { db } from '@/lib/db'
import { initializeChartOfAccounts } from '@/lib/accounting/engine'
import { seedFinancialMappings } from '@/lib/financial-mapping-engine'

async function main() {
  console.log('Seeding Chart of Accounts...')
  await initializeChartOfAccounts()
  console.log('Seeding Financial Mappings...')
  await seedFinancialMappings()
  const count = await db.account.count()
  console.log(`✅ Done. Accounts in DB: ${count}`)
}
main().catch(e => { console.error(e); process.exit(1) })
