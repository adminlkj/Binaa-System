import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Payments [id] API
// ----------------------------------------------------------------------------
// GET    /api/subcontractor-payments/[id]   — fetch single payment
// DELETE /api/subcontractor-payments/[id]   — reverse JE + delete row
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const payment = await db.subcontractorPayment.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        subcontractorInvoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'سداد مقاول الباطن غير موجود' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor payment:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor payment' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.subcontractorPayment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سداد مقاول الباطن غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Reverse the linked JE (if any) — keeps GL consistent
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      // 2. Roll back the linked invoice's paidAmount (if any)
      if (existing.subcontractorInvoiceId) {
        const inv = await tx.subcontractorInvoice.findUnique({
          where: { id: existing.subcontractorInvoiceId },
          select: { id: true, paidAmount: true, totalAmount: true, status: true },
        })
        if (inv) {
          const newPaid = Math.max(0, Number(inv.paidAmount) - Number(existing.amount))
          let newStatus = inv.status
          if (newPaid <= 0.01) {
            newStatus = 'SENT'
          } else if (newPaid < Number(inv.totalAmount) - 0.01) {
            newStatus = 'PARTIALLY_PAID'
          }
          await tx.subcontractorInvoice.update({
            where: { id: inv.id },
            data: { paidAmount: newPaid, status: newStatus },
          })
        }
      }

      // 3. Hard-delete the payment row (no soft-delete column on this model)
      await tx.subcontractorPayment.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف السداد وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('[API] Failed to delete subcontractor payment:', error)
    return NextResponse.json({ error: 'Failed to delete subcontractor payment' }, { status: 500 })
  }
}
