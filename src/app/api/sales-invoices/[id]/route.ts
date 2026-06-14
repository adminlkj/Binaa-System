import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'

const sourceIncludes = {
  progressClaim: {
    select: {
      id: true, claimNo: true, date: true, amount: true, vatAmount: true,
      totalAmount: true, status: true, invoiced: true,
      project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true } } } },
      contract: { select: { id: true, contractNo: true } },
    },
  },
  timesheet: {
    select: {
      id: true, operatingHours: true, month: true, year: true, status: true,
      project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true } } } },
      equipment: { select: { id: true, name: true, code: true, nameAr: true } },
      rental: { select: { id: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true } },
      contract: { select: { id: true, contractNo: true, hourlyRate: true, paymentTerms: true } },
    },
  },
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const invoice = await db.salesInvoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
        items: true,
        ...sourceIncludes,
      },
    })
    if (!invoice) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching sales invoice:', error)
    return NextResponse.json({ error: 'فشل في تحميل الفاتورة' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body

    // Validate status
    const validStatuses = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
    }

    // Get current invoice state
    const existing = await db.salesInvoice.findUnique({
      where: { id },
      select: { id: true, status: true, timesheetId: true, progressClaimId: true, invoiceType: true, sourceType: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status

    // Perform multi-step updates in a transaction
    const invoice = await db.$transaction(async (tx: PrismaTransaction) => {
      // When reverting to DRAFT or CANCELLING an invoice that was linked to a timesheet,
      // update the timesheet status back to APPROVED so it can be re-invoiced
      if ((status === 'DRAFT' || status === 'CANCELLED') && existing.timesheetId) {
        if (existing.status !== 'DRAFT' && existing.status !== 'CANCELLED') {
          await tx.timesheet.update({
            where: { id: existing.timesheetId },
            data: { status: 'APPROVED' },
          })
        }
      }

      // When reverting to DRAFT or CANCELLING an invoice that was linked to a progress claim,
      // update the claim's invoiced flag back to false
      if ((status === 'DRAFT' || status === 'CANCELLED') && existing.progressClaimId) {
        if (existing.status !== 'DRAFT' && existing.status !== 'CANCELLED') {
          await tx.progressClaim.update({
            where: { id: existing.progressClaimId },
            data: { invoiced: false },
          })
        }
      }

      return await tx.salesInvoice.update({
        where: { id },
        data: updateData,
        include: {
          client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
          project: { select: { id: true, name: true, nameAr: true, code: true } },
          contract: { select: { id: true, contractNo: true } },
          items: true,
          ...sourceIncludes,
        },
      })
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error updating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث الفاتورة' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get the invoice first to handle linked records
    const invoice = await db.salesInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        timesheetId: true,
        progressClaimId: true,
        invoiceType: true,
        sourceType: true,
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // Only allow deleting DRAFT invoices
    // For non-DRAFT invoices, they must be cancelled first
    if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: 'لا يمكن حذف فاتورة إلا في حالة المسودة أو الملغاة. يجب إلغاء الفاتورة أولاً' },
        { status: 400 }
      )
    }

    // Perform all deletions in a transaction
    await db.$transaction(async (tx: PrismaTransaction) => {
      // If linked to a timesheet, revert its status to APPROVED
      if (invoice.timesheetId) {
        await tx.timesheet.update({
          where: { id: invoice.timesheetId },
          data: { status: 'APPROVED' },
        })
      }

      // If linked to a progress claim, revert its invoiced flag
      if (invoice.progressClaimId) {
        await tx.progressClaim.update({
          where: { id: invoice.progressClaimId },
          data: { invoiced: false },
        })
      }

      // Delete invoice items first (cascade should handle this, but be explicit)
      await tx.salesInvoiceItem.deleteMany({
        where: { invoiceId: id },
      })

      // Delete the invoice
      await tx.salesInvoice.delete({
        where: { id },
      })
    })

    return NextResponse.json({ success: true, message: 'تم حذف الفاتورة بنجاح' })
  } catch (error) {
    console.error('Error deleting sales invoice:', error)
    return NextResponse.json({ error: 'فشل في حذف الفاتورة' }, { status: 500 })
  }
}
