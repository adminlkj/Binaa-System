import { NextResponse } from 'next/server'
import { verifyNumericalConsistency } from '@/lib/accounting/queries'

// GET /api/accounting-consistency?asOf=...
//
// BA-02 Task 2: Build-breaking numerical consistency check.
// Returns the full verification report with all 7 invariants (I1-I7).
//
// This endpoint is intended for:
//   - Admin dashboards (show real-time consistency status)
//   - CI/CD pipelines (curl this endpoint, fail build if ok=false)
//   - Periodic monitoring (alert if any invariant breaks)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const asOfStr = searchParams.get('asOf')
    const asOfDate = asOfStr ? new Date(asOfStr) : undefined

    const result = await verifyNumericalConsistency(asOfDate)

    return NextResponse.json({
      ok: result.ok,
      accountsChecked: result.accountsChecked,
      diffs: result.diffs,
      summary: result.summary,
      invariants: {
        I1: 'TrialBalance totalDebit == totalCredit',
        I2: 'TrialBalance netDebit column == netCredit column',
        I3: 'TrialBalance totals == raw JournalLine aggregate (no orphan lines)',
        I4: 'Accounting equation: Assets == Liabilities + Equity + CurrentYearEarnings',
        I5: 'Σ GL closingBalance by type == Σ TrialBalance signed balance by type',
        I6: 'Per-account: GL.closingBalance == getAccountBalance == TB.signedBalance (ALL accounts)',
        I7: 'Account Statement (full-history GL) closingBalance == TB signed balance',
      },
      checkedAt: new Date().toISOString(),
      asOf: asOfDate?.toISOString() || null,
    }, { status: result.ok ? 200 : 500 })
  } catch (error) {
    console.error('Accounting consistency check error:', error)
    return NextResponse.json(
      { ok: false, error: 'فشل في فحص الاتساق المحاسبي', detail: String(error) },
      { status: 500 }
    )
  }
}
