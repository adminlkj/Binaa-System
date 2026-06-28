import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// ============================================================================
// سداد الرواتب [id] — SalaryPayment [id]
// P4-CRIT-007 FIX:
//   - Was: null-pointer on `existing.payrollRun.status` when payrollRunId is null
//   - Was: hard-delete with NO JE reversal (R12 violated — orphaned JEs in GL)
//   - Was: status demotion not propagated to Salary
// Now:
//   - Guards null payrollRun
//   - Reverses the linked JE via reverseEntry() (R12 compliant — swapped D/C, original kept POSTED)
//   - Reverts Salary.status from PAID → APPROVED
//   - Wrapped in $transaction (atomic)
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const payment = await db.salaryPayment.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true, profession: true } },
        payrollRun: { select: { id: true, code: true, month: true, year: true, status: true } },
      },
    })
    if (!payment) {
      return NextResponse.json({ error: 'سداد الرواتب غير موجود' }, { status: 404 })
    }
    return NextResponse.json({
      ...payment,
      amount: Number(payment.amount),
    })
  } catch (error) {
    console.error('Error fetching salary payment:', error)
    return NextResponse.json({ error: 'فشل في تحميل سداد الرواتب' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.salaryPayment.findUnique({
      where: { id },
      include: { payrollRun: { select: { id: true, code: true, status: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'سداد الرواتب غير موجود' }, { status: 404 })
    }

    // P4-CRIT-007 FIX: guard null payrollRun (payrollRunId is nullable)
    if (existing.payrollRunId && existing.payrollRun?.status === 'PAID') {
      return NextResponse.json(
        { error: 'لا يمكن حذف سداد رواتب لمسير مدفوع بالكامل' },
        { status: 400 }
      )
    }

    // Atomic: reverse JE + delete SalaryPayment + revert Salary status + recompute PayrollRun status
    await db.$transaction(async (tx: PrismaTransaction) => {
      // P4-CRIT-007 FIX: reverse the linked JE (R12 compliant — swapped D/C, original kept POSTED).
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      // Revert Salary.status from PAID → APPROVED (the salary was the source of this payment)
      // We identify the salary by (employeeId, month, year) — derived from payrollRun if present,
      // otherwise we can't safely identify it (rare case).
      if (existing.payrollRunId && existing.payrollRun) {
        const salary = await tx.salary.findFirst({
          where: {
            employeeId: existing.employeeId,
            month: existing.payrollRun.month,
            year: existing.payrollRun.year,
            status: 'PAID',
          },
        })
        if (salary) {
          await tx.salary.update({
            where: { id: salary.id },
            data: { status: 'APPROVED' },
          })
        }
      }

      // Delete the salary payment record
      await tx.salaryPayment.delete({ where: { id } })

      // Recalculate payroll run status if applicable
      if (existing.payrollRunId) {
        const paidResult = await tx.salaryPayment.aggregate({
          where: { payrollRunId: existing.payrollRunId },
          _sum: { amount: true },
        })
        const totalPaid = Number(paidResult._sum.amount || 0)
        const payrollRun = await tx.payrollRun.findUnique({
          where: { id: existing.payrollRunId },
        })

        if (payrollRun) {
          let newStatus = payrollRun.status
          if (totalPaid >= Number(payrollRun.totalNet) - 0.01) {
            newStatus = 'PAID'
          } else if (totalPaid > 0) {
            newStatus = 'PARTIALLY_PAID'
          } else {
            newStatus = 'APPROVED'
          }

          if (newStatus !== payrollRun.status) {
            await tx.payrollRun.update({
              where: { id: existing.payrollRunId },
              data: { status: newStatus },
            })
          }
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting salary payment:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف سداد الرواتب'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
