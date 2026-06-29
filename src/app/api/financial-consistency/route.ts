// ============================================================================
// فحص السلامة المالية - Financial Consistency Validation API
// القاعدة رقم 8: لا يسمح بوجود مستند مالي بدون قيد يومية
// ============================================================================

import { NextResponse } from 'next/server'
import { validateFinancialConsistency } from '@/lib/accounting/consistency'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await validateFinancialConsistency()

    const summary = {
      totalIssues: result.issues.length,
      criticalIssues: result.issues.filter(i => i.severity === 'CRITICAL').length,
      warnings: result.issues.filter(i => i.severity === 'WARNING').length,
      missingJournalEntries: result.issues.filter(i => i.type === 'MISSING_JOURNAL_ENTRY').length,
      unbalancedEntries: result.issues.filter(i => i.type === 'UNBALANCED_ENTRY').length,
      brokenReferences: result.issues.filter(i => i.type === 'BROKEN_REFERENCE').length,
      totalRules: result.totalRules,
      passedRules: result.passedRules,
      score: result.score,
      rules: result.results,
    }

    return NextResponse.json({
      summary,
      issues: result.issues,
      isHealthy: summary.criticalIssues === 0,
      checkedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('Error validating financial consistency:', error)
    return NextResponse.json(
      { error: 'Failed to validate consistency' },
      { status: 500 }
    )
  }
}
