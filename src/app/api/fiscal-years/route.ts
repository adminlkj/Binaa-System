import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// ============ GET: List all fiscal years ============
export async function GET() {
  try {
    const years = await db.fiscalYear.findMany({
      include: {
        periods: { orderBy: { periodNo: 'asc' } },
        _count: { select: { periods: true } },
      },
      orderBy: { startDate: 'desc' },
    })

    const enriched = years.map(y => ({
      ...serializeDecimal(y),
      totalRevenue: toNumber(y.totalRevenue),
      totalExpenses: toNumber(y.totalExpenses),
      netProfit: toNumber(y.netProfit),
      periodsCount: y._count.periods,
      closedPeriods: y.periods.filter(p => p.status === 'CLOSED').length,
    }))

    const currentYear = enriched.find(y => y.status === 'OPEN')
    const lastClosed = enriched.find(y => y.status === 'CLOSED')

    return NextResponse.json({
      years: enriched,
      current: currentYear || null,
      lastClosed: lastClosed || null,
      total: enriched.length,
    })
  } catch (error) {
    console.error('Error fetching fiscal years:', error)
    return NextResponse.json({ error: 'فشل في تحميل السنوات المالية' }, { status: 500 })
  }
}

// ============ POST: Create a new fiscal year ============
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'تاريخ البداية والنهاية مطلوبان' }, { status: 400 })
    }

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)

    if (endDate <= startDate) {
      return NextResponse.json({ error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' }, { status: 400 })
    }

    // Auto-generate name from year if not provided
    let name = body.name || String(startDate.getFullYear())

    // Check for duplicate name
    const existingName = await db.fiscalYear.findUnique({ where: { name } })
    if (existingName) {
      return NextResponse.json({ error: `السنة المالية "${name}" موجودة بالفعل` }, { status: 400 })
    }

    // Check for overlapping years
    const overlapping = await db.fiscalYear.findFirst({
      where: {
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    })
    if (overlapping) {
      return NextResponse.json(
        { error: `تداخل في التواريخ مع السنة المالية "${overlapping.name}"` },
        { status: 400 }
      )
    }

    // Create fiscal year with 12 monthly periods
    const result = await db.$transaction(async (tx) => {
      const fiscalYear = await tx.fiscalYear.create({
        data: {
          name,
          startDate,
          endDate,
          status: 'OPEN',
        },
      })

      // Create 12 monthly periods
      const periods = []
      for (let i = 0; i < 12; i++) {
        const periodStart = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
        const periodEnd = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, 0) // last day of month
        // Don't create periods beyond the fiscal year end
        if (periodStart > endDate) break
        const actualEnd = periodEnd > endDate ? endDate : periodEnd

        periods.push({
          fiscalYearId: fiscalYear.id,
          periodNo: i + 1,
          startDate: periodStart,
          endDate: actualEnd,
          status: 'OPEN',
        })
      }

      if (periods.length > 0) {
        await tx.fiscalPeriod.createMany({ data: periods })
      }

      return tx.fiscalYear.findUnique({
        where: { id: fiscalYear.id },
        include: { periods: { orderBy: { periodNo: 'asc' } } },
      })
    })

    return NextResponse.json(serializeDecimal(result), { status: 201 })
  } catch (error) {
    console.error('Error creating fiscal year:', error)
    return NextResponse.json({ error: 'فشل في إنشاء السنة المالية' }, { status: 500 })
  }
}
