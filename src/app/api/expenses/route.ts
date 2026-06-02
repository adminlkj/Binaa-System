import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const category = searchParams.get('category')

    const expenses = await db.expense.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(expenses)
  } catch (error) {
    console.error('Error fetching expenses:', error)
    return NextResponse.json({ error: 'فشل في تحميل المصروفات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const expense = await db.expense.create({
      data: {
        projectId: body.projectId || null,
        category: body.category,
        description: body.description,
        amount: parseFloat(body.amount),
        vatAmount: body.vatAmount ? parseFloat(body.vatAmount) : null,
        date: new Date(body.date),
        reference: body.reference || null,
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Error creating expense:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المصروف' }, { status: 500 })
  }
}
