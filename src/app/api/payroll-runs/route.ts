import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// ============================================================================
// مسيرات الرواتب - GET (قائمة) + POST (إنشاء)
// المصدر الوحيد للحقيقة للقيود: JournalEntry المرتبط عبر journalEntryId
// ============================================================================

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const month = parseInt(body.month)
    const year = parseInt(body.year)
    const notes = body.notes || null
    // الفلاتر الاحترافية: ALL | TEAM | PROJECT | EMPLOYEE | SALARY_TYPE
    const selectionType: string = body.selectionType || 'ALL'
    const selectionIds: string[] = body.selectionIds || []
    const salaryTypeFilter: 'MONTHLY' | 'HOURLY' | null = body.salaryTypeFilter || null

    // Validate month/year
    if (!month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'شهر غير صالح' }, { status: 400 })
    }
    if (!year || year < 2000) {
      return NextResponse.json({ error: 'سنة غير صالحة' }, { status: 400 })
    }

    // ============ منع التكرار: التحقق من عدم وجود مسير لنفس الشهر/السنة ============
    const existingRun = await db.payrollRun.findFirst({
      where: { month, year, status: { not: 'DRAFT' } },
      select: { id: true, code: true, status: true },
    })
    if (existingRun) {
      return NextResponse.json({
        error: `يوجد مسير رواتب معتمد بالفعل للفترة ${month}/${year} (${existingRun.code}). لا يمكن إنشاء مسير مكرر لنفس الفترة`,
      }, { status: 400 })
    }

    // السماح بمسير مسودة واحد فقط لكل فترة
    const existingDraft = await db.payrollRun.findFirst({
      where: { month, year, status: 'DRAFT' },
      select: { id: true, code: true },
    })
    if (existingDraft) {
      return NextResponse.json({
        error: `يوجد مسير رواتب مسودة للفترة ${month}/${year} (${existingDraft.code}). يرجى حذفه أو اعتماده قبل إنشاء مسير جديد`,
      }, { status: 400 })
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

    // ============ بناء شرط WHERE للموظفين حسب نوع الاختيار ============
    const employeeWhere: Record<string, unknown> = {
      isActive: true,
      status: 'ACTIVE',
      deletedAt: null,
    }

    if (salaryTypeFilter) {
      employeeWhere.salaryType = salaryTypeFilter
    }

    if (selectionType === 'TEAM' && selectionIds.length > 0) {
      employeeWhere.teamMemberships = { some: { teamId: { in: selectionIds } } }
    } else if (selectionType === 'PROJECT' && selectionIds.length > 0) {
      // الموظفون الأعضاء في فرق تنتمي للمشروع المحدد
      employeeWhere.teamMemberships = {
        some: { team: { projectId: { in: selectionIds } } },
      }
    } else if (selectionType === 'EMPLOYEE' && selectionIds.length > 0) {
      employeeWhere.id = { in: selectionIds }
    }

    const employees = await db.employee.findMany({
      where: employeeWhere,
      select: {
        id: true, code: true, name: true, nameAr: true,
        salaryType: true, basicSalary: true,
        housingAllowance: true, transportAllowance: true, otherAllowances: true,
        hourlyRate: true, referenceMonthlyHours: true,
        hasGosi: true, gosiPercentage: true,
        teamMemberships: {
          select: {
            teamId: true,
            team: { select: { id: true, projectId: true } },
          },
        },
      },
      orderBy: { code: 'asc' },
    })

    if (employees.length === 0) {
      return NextResponse.json({
        error: 'لم يتم العثور على موظفين مطابقين لمعايير الفلترة',
      }, { status: 400 })
    }

    // Calculate date range for attendance (for hourly employees)
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1) // first day of next month

    // ============ بناء بنود المسير ============
    type LineData = {
      employeeId: string
      workTeamId: string | null
      projectId: string | null
      salaryType: 'MONTHLY' | 'HOURLY'
      basicSalary: number
      housingAllowance: number
      transportAllowance: number
      otherAllowances: number
      hourlyRate: number
      workHours: number
      hourlySalary: number
      overtimeAmount: number
      deductions: number
      gosiDeduction: number
      totalEntitlement: number
      netSalary: number
    }

    const linesData: LineData[] = []
    let totalAmount = 0
    let totalDeductions = 0
    let totalGosi = 0
    let totalNet = 0

    for (const emp of employees) {
      let lineTotalEntitlement = 0
      let lineWorkHours = 0
      let lineHourlyRate = 0
      let lineHourlySalary = 0
      let lineOvertimeAmount = 0
      const lineDeductions = 0
      let lineBasicSalary = 0
      let lineHousingAllowance = 0
      let lineTransportAllowance = 0
      let lineOtherAllowances = 0

      if (emp.salaryType === 'MONTHLY') {
        lineBasicSalary = Number(emp.basicSalary)
        lineHousingAllowance = Number(emp.housingAllowance)
        lineTransportAllowance = Number(emp.transportAllowance)
        lineOtherAllowances = Number(emp.otherAllowances)
        lineTotalEntitlement =
          lineBasicSalary + lineHousingAllowance + lineTransportAllowance + lineOtherAllowances
      } else {
        // HOURLY: اجلب ساعات الحضور للشهر المحدد من سجلات الحضور
        const attendance = await db.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: startDate, lt: endDate },
          },
          select: { workHours: true, overtimeHours: true },
        })

        lineWorkHours = attendance.reduce(
          (sum, a) => sum + Number(a.workHours || 0),
          0,
        )
        const totalOvertimeHours = attendance.reduce(
          (sum, a) => sum + Number(a.overtimeHours || 0),
          0,
        )

        lineHourlyRate = Number(emp.hourlyRate || 0)
        lineHourlySalary = lineWorkHours * lineHourlyRate
        lineOvertimeAmount = totalOvertimeHours * lineHourlyRate * 1.5 // عمل إضافي بمعدل 1.5x
        lineTotalEntitlement = lineHourlySalary + lineOvertimeAmount
      }

      // استقطاع التأمينات الاجتماعية
      const gosiDeduction = emp.hasGosi
        ? lineTotalEntitlement * (Number(emp.gosiPercentage) / 100)
        : 0

      const netSalary = lineTotalEntitlement - lineDeductions - gosiDeduction

      // تحديد فريق العمل والمشروع من عضوية الموظف في الفرق
      let lineWorkTeamId: string | null = null
      let lineProjectId: string | null = null
      if (emp.teamMemberships.length > 0) {
        const firstMembership = emp.teamMemberships[0]
        lineWorkTeamId = firstMembership.teamId
        lineProjectId = firstMembership.team.projectId || null
      }

      linesData.push({
        employeeId: emp.id,
        workTeamId: lineWorkTeamId,
        projectId: lineProjectId,
        salaryType: emp.salaryType,
        basicSalary: lineBasicSalary,
        housingAllowance: lineHousingAllowance,
        transportAllowance: lineTransportAllowance,
        otherAllowances: lineOtherAllowances,
        hourlyRate: lineHourlyRate,
        workHours: lineWorkHours,
        hourlySalary: lineHourlySalary,
        overtimeAmount: lineOvertimeAmount,
        deductions: lineDeductions,
        gosiDeduction,
        totalEntitlement: lineTotalEntitlement,
        netSalary,
      })

      totalAmount += lineTotalEntitlement
      totalDeductions += lineDeductions
      totalGosi += gosiDeduction
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
        totalGosi,
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
            project: { select: { id: true, code: true, name: true, nameAr: true } },
            workTeam: { select: { id: true, code: true, name: true, nameAr: true } },
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
