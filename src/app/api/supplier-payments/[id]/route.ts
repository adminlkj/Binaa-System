import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const payment = await db.supplierPayment.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching supplier payment:', error)
    return NextResponse.json({ error: 'فشل في تحميل دفعة المورد' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.supplierPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    // Cannot modify payments with journal entries (approved/posted)
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل دفعة مورد مرحلة محاسبياً - يجب إنشاء قيد عكسي ودفعة جديدة' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount) || 0
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.paidFrom !== undefined) updateData.paidFrom = body.paidFrom
    if (body.bankAccount !== undefined) updateData.bankAccount = body.bankAccount
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod
    if (body.reference !== undefined) updateData.reference = body.reference
    if (body.notes !== undefined) updateData.notes = body.notes

    const updated = await db.supplierPayment.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating supplier payment:', error)
    return NextResponse.json({ error: 'فشل في تحديث دفعة المورد' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.supplierPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'دفعة المورد غير موجودة' }, { status: 404 })
    }

    // Cannot delete payments with journal entries
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن حذف دفعة مورد مرحلة محاسبياً' },
        { status: 400 }
      )
    }

    // If linked to an invoice, reverse the paidAmount update
    if (existing.invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: existing.invoiceId },
      })
      if (invoice) {
        const newPaidAmount = Math.max(0, invoice.paidAmount - existing.amount)
        let newStatus = invoice.status

        if (newPaidAmount <= 0) {
          newStatus = 'DRAFT'
        } else if (newPaidAmount < invoice.totalAmount) {
          newStatus = 'PARTIALLY_PAID'
        }

        await db.purchaseInvoice.update({
          where: { id: existing.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        })
      }
    }

    await db.supplierPayment.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف دفعة المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier payment:', error)
    return NextResponse.json({ error: 'فشل في حذف دفعة المورد' }, { status: 500 })
  }
}
