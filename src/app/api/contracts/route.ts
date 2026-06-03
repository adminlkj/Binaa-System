import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}

    const contracts = await db.contract.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        _count: { select: { progressClaims: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(contracts)
  } catch (error) {
    console.error('Error fetching contracts:', error)
    return NextResponse.json({ error: 'فشل في تحميل العقود' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, contractNo, date, value, vatRate, startDate, endDate, status, description } = body

    if (!projectId || !contractNo || !date || value === undefined || !startDate) {
      return NextResponse.json({ error: 'الحقول المطلوبة: المشروع، رقم العقد، التاريخ، القيمة، تاريخ البدء' }, { status: 400 })
    }

    const existingNo = await db.contract.findUnique({ where: { contractNo } })
    if (existingNo) {
      return NextResponse.json({ error: 'رقم العقد موجود بالفعل' }, { status: 400 })
    }

    const rate = vatRate ?? 0.15
    const vatAmount = Math.round(value * rate * 100) / 100
    const totalValue = Math.round((value + vatAmount) * 100) / 100

    const contract = await db.contract.create({
      data: {
        projectId,
        contractNo,
        date: new Date(date),
        value: parseFloat(value),
        vatRate: rate,
        vatAmount,
        totalValue,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'DRAFT',
        description: description || null,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(contract, { status: 201 })
  } catch (error) {
    console.error('Error creating contract:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العقد' }, { status: 500 })
  }
}
