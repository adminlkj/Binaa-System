import { db } from '@/lib/db'
async function main() {
  const testJE = await db.journalEntry.findMany({ where: { sourceId: { startsWith: 'E2E-TEST' } }, select: { id: true, entryNo: true } })
  for (const je of testJE) {
    await db.journalLine.deleteMany({ where: { journalEntryId: je.id } })
    await db.journalEntry.delete({ where: { id: je.id } })
  }
  console.log(`Deleted ${testJE.length} test JEs`)
  const max = await db.$queryRaw<Array<{ m: bigint }>>`SELECT COALESCE(MAX(CAST(SUBSTR("entryNo", 4) AS INTEGER)), 0) as m FROM "JournalEntry" WHERE "entryNo" LIKE 'JE-%'`
  const maxNum = Number(max[0]?.m || 0)
  await db.sequence.update({ where: { id: 'default' }, data: { lastEntryNo: maxNum } })
  console.log(`Sequence reset to ${maxNum}`)
}
main().catch(console.error).finally(() => db.$disconnect())
