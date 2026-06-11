import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryExpense } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (employeeId) where.employeeId = employeeId
    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)
    if (status) where.status = status

    const salaries = await db.salary.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
    return NextResponse.json(salaries)
  } catch (error) {
    console.error('Error fetching salaries:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الرواتب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const basicSalary = parseFloat(body.basicSalary) || 0
    const housingAllowance = body.housingAllowance ? parseFloat(body.housingAllowance) : 0
    const transportAllowance = body.transportAllowance ? parseFloat(body.transportAllowance) : 0
    const otherAllowances = body.otherAllowances ? parseFloat(body.otherAllowances) : 0
    const overtimeAmount = body.overtimeAmount ? parseFloat(body.overtimeAmount) : 0
    const deductions = body.deductions ? parseFloat(body.deductions) : 0

    // Auto-calculate netSalary
    const netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount - deductions

    let journalEntryId: string | null = null
    let projectCostCreated = false

    // If status is APPROVED, create accounting entry and project cost entry
    if (body.status === 'APPROVED') {
      const employee = await db.employee.findUnique({
        where: { id: body.employeeId },
        select: { id: true, name: true },
      })

      const salaryDate = new Date(body.year, body.month - 1, 1)

      // Check if employee is allocated to a project
      const allocation = await db.resourceAllocation.findFirst({
        where: {
          resourceType: 'EMPLOYEE',
          resourceId: body.employeeId,
          startDate: { lte: salaryDate },
          OR: [{ endDate: null }, { endDate: { gte: salaryDate } }],
        },
      })

      // Determine cost center
      let costCenterId: string | undefined
      if (allocation) {
        // Look up cost center for the project
        const project = await db.project.findUnique({
          where: { id: allocation.projectId },
          select: { id: true, code: true, name: true },
        })
        if (project) {
          const costCenter = await db.costCenter.findFirst({
            where: { code: project.code },
          })
          if (costCenter) costCenterId = costCenter.id
        }
      }

      // Create accounting entry
      try {
        const entry = await autoEntryExpense({
          description: `راتب ${employee?.name || ''} - ${body.month}/${body.year}`,
          amount: netSalary,
          vatAmount: null,
          category: 'SALARIES',
          date: salaryDate,
          payFrom: 'TREASURY',
          costCenterId,
        })
        journalEntryId = entry.id
      } catch (entryError) {
        console.error('Error creating salary accounting entry:', entryError)
        // Continue without journal entry - don't block salary creation
      }

      // Create project cost entry if employee is allocated
      if (allocation) {
        try {
          await db.equipmentCost.create({
            data: {
              projectId: allocation.projectId,
              description: `راتب ${employee?.name || ''} - ${body.month}/${body.year}`,
              amount: netSalary,
              date: salaryDate,
            },
          })
          projectCostCreated = true
        } catch (costError) {
          console.error('Error creating project cost entry:', costError)
          // Don't block salary creation
        }
      }
    }

    const salary = await db.salary.create({
      data: {
        employeeId: body.employeeId,
        month: parseInt(body.month),
        year: parseInt(body.year),
        basicSalary,
        housingAllowance,
        transportAllowance,
        otherAllowances,
        overtimeAmount,
        deductions,
        netSalary,
        status: body.status || 'DRAFT',
        journalEntryId,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json({ ...salary, projectCostCreated }, { status: 201 })
  } catch (error) {
    console.error('Error creating salary:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الراتب' }, { status: 500 })
  }
}
