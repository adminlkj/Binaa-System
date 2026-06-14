import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)
    if (search) {
      where.code = { contains: search }
    }

    const payrollRuns = await db.payrollRun.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        _count: { select: { lines: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { code: 'desc' }],
    })

    return NextResponse.json(payrollRuns)
  } catch (error) {
    console.error('Error fetching payroll runs:', error)
    return NextResponse.json({ error: 'فشل في تحميل مسيرات الرواتب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const month = parseInt(body.month)
    const year = parseInt(body.year)
    const notes = body.notes || null
    const selectionType = body.selectionType || 'ALL' // ALL | TEAM | PROJECT
    const selectionIds: string[] = body.selectionIds || []

    // Validate month/year
    if (!month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'شهر غير صالح' }, { status: 400 })
    }
    if (!year || year < 2000) {
      return NextResponse.json({ error: 'سنة غير صالحة' }, { status: 400 })
    }

    // Generate code: PAY-{year}-{sequential 4-digit number}
    const prefix = `PAY-${year}-`
    const lastRun = await db.payrollRun.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastRun?.code) {
      const match = lastRun.code.match(/PAY-\d+-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const code = `${prefix}${String(nextNum).padStart(4, '0')}`

    // Get employees based on selection
    let employees: Array<{
      id: string; code: string; name: string; nameAr: string | null
      salaryType: string; basicSalary: number
      housingAllowance: number; transportAllowance: number; otherAllowances: number
      referenceMonthlySalary: number; referenceMonthlyHours: number
      projectId: string | null; hasGosi: boolean; gosiPercentage: number
      teamMemberships: Array<{ team: { projectId: string | null } }>
    }> = []

    if (selectionType === 'ALL') {
      employees = await db.employee.findMany({
        where: { isActive: true, status: 'ACTIVE' },
        select: {
          id: true, code: true, name: true, nameAr: true,
          salaryType: true, basicSalary: true,
          housingAllowance: true, transportAllowance: true, otherAllowances: true,
          referenceMonthlySalary: true, referenceMonthlyHours: true,
          projectId: true, hasGosi: true, gosiPercentage: true,
          teamMemberships: { select: { team: { select: { projectId: true } } } },
        },
        orderBy: { code: 'asc' },
      })
    } else if (selectionType === 'TEAM') {
      // Get employees who are members of the specified teams
      employees = await db.employee.findMany({
        where: {
          isActive: true, status: 'ACTIVE',
          teamMemberships: { some: { teamId: { in: selectionIds } } },
        },
        select: {
          id: true, code: true, name: true, nameAr: true,
          salaryType: true, basicSalary: true,
          housingAllowance: true, transportAllowance: true, otherAllowances: true,
          referenceMonthlySalary: true, referenceMonthlyHours: true,
          projectId: true, hasGosi: true, gosiPercentage: true,
          teamMemberships: { select: { team: { select: { projectId: true } } } },
        },
        orderBy: { code: 'asc' },
      })
    } else if (selectionType === 'PROJECT') {
      // Get employees assigned to specified projects (directly or via team)
      employees = await db.employee.findMany({
        where: {
          isActive: true, status: 'ACTIVE',
          OR: [
            { projectId: { in: selectionIds } },
            { teamMemberships: { some: { team: { projectId: { in: selectionIds } } } } },
          ],
        },
        select: {
          id: true, code: true, name: true, nameAr: true,
          salaryType: true, basicSalary: true,
          housingAllowance: true, transportAllowance: true, otherAllowances: true,
          referenceMonthlySalary: true, referenceMonthlyHours: true,
          projectId: true, hasGosi: true, gosiPercentage: true,
          teamMemberships: { select: { team: { select: { projectId: true } } } },
        },
        orderBy: { code: 'asc' },
      })
    }

    if (employees.length === 0) {
      return NextResponse.json({ error: 'لم يتم العثور على موظفين مطابقين' }, { status: 400 })
    }

    // Calculate date range for attendance (for hourly employees)
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1) // first day of next month

    // Build lines data
    const linesData: Array<{
      employeeId: string; salaryType: string
      basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowances: number
      workHours: number; hourlyRate: number; hourlySalary: number
      overtimeAmount: number; deductions: number; gosiDeduction: number
      totalEntitlement: number; netSalary: number
      projectId: string | null
    }> = []

    let totalAmount = 0
    let totalDeductions = 0
    let totalNet = 0

    for (const emp of employees) {
      let lineTotalEntitlement = 0
      let lineWorkHours = 0
      let lineHourlyRate = 0
      let lineHourlySalary = 0
      let lineOvertimeAmount = 0
      let lineDeductions = 0
      let lineBasicSalary = 0
      let lineHousingAllowance = 0
      let lineTransportAllowance = 0
      let lineOtherAllowances = 0

      if (emp.salaryType === 'MONTHLY') {
        lineBasicSalary = emp.basicSalary
        lineHousingAllowance = emp.housingAllowance
        lineTransportAllowance = emp.transportAllowance
        lineOtherAllowances = emp.otherAllowances
        lineTotalEntitlement = lineBasicSalary + lineHousingAllowance + lineTransportAllowance + lineOtherAllowances
      } else {
        // HOURLY: get attendance hours for the month
        const attendance = await db.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: startDate, lt: endDate },
          },
          select: { workHours: true, overtimeHours: true },
        })

        lineWorkHours = attendance.reduce((sum, a) => sum + (a.workHours || 0), 0)
        const totalOvertimeHours = attendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0)

        lineHourlyRate = emp.referenceMonthlyHours > 0
          ? emp.referenceMonthlySalary / emp.referenceMonthlyHours
          : 0
        lineHourlySalary = lineWorkHours * lineHourlyRate
        lineOvertimeAmount = totalOvertimeHours * lineHourlyRate
        lineTotalEntitlement = lineHourlySalary + lineOvertimeAmount
      }

      // GOSI deduction
      const gosiDeduction = emp.hasGosi
        ? lineTotalEntitlement * (emp.gosiPercentage / 100)
        : 0

      const netSalary = lineTotalEntitlement - lineDeductions - gosiDeduction

      // Determine projectId: from employee.projectId, or from employee's team's projectId
      let lineProjectId = emp.projectId
      if (!lineProjectId && emp.teamMemberships.length > 0) {
        const teamProject = emp.teamMemberships.find(tm => tm.team.projectId)
        lineProjectId = teamProject?.team.projectId || null
      }

      linesData.push({
        employeeId: emp.id,
        salaryType: emp.salaryType,
        basicSalary: lineBasicSalary,
        housingAllowance: lineHousingAllowance,
        transportAllowance: lineTransportAllowance,
        otherAllowances: lineOtherAllowances,
        workHours: lineWorkHours,
        hourlyRate: lineHourlyRate,
        hourlySalary: lineHourlySalary,
        overtimeAmount: lineOvertimeAmount,
        deductions: lineDeductions,
        gosiDeduction,
        totalEntitlement: lineTotalEntitlement,
        netSalary,
        projectId: lineProjectId,
      })

      totalAmount += lineTotalEntitlement
      totalDeductions += lineDeductions + gosiDeduction
      totalNet += netSalary
    }

    // Create the payroll run with all lines
    const payrollRun = await db.payrollRun.create({
      data: {
        code,
        month,
        year,
        status: 'DRAFT',
        totalAmount,
        totalDeductions,
        totalNet,
        notes,
        lines: {
          create: linesData,
        },
      },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true } },
            project: { select: { id: true, code: true, name: true } },
          },
        },
        _count: { select: { lines: true } },
      },
    })

    return NextResponse.json(payrollRun, { status: 201 })
  } catch (error) {
    console.error('Error creating payroll run:', error)
    return NextResponse.json({ error: 'فشل في إنشاء مسير الرواتب' }, { status: 500 })
  }
}
