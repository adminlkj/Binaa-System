import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const tables = await prisma.$queryRaw<Array<{name: string, sql: string}>>`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`
  console.log('Tables in DB:', tables.length)
  for (const t of tables.slice(0, 5)) {
    const count = await prisma.$queryRaw<Array<{c: bigint}>>`SELECT COUNT(*) as c FROM ${t.name}`
    console.log(`  ${t.name}: ${count[0].c} rows`)
  }
  // Check Client specifically
  const clientCount = await prisma.client.count()
  console.log('Prisma client.count():', clientCount)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1) })
