import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.salaryPayment.findUnique({
      where: { id },
      include: { payrollRun: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'سداد الرواتب غير موجود' }, { status: 404 })
    }

    // Don't allow deletion if payroll run is PAID (would need to reverse)
    if (existing.payrollRun.status === 'PAID') {
      return NextResponse.json(
        { error: 'لا يمكن حذف سداد رواتب لمسير مدفوع بالكامل' },
        { status: 400 }
      )
    }

    const payrollRunId = existing.payrollRunId

    // Delete the salary payment
    await db.salaryPayment.delete({ where: { id } })

    // Recalculate payroll run status
    const paidResult = await db.salaryPayment.aggregate({
      where: { payrollRunId },
      _sum: { amount: true },
    })
    const totalPaid = paidResult._sum.amount || 0
    const payrollRun = await db.payrollRun.findUnique({
      where: { id: payrollRunId },
    })

    if (payrollRun) {
      let newStatus = payrollRun.status
      if (totalPaid >= payrollRun.totalNet - 0.01) {
        newStatus = 'PAID'
      } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID'
      } else {
        // No payments left, revert to APPROVED
        newStatus = 'APPROVED'
      }

      if (newStatus !== payrollRun.status) {
        await db.payrollRun.update({
          where: { id: payrollRunId },
          data: { status: newStatus },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting salary payment:', error)
    return NextResponse.json({ error: 'فشل في حذف سداد الرواتب' }, { status: 500 })
  }
}
