import { db } from '@/lib/db'
import { autoEntryExpense, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    let journalEntryId = existing.journalEntryId
    let projectCostCreated = false

    // When approving: create accounting entry and project cost
    if (body.status === 'APPROVED' && existing.status === 'DRAFT') {
      try {
        await initializeChartOfAccounts()
        const employee = await db.employee.findUnique({
          where: { id: existing.employeeId },
          select: { name: true },
        })

        const entry = await autoEntryExpense({
          description: `راتب ${employee?.name || ''} - ${existing.month}/${existing.year}`,
          amount: existing.netSalary,
          vatAmount: null,
          category: 'SALARIES',
          date: new Date(existing.year, existing.month - 1, 1),
          payFrom: 'TREASURY',
        })
        journalEntryId = entry.id

        // Check if employee is allocated to a project
        const salaryDate = new Date(existing.year, existing.month - 1, 1)
        const allocation = await db.resourceAllocation.findFirst({
          where: {
            resourceType: 'EMPLOYEE',
            resourceId: existing.employeeId,
            startDate: { lte: salaryDate },
            OR: [{ endDate: null }, { endDate: { gte: salaryDate } }],
          },
        })

        if (allocation) {
          await db.equipmentCost.create({
            data: {
              projectId: allocation.projectId,
              description: `راتب ${employee?.name || ''} - ${existing.month}/${existing.year}`,
              amount: existing.netSalary,
              date: salaryDate,
            },
          })
          projectCostCreated = true
        }
      } catch (accountingError) {
        console.error('Error creating salary accounting entry:', accountingError)
      }
    }

    const updated = await db.salary.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(journalEntryId !== existing.journalEntryId && { journalEntryId }),
      },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json({ ...updated, projectCostCreated })
  } catch (error) {
    console.error('Error updating salary:', error)
    return NextResponse.json({ error: 'فشل في تحديث سجل الراتب' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    await db.salary.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting salary:', error)
    return NextResponse.json({ error: 'فشل في حذف سجل الراتب' }, { status: 500 })
  }
}
