import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}

    const claims = await db.progressClaim.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(claims)
  } catch (error) {
    console.error('Error fetching progress claims:', error)
    return NextResponse.json({ error: 'فشل في تحميل المستخلصات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, contractId, claimNo, date, percentage, amount, vatRate, status, approvedDate, notes } = body

    if (!projectId || !contractId || !claimNo || !date || percentage === undefined || amount === undefined) {
      return NextResponse.json({ error: 'الحقول المطلوبة: المشروع، العقد، رقم المستخلص، التاريخ، النسبة، المبلغ' }, { status: 400 })
    }

    const rate = vatRate ?? 0.15
    const vatAmount = Math.round(parseFloat(amount) * rate * 100) / 100
    const totalAmount = Math.round((parseFloat(amount) + vatAmount) * 100) / 100

    const claim = await db.progressClaim.create({
      data: {
        projectId,
        contractId,
        claimNo,
        date: new Date(date),
        percentage: parseFloat(percentage),
        amount: parseFloat(amount),
        vatRate: rate,
        vatAmount,
        totalAmount,
        status: status || 'DRAFT',
        approvedDate: approvedDate ? new Date(approvedDate) : null,
        notes: notes || null,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
    })

    return NextResponse.json(claim, { status: 201 })
  } catch (error) {
    console.error('Error creating progress claim:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المستخلص' }, { status: 500 })
  }
}
