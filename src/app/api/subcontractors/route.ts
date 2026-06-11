import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    const subcontractors = await db.subcontractor.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: {
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(subcontractors)
  } catch (error) {
    console.error('Error fetching subcontractors:', error)
    return NextResponse.json({ error: 'فشل في تحميل مقاولي الباطن' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'اسم مقاول الباطن مطلوب' }, { status: 400 })
    }

    const lastSub = await db.subcontractor.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastSub?.code) {
      const match = lastSub.code.match(/SUB-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `SUB-${String(nextNum).padStart(3, '0')}`

    const subcontractor = await db.subcontractor.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        specialty: body.specialty || null,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        taxNumber: body.taxNumber || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })

    return NextResponse.json(subcontractor, { status: 201 })
  } catch (error) {
    console.error('Error creating subcontractor:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مقاول الباطن' }, { status: 500 })
  }
}
