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

// ============ PUT: Update fiscal year (only if OPEN) ============
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

    if (existing.status !== 'OPEN') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل سنة مالية مغلقة' },
        { status: 400 }
      )
    }

    const updated = await db.fiscalYear.update({
      where: { id },
      data: {
        name: body.name || existing.name,
        startDate: body.startDate ? new Date(body.startDate) : existing.startDate,
        endDate: body.endDate ? new Date(body.endDate) : existing.endDate,
      },
      include: { periods: true },
    })

    return NextResponse.json(serializeDecimal(updated))
  } catch (error) {
    console.error('Error updating fiscal year:', error)
    return NextResponse.json({ error: 'فشل في تحديث السنة المالية' }, { status: 500 })
  }
}

// ============ DELETE: Delete fiscal year (only if OPEN) ============
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

    if (existing.status !== 'OPEN') {
      return NextResponse.json(
        { error: 'لا يمكن حذف سنة مالية مغلقة' },
        { status: 400 }
      )
    }

    await db.fiscalYear.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting fiscal year:', error)
    return NextResponse.json({ error: 'فشل في حذف السنة المالية' }, { status: 500 })
  }
}
