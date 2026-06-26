import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// ============ PATCH: Toggle period status (admin override) ============
// Body: { status: 'OPEN' | 'CLOSED' }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; periodId: string }> }
) {
  try {
    const { id, periodId } = await params
    const body = await request.json()

    const period = await db.fiscalPeriod.findFirst({
      where: { id: periodId, fiscalYearId: id },
    })
    if (!period) {
      return NextResponse.json({ error: 'الفترة غير موجودة' }, { status: 404 })
    }

    const newStatus = body.status === 'CLOSED' ? 'CLOSED' : 'OPEN'

    const updated = await db.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: newStatus },
    })

    return NextResponse.json({
      success: true,
      period: updated,
      message: newStatus === 'CLOSED'
        ? `تم إغلاق الفترة ${period.periodNo}`
        : `تمت إعادة فتح الفترة ${period.periodNo}`,
    })
  } catch (error) {
    console.error('Error updating period:', error)
    return NextResponse.json({ error: 'فشل في تحديث الفترة' }, { status: 500 })
  }
}
