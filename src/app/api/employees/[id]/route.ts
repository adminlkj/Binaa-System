import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        contracts: { orderBy: { startDate: 'desc' } },
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        salaries: { orderBy: { createdAt: 'desc' }, take: 12 },
        teamMemberships: { include: { team: { select: { id: true, code: true, name: true } } } },
      },
    })
    if (!employee) {
      return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })
    }
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error fetching employee:', error)
    return NextResponse.json({ error: 'فشل في تحميل بيانات الموظف' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const employee = await db.employee.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr ?? null,
        nationality: body.nationality ?? null,
        profession: body.profession ?? null,
        residenceNumber: body.residenceNumber ?? null,
        residenceExpiry: body.residenceExpiry ? new Date(body.residenceExpiry) : null,
        hireDate: body.hireDate ? new Date(body.hireDate) : null,
        basicSalary: body.basicSalary !== undefined ? parseFloat(body.basicSalary) : undefined,
        status: body.status,
        branchId: body.branchId,
        phone: body.phone ?? null,
        email: body.email ?? null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error updating employee:', error)
    return NextResponse.json({ error: 'فشل في تحديث بيانات الموظف' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.employee.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting employee:', error)
    return NextResponse.json({ error: 'فشل في حذف الموظف' }, { status: 500 })
  }
}
