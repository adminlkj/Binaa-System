import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const advances = await db.employeeAdvance.findMany({
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(advances)
  } catch (error) {
    console.error('Error fetching advances:', error)
    return NextResponse.json({ error: 'فشل في تحميل السلف' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const advance = await db.employeeAdvance.create({
      data: {
        employeeId: body.employeeId,
        amount: parseFloat(body.amount),
        date: new Date(body.date),
        settledAmount: 0,
        status: 'PENDING',
        description: body.description || null,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    return NextResponse.json(advance, { status: 201 })
  } catch (error) {
    console.error('Error creating advance:', error)
    return NextResponse.json({ error: 'فشل في إنشاء السلفة' }, { status: 500 })
  }
}
