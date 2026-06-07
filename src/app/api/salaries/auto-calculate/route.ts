import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// POST: Auto-calculate salary for an employee based on contract, attendance, and overtime
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { employeeId, month, year } = body

    if (!employeeId || !month || !year) {
      return NextResponse.json(
        { error: 'يجب تحديد الموظف والشهر والسنة' },
        { status: 400 }
      )
    }

    // 1. Look up the employee's active contract (latest)
    const contract = await db.employeeContract.findFirst({
      where: {
        employeeId,
        startDate: { lte: new Date(year, month, 1) },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date(year, month - 1, 1) } },
        ],
      },
      orderBy: { startDate: 'desc' },
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'لا يوجد عقد نشط لهذا الموظف في الفترة المحددة' },
        { status: 404 }
      )
    }

    // 2. Look up attendance for the given month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    const attendanceRecords = await db.attendance.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lt: endDate },
      },
    })

    // 3. Calculate total overtime hours from attendance
    const totalOvertimeHours = attendanceRecords.reduce(
      (sum, a) => sum + (a.overtimeHours || 0),
      0
    )

    // 4. Calculate total work hours
    const totalWorkHours = attendanceRecords.reduce(
      (sum, a) => sum + (a.workHours || 0),
      0
    )

    // 5. Calculate overtime amount
    // hourly rate = basicSalary / 30 / 8 (daily rate / 8 hours)
    const dailyRate = contract.basicSalary / 30
    const hourlyRate = dailyRate / 8
    const overtimeAmount = Math.round(totalOvertimeHours * hourlyRate * 100) / 100

    // 6. Look up pending advances for deductions
    const pendingAdvances = await db.employeeAdvance.findMany({
      where: {
        employeeId,
        status: 'PENDING',
        date: { gte: startDate, lt: endDate },
      },
    })
    const deductions = pendingAdvances.reduce(
      (sum, a) => sum + a.amount,
      0
    )

    // 7. Calculate net salary
    const basicSalary = contract.basicSalary
    const housingAllowance = contract.housingAllowance
    const transportAllowance = contract.transportAllowance
    const otherAllowances = contract.otherAllowances
    const netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount - deductions

    return NextResponse.json({
      employeeId,
      month,
      year,
      basicSalary,
      housingAllowance,
      transportAllowance,
      otherAllowances,
      overtimeAmount,
      deductions,
      netSalary: Math.round(netSalary * 100) / 100,
      attendanceDays: attendanceRecords.length,
      totalWorkHours,
      totalOvertimeHours,
      contractId: contract.id,
      contractStartDate: contract.startDate,
    })
  } catch (error) {
    console.error('Error auto-calculating salary:', error)
    return NextResponse.json(
      { error: 'فشل في حساب الراتب تلقائياً' },
      { status: 500 }
    )
  }
}
