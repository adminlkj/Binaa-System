import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'

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
        employee: {
          select: {
            id: true,
            code: true,
            name: true,
            nameAr: true,
            profession: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Convert Decimal values to numbers for JSON serialization
    const serialized = salaries.map(s => ({
      ...s,
      basicSalary: Number(s.basicSalary),
      housingAllowance: Number(s.housingAllowance),
      transportAllowance: Number(s.transportAllowance),
      otherAllowances: Number(s.otherAllowances),
      overtimeAmount: Number(s.overtimeAmount),
      deductions: Number(s.deductions),
      netSalary: Number(s.netSalary),
    }))

    return NextResponse.json(serialized)
  } catch (error) {
    console.error('Error fetching salary payments:', error)
    return NextResponse.json({ error: 'فشل في تحميل سداد الرواتب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const employeeId = body.employeeId
    const month = body.month
    const year = body.year
    const paymentMethod = body.paymentMethod || 'BANK'
    const notes = body.notes || null

    // Validate required fields
    if (!employeeId) {
      return NextResponse.json({ error: 'رقم الموظف مطلوب' }, { status: 400 })
    }
    if (!month || !year) {
      return NextResponse.json({ error: 'الشهر والسنة مطلوبان' }, { status: 400 })
    }

    // Find or create the salary record
    const existingSalary = await db.salary.findFirst({
      where: { employeeId, month, year },
    })

    if (!existingSalary) {
      // Get employee details to calculate salary
      const employee = await db.employee.findUnique({
        where: { id: employeeId },
      })

      if (!employee) {
        return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 })
      }

      // Create salary payment + journal entry in transaction
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const basicSalary = Number(employee.basicSalary || 0)
        const housingAllowance = Number(employee.housingAllowance || 0)
        const transportAllowance = Number(employee.transportAllowance || 0)
        const otherAllowances = Number(employee.otherAllowances || 0)
        const deductions = Number(body.deductions || 0)
        const netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances - deductions

        const salary = await tx.salary.create({
          data: {
            employeeId,
            projectId: body.projectId || null,
            activityType: body.activityType || 'GENERAL',
            month,
            year,
            basicSalary,
            housingAllowance,
            transportAllowance,
            otherAllowances,
            overtimeAmount: Number(body.overtimeAmount || 0),
            deductions,
            netSalary,
            status: 'PAID',
          },
          include: {
            employee: {
              select: {
                id: true,
                code: true,
                name: true,
                nameAr: true,
                profession: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
                nameAr: true,
                code: true,
              },
            },
          },
        })

        // Create accounting journal entry
        const creditAccountCode = paymentMethod === 'BANK' ? '1121' : '1110'
        const creditAccountName = paymentMethod === 'BANK' ? 'بنك الراجحي' : 'الصندوق (الخزينة)'

        try {
          const entry = await createJournalEntry({
            entryNo: `JE-SAL-${employee.code}-${month}${year}`,
            date: new Date(),
            description: `سداد راتب ${employee.nameAr || employee.name} - ${month}/${year}`,
            descriptionAr: `سداد راتب ${employee.nameAr || employee.name} - ${month}/${year}`,
            lines: [
              { accountCode: '3310', debit: netSalary, credit: 0, description: 'رواتب مستحقة' },
              { accountCode: creditAccountCode, debit: 0, credit: netSalary, description: creditAccountName },
            ],
            sourceType: 'SALARY_PAYMENT',
            sourceId: salary.id,
          }, tx)

          // Update salary with journal entry id
          await tx.salary.update({
            where: { id: salary.id },
            data: { journalEntryId: entry.id },
          })
        } catch (entryError) {
          console.error('Error creating salary payment journal entry:', entryError)
        }

        return salary
      })

      return NextResponse.json({
        ...result,
        basicSalary: Number(result.basicSalary),
        housingAllowance: Number(result.housingAllowance),
        transportAllowance: Number(result.transportAllowance),
        otherAllowances: Number(result.otherAllowances),
        overtimeAmount: Number(result.overtimeAmount),
        deductions: Number(result.deductions),
        netSalary: Number(result.netSalary),
      }, { status: 201 })
    } else {
      // Update existing salary to PAID status
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        const salary = await tx.salary.update({
          where: { id: existingSalary.id },
          data: { status: 'PAID' },
          include: {
            employee: {
              select: {
                id: true,
                code: true,
                name: true,
                nameAr: true,
                profession: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
                nameAr: true,
                code: true,
              },
            },
          },
        })

        // Create journal entry
        const netSalary = Number(salary.netSalary)
        const creditAccountCode = paymentMethod === 'BANK' ? '1121' : '1110'
        const creditAccountName = paymentMethod === 'BANK' ? 'بنك الراجحي' : 'الصندوق (الخزينة)'

        try {
          const entry = await createJournalEntry({
            entryNo: `JE-SAL-${salary.employee?.code || 'EMP'}-${month}${year}`,
            date: new Date(),
            description: `سداد راتب ${salary.employee?.nameAr || salary.employee?.name || ''} - ${month}/${year}`,
            descriptionAr: `سداد راتب ${salary.employee?.nameAr || salary.employee?.name || ''} - ${month}/${year}`,
            lines: [
              { accountCode: '3310', debit: netSalary, credit: 0, description: 'رواتب مستحقة' },
              { accountCode: creditAccountCode, debit: 0, credit: netSalary, description: creditAccountName },
            ],
            sourceType: 'SALARY_PAYMENT',
            sourceId: salary.id,
          }, tx)

          await tx.salary.update({
            where: { id: salary.id },
            data: { journalEntryId: entry.id },
          })
        } catch (entryError) {
          console.error('Error creating salary payment journal entry:', entryError)
        }

        return salary
      })

      return NextResponse.json({
        ...result,
        basicSalary: Number(result.basicSalary),
        housingAllowance: Number(result.housingAllowance),
        transportAllowance: Number(result.transportAllowance),
        otherAllowances: Number(result.otherAllowances),
        overtimeAmount: Number(result.overtimeAmount),
        deductions: Number(result.deductions),
        netSalary: Number(result.netSalary),
      }, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating salary payment:', error)
    return NextResponse.json({ error: 'فشل في تسجيل سداد الرواتب' }, { status: 500 })
  }
}
