import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Invoices [id] API
// ----------------------------------------------------------------------------
// GET    /api/subcontractor-invoices/[id]   — fetch single invoice
// PUT    /api/subcontractor-invoices/[id]   — status change only (amount changes
//                                              require DELETE + re-POST so the
//                                              posted JE is reversed cleanly)
// DELETE /api/subcontractor-invoices/[id]   — reverse JE + soft-delete row
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const invoice = await db.subcontractorInvoice.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'فاتورة مقاول الباطن غير موجودة' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor invoice:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor invoice' }, { status: 500 })
  }
}

// PUT — status changes only. Amount changes require reversal + re-post (DELETE + POST),
// not an in-place mutation that would desync the GL from the subledger.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.subcontractorInvoice.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'فاتورة مقاول الباطن غير موجودة' }, { status: 404 })
    }

    // Forbid amount mutations on posted invoices — caller must DELETE + re-POST.
    if (
      existing.journalEntryId &&
      (body.amount !== undefined ||
        body.vatAmount !== undefined ||
        body.totalAmount !== undefined ||
        body.vatRate !== undefined)
    ) {
      return NextResponse.json(
        {
          error:
            'لا يمكن تعديل مبالغ فاتورة مرحّلة محاسبياً — احذف الفاتورة (سيعكس القيد) ثم أنشئ فاتورة جديدة بالمبالغ الصحيحة',
        },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (body.status !== undefined) data.status = body.status
    if (body.description !== undefined) data.description = body.description || null
    if (body.projectId !== undefined) data.projectId = body.projectId || null

    const updated = await db.subcontractorInvoice.update({
      where: { id },
      data,
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update subcontractor invoice:', error)
    return NextResponse.json({ error: 'Failed to update subcontractor invoice' }, { status: 500 })
  }
}

// DELETE — reverse the linked JE inside the same transaction, then soft-delete the row.
// R12: never hard-delete a posted financial document. Reverse + soft-delete preserves
// the audit trail and keeps GL consistent with the operational subledger.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.subcontractorInvoice.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: 'فاتورة مقاول الباطن غير موجودة' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.subcontractorInvoice.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'CANCELLED' },
      })
    })

    return NextResponse.json({ message: 'تم حذف فاتورة مقاول الباطن وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('[API] Failed to delete subcontractor invoice:', error)
    return NextResponse.json({ error: 'Failed to delete subcontractor invoice' }, { status: 500 })
  }
}
