import { NextResponse } from 'next/server'
import { previewFiscalYearClose, ClosingEngineError } from '@/lib/accounting/closing-engine'
import { requireRoleApi } from '@/lib/auth-helpers'

// ============ GET: Preview year-end closing ============
// BA-04: Redesigned to use the unified closing-engine.ts.
// Returns the closing JE that WOULD be created, without posting it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // FIX-RBAC-VAT / AUDIT-SETTINGS Q5: closing preview discloses revenue/expense
  // balances — restrict to ADMIN/ACCOUNTANT.
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  const { id } = await params

  try {
    const preview = await previewFiscalYearClose(id)
    return NextResponse.json(preview)
  } catch (error: any) {
    if (error instanceof ClosingEngineError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      )
    }
    console.error('Closing preview error:', error)
    return NextResponse.json(
      { error: 'فشل في معاينة الإقفال', detail: error.message },
      { status: 500 }
    )
  }
}
