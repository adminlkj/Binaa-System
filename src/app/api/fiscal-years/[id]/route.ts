import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

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

    return NextResponse.json({
      ...serializeDecimal(year),
      totalRevenue: toNumber(year.totalRevenue),
      totalExpenses: toNumber(year.totalExpenses),
      netProfit: toNumber(year.netProfit),
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
