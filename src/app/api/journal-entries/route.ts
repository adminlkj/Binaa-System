import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }

    const entries = await db.journalEntry.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    })

    // Add computed totals
    const enriched = entries.map(entry => {
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
      return { ...entry, totalDebit, totalCredit }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching journal entries:', error)
    return NextResponse.json({ error: 'فشل في تحميل القيود المحاسبية' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate balanced entry
    const totalDebit = (body.lines as { debit: number; credit: number }[]).reduce((s, l) => s + (parseFloat(String(l.debit)) || 0), 0)
    const totalCredit = (body.lines as { debit: number; credit: number }[]).reduce((s, l) => s + (parseFloat(String(l.credit)) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json({ error: 'القيد غير متوازن - مجموع المدين يجب أن يساوي مجموع الدائن' }, { status: 400 })
    }

    // Auto-generate entry number
    const lastEntry = await db.journalEntry.findFirst({
      orderBy: { entryNo: 'desc' },
      select: { entryNo: true },
    })

    let nextNum = 1
    if (lastEntry?.entryNo) {
      const match = lastEntry.entryNo.match(/JE-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const entryNo = `JE-${String(nextNum).padStart(4, '0')}`

    const entry = await db.journalEntry.create({
      data: {
        entryNo,
        date: new Date(body.date),
        description: body.description || null,
        status: body.status || 'DRAFT',
        lines: {
          create: (body.lines as { accountId: string; debit: number; credit: number; costCenterId?: string; description?: string }[]).map(line => ({
            accountId: line.accountId,
            debit: parseFloat(String(line.debit)) || 0,
            credit: parseFloat(String(line.credit)) || 0,
            costCenterId: line.costCenterId || null,
            description: line.description || null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
        },
      },
    })

    const enriched = {
      ...entry,
      totalDebit: entry.lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: entry.lines.reduce((s, l) => s + l.credit, 0),
    }

    return NextResponse.json(enriched, { status: 201 })
  } catch (error) {
    console.error('Error creating journal entry:', error)
    return NextResponse.json({ error: 'فشل في إنشاء القيد المحاسبي' }, { status: 500 })
  }
}
