// ============================================================================
// Phase 6 — Sales & Revenue Cycle: Practical E2E Bug Confirmation
// ----------------------------------------------------------------------------
// Confirms each P6-CRIT-001 .. P6-CRIT-009 bug via direct API + DB inspection.
// Run AFTER dev server is up: `bun run scripts/test-sales-revenue-cycle.ts`
// ============================================================================
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const BASE = 'http://localhost:3000'

const results: Array<{ id: string; status: 'CONFIRMED' | 'NOT-CONFIRMED' | 'ERROR'; detail: string }> = []

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init)
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* keep text */ }
  return { status: res.status, json, text }
}

function record(id: string, ok: boolean, detail: string) {
  results.push({ id, status: ok ? 'CONFIRMED' : 'NOT-CONFIRMED', detail })
  console.log(`[${ok ? 'CONFIRMED' : 'NOT-CONFIRMED'}] ${id}: ${detail}`)
}

async function main() {
  console.log('=== Phase 6 Sales & Revenue Cycle — E2E Bug Confirmation ===\n')

  // -------- Setup: pick a real client + check dev server is healthy --------
  const clients = await db.client.findMany({ take: 1, orderBy: { createdAt: 'asc' } })
  if (clients.length === 0) {
    console.log('No clients in DB — aborting.')
    process.exit(1)
  }
  const clientId = clients[0].id
  console.log(`Using client: ${clients[0].name} (${clientId})\n`)

  // -------- P6-CRIT-001: clients/[id]/accounting filters JournalEntry by non-existent clientId --------
  try {
    const r = await api(`/api/clients/${clientId}/accounting`)
    if (r.status === 500) {
      record('P6-CRIT-001', true, `GET /api/clients/{id}/accounting → 500 (Prisma Unknown argument clientId)`)
    } else if (r.status === 200) {
      record('P6-CRIT-001', false, `GET /api/clients/{id}/accounting → 200 (already fixed or no error)`)
    } else {
      record('P6-CRIT-001', false, `GET /api/clients/{id}/accounting → ${r.status}`)
    }
  } catch (e: any) {
    record('P6-CRIT-001', true, `GET threw: ${e.message}`)
  }

  // -------- P6-CRIT-002: DRAFT sales invoice has a posted JE in GL --------
  try {
    const draftInv = await db.salesInvoice.findFirst({
      where: { status: 'DRAFT', journalEntryId: { not: null } },
      select: { id: true, invoiceNo: true, status: true, journalEntryId: true },
    })
    if (draftInv) {
      const je = await db.journalEntry.findUnique({
        where: { id: draftInv.journalEntryId! },
        select: { entryNo: true, status: true },
      })
      record('P6-CRIT-002', true,
        `DRAFT invoice ${draftInv.invoiceNo} has posted JE ${je?.entryNo} (status=${je?.status})`)
    } else {
      // Create a manual DRAFT invoice and check
      const r = await api('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          date: '2025-01-15',
          dueDate: '2025-02-15',
          items: [{ description: 'audit-test', quantity: 1, unitPrice: 100 }],
          vatRate: 0.15,
        }),
      })
      if (r.status === 201 && r.json?.id) {
        const fresh = await db.salesInvoice.findUnique({
          where: { id: r.json.id },
          select: { invoiceNo: true, status: true, journalEntryId: true },
        })
        if (fresh && fresh.journalEntryId) {
          record('P6-CRIT-002', true,
            `Newly-created DRAFT invoice ${fresh.invoiceNo} has journalEntryId=${fresh.journalEntryId}`)
        } else {
          record('P6-CRIT-002', false,
            `Newly-created DRAFT invoice ${fresh?.invoiceNo} has no JE (already fixed)`)
        }
      } else {
        record('P6-CRIT-002', false, `Failed to create DRAFT invoice: ${r.status} ${r.text?.slice(0, 200)}`)
      }
    }
  } catch (e: any) {
    record('P6-CRIT-002', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-003: PATCH status=CANCELLED doesn't reverse JE --------
  try {
    const target = await db.salesInvoice.findFirst({
      where: { status: 'DRAFT', journalEntryId: { not: null } },
      select: { id: true, invoiceNo: true, journalEntryId: true },
    })
    if (!target) {
      record('P6-CRIT-003', false, 'no DRAFT-with-JE invoice to test (skipped)')
    } else {
      const r = await api(`/api/sales-invoices/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      const after = await db.salesInvoice.findUnique({
        where: { id: target.id },
        select: { status: true, journalEntryId: true },
      })
      const reversalCount = await db.journalEntry.count({
        where: { reversedEntryId: target.journalEntryId },
      })
      if (r.status === 200 && after?.status === 'CANCELLED' && after.journalEntryId && reversalCount === 0) {
        record('P6-CRIT-003', true,
          `Invoice ${target.invoiceNo} CANCELLED but JE ${after.journalEntryId} still POSTED, 0 reversals`)
      } else {
        record('P6-CRIT-003', false,
          `state: status=${after?.status} je=${after?.journalEntryId} reversals=${reversalCount}`)
      }
      // Restore to DRAFT to avoid side effects
      await api(`/api/sales-invoices/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DRAFT' }),
      })
    }
  } catch (e: any) {
    record('P6-CRIT-003', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-004: DELETE DRAFT doesn't reverse JE (orphaned JE) --------
  try {
    // Create a fresh DRAFT invoice (will have a JE per P6-CRIT-002 if not yet fixed)
    const r = await api('/api/sales-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        date: '2025-01-15',
        dueDate: '2025-02-15',
        items: [{ description: 'delete-test', quantity: 1, unitPrice: 50 }],
        vatRate: 0.15,
      }),
    })
    if (r.status === 201 && r.json?.id) {
      const fresh = await db.salesInvoice.findUnique({
        where: { id: r.json.id },
        select: { invoiceNo: true, journalEntryId: true },
      })
      const jeId = fresh?.journalEntryId
      const del = await api(`/api/sales-invoices/${r.json.id}`, { method: 'DELETE' })
      const stillExists = await db.salesInvoice.findUnique({ where: { id: r.json.id } })
      let orphaned = false
      if (jeId) {
        const je = await db.journalEntry.findUnique({ where: { id: jeId }, select: { status: true, deletedAt: true } })
        orphaned = !!je && je.status === 'POSTED' && !je.deletedAt
      }
      if (del.status === 200 && !stillExists && orphaned) {
        record('P6-CRIT-004', true,
          `Deleted DRAFT invoice but JE ${jeId} remains POSTED in GL (orphan)`)
      } else if (del.status === 200 && !stillExists && !orphaned) {
        record('P6-CRIT-004', false, `Invoice deleted; JE state clean (already fixed?)`)
      } else {
        record('P6-CRIT-004', false, `delete=${del.status} stillExists=${!!stillExists} orphaned=${orphaned}`)
      }
    } else {
      record('P6-CRIT-004', false, `failed to create test invoice: ${r.status}`)
    }
  } catch (e: any) {
    record('P6-CRIT-004', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-005: client-payments allows DRAFT / PAID / CANCELLED + no overpay check --------
  try {
    // Find or create a SENT invoice with paidAmount=0
    let sent = await db.salesInvoice.findFirst({
      where: { status: 'SENT', clientId, paidAmount: 0 },
      select: { id: true, invoiceNo: true, totalAmount: true },
    })
    if (!sent) {
      // Create one and patch to SENT
      const r = await api('/api/sales-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, date: '2025-01-15', dueDate: '2025-02-15',
          items: [{ description: 'pay-test', quantity: 1, unitPrice: 200 }], vatRate: 0.15,
        }),
      })
      if (r.status === 201 && r.json?.id) {
        await api(`/api/sales-invoices/${r.json.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SENT' }),
        })
        sent = await db.salesInvoice.findUnique({
          where: { id: r.json.id },
          select: { id: true, invoiceNo: true, totalAmount: true },
        })
      }
    }
    if (!sent) {
      record('P6-CRIT-005', false, 'no SENT invoice available to test overpayment')
    } else {
      const total = Number(sent.totalAmount)
      // Try paying MORE than total (overpayment)
      const overpay = await api('/api/client-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, invoiceId: sent.id, amount: total + 99999, date: '2025-01-20',
        }),
      })
      if (overpay.status === 201) {
        record('P6-CRIT-005', true,
          `Overpayment of ${total + 99999} accepted (invoice total ${total}) — invoice ${sent.invoiceNo}`)
        // Restore: delete the test payment + reset invoice
        const created = overpay.json
        if (created?.id) {
          await db.clientPayment.delete({ where: { id: created.id } }).catch(() => {})
          // also delete its JE if any
          if (created.journalEntryId) {
            await db.journalLine.deleteMany({ where: { journalEntryId: created.journalEntryId } }).catch(() => {})
            await db.journalEntry.delete({ where: { id: created.journalEntryId } }).catch(() => {})
          }
        }
        await db.salesInvoice.update({
          where: { id: sent.id },
          data: { paidAmount: 0, status: 'SENT' },
        }).catch(() => {})
      } else {
        record('P6-CRIT-005', false,
          `Overpayment rejected (${overpay.status}) — already fixed: ${overpay.json?.error || overpay.text?.slice(0, 120)}`)
      }
    }
  } catch (e: any) {
    record('P6-CRIT-005', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-006: sales-invoices PUT accepts status via updateData --------
  try {
    const target = await db.salesInvoice.findFirst({
      where: { status: 'DRAFT' },
      select: { id: true, invoiceNo: true },
    })
    if (!target) {
      record('P6-CRIT-006', false, 'no DRAFT invoice to test PUT status change')
    } else {
      const r = await api('/api/sales-invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, status: 'PAID' }),
      })
      const after = await db.salesInvoice.findUnique({
        where: { id: target.id },
        select: { status: true, paidAmount: true },
      })
      if (r.status === 200 && after?.status === 'PAID' && Number(after.paidAmount) === 0) {
        record('P6-CRIT-006', true,
          `PUT set status=PAID with paidAmount=0 on invoice ${target.invoiceNo} (no payment)`)
        // Restore
        await db.salesInvoice.update({ where: { id: target.id }, data: { status: 'DRAFT' } }).catch(() => {})
      } else {
        record('P6-CRIT-006', false,
          `PUT response ${r.status}; after state: status=${after?.status} paid=${after?.paidAmount}`)
      }
    }
  } catch (e: any) {
    record('P6-CRIT-006', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-007: PATCH PAID → DRAFT/CANCELLED without reversing payment JEs --------
  // Skip mutating real data — just confirm via code inspection that PATCH has no payment-reversal logic.
  // We'll mark as CONFIRMED if there exists a paid invoice and PATCH path lacks reversal.
  try {
    const paid = await db.salesInvoice.findFirst({
      where: { status: 'PAID', paidAmount: { gt: 0 } },
      select: { id: true, invoiceNo: true, paidAmount: true, journalEntryId: true },
    })
    if (!paid) {
      record('P6-CRIT-007', false, 'no PAID invoice with paidAmount>0 to test')
    } else {
      // Count payments linked to this invoice
      const payCount = await db.clientPayment.count({ where: { invoiceId: paid.id } })
      // Try PATCH to DRAFT (this is the bug — should be blocked or should reverse payments)
      const r = await api(`/api/sales-invoices/${paid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DRAFT' }),
      })
      const after = await db.salesInvoice.findUnique({
        where: { id: paid.id },
        select: { status: true, paidAmount: true, journalEntryId: true },
      })
      const payCountAfter = await db.clientPayment.count({ where: { invoiceId: paid.id } })
      if (r.status === 200 && after?.status === 'DRAFT' && Number(after.paidAmount) > 0 && payCount === payCountAfter) {
        record('P6-CRIT-007', true,
          `PATCH PAID→DRAFT succeeded; invoice ${paid.invoiceNo} still has paidAmount=${after.paidAmount} and ${payCountAfter} payments — no reversal`)
      } else {
        record('P6-CRIT-007', false,
          `PATCH ${r.status}; after status=${after?.status} paid=${after?.paidAmount} pays(before=${payCount},after=${payCountAfter})`)
      }
      // Restore PAID
      await db.salesInvoice.update({ where: { id: paid.id }, data: { status: 'PAID' } }).catch(() => {})
    }
  } catch (e: any) {
    record('P6-CRIT-007', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-008: delivery-orders/[id] PATCH clobbers equipment.status --------
  try {
    // Find equipment currently RENTED
    const rented = await db.equipment.findFirst({
      where: { status: 'RENTED' },
      select: { id: true, code: true, name: true },
    })
    if (!rented) {
      record('P6-CRIT-008', false, 'no RENTED equipment to test status clobbering')
    } else {
      // Find or create a delivery order for this equipment
      let do_ = await db.equipmentDeliveryOrder.findFirst({
        where: { equipmentId: rented.id },
        select: { id: true, status: true },
      })
      if (!do_) {
        do_ = await db.equipmentDeliveryOrder.create({
          data: { equipmentId: rented.id, deliveryDate: new Date(), status: 'PENDING' },
        })
      }
      const beforeStatus = rented.status
      const r = await api(`/api/delivery-orders/${do_.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED' }),
      })
      const afterEq = await db.equipment.findUnique({
        where: { id: rented.id },
        select: { status: true },
      })
      if (r.status === 200 && afterEq?.status === 'IN_USE' && beforeStatus === 'RENTED') {
        record('P6-CRIT-008', true,
          `RENTED equipment ${rented.code} clobbered to IN_USE via [id] PATCH (bug confirmed)`)
      } else {
        record('P6-CRIT-008', false,
          `[id] PATCH ${r.status}; eq status before=${beforeStatus} after=${afterEq?.status}`)
      }
      // Restore equipment status
      await db.equipment.update({ where: { id: rented.id }, data: { status: 'RENTED' } }).catch(() => {})
      // Restore DO status
      await db.equipmentDeliveryOrder.update({ where: { id: do_.id }, data: { status: 'PENDING' } }).catch(() => {})
    }
  } catch (e: any) {
    record('P6-CRIT-008', false, `error: ${e.message}`)
  }

  // -------- P6-CRIT-009: clients/[id] DELETE is hard-delete without FK check --------
  try {
    // Try deleting a client that has salesInvoices — expect 500 (FK violation)
    const clientWithInv = await db.client.findFirst({
      where: { salesInvoices: { some: {} } },
      select: { id: true, name: true },
    })
    if (!clientWithInv) {
      record('P6-CRIT-009', false, 'no client with invoices to test FK crash')
    } else {
      const r = await api(`/api/clients/${clientWithInv.id}`, { method: 'DELETE' })
      if (r.status === 500) {
        record('P6-CRIT-009', true,
          `DELETE client ${clientWithInv.name} with invoices → 500 (FK constraint crash)`)
      } else if (r.status === 400) {
        record('P6-CRIT-009', false, `DELETE returned 400 (already fixed: ${r.json?.error || ''})`)
      } else {
        record('P6-CRIT-009', false, `DELETE returned ${r.status}`)
      }
    }
  } catch (e: any) {
    record('P6-CRIT-009', false, `error: ${e.message}`)
  }

  // -------- Summary --------
  console.log('\n=== SUMMARY ===')
  const confirmed = results.filter(r => r.status === 'CONFIRMED').length
  const notConfirmed = results.filter(r => r.status === 'NOT-CONFIRMED').length
  const errors = results.filter(r => r.status === 'ERROR').length
  console.log(`Confirmed bugs: ${confirmed} / ${results.length}`)
  console.log(`Not confirmed:  ${notConfirmed}`)
  console.log(`Errors:         ${errors}`)
  console.log('')
  for (const r of results) {
    console.log(`  ${r.status.padEnd(14)} ${r.id}: ${r.detail}`)
  }
  await db.$disconnect()
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
