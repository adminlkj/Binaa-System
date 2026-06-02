import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supplier = await db.supplier.findUnique({
      where: { id },
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.supplier.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting supplier:', error)
    return NextResponse.json({ error: 'فشل في حذف المورد' }, { status: 500 })
  }
}
