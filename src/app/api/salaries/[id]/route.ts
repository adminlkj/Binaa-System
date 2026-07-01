import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// FIX-A (AUDIT-2 Part A — HR Duplication Fix):
// Salary accrual JEs are posted ONLY by payroll-runs approval (PUT /api/payroll-runs/[id]
// with status=APPROVED). This screen no longer posts accrual JEs on approve — the salary
// record can be approved without posting a JE. This avoids double-posting when both the
// salaries and payroll-runs screens are used for the same employee/month. The helper
// `createSalaryAccrualJournalEntry` is no longer imported here (it remains exported from
// ../route.ts for backward compatibility with E2E tests that call it directly).

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const salary = await db.salary.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })
    if (!salary) {
      return NextResponse.json({ error: 'سجل الراتب غير موجود' }, { status: 404 })
    }
    return NextResponse.json(salary)
  } catch (error) {
    console.error('Error fetching salary:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجل الراتب' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.salary.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل الراتب غير موجود' }, { status: 404 })
    }

    // Status transitions: DRAFT → APPROVED → PAID
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['APPROVED'],
      APPROVED: ['PAID'],
      PAID: [],
    }

    if (body.status) {
      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `لا يمكن تغيير الحالة من ${existing.status} إلى ${body.status}` },
          { status: 400 }
        )
      }
    }

    let projectCostCreated = false

    // When approving: create project cost entry atomically (NO salary accrual JE).
    // FIX-A (AUDIT-2 Part A — HR Duplication Fix): the salary accrual JE is now posted
    // ONLY by payroll-runs approval. Approving a salary here just flips the status and
    // (optionally) records the project cost — no GL impact.
    if (body.status === 'APPROVED' && existing.status === 'DRAFT') {
      const result = await db.$transaction(async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { id: existing.employeeId },
          select: { name: true, nameAr: true },
        })

        const salaryDate = new Date(existing.year, existing.month - 1, 1)

        // Resolve cost center from project allocation
        const allocation = await tx.resourceAllocation.findFirst({
          where: {
            resourceType: 'EMPLOYEE',
            resourceId: existing.employeeId,
            startDate: { lte: salaryDate },
            OR: [{ endDate: null }, { endDate: { gte: salaryDate } }],
          },
        })

        // Project cost entry if employee is allocated (independent of GL accrual)
        if (allocation) {
          await tx.equipmentCost.create({
            data: {
              projectId: allocation.projectId,
              description: `راتب ${employee?.nameAr || employee?.name || ''} - ${existing.month}/${existing.year}`,
              amount: Number(existing.netSalary),
              date: salaryDate,
            },
          })
          projectCostCreated = true
        }

        return await tx.salary.update({
          where: { id },
          data: {
            status: 'APPROVED',
          },
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true } },
          },
        })
      })

      return NextResponse.json({ ...result, projectCostCreated })
    }

    const updated = await db.salary.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
      },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json({ ...updated, projectCostCreated })
  } catch (error) {
    console.error('Error updating salary:', error)
    const message = error instanceof Error ? error.message : 'فشل في تحديث سجل الراتب'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.salary.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل الراتب غير موجود' }, { status: 404 })
    }

    // Only allow deletion of DRAFT records
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف سجل راتب تم اعتماده' },
        { status: 400 }
      )
    }

    // R12: soft-delete instead of hard delete (preserves audit trail)
    await db.salary.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting salary:', error)
    return NextResponse.json({ error: 'فشل في حذف سجل الراتب' }, { status: 500 })
  }
}
