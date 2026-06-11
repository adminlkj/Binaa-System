import { db } from '@/lib/db'
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
    const where: Record<string, unknown> = {}
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
      where: Object.keys(where).length > 0 ? where : undefined,
    })

    // Fetch paginated entries with lines including account details
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

    // Get distinct source types for filtering
    const sourceTypes = await db.journalEntry.findMany({
      where: { sourceType: { not: null } },
      select: { sourceType: true },
      distinct: ['sourceType'],
    })

    return NextResponse.json({
      entries: enriched,
      sourceTypes: sourceTypes.map(st => st.sourceType).filter(Boolean),
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

// POST is disabled - journal entries are created automatically by business transactions
// No manual journal entries allowed
export async function POST() {
  return NextResponse.json(
    { error: 'لا يمكن إنشاء قيود يدوية - القيود المحاسبية تُنشأ تلقائياً من العمليات التجارية' },
    { status: 403 }
  )
}
