import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const payment = await db.clientPayment.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    console.error('Error fetching client payment:', error)
    return NextResponse.json({ error: 'فشل في تحميل تحصيل العميل' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.clientPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    // Cannot modify payments with journal entries (approved/posted)
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل تحصيل مرحّل محاسبياً - يجب إنشاء قيد عكسي وتحصيل جديد' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.date !== undefined) updateData.date = new Date(body.date)
    if (body.receivedIn !== undefined) updateData.receivedIn = body.receivedIn
    if (body.reference !== undefined) updateData.reference = body.reference
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.invoiceId !== undefined) updateData.invoiceId = body.invoiceId || null

    const updated = await db.clientPayment.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true, code: true } },
        invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true, sourceType: true, invoiceType: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating client payment:', error)
    return NextResponse.json({ error: 'فشل في تحديث تحصيل العميل' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.clientPayment.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'تحصيل العميل غير موجود' }, { status: 404 })
    }

    // Cannot delete payments with journal entries
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن حذف تحصيل مرحّل محاسبياً' },
        { status: 400 }
      )
    }

    // If linked to an invoice, reverse the paidAmount update
    if (existing.invoiceId) {
      const invoice = await db.salesInvoice.findUnique({
        where: { id: existing.invoiceId },
      })
      if (invoice) {
        const newPaidAmount = Math.max(0, invoice.paidAmount - existing.amount)
        let newStatus = invoice.status

        if (newPaidAmount <= 0) {
          // Revert to SENT status (not DRAFT) since invoice was already issued
          newStatus = 'SENT'
        } else if (newPaidAmount < invoice.totalAmount) {
          newStatus = 'PARTIALLY_PAID'
        }

        await db.salesInvoice.update({
          where: { id: existing.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        })
      }
    }

    await db.clientPayment.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف تحصيل العميل بنجاح' })
  } catch (error) {
    console.error('Error deleting client payment:', error)
    return NextResponse.json({ error: 'فشل في حذف تحصيل العميل' }, { status: 500 })
  }
}
