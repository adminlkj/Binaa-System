import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { requireRoleApi } from '@/lib/auth-helpers'
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
  // FIX-RBAC-VAT / AUDIT-SETTINGS Q5: only ADMIN/ACCOUNTANT may update a fiscal year.
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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

    // Atomically update the year and (optionally) reopen all periods.
    // If the period updateMany fails after the year has been reopened, the
    // year would be OPEN while its periods remain CLOSED — wrap both writes.
    let updated: Awaited<ReturnType<typeof db.fiscalYear.update>>
    if (body.status === 'OPEN' && existing.status !== 'OPEN') {
      updated = await db.$transaction(async (tx) => {
        const yr = await tx.fiscalYear.update({
          where: { id },
          data: updateData,
          include: { periods: true },
        })
        await tx.fiscalPeriod.updateMany({
          where: { fiscalYearId: id },
          data: { status: 'OPEN' },
        })
        // Re-fetch periods so the response reflects their new OPEN status.
        const refreshed = await tx.fiscalYear.findUnique({
          where: { id },
          include: { periods: true },
        })
        return refreshed ?? yr
      })
    } else {
      updated = await db.fiscalYear.update({
        where: { id },
        data: updateData,
        include: { periods: true },
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
  // FIX-RBAC-VAT / AUDIT-SETTINGS Q5: only ADMIN/ACCOUNTANT may delete a fiscal year.
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.fiscalYear.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    // P1-3 FIX (CRIT-B): لا يُسمح بحذف سنة مغلقة مباشرةً. يجب إعادة فتحها أولاً
    // (مما يعكس قيد الإقفال) ثم الحذف. حذف سنة مغلقة يترك قيد الإقفال يتيماً
    // في GL دون رابط للسنة.
    if (existing.status === 'CLOSED') {
      return NextResponse.json(
        {
          error: `لا يمكن حذف سنة مالية مُقفلة (${existing.name}). أعد فتحها أولاً (POST /api/fiscal-years/${id}/reopen) ثم احذفها.`,
          code: 'CANNOT_DELETE_CLOSED_YEAR',
          hint: 'POST /api/fiscal-years/[id]/reopen → then DELETE',
        },
        { status: 423 }
      )
    }

    // P1-3 FIX: إذا كانت السنة في حالة CLOSING، ارفض الحذف (عملية إقفال جارية)
    if (existing.status === 'CLOSING') {
      return NextResponse.json(
        { error: `السنة المالية ${existing.name} قيد الإقفال — لا يمكن حذفها`, code: 'YEAR_CLOSING' },
        { status: 423 }
      )
    }

    // P1-3 FIX: تحقق من عدم وجود قيود مرحّلة في هذه السنة. إذا وجدت، ارفض الحذف
    // (لا يمكن حذف سنة لها قيود مالية — يجب عكس القيود أولاً).
    const jeCount = await db.journalEntry.count({
      where: {
        date: { gte: existing.startDate, lte: existing.endDate },
        deletedAt: null,
        status: 'POSTED',
      },
    })
    if (jeCount > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف السنة المالية ${existing.name} — تحتوي على ${jeCount} قيد مرحّل. اعكس القيود أولاً.`,
          code: 'YEAR_HAS_POSTED_ENTRIES',
          jeCount,
        },
        { status: 423 }
      )
    }

    // Safe to delete: OPEN status, no posted JEs, no closing JE
    await db.fiscalYear.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting fiscal year:', error)
    return NextResponse.json({ error: 'فشل في حذف السنة المالية' }, { status: 500 })
  }
}
