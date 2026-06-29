import { NextResponse } from 'next/server'
import { closeFiscalYear, ClosingEngineError } from '@/lib/accounting/closing-engine'

// ============ POST: Execute year-end closing ============
// BA-04: Redesigned to use the unified closing-engine.ts.
// All closing logic (balance computation, JE creation, period closing) now
// lives in the engine — this route is just a thin HTTP wrapper.
//
// Atomic: the engine wraps everything in a $transaction so partial failure
// cannot leave orphan JEs or inconsistent fiscal year state.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const result = await closeFiscalYear(id, undefined, {
      closedBy: body.closedBy || 'admin',
      approved: true,
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
