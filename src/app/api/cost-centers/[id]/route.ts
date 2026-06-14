import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/cost-centers/[id] — Get a single cost center
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const costCenter = await db.costCenter.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
    })

    if (!costCenter) {
      return NextResponse.json(
        { error: 'مركز التكلفة غير موجود' },
        { status: 404 }
      )
    }

    return NextResponse.json(costCenter)
  } catch (error) {
    console.error('Error fetching cost center:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل مركز التكلفة' },
      { status: 500 }
    )
  }
}

// PUT /api/cost-centers/[id] — Update a cost center
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.costCenter.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'مركز التكلفة غير موجود' },
        { status: 404 }
      )
    }

    // Prevent setting parent to self (would create circular reference)
    if (body.parentId === id) {
      return NextResponse.json(
        { error: 'لا يمكن أن يكون مركز التكلفة أب لنفسه' },
        { status: 400 }
      )
    }

    const updated = await db.costCenter.update({
      where: { id },
      data: {
        ...(body.code !== undefined && { code: body.code }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.parentId !== undefined && { parentId: body.parentId || null }),
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating cost center:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث مركز التكلفة' },
      { status: 500 }
    )
  }
}

// DELETE /api/cost-centers/[id] — Delete a cost center
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.costCenter.findUnique({
      where: { id },
      include: {
        _count: { select: { journalLines: true, children: true } },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'مركز التكلفة غير موجود' },
        { status: 404 }
      )
    }

    // Prevent deletion if cost center has journal lines
    if (existing._count.journalLines > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف مركز التكلفة لوجود قيود محاسبية مرتبطة به' },
        { status: 400 }
      )
    }

    // Prevent deletion if cost center has children
    if (existing._count.children > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف مركز التكلفة لوجود مراكز تكلفة فرعية مرتبطة به' },
        { status: 400 }
      )
    }

    await db.costCenter.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف مركز التكلفة بنجاح' })
  } catch (error) {
    console.error('Error deleting cost center:', error)
    return NextResponse.json(
      { error: 'فشل في حذف مركز التكلفة' },
      { status: 500 }
    )
  }
}
