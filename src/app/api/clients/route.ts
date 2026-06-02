import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const simple = searchParams.get('simple') === 'true'

    if (simple) {
      const clients = await db.client.findMany({
        where: activeOnly ? { isActive: true } : undefined,
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(clients)
    }

    const clients = await db.client.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: {
        _count: { select: { projects: true, salesInvoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json({ error: 'فشل في تحميل العملاء' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-generate code
    const lastClient = await db.client.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastClient?.code) {
      const match = lastClient.code.match(/CLT-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `CLT-${String(nextNum).padStart(3, '0')}`

    const client = await db.client.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        taxNumber: body.taxNumber || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Error creating client:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العميل' }, { status: 500 })
  }
}
