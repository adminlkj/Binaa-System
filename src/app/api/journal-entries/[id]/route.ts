import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'القيد المحاسبي غير موجود' },
        { status: 404 }
      )
    }

    // Add computed totals
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)

    return NextResponse.json({
      ...entry,
      totalDebit,
      totalCredit,
    })
  } catch (error) {
    console.error('Error fetching journal entry:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل القيد المحاسبي' },
      { status: 500 }
    )
  }
}
