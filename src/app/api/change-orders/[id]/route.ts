import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const changeOrder = await db.changeOrder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
      },
    })

    if (!changeOrder) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    return NextResponse.json(changeOrder)
  } catch (error) {
    console.error('Error fetching change order:', error)
    return NextResponse.json({ error: 'فشل في تحميل أمر التغيير' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.changeOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    const changeValue = body.changeValue != null ? parseFloat(body.changeValue) : existing.changeValue
    const vatRate = existing.vatRate
    const vatAmount = Math.round(changeValue * vatRate * 100) / 100
    const totalChangeValue = Math.round((changeValue + vatAmount) * 100) / 100
    const originalValue = body.originalValue != null ? parseFloat(body.originalValue) : existing.originalValue
    const newValue = originalValue + changeValue

    const changeOrder = await db.changeOrder.update({
      where: { id },
      data: {
        description: body.description !== undefined ? body.description : existing.description,
        changeType: body.changeType || existing.changeType,
        originalValue,
        changeValue,
        newValue,
        vatAmount,
        totalChangeValue,
        status: body.status || existing.status,
        notes: body.notes !== undefined ? (body.notes || null) : existing.notes,
        approvedDate: body.status === 'APPROVED' ? new Date() : existing.approvedDate,
        approvedBy: body.approvedBy !== undefined ? body.approvedBy : existing.approvedBy,
        date: body.date ? new Date(body.date) : existing.date,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true } },
      },
    })

    return NextResponse.json(changeOrder)
  } catch (error) {
    console.error('Error updating change order:', error)
    return NextResponse.json({ error: 'فشل في تحديث أمر التغيير' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.changeOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'أمر التغيير غير موجود' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'لا يمكن حذف أمر التغيير إلا في حالة المسودة' }, { status: 400 })
    }

    await db.changeOrder.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting change order:', error)
    return NextResponse.json({ error: 'فشل في حذف أمر التغيير' }, { status: 500 })
  }
}
