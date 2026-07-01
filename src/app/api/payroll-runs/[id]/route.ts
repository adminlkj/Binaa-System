import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { createJournalEntry, getSalaryAccountCode, type PrismaTransaction } from '@/lib/accounting/engine'
import { AccountRole, requireAccountCodeByRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'

// ============================================================================
// مسير الرواتب - GET (تفاصيل) + PUT (تحديث الحالة) + DELETE (حذف المسودة)
//
// P4-CRIT-002 FIX: state machine — re-APPROVE from PAID/PARTIALLY_PAID is now blocked
//                 (was creating duplicate accrual JE without reversing the original).
// P4-CRIT-003 FIX: catch-all update now validates state transitions; silent demotion
//                 PAID → DRAFT/REVIEW is blocked (was producing orphaned JEs in GL).
// P4-CRIT-008 FIX: replaces hardcoded '3310','8210','3830' with role-based lookups
//                 (SALARIES_PAYABLE, GOSI_EXPENSE, GOSI_PAYABLE).
// P4-CRIT-009 FIX: now creates a deductions credit line when totalDeductions > 0
//                 (was missing → GL understated salary expense + Employee Advance asset inflated).
// ============================================================================

// Strict forward-only state machine. Demotion is blocked unless via explicit reversal flow.
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REVIEW', 'APPROVED'],
  REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['PAID', 'DRAFT'],
  PARTIALLY_PAID: ['PAID'],  // can still complete payment; cannot demote
  PAID: [],                  // terminal — no further state changes via this route
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.payrollRun.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'مسير الرواتب غير موجود' }, { status: 404 })
    }

    const newStatus = body.status

    // P4-CRIT-002/003 FIX: enforce strict state-machine transitions.
    // If newStatus is set, validate it's an allowed transition from existing.status.
    if (newStatus && newStatus !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || []
      if (!allowed.includes(newStatus)) {
        return NextResponse.json({
          error: `انتقال حالة غير صالح: ${existing.status} → ${newStatus}. الحالات المسموح بها من ${existing.status}: [${allowed.join(', ') || 'لا يوجد'}]`,
        }, { status: 400 })
      }
    }

    // ============ APPROVED: قيد الاستحقاق فقط ============
    // P4-CRIT-002 FIX: this branch is now only reachable from DRAFT/REVIEW (validated above).
    if (newStatus === 'APPROVED' && existing.status !== 'APPROVED') {
      const result = await db.$transaction(async (tx: PrismaTransaction) => {
        let journalEntryId: string | null = existing.journalEntryId

        // اجلب بنود المسير مع معلومات المشروع لتحديد نوع النشاط
        const lines = await tx.payrollRunLine.findMany({
          where: { payrollRunId: id },
          include: {
            project: { select: { id: true, projectType: true, costCenterId: true } },
          },
        })

        const salaryDate = new Date(existing.year, existing.month - 1, 1)

        // BA-08: resolve account codes by role — no hardcoded fallbacks.
        const payableCode = await requireAccountCodeByRole(AccountRole.SALARIES_PAYABLE, 'اعتماد مسير رواتب', tx)
        const gosiExpenseCode = await requireAccountCodeByRole(AccountRole.GOSI_EXPENSE, 'اعتماد مسير رواتب', tx)
        const gosiPayableCode = await requireAccountCodeByRole(AccountRole.GOSI_PAYABLE, 'اعتماد مسير رواتب', tx)
        // P4-CRIT-009 FIX: deductions are typically advance recoveries → credit EMPLOYEE_ADVANCE.
        const advanceCode = await requireAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, 'اعتماد مسير رواتب', tx)

        // تجميع البنود حسب نوع النشاط (PROJECT, RENTAL, ADMIN) لإنشاء قيود منفصلة
        const linesByActivity: Record<string, { totalNet: number; totalGosi: number; totalDeductions: number; costCenterId?: string }> = {}

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
            linesByActivity[activity] = { totalNet: 0, totalGosi: 0, totalDeductions: 0, costCenterId: undefined }
          }
          linesByActivity[activity].totalNet += Number(line.netSalary)
          linesByActivity[activity].totalGosi += Number(line.gosiDeduction)
          linesByActivity[activity].totalDeductions += Number(line.deductions)
          // P4-HIGH-010: propagate costCenterId from project (first line wins)
          if (!linesByActivity[activity].costCenterId && line.project?.costCenterId) {
            linesByActivity[activity].costCenterId = line.project.costCenterId
          }
        }

        // إنشاء قيود يومية لكل نوع نشاط (قيد استحقاق فقط)
        for (const [activity, totals] of Object.entries(linesByActivity)) {
          const salaryAccountCode = await getSalaryAccountCode(
            activity as 'PROJECT' | 'RENTAL' | 'ADMIN',
            tx,
          )
          const activityNameAr =
            activity === 'PROJECT' ? 'مشاريع' : activity === 'RENTAL' ? 'تأجير' : 'إدارية'

          // P4-CRIT-009 FIX: gross salary expense = totalNet + totalDeductions + totalGosi
          // (was: only totalNet, which understated expense and missed advance recovery).
          const grossExpense = totals.totalNet + totals.totalDeductions + totals.totalGosi

          const jeLines = [
            {
              accountCode: salaryAccountCode,
              debit: grossExpense,
              credit: 0,
              description: `رواتب ${activityNameAr} (إجمالي)`,
              costCenterId: totals.costCenterId,
            },
            // Credit Salaries Payable for the net amount (paid later)
            {
              accountCode: payableCode,
              debit: 0,
              credit: totals.totalNet,
              description: 'رواتب مستحقة (الصافي)',
            },
          ]

          // P4-CRIT-009 FIX: credit Employee Advance for deductions (advance recovery)
          if (totals.totalDeductions > 0) {
            jeLines.push({
              accountCode: advanceCode,
              debit: 0,
              credit: totals.totalDeductions,
              description: 'استرداد سلف الموظفين',
            })
          }

          // GOSI lines (Dr GOSI_EXPENSE / Cr GOSI_PAYABLE)
          if (totals.totalGosi > 0) {
            jeLines.push(
              {
                accountCode: gosiExpenseCode,
                debit: totals.totalGosi,
                credit: 0,
                description: 'تأمينات اجتماعية (حصة المنشأة)',
              },
              {
                accountCode: gosiPayableCode,
                debit: 0,
                credit: totals.totalGosi,
                description: 'تأمينات مستحقة',
              },
            )
          }

          try {
            // P1-4 FIX: entryNo now auto-generated via getNextEntryNo(tx) → JE-NNNNNN
            // (was JE-PAY-...-${Date.now()} which was non-sequential and collision-prone).
            const entry = await createJournalEntry({
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

        // BA-08: resolve payable code by role — no hardcoded fallback.
        const payableCode = await requireAccountCodeByRole(AccountRole.SALARIES_PAYABLE, 'سداد مسير رواتب', tx)

        // قيد الدفع: مدين رواتب مستحقة / دائن البنك
        const jeLines = [
          {
            accountCode: payableCode,
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

    // ============ REVIEW: تحويل المسير للمراجعة (بدون قيد محاسبي) ============
    // L3B-CRIT-003 FIX: DRAFT → REVIEW transition was declared allowed in VALID_TRANSITIONS
    // but had no handler branch — fell through to the catch-all 400. Now handled explicitly.
    if (newStatus === 'REVIEW' && existing.status === 'DRAFT') {
      const payrollRun = await db.payrollRun.update({
        where: { id },
        data: {
          status: 'REVIEW',
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
    }

    // Also allow REVIEW → DRAFT (return for editing) without any JE side-effects.
    if (newStatus === 'DRAFT' && existing.status === 'REVIEW') {
      const payrollRun = await db.payrollRun.update({
        where: { id },
        data: {
          status: 'DRAFT',
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
    }

    // P4-CRIT-003 FIX: catch-all update now ONLY allows non-status field updates (e.g. notes).
    // Status changes are validated above against the state machine.
    if (newStatus && newStatus !== existing.status) {
      // Should never reach here because the validation above already returned 400 for invalid transitions
      return NextResponse.json({
        error: `انتقال حالة غير صالح: ${existing.status} → ${newStatus}`,
      }, { status: 400 })
    }

    const payrollRun = await db.payrollRun.update({
      where: { id },
      data: {
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
    const message = error instanceof Error ? error.message : 'فشل في تحديث مسير الرواتب'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

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
