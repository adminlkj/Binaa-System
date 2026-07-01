import { requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { autoEntryAdvanceSettlement, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// P4-CRIT-006 FIX: was reading Employee.position (non-existent field — every settle from UI crashed with 500).
// Now reads `profession` and reuses the bulk-PUT logic (advance update + autoEntryAdvanceSettlement JE in $transaction).
// The settlement JE itself uses the corrected Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE (see engine.ts P4-CRIT-010).
//
// USER-EMPOWERING UPDATE: now respects settlementMethod + settlementDate chosen by the user
// (المستخدم سيد النظام). Falls back to salary deduction + today if not provided.

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()
    const settleAmount = parseFloat(body.settleAmount)

    if (isNaN(settleAmount) || settleAmount <= 0) {
      return NextResponse.json({ error: 'مبلغ التسوية غير صالح' }, { status: 400 })
    }

    const existing = await db.employeeAdvance.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, name: true, profession: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة غير موجودة' }, { status: 404 })
    }

    // P4-MED-015: validate settledAmount ≤ remaining
    const existingSettled = Number(existing.settledAmount)
    const totalAmount = Number(existing.amount)
    const newSettledAmount = existingSettled + settleAmount
    if (newSettledAmount > totalAmount) {
      return NextResponse.json({
        error: `مبلغ التسوية يتجاوز الرصيد المتبقي (${(totalAmount - existingSettled).toFixed(2)})`,
      }, { status: 400 })
    }

    // Infer AdvanceStatus from existing.status so the literal assignments below
    // stay within the enum (also fixes the cascade that stripped `employee` from
    // the update() return type when `status: string` was used).
    let newStatus = existing.status
    if (newSettledAmount >= totalAmount) {
      newStatus = 'SETTLED'
    } else if (newSettledAmount > 0) {
      newStatus = 'PARTIALLY_SETTLED'
    }

    // تاريخ التحصيل: يحترم اختيار المستخدم، والا الافتراضي اليوم
    const settlementDate = body.settlementDate ? new Date(body.settlementDate) : new Date()

    // P4-CRIT-006 FIX: wrap in $transaction with the settlement JE (R1 enforced).
    const advance = await db.$transaction(async (tx: PrismaTransaction) => {
      const updated = await tx.employeeAdvance.update({
        where: { id },
        data: {
          settledAmount: newSettledAmount,
          status: newStatus,
          // خصائص يختارها المستخدم للتسوية (المستخدم سيد النظام)
          settlementMethod: body.settlementMethod || existing.settlementMethod,
          settlementAccountCode: body.settlementAccountCode || existing.settlementAccountCode,
          settlementDate,
        },
        include: {
          employee: { select: { id: true, code: true, name: true, profession: true } },
        },
      })

      // Settlement JE يحترم اختيار المستخدم لطريقة التحصيل
      await autoEntryAdvanceSettlement({
        employeeName: updated.employee.name,
        settledAmount: settleAmount,
        date: settlementDate,
        settlementMethod: body.settlementMethod,
        settlementAccountCode: body.settlementAccountCode,
      }, tx)

      return updated
    })

    return NextResponse.json(advance)
  } catch (error) {
    console.error('Error settling advance:', error)
    const message = error instanceof Error ? error.message : 'فشل في تسوية السلفة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
