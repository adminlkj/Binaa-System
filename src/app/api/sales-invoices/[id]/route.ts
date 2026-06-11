import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status

    const invoice = await db.salesInvoice.update({
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

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error updating sales invoice:', error)
    return NextResponse.json({ error: 'فشل في تحديث الفاتورة' }, { status: 500 })
  }
}
