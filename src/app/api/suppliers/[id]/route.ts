import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supplier = await db.supplier.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { purchaseOrders: true, purchaseInvoices: true } },
      },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }
    return NextResponse.json(supplier)
  } catch (error) {
    console.error('Error fetching supplier:', error)
    return NextResponse.json({ error: 'فشل في تحميل المورد' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    // L4-DATA-003: Validate name is non-empty when provided.
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
      return NextResponse.json({ error: 'اسم المورد لا يمكن أن يكون فارغاً' }, { status: 400 })
    }

    const supplier = await db.supplier.update({
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
    return NextResponse.json(supplier)
  } catch (error) {
    console.error('Error updating supplier:', error)
    return NextResponse.json({ error: 'فشل في تحديث المورد' }, { status: 500 })
  }
}

// P5-CRIT-008 FIX: Soft-delete with FK pre-flight check.
// Previously the DELETE did `db.supplier.delete({where:{id}})` which 500-crashed
// on any supplier with related records (PO, PI, GR, payment, equipment, maintenance)
// due to onDelete: Restrict. Now we:
//   1. Count all related records.
//   2. If any exist → return 400 with Arabic counts (user must deactivate instead).
//   3. If none → soft-delete (deletedAt = now, isActive = false).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'المورد محذوف بالفعل' }, { status: 400 })
    }

    // Pre-flight: count all related records that would block hard-delete
    const [
      poCount, piCount, grCount, payCount, eqCount, maintCount,
    ] = await Promise.all([
      db.purchaseOrder.count({ where: { supplierId: id } }),
      db.purchaseInvoice.count({ where: { supplierId: id } }),
      db.goodsReceipt.count({ where: { supplierId: id } }),
      db.supplierPayment.count({ where: { supplierId: id } }),
      db.equipment.count({ where: { supplierId: id } }),
      db.equipmentMaintenance.count({ where: { supplierId: id } }),
    ])

    const totalRelations = poCount + piCount + grCount + payCount + eqCount + maintCount
    if (totalRelations > 0) {
      const parts: string[] = []
      if (poCount > 0) parts.push(`${poCount} أمر شراء`)
      if (piCount > 0) parts.push(`${piCount} فاتورة شراء`)
      if (grCount > 0) parts.push(`${grCount} إيصال استلام`)
      if (payCount > 0) parts.push(`${payCount} دفعة مورد`)
      if (eqCount > 0) parts.push(`${eqCount} معدّة`)
      if (maintCount > 0) parts.push(`${maintCount} صيانة معدّة`)
      return NextResponse.json(
        {
          error: `لا يمكن حذف المورد: مرتبط بـ ${parts.join('، ')}. يمكنك تعطيله بدلاً من ذلك (isActive=false).`,
        },
        { status: 400 }
      )
    }

    // No relations — safe to soft-delete
    await db.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    return NextResponse.json({ success: true, message: 'تم حذف المورد بنجاح' })
  } catch (error) {
    console.error('Error deleting supplier:', error)
    return NextResponse.json({ error: 'فشل في حذف المورد' }, { status: 500 })
  }
}
