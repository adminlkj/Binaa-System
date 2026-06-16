// ============================================================================
// فحص السلامة المالية - Financial Consistency Validation API
// القاعدة رقم 8: لا يسمح بوجود مستند مالي بدون قيد يومية
// ============================================================================

import { NextResponse } from 'next/server'
import { validateFinancialConsistency } from '@/lib/accounting/engine'

export async function GET() {
  try {
    const issues = await validateFinancialConsistency()

    const summary = {
      totalIssues: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'CRITICAL').length,
      warnings: issues.filter(i => i.severity === 'WARNING').length,
      missingJournalEntries: issues.filter(i => i.type === 'MISSING_JOURNAL_ENTRY').length,
      unbalancedEntries: issues.filter(i => i.type === 'UNBALANCED_ENTRY').length,
      brokenReferences: issues.filter(i => i.type === 'BROKEN_REFERENCE').length,
    }

    return NextResponse.json({
      summary,
      issues,
      isHealthy: issues.filter(i => i.severity === 'CRITICAL').length === 0,
      checkedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('Error validating financial consistency:', error)
    return NextResponse.json({ error: 'Failed to validate consistency' }, { status: 500 })
  }
}
