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
    const { projectId, description, workers, days, dailyRate, date } = body

    if (!projectId || !description || !workers || !days || !dailyRate || !date) {
      return NextResponse.json({ error: 'الحقول المطلوبة: المشروع، الوصف، عدد العمال، الأيام، الأجر اليومي، التاريخ' }, { status: 400 })
    }

    const workersNum = parseInt(workers)
    const daysNum = parseFloat(days)
    const dailyRateNum = parseFloat(dailyRate)

    if (isNaN(workersNum) || isNaN(daysNum) || isNaN(dailyRateNum)) {
      return NextResponse.json({ error: 'قيم الأرقام غير صالحة' }, { status: 400 })
    }

    const totalAmount = workersNum * daysNum * dailyRateNum

    const laborCost = await db.laborCost.create({
      data: {
        projectId,
        description,
        workers: workersNum,
        days: daysNum,
        dailyRate: dailyRateNum,
        totalAmount,
        date: new Date(date),
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
