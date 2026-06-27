import { db } from '@/lib/db'
import { autoEntryEmployeeAdvance, autoEntryAdvanceSettlement, initializeChartOfAccounts, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const advances = await db.employeeAdvance.findMany({
      include: {
        employee: { select: { id: true, code: true, name: true, profession: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(advances)
  } catch (error) {
    console.error('Error fetching advances:', error)
    return NextResponse.json({ error: 'فشل في تحميل السلف' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Atomic: advance record + JE + journalEntryId link in one transaction.
    // R1 enforced — if the JE fails, the advance record is rolled back too.
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const advance = await tx.employeeAdvance.create({
        data: {
          employeeId: body.employeeId,
          amount: parseFloat(body.amount) || 0,
          date: new Date(body.date),
          settledAmount: 0,
          status: 'PENDING',
          description: body.description || null,
        },
        include: {
          employee: { select: { id: true, code: true, name: true, profession: true } },
        },
      })

      await initializeChartOfAccounts()
      const journalEntry = await autoEntryEmployeeAdvance({
        employeeName: advance.employee.name,
        amount: advance.amount,
        date: advance.date,
      }, tx)

      if (journalEntry) {
        await tx.employeeAdvance.update({
          where: { id: advance.id },
          data: { journalEntryId: journalEntry.id },
        })
      }

      return await tx.employeeAdvance.findUnique({
        where: { id: advance.id },
        include: {
          employee: { select: { id: true, code: true, name: true, profession: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating advance:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء السلفة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, settledAmount, status } = body

    if (!id || settledAmount === undefined) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
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

    const newSettledAmount = existing.settledAmount + parseFloat(String(settledAmount))
    const newStatus = status || (newSettledAmount >= existing.amount ? 'SETTLED' : 'PARTIALLY_SETTLED')

    // Atomic: advance update + settlement JE in one transaction.
    // R1 enforced — if the JE fails, the settlement update is rolled back too.
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

      await initializeChartOfAccounts()
      // Settlement JE (Dr Payroll / Cr Employee Advance). R1 enforced — if this
      // fails, the settlement update above is rolled back too.
      await autoEntryAdvanceSettlement({
        employeeName: updated.employee.name,
        settledAmount: parseFloat(String(settledAmount)),
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
