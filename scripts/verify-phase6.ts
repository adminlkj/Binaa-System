// ============================================================================
// Phase 6 — POST-FIX E2E Verification (resilient to dev-server crashes)
// ----------------------------------------------------------------------------
// Strategy: each API call retries with backoff. If the dev server dies
// (Turbopack instability under load), we restart it before retrying.
// Direct DB / Prisma checks run independently of the dev server.
// ============================================================================
import { PrismaClient } from '@prisma/client'
import { execSync, spawn } from 'child_process'

const db = new PrismaClient()
const BASE = 'http://localhost:3000'

const results: Array<{ id: string; status: 'PASS' | 'FAIL'; detail: string }> = []

function record(id: string, ok: boolean, detail: string) {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}: ${detail}`)
}

let devProc: any = null
function ensureDevServer(): boolean {
  // Try a quick health check first
  try {
    const r = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 5 ${BASE}/api/clients`, { encoding: 'utf-8' }).trim()
    if (r === '200') return true
  } catch {}

  // Kill any stale processes on port 3000
  try { execSync('lsof -ti:3000 | xargs -r kill -9 2>/dev/null', { stdio: 'ignore' }) } catch {}
  sleep(2000)

  // Start fresh
  console.log('  [dev] restarting dev server...')
  devProc = spawn('bun', ['run', 'dev'], {
    cwd: '/home/z/my-project',
    detached: true,
    stdio: 'ignore',
  })
  devProc.unref()

  // Wait up to 25s for the server to be ready
  for (let i = 0; i < 25; i++) {
    sleep(1000)
    try {
      const r = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 5 ${BASE}/api/clients`, { encoding: 'utf-8' }).trim()
      if (r === '200') {
        console.log(`  [dev] ready after ${i + 1}s`)
        return true
      }
    } catch {}
  }
  console.log('  [dev] FAILED to restart dev server')
  return false
}

function sleep(ms: number) {
  execSync(`sleep ${ms / 1000}`)
}

async function api(path: string, init?: RequestInit, retries = 3): Promise<{ status: number; json: any; text: string }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, init)
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {}
      return { status: res.status, json, text }
    } catch (e: any) {
      if (attempt < retries - 1) {
        console.log(`  [retry] ${path} attempt ${attempt + 1} failed: ${e.message.slice(0, 100)}`)
        // Restart dev server before next retry
        ensureDevServer()
        sleep(2000)
      } else {
        throw e
      }
    }
  }
  throw new Error('unreachable')
}

async function main() {
  console.log('=== Phase 6 — POST-FIX E2E Verification (resilient) ===\n')

  if (!ensureDevServer()) {
    console.log('FATAL: cannot start dev server. Falling back to DB-only verification.')
  }

  const client = await db.client.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!client) { console.log('No active client — aborting.'); process.exit(1) }
  console.log(`Using client: ${client.name} (${client.id})\n`)

  // -------- P6-CRIT-001: clients/[id]/accounting no longer crashes --------
  try {
    const r = await api(`/api/clients/${client.id}/accounting`)
    if (r.status === 200 && r.json && typeof r.json.currentBalance === 'number') {
      record('P6-CRIT-001', true,
        `GET /api/clients/{id}/accounting → 200 (jeCount=${r.json.journalEntryCount}, balance=${r.json.currentBalance})`)
    } else {
      record('P6-CRIT-001', false, `GET → ${r.status}: ${r.text?.slice(0, 200)}`)
    }
  } catch (e: any) { record('P6-CRIT-001', false, `error: ${e.message}`) }

  // -------- P6-CRIT-002: DRAFT sales invoice has NO journalEntryId --------
  let draftInvId: string | null = null
  try {
    const r = await api('/api/sales-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id, date: '2025-01-15', dueDate: '2025-02-15',
        items: [{ description: 'v6-test', quantity: 1, unitPrice: 100 }], vatRate: 0.15,
      }),
    })
    if (r.status === 201 && r.json?.id) {
      draftInvId = r.json.id
      const fresh = await db.salesInvoice.findUnique({
        where: { id: draftInvId },
        select: { invoiceNo: true, status: true, journalEntryId: true },
      })
      if (fresh && fresh.status === 'DRAFT' && !fresh.journalEntryId) {
        record('P6-CRIT-002', true, `DRAFT ${fresh.invoiceNo} has journalEntryId=null`)
      } else {
        record('P6-CRIT-002', false, `state: ${JSON.stringify(fresh)}`)
      }
    } else { record('P6-CRIT-002', false, `POST → ${r.status}: ${r.text?.slice(0, 200)}`) }
  } catch (e: any) { record('P6-CRIT-002', false, `error: ${e.message}`) }

  // -------- P6-CRIT-003: PATCH CANCELLED reverses the linked JE --------
  let sentJeId: string | null = null
  try {
    if (draftInvId) {
      const pSent = await api(`/api/sales-invoices/${draftInvId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      })
      const sent = await db.salesInvoice.findUnique({
        where: { id: draftInvId },
        select: { status: true, journalEntryId: true, invoiceNo: true },
      })
      if (pSent.status === 200 && sent?.status === 'SENT' && sent.journalEntryId) {
        sentJeId = sent.journalEntryId
        const pCancel = await api(`/api/sales-invoices/${draftInvId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        })
        const afterCancel = await db.salesInvoice.findUnique({
          where: { id: draftInvId },
          select: { status: true },
        })
        const reversalCount = await db.journalEntry.count({
          where: { reversedEntryId: sentJeId },
        })
        if (pCancel.status === 200 && afterCancel?.status === 'CANCELLED' && reversalCount >= 1) {
          record('P6-CRIT-003', true,
            `CANCELLED ${sent.invoiceNo}; JE ${sentJeId.slice(-8)} now has ${reversalCount} reversal(s)`)
        } else {
          record('P6-CRIT-003', false,
            `cancel=${pCancel.status} status=${afterCancel?.status} reversals=${reversalCount}`)
        }
      } else {
        record('P6-CRIT-003', false,
          `DRAFT→SENT failed: patch=${pSent.status} status=${sent?.status} je=${sent?.journalEntryId}`)
      }
    } else { record('P6-CRIT-003', false, 'no DRAFT invoice to test') }
  } catch (e: any) { record('P6-CRIT-003', false, `error: ${e.message}`) }

  // -------- P6-CRIT-004: DELETE DRAFT (no JE to orphan now) --------
  try {
    const r = await api('/api/sales-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id, date: '2025-01-15', dueDate: '2025-02-15',
        items: [{ description: 'del-test', quantity: 1, unitPrice: 50 }], vatRate: 0.15,
      }),
    })
    if (r.status === 201 && r.json?.id) {
      const del = await api(`/api/sales-invoices/${r.json.id}`, { method: 'DELETE' })
      const stillExists = await db.salesInvoice.findUnique({ where: { id: r.json.id } })
      if (del.status === 200 && !stillExists) {
        record('P6-CRIT-004', true, `Deleted DRAFT cleanly (no orphan JE possible — DRAFT has no JE)`)
      } else {
        record('P6-CRIT-004', false, `del=${del.status} stillExists=${!!stillExists}`)
      }
    } else { record('P6-CRIT-004', false, `POST → ${r.status}`) }
  } catch (e: any) { record('P6-CRIT-004', false, `error: ${e.message}`) }

  // -------- P6-CRIT-005: client-payments blocks overpayment + DRAFT/CANCELLED --------
  try {
    const r = await api('/api/sales-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id, date: '2025-01-15', dueDate: '2025-02-15',
        items: [{ description: 'pay-test', quantity: 1, unitPrice: 200 }], vatRate: 0.15,
      }),
    })
    if (r.status === 201 && r.json?.id) {
      const newInvId = r.json.id
      await api(`/api/sales-invoices/${newInvId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      })
      const total = Number((await db.salesInvoice.findUnique({ where: { id: newInvId }, select: { totalAmount: true } }))?.totalAmount || 0)
      const overpay = await api('/api/client-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id, invoiceId: newInvId,
          amount: total + 99999, date: '2025-01-20',
        }),
      })
      if (overpay.status === 400) {
        record('P6-CRIT-005', true,
          `Overpayment of ${total + 99999} blocked: ${overpay.json?.error?.slice(0, 100)}`)
      } else if (overpay.status === 201) {
        record('P6-CRIT-005', false, `Overpayment ACCEPTED — bug not fixed`)
        if (overpay.json?.id) {
          await db.clientPayment.delete({ where: { id: overpay.json.id } }).catch(() => {})
          if (overpay.json.journalEntryId) {
            await db.journalLine.deleteMany({ where: { journalEntryId: overpay.json.journalEntryId } }).catch(() => {})
            await db.journalEntry.delete({ where: { id: overpay.json.journalEntryId } }).catch(() => {})
          }
        }
      } else {
        record('P6-CRIT-005', false, `overpay → ${overpay.status}: ${overpay.text?.slice(0, 200)}`)
      }
      // Cleanup: cancel + delete the test invoice
      await api(`/api/sales-invoices/${newInvId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      }).catch(() => {})
      // CANCELLED invoice can be deleted per the DELETE rule
      // But there's a CANCELLED-DO-state issue — let's just leave it as CANCELLED.
    } else { record('P6-CRIT-005', false, `POST → ${r.status}`) }
  } catch (e: any) { record('P6-CRIT-005', false, `error: ${e.message}`) }

  // -------- P6-CRIT-006: PUT rejects status changes --------
  try {
    const target = await db.salesInvoice.findFirst({
      where: { status: 'DRAFT' },
      select: { id: true, invoiceNo: true },
    })
    if (!target) {
      record('P6-CRIT-006', false, 'no DRAFT invoice to test PUT status rejection')
    } else {
      const r = await api('/api/sales-invoices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, status: 'PAID' }),
      })
      const after = await db.salesInvoice.findUnique({
        where: { id: target.id },
        select: { status: true },
      })
      if (r.status === 400 && after?.status === 'DRAFT') {
        record('P6-CRIT-006', true,
          `PUT with status=PAID rejected (400); invoice stays DRAFT: ${r.json?.error?.slice(0, 80)}`)
      } else {
        record('P6-CRIT-006', false,
          `PUT → ${r.status}; status=${after?.status} (expected DRAFT)`)
      }
    }
  } catch (e: any) { record('P6-CRIT-006', false, `error: ${e.message}`) }

  // -------- P6-CRIT-007: PAID→DRAFT blocked when paidAmount > 0 --------
  try {
    const paid = await db.salesInvoice.findFirst({
      where: { status: 'PAID', paidAmount: { gt: 0 } },
      select: { id: true, invoiceNo: true, paidAmount: true },
    })
    if (!paid) {
      record('P6-CRIT-007', false, 'no PAID invoice with paidAmount>0 to test')
    } else {
      const r = await api(`/api/sales-invoices/${paid.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DRAFT' }),
      })
      const after = await db.salesInvoice.findUnique({
        where: { id: paid.id },
        select: { status: true },
      })
      if (r.status === 400 && after?.status === 'PAID') {
        record('P6-CRIT-007', true,
          `PAID→DRAFT blocked (400); invoice stays PAID: ${r.json?.error?.slice(0, 80)}`)
      } else {
        record('P6-CRIT-007', false,
          `PATCH → ${r.status}; status=${after?.status} (expected PAID)`)
        await db.salesInvoice.update({ where: { id: paid.id }, data: { status: 'PAID' } }).catch(() => {})
      }
    }
  } catch (e: any) { record('P6-CRIT-007', false, `error: ${e.message}`) }

  // -------- P6-CRIT-008: [id] PATCH respects RENTED equipment --------
  try {
    const rented = await db.equipment.findFirst({
      where: { status: 'RENTED' },
      select: { id: true, code: true, status: true },
    })
    if (!rented) {
      record('P6-CRIT-008', false, 'no RENTED equipment to test')
    } else {
      let do_ = await db.equipmentDeliveryOrder.findFirst({
        where: { equipmentId: rented.id },
        select: { id: true, status: true },
      })
      if (!do_) {
        do_ = await db.equipmentDeliveryOrder.create({
          data: { equipmentId: rented.id, deliveryDate: new Date(), status: 'PENDING' },
        })
      }
      const r = await api(`/api/delivery-orders/${do_.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED' }),
      })
      const afterEq = await db.equipment.findUnique({
        where: { id: rented.id },
        select: { status: true },
      })
      if (r.status === 200 && afterEq?.status === 'RENTED') {
        record('P6-CRIT-008', true,
          `RENTED ${rented.code} stayed RENTED after [id] PATCH DELIVERED (was clobbered to IN_USE before fix)`)
      } else {
        record('P6-CRIT-008', false,
          `[id] PATCH ${r.status}; eq before=RENTED after=${afterEq?.status}`)
      }
      await db.equipment.update({ where: { id: rented.id }, data: { status: 'RENTED' } }).catch(() => {})
      await db.equipmentDeliveryOrder.update({ where: { id: do_.id }, data: { status: 'PENDING' } }).catch(() => {})
    }
  } catch (e: any) { record('P6-CRIT-008', false, `error: ${e.message}`) }

  // -------- P6-CRIT-009: clients/[id] DELETE returns 400 with FK counts --------
  try {
    const clientWithInv = await db.client.findFirst({
      where: { salesInvoices: { some: {} }, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!clientWithInv) {
      record('P6-CRIT-009', false, 'no active client with invoices to test')
    } else {
      const r = await api(`/api/clients/${clientWithInv.id}`, { method: 'DELETE' })
      const stillActive = await db.client.findFirst({ where: { id: clientWithInv.id, deletedAt: null } })
      if (r.status === 400 && stillActive) {
        record('P6-CRIT-009', true,
          `DELETE client w/ invoices → 400 (FK pre-flight): ${r.json?.error?.slice(0, 100)}`)
      } else {
        record('P6-CRIT-009', false, `DELETE → ${r.status}; stillActive=${!!stillActive}`)
        // Restore if soft-deleted
        await db.client.update({ where: { id: clientWithInv.id }, data: { deletedAt: null, isActive: true } }).catch(() => {})
      }
    }
  } catch (e: any) { record('P6-CRIT-009', false, `error: ${e.message}`) }

  // -------- P6-HIGH-001: costCenterId propagation on sales-invoice JE --------
  try {
    // Find a project with cost center for this client
    const proj = await db.project.findFirst({
      where: { costCenter: { isNot: null } },
      select: { id: true, costCenter: { select: { id: true } }, clientId: true },
    })
    if (!proj) {
      record('P6-HIGH-001', false, 'no project with cost center in DB')
    } else {
      const useClientId = proj.clientId || client.id
      // Create invoice linked to this project + transition to SENT
      const r = await api('/api/sales-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: useClientId, projectId: proj.id,
          date: '2025-01-15', dueDate: '2025-02-15',
          items: [{ description: 'cc-test', quantity: 1, unitPrice: 100 }], vatRate: 0.15,
        }),
      })
      if (r.status === 201 && r.json?.id) {
        await api(`/api/sales-invoices/${r.json.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SENT' }),
        })
        const sent = await db.salesInvoice.findUnique({
          where: { id: r.json.id },
          select: { journalEntryId: true, invoiceNo: true },
        })
        if (sent?.journalEntryId) {
          const lines = await db.journalLine.findMany({
            where: { journalEntryId: sent.journalEntryId, deletedAt: null },
            select: { costCenterId: true },
          })
          const expectedCC = proj.costCenter?.id
          const allHaveCC = lines.length > 0 && lines.every(l => l.costCenterId === expectedCC)
          if (allHaveCC) {
            record('P6-HIGH-001', true,
              `New SENT ${sent.invoiceNo} JE: all ${lines.length} lines have costCenterId=${expectedCC?.slice(-8)}`)
          } else {
            record('P6-HIGH-001', false,
              `JE lines: ${JSON.stringify(lines.map(l => l.costCenterId))} expected=${expectedCC}`)
          }
        } else {
          record('P6-HIGH-001', false, 'SENT invoice has no journalEntryId')
        }
      } else {
        record('P6-HIGH-001', false, `POST → ${r.status}: ${r.text?.slice(0, 200)}`)
      }
    }
  } catch (e: any) { record('P6-HIGH-001', false, `error: ${e.message}`) }

  // -------- Summary --------
  console.log('\n=== SUMMARY ===')
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  console.log(`PASS: ${pass} / ${results.length}`)
  console.log(`FAIL: ${fail}`)
  console.log('')
  for (const r of results) {
    console.log(`  ${r.status.padEnd(8)} ${r.id}: ${r.detail}`)
  }

  // -------- GL integrity --------
  console.log('\n=== GL INTEGRITY ===')
  const allJEs = await db.journalEntry.findMany({
    where: { deletedAt: null, status: 'POSTED' },
    include: { lines: { where: { deletedAt: null } } },
  })
  let unbalanced = 0, totalDr = 0, totalCr = 0
  for (const je of allJEs) {
    const dr = je.lines.reduce((s, l) => s + Number(l.debit), 0)
    const cr = je.lines.reduce((s, l) => s + Number(l.credit), 0)
    if (Math.abs(dr - cr) > 0.01) { unbalanced++; console.log(`  UNBALANCED: ${je.entryNo} Dr=${dr} Cr=${cr}`) }
    totalDr += dr; totalCr += cr
  }
  console.log(`Posted JEs: ${allJEs.length}, unbalanced: ${unbalanced}, Dr=${totalDr.toFixed(2)} Cr=${totalCr.toFixed(2)} diff=${(totalDr - totalCr).toFixed(2)}`)

  // -------- Orphan check --------
  console.log('\n=== ORPHAN CHECK ===')
  const draftWithJE = await db.salesInvoice.count({
    where: { status: 'DRAFT', journalEntryId: { not: null } },
  })
  console.log(`DRAFT invoices with journalEntryId (legacy — should be cleaned up): ${draftWithJE}`)

  await db.$disconnect()
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
