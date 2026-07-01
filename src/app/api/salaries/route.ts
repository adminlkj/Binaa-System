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
 * Salary accrual journal entry helper.
 *
 * IMPORTANT (FIX-A / AUDIT-2 Part A — HR Duplication Fix):
 * This helper is RETAINED for backward compatibility with existing E2E tests
 * (scripts/e2e-payroll-cycle.ts calls it directly to verify the accounting
 * model). However, it is NO LONGER called by the salaries API routes
 * (POST /api/salaries, PUT /api/salaries/[id]).
 *
 * Salary accrual JEs are now posted ONLY by the payroll-runs approval flow
 * (PUT /api/payroll-runs/[id] with status=APPROVED). That flow correctly posts
 * Dr PAYROLL_EXPENSE + Dr GOSI_EXPENSE / Cr SALARIES_PAYABLE + Cr GOSI_PAYABLE
 * (with optional Cr EMPLOYEE_ADVANCE for deductions) and is the single source
 * of truth for salary accruals. The salaries screen creates salary records
 * (DRAFT / APPROVED) that can be included in a payroll run — it no longer
 * posts accrual JEs to avoid double-posting when both screens are used for
 * the same employee/month.
 *
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

    // FIX-A (AUDIT-2 Part A — HR Duplication Fix):
    // Salary accrual JEs are posted ONLY by payroll-runs approval (PUT /api/payroll-runs/[id]
    // with status=APPROVED). This screen creates salary records that can be included in a
    // payroll run — it no longer posts accrual JEs to avoid double-posting when both screens
    // are used for the same employee/month. The salary record is created as a DRAFT (or
    // APPROVED — but with no JE posted in either case). Project cost tracking (EquipmentCost)
    // is preserved when the salary is approved, as it is independent of the GL accrual.
    const { salary, projectCostCreated } = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the salary record first so we have a stable sourceId for any downstream links.
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

      let projectCostCreated = false

      // If status is APPROVED, create the project cost entry (EquipmentCost) only.
      // NO salary accrual JE is posted from this screen — see comment above.
      if (body.status === 'APPROVED') {
        const employee = created.employee
        const salaryDate = new Date(body.year, body.month - 1, 1)

        // Resolve cost center from project allocation (NOT projectId-as-costCenterId)
        const allocation = await tx.resourceAllocation.findFirst({
          where: {
            resourceType: 'EMPLOYEE',
            resourceId: body.employeeId,
            startDate: { lte: salaryDate },
            OR: [{ endDate: null }, { endDate: { gte: salaryDate } }],
          },
        })

        // Project cost entry if employee is allocated (independent of GL accrual)
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
