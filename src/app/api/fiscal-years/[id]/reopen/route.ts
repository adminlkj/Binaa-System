import { NextResponse } from 'next/server'
import { reopenFiscalYear, ClosingEngineError } from '@/lib/accounting/closing-engine'
import { requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// ============ POST: Reopen a closed fiscal year ============
// BA-04: Redesigned to use the unified closing-engine.ts.
// P1-4 FIX: الآن يُغلَّف في $transaction صراحةً (عكس قيد الإقفال + تحديث
// السنة + 12 إعادة فتح فترة ككتلة ذرية واحدة).
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
    body = {}
  }

  try {
    const result = await db.$transaction(async (tx) => {
      return reopenFiscalYear(id, tx, {
        reopenedBy: body.reopenedBy || 'admin',
        reverseClosingJE: body.reverseClosingJE !== false, // default true
      })
    })

    return NextResponse.json({
      success: true,
      message: `تم إعادة فتح السنة المالية بنجاح`,
      ...result,
    })
  } catch (error: any) {
    if (error instanceof ClosingEngineError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      )
    }
    console.error('Fiscal year reopen error:', error)
    return NextResponse.json(
      { error: 'فشل في إعادة فتح السنة المالية', detail: error.message },
      { status: 500 }
    )
  }
}
