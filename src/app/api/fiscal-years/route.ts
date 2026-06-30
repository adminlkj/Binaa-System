import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { requireRoleApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

// ============ Helper: compute live revenue/expenses/netProfit for a fiscal year ============
// يحسب الإيرادات والمصروفات وصافي الربح لحظياً من القيود اليومية المرحّلة
// داخل نطاق تاريخ السنة المالية. هذا يضمن ظهور الحركات الفعلية للسنة في بطاقتها
// حتى لو كانت السنة ما زالت مفتوحة (الحقول المخزنة totalRevenue/totalExpenses
// لا تُملأ إلا عند الإقفال).
async function computeLiveYearTotals(startDate: Date, endDate: Date) {
  // اجلب جميع بنود القيود المرحّلة ضمن نطاق السنة
  const grouped = await db.journalLine.groupBy({
    by: ['accountId'],
    _sum: { debit: true, credit: true },
    where: {
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
      },
    },
  })

  // خريطة أنواع الحسابات
  const accounts = await db.account.findMany({
    select: { id: true, type: true },
  })
  const typeMap = new Map(accounts.map(a => [a.id, a.type]))

  let totalRevenue = 0
  let totalExpenses = 0
  for (const g of grouped) {
    const t = typeMap.get(g.accountId)
    if (!t) continue
    const debit = toNumber(g._sum?.debit)
    const credit = toNumber(g._sum?.credit)
    if (t === 'REVENUE') {
      // الإيرادات دائنية بطبيعتها: الرصيد = دائن - مدين
      totalRevenue += credit - debit
    } else if (t === 'EXPENSE') {
      // المصروفات مدينية بطبيعتها: الرصيد = مدين - دائن
      totalExpenses += debit - credit
    }
  }

  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
  }
}

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

    // اجمع الحسابات الحية لكل سنة (متوازية للأداء)
    const enriched = await Promise.all(
      years.map(async (y) => {
        const liveTotals = await computeLiveYearTotals(y.startDate, y.endDate)
        return {
          ...serializeDecimal(y),
          // القيم المخزنة (تُملأ عند الإقفال)
          storedRevenue: toNumber(y.totalRevenue),
          storedExpenses: toNumber(y.totalExpenses),
          storedNetProfit: toNumber(y.netProfit),
          // القيم الحية (محسوبة من القيود الآن)
          totalRevenue: liveTotals.totalRevenue,
          totalExpenses: liveTotals.totalExpenses,
          netProfit: liveTotals.netProfit,
          // عدد العمليات داخل هذه السنة
          periodsCount: y._count.periods,
          closedPeriods: y.periods.filter(p => p.status === 'CLOSED').length,
        }
      })
    )

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
  // FIX-RBAC-VAT / AUDIT-SETTINGS Q5: only ADMIN/ACCOUNTANT may create a fiscal year.
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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
    const name = body.name || String(startDate.getFullYear())

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
      const periods: { fiscalYearId: string; periodNo: number; startDate: Date; endDate: Date; status: string }[] = []
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
