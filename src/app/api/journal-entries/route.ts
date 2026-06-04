import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { createJournalEntry } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const search = searchParams.get('search')

    // Build where clause
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }
    if (search) {
      where.OR = [
        { entryNo: { contains: search } },
        { description: { contains: search } },
      ]
    }

    // Get total count for pagination
    const total = await db.journalEntry.count({
      where: Object.keys(where).length > 0 ? where : undefined,
    })

    // Fetch paginated entries
    const entries = await db.journalEntry.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    // Add computed totals to each entry
    const enriched = entries.map((entry) => {
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
      return { ...entry, totalDebit, totalCredit }
    })

    return NextResponse.json({
      entries: enriched,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error fetching journal entries:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل القيود المحاسبية' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.date) {
      return NextResponse.json(
        { error: 'تاريخ القيد مطلوب' },
        { status: 400 }
      )
    }

    if (!body.lines || !Array.isArray(body.lines) || body.lines.length < 2) {
      return NextResponse.json(
        { error: 'القيد يجب أن يحتوي على سطرين على الأقل' },
        { status: 400 }
      )
    }

    // Validate each line has accountId
    for (const line of body.lines as { accountId?: string; debit: number; credit: number }[]) {
      if (!line.accountId) {
        return NextResponse.json(
          { error: 'كل سطر يجب أن يكون مرتبطاً بحساب' },
          { status: 400 }
        )
      }
    }

    // Validate balanced entry: total debits must equal total credits
    const totalDebit = (body.lines as { debit: number; credit: number }[]).reduce(
      (s, l) => s + (parseFloat(String(l.debit)) || 0),
      0
    )
    const totalCredit = (body.lines as { debit: number; credit: number }[]).reduce(
      (s, l) => s + (parseFloat(String(l.credit)) || 0),
      0
    )

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        {
          error: 'القيد غير متوازن - مجموع المدين يجب أن يساوي مجموع الدائن',
          totalDebit,
          totalCredit,
          difference: Math.abs(totalDebit - totalCredit),
        },
        { status: 400 }
      )
    }

    // Validate that at least some amount exists
    if (totalDebit === 0 && totalCredit === 0) {
      return NextResponse.json(
        { error: 'القيد لا يمكن أن يكون بصفر' },
        { status: 400 }
      )
    }

    // Validate all account IDs exist
    const accountIds = (body.lines as { accountId: string }[]).map((l) => l.accountId)
    const existingAccounts = await db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true },
    })
    const existingIds = new Set(existingAccounts.map((a) => a.id))
    const missingIds = accountIds.filter((id) => !existingIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `حسابات غير موجودة: ${missingIds.join(', ')}` },
        { status: 400 }
      )
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
          create: (body.lines as { accountId: string; debit: number; credit: number; costCenterId?: string; description?: string }[]).map(
            (line) => ({
              accountId: line.accountId,
              debit: parseFloat(String(line.debit)) || 0,
              credit: parseFloat(String(line.credit)) || 0,
              costCenterId: line.costCenterId || null,
              description: line.description || null,
            })
          ),
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
    return NextResponse.json(
      { error: 'فشل في إنشاء القيد المحاسبي' },
      { status: 500 }
    )
  }
}
