import { db } from '@/lib/db'
async function main() {
  const withExpenses = await db.account.count({ where: { usableInExpenses: true } })
  const withProject = await db.account.count({ where: { allowsProject: true } })
  const withRole = await db.account.count({ where: { accountRole: { not: null } } })
  const total = await db.account.count()
  console.log(`Accounts with usableInExpenses=true: ${withExpenses}`)
  console.log(`Accounts with allowsProject=true: ${withProject}`)
  console.log(`Accounts with role: ${withRole}/${total}`)
}
main().catch(console.error).finally(() => db.$disconnect())
