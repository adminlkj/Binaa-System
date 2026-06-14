import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') !== 'false' // default true
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (activeOnly) where.isActive = true
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { code: { contains: search } },
        { type: { contains: search } },
        { model: { contains: search } },
        { serialNumber: { contains: search } },
      ]
    }

    const include = {
      supplier: {
        select: { id: true, code: true, name: true, nameAr: true },
      },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const equipment = await db.equipment.findMany({
        where: whereClause,
        include,
        orderBy: { code: 'asc' },
      })
      return NextResponse.json(equipment)
    }

    const [data, total] = await Promise.all([
      db.equipment.findMany({
        where: whereClause,
        include,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.equipment.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching equipment:', error)
    return NextResponse.json({ error: 'فشل في تحميل المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastEquipment = await db.equipment.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastEquipment?.code) {
      const match = lastEquipment.code.match(/EQ-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `EQ-${String(nextNum).padStart(3, '0')}`

    const equipment = await db.equipment.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        type: body.type || null,
        model: body.model || null,
        serialNumber: body.serialNumber || null,
        status: body.status || 'AVAILABLE',
        ownershipType: body.ownershipType || 'COMPANY_OWNED',
        supplierId: body.supplierId || null,
        ownerId: body.ownerId || null,
        purchasePrice: parseFloat(body.purchasePrice) || 0,
        sellingPrice: parseFloat(body.sellingPrice) || 0,
        hourlyRate: parseFloat(body.hourlyRate) || 0,
        dailyRate: parseFloat(body.dailyRate) || 0,
        monthlyRate: parseFloat(body.monthlyRate) || 0,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
        warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
        isActive: true,
      },
      include: {
        supplier: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })

    return NextResponse.json(equipment, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المعدة' }, { status: 500 })
  }
}
