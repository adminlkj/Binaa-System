import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const activeOnly = searchParams.get('active') === 'true'
    const branchId = searchParams.get('branchId')
    const status = searchParams.get('status')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)

    const where: Record<string, unknown> = { deletedAt: null }
    if (activeOnly) where.isActive = true
    if (branchId) where.branchId = branchId
    if (status) where.status = status
    if (search) {
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { profession: { contains: search } },
      ]
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const employees = await db.employee.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          expenseAccount: { select: { id: true, code: true, name: true, nameAr: true, accountRole: true } },
        },
        orderBy: { code: 'asc' },
      })
      return NextResponse.json(employees)
    }

    const [data, total] = await Promise.all([
      db.employee.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          expenseAccount: { select: { id: true, code: true, name: true, nameAr: true, accountRole: true } },
        },
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.employee.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json({ error: 'فشل في تحميل الموظفين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-generate employee code EMP-XXX
    const lastEmployee = await db.employee.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastEmployee?.code) {
      const match = lastEmployee.code.match(/EMP-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `EMP-${String(nextNum).padStart(3, '0')}`

    // L4-DATA-001: Validate required fields — name must be non-empty string.
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'اسم الموظف مطلوب ولا يمكن أن يكون فارغاً' }, { status: 400 })
    }

    // Branch is required by schema - if not provided, fall back to first branch
    let branchId = body.branchId
    if (!branchId) {
      const firstBranch = await db.branch.findFirst({ select: { id: true } })
      if (!firstBranch) {
        return NextResponse.json({ error: 'لا يوجد فرع مسجل. أنشئ فرعاً أولاً.' }, { status: 400 })
      }
      branchId = firstBranch.id
    }

    const employee = await db.employee.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        nationality: body.nationality || null,
        profession: body.profession || null,
        residenceNumber: body.residenceNumber || null,
        residenceExpiry: body.residenceExpiry ? new Date(body.residenceExpiry) : null,
        hireDate: body.hireDate ? new Date(body.hireDate) : null,
        basicSalary: body.basicSalary ? parseFloat(body.basicSalary) : 0,
        status: body.status || 'ACTIVE',
        branchId,
        phone: body.phone || null,
        email: body.email || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        expenseAccountId: body.expenseAccountId || null,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        expenseAccount: { select: { id: true, code: true, name: true, nameAr: true, accountRole: true } },
      },
    })

    return NextResponse.json(employee, { status: 201 })
  } catch (error) {
    console.error('Error creating employee:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الموظف' }, { status: 500 })
  }
}
