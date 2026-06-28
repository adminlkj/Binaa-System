import { db } from '@/lib/db'
import { autoEntryAdvanceSettlement, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

// P4-CRIT-006 FIX: was reading Employee.position (non-existent field — every settle from UI crashed with 500).
// Now reads `profession` and reuses the bulk-PUT logic (advance update + autoEntryAdvanceSettlement JE in $transaction).
// The settlement JE itself uses the corrected Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE (see engine.ts P4-CRIT-010).

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    let newStatus: string = existing.status
    if (newSettledAmount >= totalAmount) {
      newStatus = 'SETTLED'
    } else if (newSettledAmount > 0) {
      newStatus = 'PARTIALLY_SETTLED'
    }

    // P4-CRIT-006 FIX: wrap in $transaction with the settlement JE (R1 enforced).
    const advance = await db.$transaction(async (tx: PrismaTransaction) => {
      const updated = await tx.employeeAdvance.update({
        where: { id },
        data: {
          settledAmount: newSettledAmount,
          status: newStatus,
        },
        include: {
          employee: { select: { id: true, code: true, name: true, profession: true } },
        },
      })

      // Settlement JE: Dr SALARIES_PAYABLE / Cr EMPLOYEE_ADVANCE (P4-CRIT-010 fixed in engine.ts)
      await autoEntryAdvanceSettlement({
        employeeName: updated.employee.name,
        settledAmount: settleAmount,
        date: new Date(),
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
