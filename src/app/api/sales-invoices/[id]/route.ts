import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { reverseEntry } from '@/lib/accounting/engine'
import { createSalesInvoiceJournalEntry } from '@/lib/auto-journal'

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
  const { response } = await requireAuthApi()
  if (response) return response

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

// PATCH /api/sales-invoices/[id]
// P6-CRIT-003 FIX: status=CANCELLED now reverses the linked JE.
// P6-CRIT-007 FIX: PAID→DRAFT/CANCELLED now blocked when there are linked payments
//                  (must reverse payments first). Also DRAFT→SENT now creates the JE
//                  (P6-CRIT-002 fix's counterpart — JE no longer created at DRAFT creation).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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
      select: {
        id: true, status: true, timesheetId: true, progressClaimId: true,
        invoiceType: true, sourceType: true, journalEntryId: true, paidAmount: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // No-op if same status
    if (!status || status === existing.status) {
      return NextResponse.json(
        await db.salesInvoice.findUnique({
          where: { id },
          include: {
            client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
            project: { select: { id: true, name: true, nameAr: true, code: true } },
            contract: { select: { id: true, contractNo: true } },
            items: true,
            ...sourceIncludes,
          },
        }) || { error: 'الفاتورة غير موجودة' }
      )
    }

    // P6-CRIT-007 FIX: forbid transitions that would orphan payment JEs / corrupt data.
    // - PAID → DRAFT: forbidden (must cancel payments first).
    // - PAID → CANCELLED: forbidden (must reverse payments first).
    // - PARTIALLY_PAID → DRAFT: forbidden (must reverse payments first).
    // - PARTIALLY_PAID → CANCELLED: forbidden (must reverse payments first).
    const hasPayments = (Number(existing.paidAmount) || 0) > 0
    if (hasPayments && (status === 'DRAFT' || status === 'CANCELLED')) {
      return NextResponse.json(
        {
          error:
            `لا يمكن إرجاع الفاتورة إلى ${status === 'DRAFT' ? 'المسودة' : 'الملغاة'} وهي تحتوي على تحصيلات ` +
            `(paidAmount=${existing.paidAmount}). يجب عكس التحصيلات أولاً.`,
        },
        { status: 400 }
      )
    }

    // P6-CRIT-002 counterpart + P6-CRIT-003 FIX:
    // - DRAFT → SENT: create the JE (was missing because DRAFT no longer auto-creates JEs).
    // - * → CANCELLED: reverse the linked JE if any.
    // - CANCELLED → DRAFT/SENT: re-create the JE (un-cancel).
    if (status === 'SENT' && existing.status === 'DRAFT') {
      // DRAFT → SENT: post the JE for the first time.
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        let journalEntryId = existing.journalEntryId
        if (!journalEntryId) {
          await createSalesInvoiceJournalEntry(existing.id, tx)
          const refreshed = await tx.salesInvoice.findUnique({
            where: { id: existing.id },
            select: { journalEntryId: true },
          })
          journalEntryId = refreshed?.journalEntryId || null
        }
        return await tx.salesInvoice.update({
          where: { id },
          data: { status: 'SENT', journalEntryId },
          include: {
            client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
            project: { select: { id: true, name: true, nameAr: true, code: true } },
            contract: { select: { id: true, contractNo: true } },
            items: true,
            ...sourceIncludes,
          },
        })
      })
      return NextResponse.json(result)
    }

    if (status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      // P6-CRIT-003 FIX: reverse the linked JE.
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        if (existing.journalEntryId) {
          await reverseEntry(existing.journalEntryId, tx)
        }
        // Revert linked timesheet to APPROVED so it can be re-invoiced.
        if (existing.timesheetId) {
          await tx.timesheet.update({
            where: { id: existing.timesheetId },
            data: { status: 'APPROVED' },
          })
        }
        // Revert linked progress claim invoiced flag.
        if (existing.progressClaimId) {
          await tx.progressClaim.update({
            where: { id: existing.progressClaimId },
            data: { invoiced: false },
          })
        }
        return await tx.salesInvoice.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: {
            client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
            project: { select: { id: true, name: true, nameAr: true, code: true } },
            contract: { select: { id: true, contractNo: true } },
            items: true,
            ...sourceIncludes,
          },
        })
      })
      return NextResponse.json(result)
    }

    if ((status === 'SENT' || status === 'DRAFT') && existing.status === 'CANCELLED') {
      // Un-cancel: re-create the JE (if it was reversed).
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        let journalEntryId = existing.journalEntryId
        // If the original JE was reversed (or never existed), create a new one.
        if (status === 'SENT') {
          if (!journalEntryId) {
            await createSalesInvoiceJournalEntry(existing.id, tx)
            const refreshed = await tx.salesInvoice.findUnique({
              where: { id: existing.id },
              select: { journalEntryId: true },
            })
            journalEntryId = refreshed?.journalEntryId || null
          } else {
            // Check if existing JE was reversed — if so, create a fresh one.
            const je = await tx.journalEntry.findUnique({
              where: { id: journalEntryId },
              select: { isReversal: true, reversedEntryId: true, deletedAt: true },
            })
            if (je?.deletedAt || je?.isReversal) {
              await createSalesInvoiceJournalEntry(existing.id, tx)
              const refreshed = await tx.salesInvoice.findUnique({
                where: { id: existing.id },
                select: { journalEntryId: true },
              })
              journalEntryId = refreshed?.journalEntryId || null
            }
          }
        }
        return await tx.salesInvoice.update({
          where: { id },
          data: { status, journalEntryId },
          include: {
            client: { select: { id: true, name: true, nameAr: true, code: true, taxNumber: true, phone: true, email: true, address: true } },
            project: { select: { id: true, name: true, nameAr: true, code: true } },
            contract: { select: { id: true, contractNo: true } },
            items: true,
            ...sourceIncludes,
          },
        })
      })
      return NextResponse.json(result)
    }

    // Other status transitions (DRAFT↔OVERDUE, SENT→OVERDUE, etc.) — just update the flag.
    const invoice = await db.$transaction(async (tx: PrismaTransaction) => {
      // Revert linked timesheet/claim only if going back to DRAFT.
      if (status === 'DRAFT') {
        if (existing.timesheetId) {
          await tx.timesheet.update({
            where: { id: existing.timesheetId },
            data: { status: 'APPROVED' },
          })
        }
        if (existing.progressClaimId) {
          await tx.progressClaim.update({
            where: { id: existing.progressClaimId },
            data: { invoiced: false },
          })
        }
      }
      return await tx.salesInvoice.update({
        where: { id },
        data: { status },
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

// DELETE /api/sales-invoices/[id]
// P6-CRIT-004 FIX: reverse the linked JE before hard-deleting the invoice
// (mirror of P5-CRIT-002 fix for supplier-invoices). Previously DRAFT invoices
// (which had JEs per P6-CRIT-002) left orphaned POSTED JEs in GL forever.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

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
        journalEntryId: true,
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    // Only allow deleting DRAFT or CANCELLED invoices
    if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: 'لا يمكن حذف فاتورة إلا في حالة المسودة أو الملغاة. يجب إلغاء الفاتورة أولاً' },
        { status: 400 }
      )
    }

    // P6-CRIT-007 safety: forbid delete if any payments exist (must reverse payments first).
    const payCount = await db.clientPayment.count({ where: { invoiceId: id } })
    if (payCount > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف الفاتورة: مرتبطة بـ ${payCount} تحصيل. يجب عكس التحصيلات أولاً.` },
        { status: 400 }
      )
    }

    // Perform all deletions in a transaction
    await db.$transaction(async (tx: PrismaTransaction) => {
      // P6-CRIT-004 FIX: reverse the linked JE before deleting the invoice.
      if (invoice.journalEntryId) {
        await reverseEntry(invoice.journalEntryId, tx)
      }

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
