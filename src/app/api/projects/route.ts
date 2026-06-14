import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { code: { contains: search } },
        { location: { contains: search } },
      ]
    }

    const include = {
      client: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      contracts: { select: { id: true, contractNo: true, totalValue: true, status: true } },
      _count: { select: { boqItems: true, progressClaims: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const projects = await db.project.findMany({
        where: whereClause,
        include,
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json(projects)
    }

    const [data, total] = await Promise.all([
      db.project.findMany({
        where: whereClause,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.project.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'فشل في تحميل المشاريع' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code, name, nameAr, clientId, branchId, location, startDate, endDate, status, description, contractValue, projectType } = body

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
        projectType: projectType || 'CONSTRUCTION',
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
