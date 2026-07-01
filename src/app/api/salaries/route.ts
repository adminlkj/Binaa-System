import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { requireAccountByRole, AccountRole } from '@/lib/account-roles'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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

/**
 * Salary accrual journal entry.
 * Accounting model (correct double-entry):
 *   Dr PAYROLL_EXPENSE     netSalary      (expense recognized)
 *   Cr SALARIES_PAYABLE    netSalary      (liability until paid)
 *
 * The cash credit happens later in salary-payments/route.ts when the salary
 * is actually paid (Dr SALARIES_PAYABLE / Cr Cash). This avoids the prior bug
 * where cash was debited twice (once at approve via autoEntryExpense, once at
 * payment) and Salaries_Payable went negative.
 */
export async function createSalaryAccrualJournalEntry(
  args: {
    employeeName: string
    netSalary: number
    salaryDate: Date
    month: number
    year: number
    costCenterId?: string
    salaryId: string
  },
  tx: PrismaTransaction
) {
  const payrollAccount = await requireAccountByRole(AccountRole.PAYROLL_EXPENSE, 'استحقاق راتب', tx)
  const payableAccount = await requireAccountByRole(AccountRole.SALARIES_PAYABLE, 'استحقاق راتب', tx)
  const desc = `استحقاق راتب ${args.employeeName} - ${args.month}/${args.year}`
  return createJournalEntry({
    entryNo: `JE-SAL-ACCRUE-${args.salaryId}`,
    date: args.salaryDate,
    description: `Salary accrual - ${args.employeeName} - ${args.month}/${args.year}`,
    descriptionAr: desc,
    lines: [
      {
        accountCode: payrollAccount.code,
        debit: args.netSalary,
        credit: 0,
        description: desc,
        costCenterId: args.costCenterId,
      },
      {
        accountCode: payableAccount.code,
        debit: 0,
        credit: args.netSalary,
        description: desc,
      },
    ],
    sourceType: 'SALARY_ACCRUAL',
    sourceId: args.salaryId,
  }, tx)
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()

    const basicSalary = parseFloat(body.basicSalary) || 0
    const housingAllowance = body.housingAllowance ? parseFloat(body.housingAllowance) : 0
    const transportAllowance = body.transportAllowance ? parseFloat(body.transportAllowance) : 0
    const otherAllowances = body.otherAllowances ? parseFloat(body.otherAllowances) : 0
    const overtimeAmount = body.overtimeAmount ? parseFloat(body.overtimeAmount) : 0
    const deductions = body.deductions ? parseFloat(body.deductions) : 0

    const netSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances + overtimeAmount - deductions

    // Atomic: salary record + accrual JE + project cost in one transaction.
    // R1 enforced — if the JE fails, the salary record is rolled back too.
    const { salary, projectCostCreated } = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the salary record first so we have a stable sourceId for the JE
      const created = await tx.salary.create({
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
        },
        include: {
          employee: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      let journalEntryId: string | null = null
      let projectCostCreated = false

      // If status is APPROVED, create accrual JE + project cost entry
      if (body.status === 'APPROVED') {
        const employee = created.employee
        const salaryDate = new Date(body.year, body.month - 1, 1)

        // Resolve cost center from project allocation (NOT projectId-as-costCenterId)
        let costCenterId: string | undefined
        const allocation = await tx.resourceAllocation.findFirst({
          where: {
            resourceType: 'EMPLOYEE',
            resourceId: body.employeeId,
            startDate: { lte: salaryDate },
            OR: [{ endDate: null }, { endDate: { gte: salaryDate } }],
          },
        })
        if (allocation) {
          const project = await tx.project.findUnique({
            where: { id: allocation.projectId },
            select: { id: true, code: true, name: true },
          })
          if (project) {
            const costCenter = await tx.costCenter.findFirst({
              where: { code: project.code },
            })
            if (costCenter) costCenterId = costCenter.id
          }
        }

        // Accrual JE: Dr Payroll / Cr Salaries Payable (NO cash movement yet)
        const entry = await createSalaryAccrualJournalEntry({
          employeeName: employee.nameAr || employee.name || '',
          netSalary,
          salaryDate,
          month: parseInt(body.month),
          year: parseInt(body.year),
          costCenterId,
          salaryId: created.id,
        }, tx)
        journalEntryId = entry.id

        // Project cost entry if employee is allocated
        if (allocation) {
          await tx.equipmentCost.create({
            data: {
              projectId: allocation.projectId,
              description: `راتب ${employee.nameAr || employee.name || ''} - ${body.month}/${body.year}`,
              amount: netSalary,
              date: salaryDate,
            },
          })
          projectCostCreated = true
        }
      }

      // Attach journalEntryId
      if (journalEntryId) {
        await tx.salary.update({
          where: { id: created.id },
          data: { journalEntryId },
        })
      }

      const withJe = await tx.salary.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          employee: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
      return { salary: withJe, projectCostCreated }
    })

    return NextResponse.json({ ...salary, projectCostCreated }, { status: 201 })
  } catch (error) {
    console.error('Error creating salary:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء سجل الراتب'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
