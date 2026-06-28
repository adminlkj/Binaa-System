import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  // Find an existing cost center
  const cc = await db.costCenter.findFirst()
  if (!cc) { console.log('No cost center exists — creating one'); /* create */ }
  console.log(`Cost center found: ${cc?.id} (${cc?.name})`)
  // Find a project without cost center, assign it
  const proj = await db.project.findFirst({
    where: { costCenterId: null },
    select: { id: true, name: true, clientId: true },
  })
  if (!proj) { console.log('No project to update'); return }
  await db.project.update({ where: { id: proj.id }, data: { costCenterId: cc!.id } })
  console.log(`Assigned cost center to project ${proj.name} (${proj.id})`)
  // Now create a sales invoice linked to this project, transition to SENT, check JE lines
  const r = await fetch('http://localhost:3000/api/sales-invoices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: proj.clientId, projectId: proj.id,
      date: '2025-01-15', dueDate: '2025-02-15',
      items: [{ description: 'cc-verify', quantity: 1, unitPrice: 100 }],
      vatRate: 0.15,
    }),
  })
  const inv = await r.json()
  console.log(`Created invoice ${inv.invoiceNo} (${inv.id})`)
  // Transition to SENT
  const p = await fetch(`http://localhost:3000/api/sales-invoices/${inv.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'SENT' }),
  })
  console.log(`PATCH SENT: ${p.status}`)
  const sent = await db.salesInvoice.findUnique({ where: { id: inv.id }, select: { journalEntryId: true } })
  if (!sent?.journalEntryId) { console.log('FAIL: no JE'); return }
  const lines = await db.journalLine.findMany({
    where: { journalEntryId: sent.journalEntryId, deletedAt: null },
    select: { costCenterId: true, debit: true, credit: true },
  })
  console.log(`JE ${sent.journalEntryId} lines:`)
  for (const l of lines) {
    console.log(`  Dr=${l.debit} Cr=${l.credit} costCenterId=${l.costCenterId} (expected ${cc!.id})`)
  }
  const allHaveCC = lines.length > 0 && lines.every(l => l.costCenterId === cc!.id)
  console.log(`\nP6-HIGH-001: ${allHaveCC ? 'PASS' : 'FAIL'} — all ${lines.length} lines have costCenterId`)
  // Cleanup: cancel + restore project
  await fetch(`http://localhost:3000/api/sales-invoices/${inv.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'CANCELLED' }),
  })
  await db.project.update({ where: { id: proj.id }, data: { costCenterId: null } })
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
