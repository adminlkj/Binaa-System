import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const laborCost = await db.laborCost.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })
    if (!laborCost) {
      return NextResponse.json({ error: 'تكلفة العمالة غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(laborCost)
  } catch (error) {
    console.error('Error fetching labor cost:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكلفة العمالة' }, { status: 500 })
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
    if (body.description !== undefined) data.description = body.description
    if (body.workers !== undefined) data.workers = parseInt(body.workers)
    if (body.days !== undefined) data.days = parseFloat(body.days)
    if (body.dailyRate !== undefined) data.dailyRate = parseFloat(body.dailyRate)
    if (body.date !== undefined) data.date = new Date(body.date)
    // خصائص يختارها المستخدم (المستخدم سيد النظام)
    if (body.paymentSource !== undefined) data.paymentSource = body.paymentSource
    if (body.paymentAccountCode !== undefined) data.paymentAccountCode = body.paymentAccountCode

    // Recalculate total if workers, days, or dailyRate changed
    if (body.workers !== undefined || body.days !== undefined || body.dailyRate !== undefined) {
      const existing = await db.laborCost.findUnique({ where: { id } })
      if (existing) {
        const w = body.workers !== undefined ? parseInt(body.workers) : existing.workers
        const d = body.days !== undefined ? parseFloat(body.days) : Number(existing.days)
        const r = body.dailyRate !== undefined ? parseFloat(body.dailyRate) : Number(existing.dailyRate)
        data.totalAmount = w * d * r
      }
    }

    const laborCost = await db.laborCost.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(laborCost)
  } catch (error) {
    console.error('Error updating labor cost:', error)
    return NextResponse.json({ error: 'فشل في تحديث تكلفة العمالة' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.laborCost.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'تكلفة العمالة غير موجودة' }, { status: 404 })
    }

    await db.laborCost.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف تكلفة العمالة بنجاح' })
  } catch (error) {
    console.error('Error deleting labor cost:', error)
    return NextResponse.json({ error: 'فشل في حذف تكلفة العمالة' }, { status: 500 })
  }
}
