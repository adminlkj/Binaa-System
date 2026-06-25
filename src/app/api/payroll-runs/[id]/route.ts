import { db } from '@/lib/db'
import { createJournalEntry, getSalaryAccountCode, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============================================================================
// مسير الرواتب - GET (تفاصيل) + PUT (تحديث الحالة) + DELETE (حذف المسودة)
// القواعد:
//   - APPROVED: ينشئ قيد استحقاق فقط (مدين 8110/7120/7210 / دائن 3310)
//   - PAID: يتحقق من bankAccountCode + journalEntryId موجود + totalNet > 0
//           ثم ينشئ قيد دفع مستقل (مدين 3310 / دائن البنك)
// ============================================================================

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
            workTeam: { select: { id: true, code: true, name: true, nameAr: true } },
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

    // ============ APPROVED: قيد الاستحقاق فقط ============
    if (newStatus === 'APPROVED' && existing.status !== 'APPROVED') {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        let journalEntryId: string | null = existing.journalEntryId

        // اجلب بنود المسير مع معلومات المشروع لتحديد نوع النشاط
        const lines = await tx.payrollRunLine.findMany({
          where: { payrollRunId: id },
          include: {
            project: { select: { id: true, projectType: true } },
          },
        })

        const salaryDate = new Date(existing.year, existing.month -  1, 1)

        // تجميع البنود حسب نوع النشاط (PROJECT, RENTAL, ADMIN) لإنشاء قيود منفصلة
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
          linesByActivity[activity].totalNet += Number(line.netSalary)
          linesByActivity[activity].totalGosi += Number(line.gosiDeduction)
        }

        // إنشاء قيود يومية لكل نوع نشاط (قيد استحقاق فقط)
        for (const [activity, totals] of Object.entries(linesByActivity)) {
          const salaryAccountCode = await getSalaryAccountCode(
            activity as 'PROJECT' | 'RENTAL' | 'ADMIN',
            tx,
          )
          const activityNameAr =
            activity === 'PROJECT' ? 'مشاريع' : activity === 'RENTAL' ? 'تأجير' : 'إدارية'

          const jeLines = [
            {
              accountCode: salaryAccountCode,
              debit: totals.totalNet,
              credit: 0,
              description: `رواتب ${activityNameAr}`,
            },
            {
              accountCode: '3310',
              debit: 0,
              credit: totals.totalNet,
              description: 'رواتب مستحقة',
            },
          ]

          if (totals.totalGosi > 0) {
            jeLines.push(
              {
                accountCode: '8210',
                debit: totals.totalGosi,
                credit: 0,
                description: 'تأمينات اجتماعية',
              },
              {
                accountCode: '3830',
                debit: 0,
                credit: totals.totalGosi,
                description: 'تأمينات مستحقة',
              },
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
            }, tx)
            journalEntryId = entry.id
          } catch (entryError) {
            console.error('Error creating payroll journal entry:', entryError)
            throw entryError
          }
        }

        return await tx.payrollRun.update({
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
                workTeam: { select: { id: true, code: true, name: true, nameAr: true } },
              },
            },
          },
        })
      })

      return NextResponse.json(result)
    }

    // ============ PAID: قيد الدفع (مدين 3310 / دائن البنك) ============
    if (newStatus === 'PAID' && existing.status !== 'PAID') {
      // التحقق من وجود قيد الاستحقاق أولاً
      if (!existing.journalEntryId) {
        return NextResponse.json({
          error: 'يجب اعتماد المسير أولاً (APPROVED) لإنشاء قيد الاستحقاق قبل الدفع',
        }, { status: 400 })
      }

      if (!body.bankAccountCode) {
        return NextResponse.json({
          error: 'يجب تحديد الحساب البنكي/النقدي للدفع',
        }, { status: 400 })
      }

      if (Number(existing.totalNet) <= 0) {
        return NextResponse.json({
          error: 'صافي الرواتب يجب أن يكون أكبر من صفر',
        }, { status: 400 })
      }

      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        let paymentJournalEntryId: string | null = existing.paymentJournalEntryId

        const salaryDate = new Date(existing.year, existing.month - 1, 1)
        const totalNet = Number(existing.totalNet)
        const bankAccountCode = String(body.bankAccountCode)
        const bankAccountNameAr = String(body.bankAccountNameAr || 'البنك')

        // قيد الدفع: مدين رواتب مستحقة / دائن البنك
        const jeLines = [
          {
            accountCode: '3310',
            debit: totalNet,
            credit: 0,
            description: 'سداد رواتب مستحقة',
          },
          {
            accountCode: bankAccountCode,
            debit: 0,
            credit: totalNet,
            description: `سداد من ${bankAccountNameAr}`,
          },
        ]

        try {
          const entry = await createJournalEntry({
            entryNo: `JE-PAYP-${existing.code}`,
            date: salaryDate,
            description: `سداد مسير رواتب ${existing.code} - ${existing.month}/${existing.year}`,
            descriptionAr: `سداد مسير رواتب ${existing.code} - ${existing.month}/${existing.year}`,
            lines: jeLines,
            sourceType: 'PAYROLL_PAYMENT',
            sourceId: existing.code,
          }, tx)
          paymentJournalEntryId = entry.id
        } catch (entryError) {
          console.error('Error creating payroll payment journal entry:', entryError)
          throw entryError
        }

        return await tx.payrollRun.update({
          where: { id },
          data: {
            status: 'PAID',
            notes: body.notes !== undefined ? body.notes : existing.notes,
            paymentJournalEntryId,
            paymentAccountCode: bankAccountCode,
            paymentAccountNameAr: bankAccountNameAr,
          },
          include: {
            lines: {
              include: {
                employee: { select: { id: true, code: true, name: true, nameAr: true } },
                project: { select: { id: true, code: true, name: true, nameAr: true } },
                workTeam: { select: { id: true, code: true, name: true, nameAr: true } },
              },
            },
          },
        })
      })

      return NextResponse.json(result)
    }

    // تحديث عام (الحالة أو الملاحظات فقط)
    const payrollRun = await db.payrollRun.update({
      where: { id },
      data: {
        status: newStatus || existing.status,
        notes: body.notes !== undefined ? body.notes : existing.notes,
      },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, code: true, name: true, nameAr: true } },
            project: { select: { id: true, code: true, name: true, nameAr: true } },
            workTeam: { select: { id: true, code: true, name: true, nameAr: true } },
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

    // لا يمكن حذف إلا المسيرات في حالة المسودة
    if (existing.status !== 'DRAFT') {
      return NextResponse.json({
        error: 'لا يمكن حذف مسير الرواتب إلا في حالة المسودة',
      }, { status: 400 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      await tx.payrollRunLine.deleteMany({ where: { payrollRunId: id } })
      await tx.payrollRun.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payroll run:', error)
    return NextResponse.json({ error: 'فشل في حذف مسير الرواتب' }, { status: 500 })
  }
}
