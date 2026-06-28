import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const simple = searchParams.get('simple') === 'true'
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    // P6-CRIT-009 FIX: filter out soft-deleted clients (mirror of suppliers/route.ts).
    const where: Record<string, unknown> = { deletedAt: null }
    if (activeOnly) where.isActive = true
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { code: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    if (simple) {
      const clients = await db.client.findMany({
        where: whereClause,
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json(clients)
    }

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const clients = await db.client.findMany({
        where: whereClause,
        include: {
          _count: { select: { projects: true, salesInvoices: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json(clients)
    }

    const [data, total] = await Promise.all([
      db.client.findMany({
        where: whereClause,
        include: {
          _count: { select: { projects: true, salesInvoices: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.client.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
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
