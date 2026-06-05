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

    const basicSalary = parseFloat(body.basicSalary)
    const housingAllowance = body.housingAllowance ? parseFloat(body.housingAllowance) : 0
    const transportAllowance = body.transportAllowance ? parseFloat(body.transportAllowance) : 0
    const otherAllowances = body.otherAllowances ? parseFloat(body.otherAllowances) : 0
    const overtimeAmount = body.overtimeAmount ? parseFloat(body.overtimeAmount) : 0
    const deductions = body.deductions ? parseFloat(body.deductions) : 0

    // Auto-calculate netSalary
    const netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount - deductions

    let journalEntryId: string | null = null

    // If status is APPROVED, create accounting entry
    if (body.status === 'APPROVED') {
      try {
        const employee = await db.employee.findUnique({
          where: { id: body.employeeId },
          select: { name: true },
        })

        const entry = await autoEntryExpense({
          description: `راتب ${employee?.name || ''} - ${body.month}/${body.year}`,
          amount: netSalary,
          vatAmount: null,
          category: 'SALARIES',
          date: new Date(body.year, body.month - 1, 1),
          payFrom: 'TREASURY',
        })

        journalEntryId = entry.id
      } catch (entryError) {
        console.error('Error creating salary accounting entry:', entryError)
        // Continue without journal entry - don't block salary creation
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

    return NextResponse.json(salary, { status: 201 })
  } catch (error) {
    console.error('Error creating salary:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الراتب' }, { status: 500 })
  }
}
