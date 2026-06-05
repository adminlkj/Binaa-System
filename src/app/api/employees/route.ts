import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const activeOnly = searchParams.get('active') === 'true'
    const branchId = searchParams.get('branchId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
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

    const employees = await db.employee.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(employees)
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
        branchId: body.branchId,
        phone: body.phone || null,
        email: body.email || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(employee, { status: 201 })
  } catch (error) {
    console.error('Error creating employee:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الموظف' }, { status: 500 })
  }
}
