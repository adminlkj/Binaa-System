import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contract = await db.employeeContract.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    const contractWithTotal = {
      ...contract,
      totalCompensation:
        (contract.basicSalary ?? 0) +
        (contract.housingAllowance ?? 0) +
        (contract.transportAllowance ?? 0) +
        (contract.otherAllowances ?? 0),
    }
    return NextResponse.json(contractWithTotal)
  } catch (error) {
    console.error('Error fetching employee contract:', error)
    return NextResponse.json({ error: 'فشل في تحميل العقد' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate contract exists
    const existing = await db.employeeContract.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null
    if (body.basicSalary !== undefined) updateData.basicSalary = parseFloat(body.basicSalary) || 0
    if (body.housingAllowance !== undefined) updateData.housingAllowance = parseFloat(body.housingAllowance) || 0
    if (body.transportAllowance !== undefined) updateData.transportAllowance = parseFloat(body.transportAllowance) || 0
    if (body.otherAllowances !== undefined) updateData.otherAllowances = parseFloat(body.otherAllowances) || 0

    const contract = await db.employeeContract.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Update employee basic salary to match the latest contract
    if (body.basicSalary !== undefined) {
      await db.employee.update({
        where: { id: existing.employeeId },
        data: { basicSalary: parseFloat(body.basicSalary) || 0 },
      })
    }

    const contractWithTotal = {
      ...contract,
      totalCompensation:
        (contract.basicSalary ?? 0) +
        (contract.housingAllowance ?? 0) +
        (contract.transportAllowance ?? 0) +
        (contract.otherAllowances ?? 0),
    }
    return NextResponse.json(contractWithTotal)
  } catch (error) {
    console.error('Error updating employee contract:', error)
    return NextResponse.json({ error: 'فشل في تحديث العقد' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Validate contract exists
    const existing = await db.employeeContract.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    await db.employeeContract.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف العقد بنجاح' })
  } catch (error) {
    console.error('Error deleting employee contract:', error)
    return NextResponse.json({ error: 'فشل في حذف العقد' }, { status: 500 })
  }
}
