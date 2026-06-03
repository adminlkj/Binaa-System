import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const laborCosts = await db.laborCost.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(laborCosts)
  } catch (error) {
    console.error('Error fetching labor costs:', error)
    return NextResponse.json({ error: 'فشل في تحميل تكاليف العمالة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const workers = parseInt(body.workers)
    const days = parseFloat(body.days)
    const dailyRate = parseFloat(body.dailyRate)
    const totalAmount = workers * days * dailyRate

    const laborCost = await db.laborCost.create({
      data: {
        projectId: body.projectId,
        description: body.description,
        workers,
        days,
        dailyRate,
        totalAmount,
        date: new Date(body.date),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(laborCost, { status: 201 })
  } catch (error) {
    console.error('Error creating labor cost:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تكلفة العمالة' }, { status: 500 })
  }
}
