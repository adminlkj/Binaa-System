import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')

    const expenses = await db.equipmentExpense.findMany({
      where: equipmentId ? { equipmentId } : {},
      include: {
        equipment: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(expenses)
  } catch (error) {
    console.error('Error fetching equipment expenses:', error)
    return NextResponse.json({ error: 'فشل في تحميل مصروفات المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const expense = await db.equipmentExpense.create({
      data: {
        equipmentId: body.equipmentId,
        category: body.category,
        description: body.description,
        amount: parseFloat(body.amount) || 0,
        date: new Date(body.date),
        reference: body.reference || null,
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment expense:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مصروف المعدة' }, { status: 500 })
  }
}
