import { db } from '@/lib/db'
import { autoEntryEmployeeAdvance, autoEntryAdvanceSettlement, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const advances = await db.employeeAdvance.findMany({
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
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

    const advance = await db.employeeAdvance.create({
      data: {
        employeeId: body.employeeId,
        amount: parseFloat(body.amount),
        date: new Date(body.date),
        settledAmount: 0,
        status: 'PENDING',
        description: body.description || null,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    // Auto-create accounting journal entry
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntryEmployeeAdvance({
        employeeName: advance.employee.name,
        amount: advance.amount,
        date: advance.date,
      })

      // Store journalEntryId on the advance
      if (journalEntry) {
        await db.employeeAdvance.update({
          where: { id: advance.id },
          data: { journalEntryId: journalEntry.id },
        })
      }
    } catch (accountingError) {
      console.error('Accounting entry failed for employee advance:', accountingError)
    }

    // Re-fetch to include journalEntryId
    const updatedAdvance = await db.employeeAdvance.findUnique({
      where: { id: advance.id },
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    return NextResponse.json(updatedAdvance, { status: 201 })
  } catch (error) {
    console.error('Error creating advance:', error)
    return NextResponse.json({ error: 'فشل في إنشاء السلفة' }, { status: 500 })
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
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'السلفة غير موجودة' }, { status: 404 })
    }

    const newSettledAmount = existing.settledAmount + parseFloat(String(settledAmount))
    const newStatus = status || (newSettledAmount >= existing.amount ? 'SETTLED' : 'PARTIALLY_SETTLED')

    const advance = await db.employeeAdvance.update({
      where: { id },
      data: {
        settledAmount: newSettledAmount,
        status: newStatus,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    // Auto-create accounting journal entry for settlement
    try {
      await initializeChartOfAccounts()
      await autoEntryAdvanceSettlement({
        employeeName: advance.employee.name,
        settledAmount: parseFloat(String(settledAmount)),
        date: new Date(),
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for advance settlement:', accountingError)
    }

    return NextResponse.json(advance)
  } catch (error) {
    console.error('Error settling advance:', error)
    return NextResponse.json({ error: 'فشل في تسوية السلفة' }, { status: 500 })
  }
}
