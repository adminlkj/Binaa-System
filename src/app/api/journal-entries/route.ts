import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { postJournalEntry, getNextEntryNo, AccountingGuardError } from '@/lib/accounting/guard'
import { requireRoleApi } from '@/lib/auth-helpers'

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
      { error: 'Failed to fetch journal entries' },
      { status: 500 }
    )
  }
}

// POST - Create manual journal entry
// كل القيود تُنشأ عبر postJournalEntry من guard.ts — لا استثناءات.
// القواعد R1-R12 تُفرض مركزياً ولا يمكن كسرها.
export async function POST(request: Request) {
  try {
    // Role gate: only ADMIN and ACCOUNTANT may post manual journal entries
    const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
    if (response) return response

    const body = await request.json()

    // Basic field presence (deeper validation in the guard)
    if (!body.date || !body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { error: 'التاريخ والبنود مطلوبة' },
        { status: 400 }
      )
    }

    // Generate entryNo if not provided
    const entryNo = body.entryNo || await getNextEntryNo()

    const entry = await postJournalEntry({
      entryNo,
      date: body.date,
      description: body.description || null,
      sourceType: body.sourceType || 'MANUAL',
      sourceId: body.sourceId || null,
      lines: body.lines.map((l: { accountCode?: string; accountId?: string; debit?: number; credit?: number; description?: string; costCenterId?: string }) => ({
        accountCode: l.accountCode,
        accountId: l.accountId,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description,
        costCenterId: l.costCenterId,
      })),
    })

    const computedDebit = entry.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const computedCredit = entry.lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      ...entry,
      totalDebit: computedDebit,
      totalCredit: computedCredit,
    }), { status: 201 })
  } catch (error) {
    if (error instanceof AccountingGuardError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      )
    }
    console.error('[API] Failed to create journal entry:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء القيد المحاسبي'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
