import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { toNumber } from '@/lib/decimal'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params

    const claim = await db.progressClaim.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true, nameAr: true, code: true, address: true, taxNumber: true } } } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
    })

    if (!claim) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }

    return NextResponse.json(claim)
  } catch (error) {
    console.error('Error fetching progress claim:', error)
    return NextResponse.json({ error: 'فشل في تحميل المستخلص' }, { status: 500 })
  }
}

// PUT: Update claim status or other fields.
// Supported status transitions:
//   DRAFT → SUBMITTED → APPROVED → (invoiced separately)
//   Any status → REJECTED
//
// IMPORTANT (accounting model): A progress claim is a certification of work done,
// NOT a revenue event. Revenue (and AR + VAT) is recognized ONLY when the approved
// claim is converted to a sales invoice (see sales-invoices/route.ts which calls
// createSalesInvoiceJournalEntry). Creating a JE at claim approval would double-count
// revenue because the invoice conversion creates its own JE.
// The previous code called createProgressClaimJournalEntry here → double revenue.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.progressClaim.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }

    // Status-only update (workflow transition)
    if (body.status && typeof body.status === 'string') {
      const newStatus = body.status

      // Validate allowed transitions
      const allowed: Record<string, string[]> = {
        DRAFT: ['SUBMITTED', 'REJECTED'],
        SUBMITTED: ['APPROVED', 'REJECTED', 'DRAFT'],
        APPROVED: ['REJECTED'],
        REJECTED: ['DRAFT'],
        PAID: [],
        PARTIALLY_PAID: [],
      }
      const allowedNext = allowed[existing.status] || []
      if (!allowedNext.includes(newStatus)) {
        return NextResponse.json(
          { error: `غير مسموح بالانتقال من ${existing.status} إلى ${newStatus}` },
          { status: 400 }
        )
      }

      // Simple status update. No journal entry — revenue is recognized at invoicing.
      const updated = await db.progressClaim.update({
        where: { id },
        data: {
          status: newStatus,
          approvedDate: newStatus === 'APPROVED' ? new Date() : existing.approvedDate,
        },
        include: {
          project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true, nameAr: true, code: true } } } },
          contract: { select: { id: true, contractNo: true, totalValue: true } },
        },
      })
      return NextResponse.json(updated)
    }

    // Generic field update (claimNo, notes, etc.)
    const updateData: Record<string, unknown> = {}
    if (body.claimNo !== undefined) updateData.claimNo = body.claimNo
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.percentage !== undefined) updateData.percentage = parseFloat(body.percentage) || 0
    if (body.amount !== undefined) {
      const newAmount = parseFloat(body.amount) || 0
      const newVatRate = body.vatRate !== undefined ? parseFloat(body.vatRate) : toNumber(existing.vatRate)
      const newVatAmount = Math.round(newAmount * newVatRate * 100) / 100
      const newTotalAmount = Math.round((newAmount + newVatAmount) * 100) / 100
      updateData.amount = newAmount
      updateData.vatRate = newVatRate
      updateData.vatAmount = newVatAmount
      updateData.totalAmount = newTotalAmount
    }

    const updated = await db.progressClaim.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true, nameAr: true, code: true } } } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating progress claim:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث المستخلص' },
      { status: 500 }
    )
  }
}

// DELETE: Soft-delete a claim (only if DRAFT and not invoiced)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.progressClaim.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }

    // Block deletion of approved/paid claims
    if (existing.status === 'APPROVED' || existing.status === 'PAID' || existing.status === 'PARTIALLY_PAID') {
      return NextResponse.json(
        { error: 'لا يمكن حذف مستخلص معتمد أو مدفوع' },
        { status: 400 }
      )
    }

    // Block deletion if already invoiced
    if (existing.invoiced) {
      return NextResponse.json(
        { error: 'لا يمكن حذف مستخلص تم فوترته' },
        { status: 400 }
      )
    }

    await db.progressClaim.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting progress claim:', error)
    return NextResponse.json(
      { error: 'فشل في حذف المستخلص' },
      { status: 500 }
    )
  }
}
