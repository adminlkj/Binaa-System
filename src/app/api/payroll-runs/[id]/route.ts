import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry, getSalaryAccountCode } from '@/lib/accounting/engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payrollRun = await db.payrollRun.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true, salaryType: true } },
            project: { select: { id: true, code: true, name: true, nameAr: true } },
          },
          orderBy: { employee: { code: 'asc' } },
        },
        salaryPayments: true,
      },
    })

    if (!payrollRun) {
      return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
    }

    return NextResponse.json(payrollRun)
  } catch (error) {
    console.error('Error fetching payroll run:', error)
    return NextResponse.json({ error: 'فشل في تحميل مسير الرواتب' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.payrollRun.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
    }

    const newStatus = body.status
    let journalEntryId: string | null = existing.journalEntryId

    // When status changes to APPROVED, create accounting journal entries
    if (newStatus === 'APPROVED' && existing.status !== 'APPROVED') {
      // Get payroll lines with project info to determine activity type
      const lines = await db.payrollRunLine.findMany({
        where: { payrollRunId: id },
        include: {
          project: { select: { id: true, projectType: true } },
        },
      })

      const salaryDate = new Date(existing.year, existing.month - 1, 1)

      // Group lines by activity type (PROJECT, RENTAL, ADMIN) to create separate journal entries
      const linesByActivity: Record<string, { totalNet: number; totalGosi: number }> = {}

      for (const line of lines) {
        const projectType = line.project?.projectType
        let activity: 'PROJECT' | 'RENTAL' | 'ADMIN'
        if (projectType === 'EQUIPMENT_RENTAL') {
          activity = 'RENTAL'
        } else if (projectType === 'CONSTRUCTION' || line.projectId) {
          activity = 'PROJECT'
        } else {
          activity = 'ADMIN'
        }

        if (!linesByActivity[activity]) {
          linesByActivity[activity] = { totalNet: 0, totalGosi: 0 }
        }
        linesByActivity[activity].totalNet += line.netSalary
        linesByActivity[activity].totalGosi += line.gosiDeduction
      }

      // Create journal entries for each activity type
      for (const [activity, totals] of Object.entries(linesByActivity)) {
        const salaryAccountCode = getSalaryAccountCode(activity as 'PROJECT' | 'RENTAL' | 'ADMIN')
        const activityNameAr = activity === 'PROJECT' ? 'مشاريع' : activity === 'RENTAL' ? 'تأجير' : 'إدارية'

        const jeLines = [
          { accountCode: salaryAccountCode, debit: totals.totalNet, credit: 0, description: `رواتب ${activityNameAr}` },
          { accountCode: '3310', debit: 0, credit: totals.totalNet, description: 'رواتب مستحقة' },
        ]

        if (totals.totalGosi > 0) {
          jeLines.push(
            { accountCode: '8210', debit: totals.totalGosi, credit: 0, description: 'تأمينات اجتماعية' },
            { accountCode: '3830', debit: 0, credit: totals.totalGosi, description: 'تأمينات مستحقة' },
          )
        }

        try {
          const entry = await createJournalEntry({
            entryNo: `JE-PAY-${existing.code}-${activity}`,
            date: salaryDate,
            description: `مسير رواتب ${existing.code} - ${activityNameAr} - ${existing.month}/${existing.year}`,
            descriptionAr: `مسير رواتب ${existing.code} - ${activityNameAr} - ${existing.month}/${existing.year}`,
            lines: jeLines,
            sourceType: 'PAYROLL_RUN',
            sourceId: existing.code,
          })
          journalEntryId = entry.id
        } catch (entryError) {
          console.error('Error creating payroll journal entry:', entryError)
          // Continue without journal entry - don't block approval
        }
      }
    }

    const payrollRun = await db.payrollRun.update({
      where: { id },
      data: {
        status: newStatus || existing.status,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        journalEntryId,
      },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true } },
            project: { select: { id: true, code: true, name: true, nameAr: true } },
          },
        },
      },
    })

    return NextResponse.json(payrollRun)
  } catch (error) {
    console.error('Error updating payroll run:', error)
    return NextResponse.json({ error: 'فشل في تحديث مسير الرواتب' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.payrollRun.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
    }

    // Only allow deletion of DRAFT payroll runs
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({ error: 'لا يمكن حذف مسير الرواتب إلا في حالة المسودة' }, { status: 400 })
    }

    // Delete lines first (cascade should handle this, but be explicit)
    await db.payrollRunLine.deleteMany({ where: { payrollRunId: id } })
    await db.payrollRun.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payroll run:', error)
    return NextResponse.json({ error: 'فشل في حذف مسير الرواتب' }, { status: 500 })
  }
}
