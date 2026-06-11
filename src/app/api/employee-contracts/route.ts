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
    const contractsWithTotal = contracts.map(c => ({
      ...c,
      totalCompensation: (c.basicSalary ?? 0) + (c.housingAllowance ?? 0) + (c.transportAllowance ?? 0) + (c.otherAllowances ?? 0),
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
    const contractWithTotal = {
      ...contract,
      totalCompensation: (contract.basicSalary ?? 0) + (contract.housingAllowance ?? 0) + (contract.transportAllowance ?? 0) + (contract.otherAllowances ?? 0),
    }
    return NextResponse.json(contractWithTotal, { status: 201 })
  } catch (error) {
    console.error('Error creating employee contract:', error)
    return NextResponse.json({ error: 'فشل في إنشاء عقد الموظف' }, { status: 500 })
  }
}
