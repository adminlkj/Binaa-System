import { NextResponse } from 'next/server'
import { closeFiscalYear, ClosingEngineError } from '@/lib/accounting/closing-engine'
import { requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// ============ POST: Execute year-end closing ============
// BA-04: Redesigned to use the unified closing-engine.ts.
// All closing logic (balance computation, JE creation, period closing) now
// lives in the engine — this route is just a thin HTTP wrapper.
//
// P1-4 FIX: الإقفال الآن يُغلَّف في $transaction صراحةً على مستوى الـ route.
// سابقاً كان يمرر undefined كـ tx مما يجعل المحرك يعمل على db مباشرة — أي قيد
// إقفال + تحديث FiscalYear + 12 تحديث فترة كعمليات منفصلة. الآن ذرية كاملة.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response
  const { id } = await params
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'صيغة الطلب غير صالحة' }, { status: 400 })
  }

  if (!body.approved) {
    return NextResponse.json(
      { error: 'يجب الموافقة على الإقفال أولاً (body.approved=true)' },
      { status: 400 }
    )
  }

  try {
    const result = await db.$transaction(async (tx) => {
      return closeFiscalYear(id, tx, {
        closedBy: body.closedBy || 'admin',
        approved: true,
      })
    })

    return NextResponse.json({
      success: true,
      message: `تم إقفال السنة المالية بنجاح`,
      ...result,
    })
  } catch (error: any) {
    if (error instanceof ClosingEngineError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      )
    }
    console.error('Year-end closing error:', error)
    return NextResponse.json(
      { error: 'فشل في إقفال السنة المالية', detail: error.message },
      { status: 500 }
    )
  }
}
