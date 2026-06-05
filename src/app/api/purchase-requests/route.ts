import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const source = searchParams.get('source')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (source) where.source = source

    const requests = await db.purchaseRequest.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(requests)
  } catch (error) {
    console.error('Error fetching purchase requests:', error)
    return NextResponse.json({ error: 'فشل في تحميل طلبات الشراء' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, source, date, description, requestedBy, items } = body

    if (!date || !items?.length) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Auto-generate request number PR-XXX
    const lastRequest = await db.purchaseRequest.findFirst({
      orderBy: { requestNo: 'desc' },
      select: { requestNo: true },
    })

    let nextNum = 1
    if (lastRequest?.requestNo) {
      const match = lastRequest.requestNo.match(/PR-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const requestNo = `PR-${String(nextNum).padStart(4, '0')}`

    const purchaseRequest = await db.purchaseRequest.create({
      data: {
        requestNo,
        projectId: projectId || null,
        source: source || 'PROJECT',
        date: new Date(date),
        description: description || null,
        status: 'NEW',
        requestedBy: requestedBy || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unit?: string | null; notes?: string | null }) => ({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit || null,
            notes: item.notes || null,
          })),
        },
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        items: true,
      },
    })

    return NextResponse.json(purchaseRequest, { status: 201 })
  } catch (error) {
    console.error('Error creating purchase request:', error)
    return NextResponse.json({ error: 'فشل في إنشاء طلب الشراء' }, { status: 500 })
  }
}
