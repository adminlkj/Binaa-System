import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')

    const contracts = await db.employeeContract.findMany({
      where: employeeId ? { employeeId } : undefined,
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { startDate: 'desc' },
    })
    // Calculate totalCompensation since it's not stored in DB
    // L3B-CRIT-004 FIX: wrap with Number() — Prisma Decimal serializes to string, so '+' was concatenating.
    const contractsWithTotal = contracts.map(c => ({
      ...c,
      totalCompensation: Number(c.basicSalary ?? 0) + Number(c.housingAllowance ?? 0) + Number(c.transportAllowance ?? 0) + Number(c.otherAllowances ?? 0),
    }))
    return NextResponse.json(contractsWithTotal)
  } catch (error) {
    console.error('Error fetching employee contracts:', error)
    return NextResponse.json({ error: 'فشل في تحميل عقود الموظفين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // L4-DATA-005: Validate required employeeId and date order (endDate >= startDate).
    if (!body.employeeId) {
      return NextResponse.json({ error: 'الموظف مطلوب' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'تاريخ بداية العقد مطلوب' }, { status: 400 })
    }
    if (body.endDate) {
      const startD = new Date(body.startDate)
      const endD = new Date(body.endDate)
      if (isNaN(startD.getTime())) {
        return NextResponse.json({ error: 'تاريخ بداية العقد غير صالح' }, { status: 400 })
      }
      if (isNaN(endD.getTime())) {
        return NextResponse.json({ error: 'تاريخ نهاية العقد غير صالح' }, { status: 400 })
      }
      if (endD < startD) {
        return NextResponse.json({ error: 'تاريخ نهاية العقد لا يمكن أن يكون قبل تاريخ بدايته' }, { status: 400 })
      }
    }

    const contract = await db.employeeContract.create({
      data: {
        employeeId: body.employeeId,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        basicSalary: parseFloat(body.basicSalary) || 0,
        housingAllowance: body.housingAllowance ? parseFloat(body.housingAllowance) : 0,
        transportAllowance: body.transportAllowance ? parseFloat(body.transportAllowance) : 0,
        otherAllowances: body.otherAllowances ? parseFloat(body.otherAllowances) : 0,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Update employee basic salary if this is the latest contract
    await db.employee.update({
      where: { id: body.employeeId },
      data: { basicSalary: parseFloat(body.basicSalary) || 0 },
    })

    // Return contract with computed totalCompensation
    // L3B-CRIT-004 FIX: wrap with Number() — Prisma Decimal serializes to string.
    const contractWithTotal = {
      ...contract,
      totalCompensation: Number(contract.basicSalary ?? 0) + Number(contract.housingAllowance ?? 0) + Number(contract.transportAllowance ?? 0) + Number(contract.otherAllowances ?? 0),
    }
    return NextResponse.json(contractWithTotal, { status: 201 })
  } catch (error) {
    console.error('Error creating employee contract:', error)
    return NextResponse.json({ error: 'فشل في إنشاء عقد الموظف' }, { status: 500 })
  }
}
