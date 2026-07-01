import { requireAuthApi } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { accountingHealthCheck } from '@/lib/accounting/guard'

// GET /api/accounting-guard/health
// يعرض فحص السلامة المحاسبية الشامل (R1-R12) من الحارس غير القابل للكسر
export async function GET() {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const result = await accountingHealthCheck()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] Accounting guard health check error:', error)
    return NextResponse.json(
      { error: 'فشل في فحص السلامة المحاسبية' },
      { status: 500 }
    )
  }
}
