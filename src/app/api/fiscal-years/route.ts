import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/fiscal-years - List all fiscal years with periods
export async function GET() {
  try {
    const fiscalYears = await db.fiscalYear.findMany({
      include: {
        periods: { orderBy: { periodNo: 'asc' } },
      },
      orderBy: { startDate: 'desc' },
    })
    return NextResponse.json(fiscalYears)
  } catch (error) {
    console.error('[API] Failed to fetch fiscal years:', error)
    return NextResponse.json({ error: 'فشل في جلب السنوات المالية' }, { status: 500 })
  }
}

// POST /api/fiscal-years - Create a new fiscal year with 12 periods
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, startDate, endDate } = body

    if (!name || !startDate || !endDate) {
      return NextResponse.json({ error: 'الاسم وتاريخ البداية والنهاية مطلوبون' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    // Check for overlap
    const existing = await db.fiscalYear.findFirst({
      where: {
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    })
    if (existing) {
      return NextResponse.json({ error: 'توجد سنة مالية متداخلة مع هذه الفترة' }, { status: 400 })
    }

    // Create fiscal year with 12 monthly periods
    const fiscalYear = await db.fiscalYear.create({
      data: {
        name,
        startDate: start,
        endDate: end,
        status: 'OPEN',
        periods: {
          create: Array.from({ length: 12 }, (_, i) => {
            const periodStart = new Date(start.getFullYear(), start.getMonth() + i, 1)
            const periodEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0) // Last day of month
            return {
              periodNo: i + 1,
              startDate: periodStart,
              endDate: periodEnd,
              status: 'OPEN',
            }
          }),
        },
      },
      include: { periods: true },
    })

    return NextResponse.json(fiscalYear, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create fiscal year:', error)
    return NextResponse.json({ error: 'فشل في إنشاء السنة المالية' }, { status: 500 })
  }
}
