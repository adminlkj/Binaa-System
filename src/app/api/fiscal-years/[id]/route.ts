import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ Helper: live totals for a fiscal year ============
async function computeLiveYearTotals(startDate: Date, endDate: Date) {
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

  const accounts = await db.account.findMany({
    select: { id: true, type: true },
  })
  const typeMap = new Map(accounts.map(a => [a.id, a.type]))

  let totalRevenue = 0
  let totalExpenses = 0
  let entryCount = 0
  const entryIds = new Set<string>()

  // اجلب عدد القيود الفريدة داخل نطاق السنة
  const entries = await db.journalEntry.findMany({
    where: {
      status: 'POSTED',
      deletedAt: null,
      date: { gte: startDate, lte: endDate },
    },
    select: { id: true, sourceType: true },
  })
  entryCount = entries.length

  for (const g of grouped) {
    const t = typeMap.get(g.accountId)
    if (!t) continue
    const debit = toNumber(g._sum?.debit)
    const credit = toNumber(g._sum?.credit)
    if (t === 'REVENUE') {
      totalRevenue += credit - debit
    } else if (t === 'EXPENSE') {
      totalExpenses += debit - credit
    }
  }

  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    entryCount,
  }
}

// ============ GET: Fiscal year detail ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const year = await db.fiscalYear.findUnique({
      where: { id },
      include: {
        periods: { orderBy: { periodNo: 'asc' } },
      },
    })

    if (!year) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    // احسب القيم الحية من القيود المرحّلة
    const liveTotals = await computeLiveYearTotals(year.startDate, year.endDate)

    return NextResponse.json({
      ...serializeDecimal(year),
      // القيم المخزنة (تُملأ عند الإقفال)
      storedRevenue: toNumber(year.totalRevenue),
      storedExpenses: toNumber(year.totalExpenses),
      storedNetProfit: toNumber(year.netProfit),
      // القيم الحية (محسوبة من القيود الآن)
      totalRevenue: liveTotals.totalRevenue,
      totalExpenses: liveTotals.totalExpenses,
      netProfit: liveTotals.netProfit,
      entryCount: liveTotals.entryCount,
    })
  } catch (error) {
    console.error('Error fetching fiscal year:', error)
    return NextResponse.json({ error: 'فشل في تحميل السنة المالية' }, { status: 500 })
  }
}

// ============ PUT: Update fiscal year (admin — no status restriction) ============
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.fiscalYear.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    // Admin override: allow editing closed years too (with audit note)
    const updateData: any = {
      name: body.name || existing.name,
    }
    if (body.startDate) updateData.startDate = new Date(body.startDate)
    if (body.endDate) updateData.endDate = new Date(body.endDate)

    // If reopening via PUT (status override)
    if (body.status && body.status !== existing.status) {
      updateData.status = body.status
      if (body.status === 'OPEN') {
        updateData.closedAt = null
        updateData.closedBy = null
        updateData.closingNotes = body.notes || `أُعيد فتح السنة بواسطة المدير`
      }
    }

    const updated = await db.fiscalYear.update({
      where: { id },
      data: updateData,
      include: { periods: true },
    })

    // If status changed to OPEN, reopen all periods too
    if (body.status === 'OPEN' && existing.status !== 'OPEN') {
      await db.fiscalPeriod.updateMany({
        where: { fiscalYearId: id },
        data: { status: 'OPEN' },
      })
    }

    return NextResponse.json(serializeDecimal(updated))
  } catch (error) {
    console.error('Error updating fiscal year:', error)
    return NextResponse.json({ error: 'فشل في تحديث السنة المالية' }, { status: 500 })
  }
}

// ============ DELETE: Delete fiscal year (admin — no status restriction) ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.fiscalYear.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    // Admin override: allow deleting closed years too
    // (closing JE remains in the ledger as historical record)
    await db.fiscalYear.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting fiscal year:', error)
    return NextResponse.json({ error: 'فشل في حذف السنة المالية' }, { status: 500 })
  }
}
