import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Find DRAFT invoices that still have journalEntryId (legacy from pre-fix tests)
  const drafts = await db.salesInvoice.findMany({
    where: { status: 'DRAFT', journalEntryId: { not: null } },
    select: { id: true, invoiceNo: true, journalEntryId: true },
  })
  console.log(`Found ${drafts.length} DRAFT invoice(s) with legacy journalEntryId`)
  for (const d of drafts) {
    console.log(`  ${d.invoiceNo} (${d.id}) → JE ${d.journalEntryId}`)
    // Reverse the JE (proper accounting — don't hard-delete)
    const je = await db.journalEntry.findUnique({
      where: { id: d.journalEntryId! },
      select: { isReversal: true, reversedEntryId: true, lines: { where: { deletedAt: null } } },
    })
    if (je && !je.isReversal && !je.reversedEntryId) {
      // Create reversal entry: swap debit/credit
      const reversalLines = je.lines.map(l => ({
        accountCode: '', // will be resolved below
        accountId: l.accountId,
        debit: Number(l.credit),
        credit: Number(l.debit),
        description: `عكس قيد يتيم لفاتورة DRAFT ${d.invoiceNo}`,
        costCenterId: l.costCenterId,
      }))
      // Use raw SQL to insert reversal JE + lines
      const entryNo = `JE-CLEANUP-${Date.now()}`
      const now = new Date()
      const newJe = await db.journalEntry.create({
        data: {
          entryNo,
          date: now,
          description: `عكس قيد قديم لفاتورة DRAFT ${d.invoiceNo}`,
          status: 'POSTED',
          sourceType: 'SALES_INVOICE',
          sourceId: d.id,
          isReversal: true,
          reversedEntryId: d.journalEntryId!,
          createdAt: now,
          updatedAt: now,
        },
      })
      for (const rl of reversalLines) {
        await db.journalLine.create({
          data: {
            journalEntryId: newJe.id,
            accountId: rl.accountId!,
            debit: rl.debit,
            credit: rl.credit,
            description: rl.description,
            costCenterId: rl.costCenterId,
            createdAt: now,
            updatedAt: now,
          },
        })
      }
      // Mark original JE as reversed
      await db.journalEntry.update({
        where: { id: d.journalEntryId! },
        data: { reversedBy: { connect: { id: newJe.id } } },
      })
      // Detach JE from invoice
      await db.salesInvoice.update({
        where: { id: d.id },
        data: { journalEntryId: null },
      })
      console.log(`    → reversed: new JE ${newJe.entryNo}, original marked reversed, invoice.journalEntryId=null`)
    } else if (je?.isReversal) {
      // Already a reversal — just detach
      await db.salesInvoice.update({ where: { id: d.id }, data: { journalEntryId: null } })
      console.log(`    → already a reversal JE; detached from invoice`)
    }
  }
  // Verify
  const remaining = await db.salesInvoice.count({
    where: { status: 'DRAFT', journalEntryId: { not: null } },
  })
  console.log(`\nRemaining DRAFT invoices with journalEntryId: ${remaining}`)

  // Also clean up the overpaid SRV-2026-0002 from pre-fix test (status was PAID with paidAmount > total)
  const badInv = await db.salesInvoice.findFirst({
    where: { invoiceNo: 'SRV-2026-0002' },
    select: { id: true, status: true, paidAmount: true, totalAmount: true, journalEntryId: true },
  })
  if (badInv && Number(badInv.paidAmount) > Number(badInv.totalAmount)) {
    console.log(`\nCleaning up overpaid test invoice ${badInv.invoiceNo}: paid=${badInv.paidAmount} total=${badInv.totalAmount}`)
    // Find + delete the bad client payment(s)
    const pays = await db.clientPayment.findMany({
      where: { invoiceId: badInv.id },
      select: { id: true, journalEntryId: true },
    })
    for (const p of pays) {
      if (p.journalEntryId) {
        await db.journalLine.deleteMany({ where: { journalEntryId: p.journalEntryId } })
        await db.journalEntry.delete({ where: { id: p.journalEntryId } })
      }
      await db.clientPayment.delete({ where: { id: p.id } })
    }
    // Reset invoice paidAmount
    await db.salesInvoice.update({
      where: { id: badInv.id },
      data: { paidAmount: 0, status: 'SENT' },
    })
    console.log(`  → cleaned ${pays.length} payment(s), reset paidAmount=0 status=SENT`)
  }

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
