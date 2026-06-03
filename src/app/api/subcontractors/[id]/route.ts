import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const subcontractor = await db.subcontractor.findUnique({
      where: { id },
      include: {
        _count: { select: { invoices: true } },
      },
    })
    if (!subcontractor) {
      return NextResponse.json({ error: 'مقاول الباطن غير موجود' }, { status: 404 })
    }
    return NextResponse.json(subcontractor)
  } catch (error) {
    console.error('Error fetching subcontractor:', error)
    return NextResponse.json({ error: 'فشل في تحميل مقاول الباطن' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const subcontractor = await db.subcontractor.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr || null,
        specialty: body.specialty || null,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        taxNumber: body.taxNumber || null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    })
    return NextResponse.json(subcontractor)
  } catch (error) {
    console.error('Error updating subcontractor:', error)
    return NextResponse.json({ error: 'فشل في تحديث مقاول الباطن' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.subcontractor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting subcontractor:', error)
    return NextResponse.json({ error: 'فشل في حذف مقاول الباطن' }, { status: 500 })
  }
}
