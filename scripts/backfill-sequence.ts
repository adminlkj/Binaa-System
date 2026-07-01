// Backfill the Sequence table with the current max JE-NNNNNN entry number.
// Run once after deploying the Sequence model. Idempotent.

import { db } from '@/lib/db'

async function main() {
  const entries = await db.journalEntry.findMany({
    where: { entryNo: { startsWith: 'JE-' } },
    select: { entryNo: true },
  })
  let max = 0
  for (const je of entries) {
    const match = je.entryNo.match(/^JE-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  console.log(`Current max JE-NNNNNN number: ${max}`)

  // Use Prisma client upsert to handle @updatedAt automatically
  const seq = await db.sequence.upsert({
    where: { id: 'default' },
    create: { id: 'default', lastEntryNo: max },
    update: { lastEntryNo: { increment: 0 } }, // no-op if exists; we'll set explicitly below
  })
  // Explicitly set to max (in case existing was lower)
  const updated = await db.sequence.update({
    where: { id: 'default' },
    data: { lastEntryNo: Math.max(seq.lastEntryNo, max) },
  })
  console.log(`✅ Sequence table seeded. lastEntryNo = ${updated.lastEntryNo}`)
  console.log(`   Next entry will be: JE-${String(updated.lastEntryNo + 1).padStart(6, '0')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
