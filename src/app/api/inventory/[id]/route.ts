import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAuthApi()
  if (response) return response

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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) data.name = body.name
    if (body.nameAr !== undefined) data.nameAr = body.nameAr || null
    if (body.itemType !== undefined) data.itemType = body.itemType
    if (body.unit !== undefined) data.unit = body.unit
    if (body.purchasePrice !== undefined) data.purchasePrice = parseFloat(body.purchasePrice) || 0
    if (body.sellingPrice !== undefined) data.sellingPrice = parseFloat(body.sellingPrice) || 0
    if (body.quantity !== undefined) data.quantity = parseFloat(body.quantity) || 0
    if (body.minQuantity !== undefined) data.minQuantity = parseFloat(body.minQuantity) || 0
    if (body.warehouseId !== undefined) data.warehouseId = body.warehouseId
    if (body.category !== undefined) data.category = body.category || null
    if (body.isActive !== undefined) data.isActive = body.isActive

    const item = await db.inventoryItem.update({
      where: { id },
      data,
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
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params
    await db.inventoryItem.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting inventory item:', error)
    return NextResponse.json({ error: 'فشل في حذف الصنف' }, { status: 500 })
  }
}
