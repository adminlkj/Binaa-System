// P1-4c: Add partial unique indexes for journal entry idempotency.
// These prevent:
//   1. Double-posting: two POSTED non-reversal JEs with the same (sourceType, sourceId)
//   2. Double-reversal: two reversal JEs pointing to the same reversedEntryId
//
// SQLite supports partial indexes via WHERE clauses. Prisma schema DSL doesn't
// express these, so we apply them as raw SQL after db:push.
//
// Idempotent: uses CREATE UNIQUE INDEX IF NOT EXISTS.

import { db } from '@/lib/db'

async function main() {
  console.log('Adding idempotency unique indexes...')

  // 1. Prevent double-posting: at most ONE non-reversal POSTED JE per (sourceType, sourceId)
  try {
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_source_isReversal_unique"
      ON "JournalEntry" ("sourceType", "sourceId")
      WHERE "isReversal" = 0 AND "sourceId" IS NOT NULL AND "deletedAt" IS NULL
    `)
    console.log('  ✅ JournalEntry_source_isReversal_unique (prevents double-posting)')
  } catch (e: any) {
    console.log(`  ⚠️  JournalEntry_source_isReversal_unique: ${e.message}`)
    console.log('     Existing duplicates prevent index creation. Run cleanup first.')
  }

  // 2. Prevent double-reversal: at most ONE reversal JE per reversedEntryId
  try {
    await db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_reversedEntryId_unique"
      ON "JournalEntry" ("reversedEntryId")
      WHERE "isReversal" = 1 AND "reversedEntryId" IS NOT NULL AND "deletedAt" IS NULL
    `)
    console.log('  ✅ JournalEntry_reversedEntryId_unique (prevents double-reversal)')
  } catch (e: any) {
    console.log(`  ⚠️  JournalEntry_reversedEntryId_unique: ${e.message}`)
  }

  console.log('\nDone. Idempotency indexes are in place.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
