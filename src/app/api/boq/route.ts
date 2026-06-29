import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}

    const items = await db.bOQItem.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })

    return NextResponse.json(items)
  } catch (error) {
    console.error('Error fetching BOQ items:', error)
    return NextResponse.json({ error: 'فشل في تحميل جدول الكميات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, code, description, unit, quantity, unitPrice, category } = body

    if (!projectId || !code || !description || !unit || quantity === undefined || unitPrice === undefined) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة ما عدا التصنيف' }, { status: 400 })
    }

    // L4-DATA-004: Validate quantity and unitPrice are non-negative.
    const qtyNum = parseFloat(quantity)
    const priceNum = parseFloat(unitPrice)
    if (isNaN(qtyNum) || qtyNum < 0) {
      return NextResponse.json({ error: 'الكمية يجب أن تكون رقماً صحيحاً وأكبر من أو يساوي صفر' }, { status: 400 })
    }
    if (isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ error: 'سعر الوحدة يجب أن يكون رقماً صحيحاً وأكبر من أو يساوي صفر' }, { status: 400 })
    }

    const totalPrice = Math.round(qtyNum * priceNum * 100) / 100

    const item = await db.bOQItem.create({
      data: {
        projectId,
        code,
        description,
        unit,
        quantity: qtyNum,
        unitPrice: priceNum,
        totalPrice,
        category: category || null,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error creating BOQ item:', error)
    return NextResponse.json({ error: 'فشل في إنشاء بند جدول الكميات' }, { status: 500 })
  }
}
