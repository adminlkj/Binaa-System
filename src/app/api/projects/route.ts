import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const projects = await db.project.findMany({
      include: {
        client: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        contracts: { select: { id: true, contractNo: true, totalValue: true, status: true } },
        _count: { select: { boqItems: true, progressClaims: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'فشل في تحميل المشاريع' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code, name, nameAr, clientId, branchId, location, startDate, endDate, status, description, contractValue } = body

    if (!code || !name || !clientId || !branchId || !startDate) {
      return NextResponse.json({ error: 'الحقول المطلوبة: الكود، الاسم، العميل، الفرع، تاريخ البدء' }, { status: 400 })
    }

    const existingCode = await db.project.findUnique({ where: { code } })
    if (existingCode) {
      return NextResponse.json({ error: 'كود المشروع موجود بالفعل' }, { status: 400 })
    }

    const project = await db.project.create({
      data: {
        code,
        name,
        nameAr: nameAr || null,
        clientId,
        branchId,
        location: location || null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'PLANNING',
        description: description || null,
        contractValue: contractValue ? parseFloat(contractValue) : 0,
      },
      include: {
        client: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المشروع' }, { status: 500 })
  }
}
