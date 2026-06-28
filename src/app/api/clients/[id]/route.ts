import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/clients/[id]
// P6-CRIT-009 FIX: filter out soft-deleted clients.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const client = await db.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { projects: true, salesInvoices: true } },
      },
    })
    if (!client) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }
    return NextResponse.json(client)
  } catch (error) {
    console.error('Error fetching client:', error)
    return NextResponse.json({ error: 'فشل في تحميل العميل' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const client = await db.client.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr || null,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        taxNumber: body.taxNumber || null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    })
    return NextResponse.json(client)
  } catch (error) {
    console.error('Error updating client:', error)
    return NextResponse.json({ error: 'فشل في تحديث العميل' }, { status: 500 })
  }
}

// P6-CRIT-009 FIX: Soft-delete with FK pre-flight check (mirror of suppliers/[id]/route.ts).
// Previously the DELETE did `db.client.delete({where:{id}})` which 500-crashed on any
// client with related records (projects, salesInvoices, rentalContracts, clientPayments,
// customerAdvances — all onDelete: Restrict). Now we:
//   1. Count all related records.
//   2. If any exist → return 400 with Arabic counts (user must deactivate instead).
//   3. If none → soft-delete (deletedAt = now, isActive = false).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const existing = await db.client.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 })
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'العميل محذوف بالفعل' }, { status: 400 })
    }

    // Pre-flight: count all related records that would block hard-delete
    const [
      projCount, invCount, rentCount, payCount, advCount, doCount,
    ] = await Promise.all([
      db.project.count({ where: { clientId: id } }),
      db.salesInvoice.count({ where: { clientId: id } }),
      db.equipmentRental.count({ where: { clientId: id } }),
      db.clientPayment.count({ where: { clientId: id } }),
      db.customerAdvance.count({ where: { clientId: id } }),
      db.equipmentDeliveryOrder.count({ where: { clientId: id } }),
    ])

    const totalRelations = projCount + invCount + rentCount + payCount + advCount + doCount
    if (totalRelations > 0) {
      const parts: string[] = []
      if (projCount > 0) parts.push(`${projCount} مشروع`)
      if (invCount > 0) parts.push(`${invCount} فاتورة مبيعات`)
      if (rentCount > 0) parts.push(`${rentCount} عقد إيجار`)
      if (payCount > 0) parts.push(`${payCount} تحصيل`)
      if (advCount > 0) parts.push(`${advCount} مقدمة عميل`)
      if (doCount > 0) parts.push(`${doCount} أمر توصيل`)
      return NextResponse.json(
        {
          error: `لا يمكن حذف العميل: مرتبط بـ ${parts.join('، ')}. يمكنك تعطيله بدلاً من ذلك (isActive=false).`,
        },
        { status: 400 }
      )
    }

    // No relations — safe to soft-delete
    await db.client.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    return NextResponse.json({ success: true, message: 'تم حذف العميل بنجاح' })
  } catch (error) {
    console.error('Error deleting client:', error)
    return NextResponse.json({ error: 'فشل في حذف العميل' }, { status: 500 })
  }
}
