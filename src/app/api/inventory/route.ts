import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouseId')
    const category = searchParams.get('category')
    const itemType = searchParams.get('itemType')

    const items = await db.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(warehouseId ? { warehouseId } : {}),
        ...(category ? { category } : {}),
        ...(itemType ? { itemType: itemType as 'PRODUCT' | 'SERVICE' } : {}),
      },
      include: {
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json({ error: 'فشل في تحميل المخزون' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()

    const lastItem = await db.inventoryItem.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastItem?.code) {
      const match = lastItem.code.match(/INV-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `INV-${String(nextNum).padStart(3, '0')}`

    const item = await db.inventoryItem.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        itemType: body.itemType || 'PRODUCT',
        unit: body.unit,
        purchasePrice: parseFloat(body.purchasePrice) || 0,
        sellingPrice: parseFloat(body.sellingPrice) || 0,
        quantity: parseFloat(body.quantity) || 0,
        minQuantity: parseFloat(body.minQuantity) || 0,
        warehouseId: body.warehouseId,
        category: body.category || null,
        isActive: true,
      },
      include: {
        warehouse: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating inventory item:', error)
    return NextResponse.json({ error: 'فشل في إنشاء صنف المخزون' }, { status: 500 })
  }
}
