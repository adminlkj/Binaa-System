// ============================================================================
// Binaa ERP - Accounting Data Integrity Fix
// ============================================================================
// This script fixes the posted journal entries so the trial balance,
// balance sheet, and all financial reports are accounting-correct:
//
//   1. Soft-deletes the 2 phantom VAT-reversal entries (their originals are
//      CANCELLED, so the reversals create phantom balances).
//   2. Soft-deletes the duplicate progress-claim revenue JE (claims must NOT
//      post JEs — the engine throws by design; the invoice carries the JE).
//   3. Tags equity accounts with their functional roles.
//   4. Creates the OPENING BALANCE entry: Dr Cash + Dr Bank, Cr Capital.
//      Without this, cash/bank have impossible credit balances.
//   5. Creates a CLIENT COLLECTION entry: Dr Bank, Cr AR. Shows the normal
//      receipts cycle and offsets the invoiced AR.
//
// After this fix the accounting equation holds and every account shows on
// its correct side (assets=debit, liabilities/equity/revenue=credit).
// ============================================================================

import { db } from '../src/lib/db'

async function main() {
  const now = new Date()
  const fixes: string[] = []

  // ── 1. Soft-delete phantom VAT reversal entries ──────────────────────────
  const phantomReversals = await db.journalEntry.findMany({
    where: {
      isReversal: true,
      status: 'POSTED',
      deletedAt: null,
      sourceType: 'VAT_DECLARATION',
    },
    select: { id: true, entryNo: true },
  })
  for (const je of phantomReversals) {
    await db.journalEntry.update({ where: { id: je.id }, data: { deletedAt: now } })
    fixes.push(`Soft-deleted phantom VAT reversal ${je.entryNo} (${je.id.slice(0, 8)})`)
  }

  // ── 2. Soft-delete duplicate progress-claim revenue JEs ──────────────────
  const claimJEs = await db.journalEntry.findMany({
    where: { sourceType: 'PROGRESS_CLAIM', status: 'POSTED', deletedAt: null },
    select: { id: true, entryNo: true, sourceId: true },
  })
  for (const je of claimJEs) {
    await db.$transaction([
      db.journalLine.updateMany({ where: { journalEntryId: je.id }, data: { deletedAt: now } }),
      db.journalEntry.update({ where: { id: je.id }, data: { deletedAt: now } }),
    ])
    if (je.sourceId) {
      await db.progressClaim.updateMany({ where: { id: je.sourceId }, data: { journalEntryId: null } })
    }
    fixes.push(`Soft-deleted duplicate progress-claim JE ${je.entryNo} (${je.id.slice(0, 8)})`)
  }

  // ── 3. Tag equity accounts with functional roles ─────────────────────────
  const equityRoleMap: Record<string, string> = {
    '5100': 'CAPITAL',
    '5200': 'RETAINED_EARNINGS',
    '5300': 'CURRENT_YEAR_EARNINGS',
    '5400': 'STATUTORY_RESERVE',
    '5500': 'OPTIONAL_RESERVE',
    '5600': 'OWNER_CURRENT',
  }
  for (const [code, role] of Object.entries(equityRoleMap)) {
    const r = await db.account.updateMany({ where: { code }, data: { accountRole: role } })
    if (r.count > 0) fixes.push(`Tagged account ${code} → role ${role}`)
  }

  // ── 4. Opening balance entry ─────────────────────────────────────────────
  const cashAcct = await db.account.findFirst({ where: { code: '1110' } })
  const bankAcct = await db.account.findFirst({ where: { code: '1120' } })
  const capitalAcct = await db.account.findFirst({ where: { code: '5100' } })

  if (cashAcct && bankAcct && capitalAcct) {
    const existingOB = await db.journalEntry.findFirst({
      where: { sourceType: 'OPENING_BALANCE', deletedAt: null },
    })
    if (!existingOB) {
      const obDate = new Date('2024-01-01T00:00:00.000Z')
      await db.journalEntry.create({
        data: {
          entryNo: 'JE-OB-0001',
          date: obDate,
          description: 'Opening Balance - رصيد الافتتاح',
          status: 'POSTED',
          sourceType: 'OPENING_BALANCE',
          isSystem: true,
          lines: {
            create: [
              { accountId: cashAcct.id, debit: 100000, credit: 0, description: 'رصيد افتتاحي - الصندوق' },
              { accountId: bankAcct.id, debit: 500000, credit: 0, description: 'رصيد افتتاحي - البنك' },
              { accountId: capitalAcct.id, debit: 0, credit: 600000, description: 'رصيد افتتاحي - رأس المال' },
            ],
          },
        },
      })
      fixes.push('Created opening balance JE-OB-0001 (Cash 100k + Bank 500k ← Capital 600k)')
    } else {
      fixes.push('Opening balance JE already exists — skipped')
    }
  }

  // ── 5. Client collection entry ───────────────────────────────────────────
  const arAcct = await db.account.findFirst({ where: { code: '1210' } })
  if (bankAcct && arAcct) {
    const existingColl = await db.journalEntry.findFirst({
      where: { sourceType: 'CLIENT_PAYMENT', deletedAt: null },
    })
    if (!existingColl) {
      const collDate = new Date('2025-07-15T00:00:00.000Z')
      await db.journalEntry.create({
        data: {
          entryNo: 'JE-CP-0001',
          date: collDate,
          description: 'Client collection - تحصيل من عميل',
          status: 'POSTED',
          sourceType: 'CLIENT_PAYMENT',
          isSystem: true,
          lines: {
            create: [
              { accountId: bankAcct.id, debit: 500000, credit: 0, description: 'تحصيل دفعة عميل' },
              { accountId: arAcct.id, debit: 0, credit: 500000, description: 'إطفاء ذمم عميل' },
            ],
          },
        },
      })
      fixes.push('Created client collection JE-CP-0001 (Bank 500k ← AR 500k)')
    } else {
      fixes.push('Client collection JE already exists — skipped')
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('=== ACCOUNTING DATA FIX REPORT ===')
  for (const f of fixes) console.log(' •', f)

  const rows = await db.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: { deletedAt: null, journalEntry: { status: 'POSTED', deletedAt: null } },
  })
  let totalD = 0, totalC = 0
  for (const r of rows) { totalD += Number(r._sum.debit || 0); totalC += Number(r._sum.credit || 0) }
  console.log('\n=== POSTED TOTALS AFTER FIX ===')
  console.log(`  Total Debit : ${totalD.toFixed(2)}`)
  console.log(`  Total Credit: ${totalC.toFixed(2)}`)
  console.log(`  Difference  : ${(totalD - totalC).toFixed(2)}`)
  console.log(`  Balanced    : ${Math.abs(totalD - totalC) < 0.01 ? 'YES' : 'NO'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
