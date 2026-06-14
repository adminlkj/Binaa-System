import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const item = await db.bOQItem.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
    })
    if (!item) {
      return NextResponse.json({ error: 'بند جدول الكميات غير موجود' }, { status: 404 })
    }
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error fetching BOQ item:', error)
    return NextResponse.json({ error: 'فشل في تحميل بند جدول الكميات' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}

    if (body.projectId !== undefined) data.projectId = body.projectId
    if (body.code !== undefined) data.code = body.code
    if (body.description !== undefined) data.description = body.description
    if (body.unit !== undefined) data.unit = body.unit
    if (body.quantity !== undefined) data.quantity = parseFloat(body.quantity)
    if (body.unitPrice !== undefined) data.unitPrice = parseFloat(body.unitPrice)
    if (body.category !== undefined) data.category = body.category || null

    // Recalculate total price if quantity or unitPrice changed
    if (body.quantity !== undefined || body.unitPrice !== undefined) {
      const existing = await db.bOQItem.findUnique({ where: { id } })
      if (existing) {
        const qty = body.quantity !== undefined ? parseFloat(body.quantity) : Number(existing.quantity)
        const price = body.unitPrice !== undefined ? parseFloat(body.unitPrice) : Number(existing.unitPrice)
        data.totalPrice = Math.round(qty * price * 100) / 100
      }
    }

    const item = await db.bOQItem.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating BOQ item:', error)
    return NextResponse.json({ error: 'فشل في تحديث بند جدول الكميات' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.bOQItem.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'بند جدول الكميات غير موجود' }, { status: 404 })
    }

    await db.bOQItem.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف بند جدول الكميات بنجاح' })
  } catch (error) {
    console.error('Error deleting BOQ item:', error)
    return NextResponse.json({ error: 'فشل في حذف بند جدول الكميات' }, { status: 500 })
  }
}
