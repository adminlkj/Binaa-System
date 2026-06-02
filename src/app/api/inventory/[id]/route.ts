import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await db.inventoryItem.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
      },
    })
    if (!item) {
      return NextResponse.json({ error: 'الصنف غير موجود' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error fetching inventory item:', error)
    return NextResponse.json({ error: 'فشل في تحميل الصنف' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const item = await db.inventoryItem.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr || null,
        unit: body.unit,
        unitPrice: body.unitPrice !== undefined ? parseFloat(body.unitPrice) : undefined,
        quantity: body.quantity !== undefined ? parseFloat(body.quantity) : undefined,
        minQuantity: body.minQuantity !== undefined ? parseFloat(body.minQuantity) : undefined,
        warehouseId: body.warehouseId,
        category: body.category || null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
      },
    })
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating inventory item:', error)
    return NextResponse.json({ error: 'فشل في تحديث الصنف' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.inventoryItem.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting inventory item:', error)
    return NextResponse.json({ error: 'فشل في حذف الصنف' }, { status: 500 })
  }
}
