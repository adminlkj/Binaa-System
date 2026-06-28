import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const employee = await db.employee.findFirst({
      where: { id, deletedAt: null },
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
        basicSalary: body.basicSalary !== undefined ? (parseFloat(body.basicSalary) || 0) : undefined,
        status: body.status,
        branchId: body.branchId,
        phone: body.phone ?? null,
        email: body.email ?? null,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
        expenseAccountId: body.expenseAccountId !== undefined ? (body.expenseAccountId || null) : undefined,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        expenseAccount: { select: { id: true, code: true, name: true, nameAr: true, accountRole: true } },
      },
    })
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error updating employee:', error)
    return NextResponse.json({ error: 'فشل في تحديث بيانات الموظف' }, { status: 500 })
  }
}

// P4-CRIT-012 FIX: was hard-delete → crashed on FK restrict + no audit trail.
// Now: blocks delete if employee has financial records; otherwise soft-deletes
// (deletedAt + isActive=false + status=TERMINATED) preserving referential integrity.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const existing = await db.employee.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: 'الموظف محذوف بالفعل' }, { status: 400 })
    }

    // Pre-flight: block delete if employee has financial records (FK restrict)
    const [salaryCount, advanceCount, attendanceCount, contractCount] = await Promise.all([
      db.salary.count({ where: { employeeId: id } }),
      db.employeeAdvance.count({ where: { employeeId: id } }),
      db.attendance.count({ where: { employeeId: id } }),
      db.employeeContract.count({ where: { employeeId: id } }),
    ])

    const total = salaryCount + advanceCount + attendanceCount + contractCount
    if (total > 0) {
      return NextResponse.json({
        error: `لا يمكن حذف الموظف لوجود سجلات مرتبطة (${total}): رواتب=${salaryCount}، سلف=${advanceCount}، حضور=${attendanceCount}، عقود=${contractCount}. استخدم خيار "إنهاء الخدمة" بدلاً من ذلك.`,
      }, { status: 400 })
    }

    // Soft-delete: mark deletedAt, deactivate, set status TERMINATED
    await db.employee.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        status: 'TERMINATED',
      },
    })

    return NextResponse.json({ success: true, message: 'تم حذف الموظف (soft-delete)' })
  } catch (error) {
    console.error('Error deleting employee:', error)
    return NextResponse.json({ error: 'فشل في حذف الموظف' }, { status: 500 })
  }
}
