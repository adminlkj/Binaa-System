import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.employeeAdvance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة غير موجودة' }, { status: 404 })
    }

    const settledAmount = existing.settledAmount + parseFloat(body.settleAmount)
    const remaining = existing.amount - settledAmount
    let newStatus: string = existing.status

    if (settledAmount >= existing.amount) {
      newStatus = 'SETTLED'
    } else if (settledAmount > 0) {
      newStatus = 'PARTIALLY_SETTLED'
    }

    const advance = await db.employeeAdvance.update({
      where: { id },
      data: {
        settledAmount,
        status: newStatus,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, position: true } },
      },
    })

    return NextResponse.json(advance)
  } catch (error) {
    console.error('Error settling advance:', error)
    return NextResponse.json({ error: 'فشل في تسوية السلفة' }, { status: 500 })
  }
}
