import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

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

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const suppliers = await db.supplier.findMany({
        where: whereClause,
        include: {
          _count: { select: { purchaseOrders: true, purchaseInvoices: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json(suppliers)
    }

    const [data, total] = await Promise.all([
      db.supplier.findMany({
        where: whereClause,
        include: {
          _count: { select: { purchaseOrders: true, purchaseInvoices: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.supplier.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json({ error: 'فشل في تحميل الموردين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()

    const lastSupplier = await db.supplier.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastSupplier?.code) {
      const match = lastSupplier.code.match(/SUP-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `SUP-${String(nextNum).padStart(3, '0')}`

    // L4-DATA-003: Validate required fields — name must be non-empty string.
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'اسم المورد مطلوب ولا يمكن أن يكون فارغاً' }, { status: 400 })
    }

    const supplier = await db.supplier.create({
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

    return NextResponse.json(supplier, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المورد' }, { status: 500 })
  }
}
