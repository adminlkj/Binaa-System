import { db } from '@/lib/db'
async function main() {
  const count = await db.financialMapping.count()
  console.log(`FinancialMapping records: ${count}`)
  const mappings = await db.financialMapping.findMany({ select: { operationType: true, debitRoles: true, creditRoles: true } })
  for (const m of mappings) {
    console.log(`  ${m.operationType}: Dr[${m.debitRoles}] Cr[${m.creditRoles}]`)
  }
  const accountsWithRole = await db.account.count({ where: { accountRole: { not: null } } })
  const accountsTotal = await db.account.count()
  console.log(`\nAccounts with role: ${accountsWithRole}/${accountsTotal}`)
  const props = await db.account.groupBy({ by: ['usableInExpenses'], _count: true })
  console.log('usableInExpenses distribution:', props)
}
main().catch(console.error).finally(() => db.$disconnect())
