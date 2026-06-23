import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const sourceType = searchParams.get('sourceType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search')

    // Build where clause
    const where: Record<string, unknown> = { deletedAt: null }
    if (status) where.status = status
    if (sourceType) where.sourceType = sourceType
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
      where,
    })

    // Fetch paginated entries with lines including account details
    const entries = await db.journalEntry.findMany({
      where,
      include: {
        lines: {
          where: { deletedAt: null },
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
      const totalDebit = entry.lines.reduce((s, l) => s + toNumber(l.debit), 0)
      const totalCredit = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0)
      return { ...entry, totalDebit, totalCredit }
    })

    // Get distinct source types for filtering
    const sourceTypes = await db.journalEntry.findMany({
      where: { sourceType: { not: null }, deletedAt: null },
      select: { sourceType: true },
      distinct: ['sourceType'],
    })

    return NextResponse.json(serializeDecimal({
      entries: enriched,
      sourceTypes: sourceTypes.map(st => st.sourceType).filter(Boolean),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }))
  } catch (error) {
    console.error('[API] Failed to fetch journal entries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch journal entries', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Create manual journal entry with balance validation
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.entryNo || !body.date || !body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { error: 'رقم القيد والتاريخ والبنود مطلوبة' },
        { status: 400 }
      )
    }

    // Rule 1: Validate balanced entry - total debits must equal total credits
    const totalDebit = body.lines.reduce((sum: number, l: { debit?: number }) => sum + (l.debit || 0), 0)
    const totalCredit = body.lines.reduce((sum: number, l: { credit?: number }) => sum + (l.credit || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: 'لا يمكن ترحيل قيد غير متوازن - مجموع المدين يجب أن يساوي مجموع الدائن', totalDebit, totalCredit },
        { status: 400 }
      )
    }

    // Validate each line has an account and at least one side has a value
    for (const line of body.lines as { accountCode?: string; accountId?: string; debit?: number; credit?: number }[]) {
      if (!line.accountCode && !line.accountId) {
        return NextResponse.json(
          { error: 'كل بند يجب أن يكون مرتبطاً بحساب' },
          { status: 400 }
        )
      }
      if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
        return NextResponse.json(
          { error: 'كل بند يجب أن يحتوي على قيمة مدين أو دائن' },
          { status: 400 }
        )
      }
    }

    // Resolve account IDs from codes if needed
    const resolvedLines = await Promise.all(
      (body.lines as { accountCode?: string; accountId?: string; debit?: number; credit?: number; description?: string; costCenterId?: string }[]).map(async (line) => {
        let accountId = line.accountId
        if (!accountId && line.accountCode) {
          const account = await db.account.findUnique({ where: { code: line.accountCode } })
          if (!account) {
            throw new Error(`الحساب غير موجود: ${line.accountCode}`)
          }
          accountId = account.id
        }
        return {
          accountId: accountId!,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || null,
          costCenterId: line.costCenterId || null,
        }
      })
    )

    // Create the journal entry
    const entry = await db.journalEntry.create({
      data: {
        entryNo: body.entryNo,
        date: new Date(body.date),
        description: body.description || null,
        status: body.status || 'DRAFT',
        sourceType: body.sourceType || 'MANUAL',
        sourceId: body.sourceId || null,
        lines: {
          create: resolvedLines,
        },
      },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, nameAr: true, type: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    const computedDebit = entry.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const computedCredit = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      ...entry,
      totalDebit: computedDebit,
      totalCredit: computedCredit,
    }), { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create journal entry:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء القيد المحاسبي'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
