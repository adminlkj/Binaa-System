// ============================================================================
// نظام بِنَاء ERP - مدقّق السلامة المالية
// Binaa ERP - Financial Consistency Validator (Phase 1)
// ============================================================================
// يقوم بفحص 5 قواعد سلامة محاسبية:
//   1. توازن القيود (مدين = دائن)
//   2. لا قيود بدون أطراف
//   3. كل مستند مالي له قيد (القاعدة الذهبية)
//   4. لا قيود مكررة لنفس المستند
//   5. كل حساب له دور معرّف في النظام
// ============================================================================

import { db } from '@/lib/db'

export interface ConsistencyResult {
  rule: string
  passed: boolean
  violations: Array<{ ref: string; detail: string }>
}

export interface ConsistencyIssue {
  rule: string
  type: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  ref: string
  detail: string
}

/**
 * يتحقق من السلامة المالية الكاملة للنظام
 * @returns { totalRules, passedRules, results, score, issues }
 */
export async function validateFinancialConsistency(): Promise<{
  totalRules: number
  passedRules: number
  results: ConsistencyResult[]
  issues: ConsistencyIssue[]
  score: number
}> {
  const results: ConsistencyResult[] = []
  const issues: ConsistencyIssue[] = []

  // Rule 1: توازن القيود (debit column vs credit column on JournalLine)
  // FIXED (HIGH #20): filter to POSTED, non-deleted entries + non-deleted lines only.
  // The prior raw SQL counted DRAFT entries (naturally unbalanced while editing) and
  // soft-deleted entries/lines as violations → false positives.
  const unbalanced = await db.$queryRaw<Array<{ entryId: string; debits: number; credits: number }>>`
    SELECT je.id as "entryId",
      COALESCE(SUM(jl.debit), 0) as debits,
      COALESCE(SUM(jl.credit), 0) as credits
    FROM "JournalEntry" je
    LEFT JOIN "JournalLine" jl ON jl."journalEntryId" = je.id AND jl."deletedAt" IS NULL
    WHERE je."deletedAt" IS NULL AND je."status" = 'POSTED'
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
    LIMIT 100
  `
  results.push({
    rule: 'توازن القيود (مدين = دائن)',
    passed: unbalanced.length === 0,
    violations: unbalanced.map(u => ({ ref: u.entryId, detail: `مدين=${u.debits} دائن=${u.credits}` })),
  })
  unbalanced.forEach(u => issues.push({
    rule: 'توازن القيود', type: 'UNBALANCED_ENTRY', severity: 'CRITICAL',
    ref: u.entryId, detail: `القيد غير متوازن: مدين=${u.debits} دائن=${u.credits}`,
  }))

  // Rule 2: قيود بدون أطراف (POSTED entries only — DRAFT entries may be in progress)
  const emptyEntries = await db.journalEntry.findMany({
    where: { lines: { none: {} }, deletedAt: null, status: 'POSTED' },
    take: 100,
    select: { id: true, entryNo: true },
  })
  results.push({
    rule: 'لا قيود بدون أطراف',
    passed: emptyEntries.length === 0,
    violations: emptyEntries.map(e => ({ ref: e.id, detail: `القيد ${e.entryNo} بدون أطراف` })),
  })
  emptyEntries.forEach(e => issues.push({
    rule: 'قيد بدون أطراف', type: 'EMPTY_ENTRY', severity: 'CRITICAL',
    ref: e.id, detail: `القيد ${e.entryNo} بدون أطراف`,
  }))

  // Rule 3: المستندات المالية بدون قيد
  const salesInvoicesWithoutJE = await db.salesInvoice.count({ where: { journalEntryId: null } })
  const clientPaymentsWithoutJE = await db.clientPayment.count({ where: { journalEntryId: null } })
  const expensesWithoutJE = await db.expense.count({ where: { journalEntryId: null } })
  const supplierPaymentsWithoutJE = await db.supplierPayment.count({ where: { journalEntryId: null } })
  const totalDocsWithoutJE = salesInvoicesWithoutJE + clientPaymentsWithoutJE + expensesWithoutJE + supplierPaymentsWithoutJE
  results.push({
    rule: 'كل مستند مالي له قيد',
    passed: totalDocsWithoutJE === 0,
    violations: [
      ...(salesInvoicesWithoutJE > 0 ? [{ ref: 'sales-invoices', detail: `${salesInvoicesWithoutJE} فاتورة بدون قيد` }] : []),
      ...(clientPaymentsWithoutJE > 0 ? [{ ref: 'client-payments', detail: `${clientPaymentsWithoutJE} دفعة بدون قيد` }] : []),
      ...(expensesWithoutJE > 0 ? [{ ref: 'expenses', detail: `${expensesWithoutJE} مصروف بدون قيد` }] : []),
      ...(supplierPaymentsWithoutJE > 0 ? [{ ref: 'supplier-payments', detail: `${supplierPaymentsWithoutJE} دفعة مورد بدون قيد` }] : []),
    ],
  })
  if (salesInvoicesWithoutJE > 0) issues.push({
    rule: 'مستند بدون قيد', type: 'MISSING_JOURNAL_ENTRY', severity: 'WARNING',
    ref: 'sales-invoices', detail: `${salesInvoicesWithoutJE} فاتورة بدون قيد`,
  })
  if (clientPaymentsWithoutJE > 0) issues.push({
    rule: 'مستند بدون قيد', type: 'MISSING_JOURNAL_ENTRY', severity: 'WARNING',
    ref: 'client-payments', detail: `${clientPaymentsWithoutJE} دفعة بدون قيد`,
  })
  if (expensesWithoutJE > 0) issues.push({
    rule: 'مستند بدون قيد', type: 'MISSING_JOURNAL_ENTRY', severity: 'WARNING',
    ref: 'expenses', detail: `${expensesWithoutJE} مصروف بدون قيد`,
  })
  if (supplierPaymentsWithoutJE > 0) issues.push({
    rule: 'مستند بدون قيد', type: 'MISSING_JOURNAL_ENTRY', severity: 'WARNING',
    ref: 'supplier-payments', detail: `${supplierPaymentsWithoutJE} دفعة مورد بدون قيد`,
  })

  // Rule 4: قيود مكررة لنفس المستند (exclude deleted entries + reversal pairs)
  // NOTE: a reversal entry shares sourceType/sourceId with its original by design
  // (reverseEntry sets sourceId to the original's sourceId). That is NOT a duplicate.
  // We exclude isReversal entries from this check so legitimate reversals don't flag.
  const duplicateRefs = await db.$queryRaw<Array<{ sourceType: string | null; sourceId: string | null; cnt: bigint }>>`
    SELECT "sourceType", "sourceId", COUNT(*) as cnt
    FROM "JournalEntry"
    WHERE "sourceId" IS NOT NULL AND "deletedAt" IS NULL AND "isReversal" = false
    GROUP BY "sourceType", "sourceId"
    HAVING COUNT(*) > 1
    LIMIT 100
  `
  results.push({
    rule: 'لا قيود مكررة لنفس المستند',
    passed: duplicateRefs.length === 0,
    violations: duplicateRefs.map(d => ({ ref: `${d.sourceType}:${d.sourceId}`, detail: `${Number(d.cnt)} قيود مكررة` })),
  })
  duplicateRefs.forEach(d => issues.push({
    rule: 'قيد مكرر', type: 'DUPLICATE_ENTRY', severity: 'WARNING',
    ref: `${d.sourceType}:${d.sourceId}`, detail: `${Number(d.cnt)} قيود مكررة لنفس المستند`,
  }))

  // Rule 5: كل حساب له دور معرّف
  const accountsWithoutRole = await db.account.count({
    where: { accountRole: null, isActive: true, allowPosting: true },
  })
  results.push({
    rule: 'كل حساب له دور معرّف في النظام',
    passed: accountsWithoutRole === 0,
    violations: accountsWithoutRole > 0 ? [{ ref: 'accounts', detail: `${accountsWithoutRole} حساب نشط بدون دور` }] : [],
  })
  if (accountsWithoutRole > 0) issues.push({
    rule: 'حساب بدون دور', type: 'MISSING_ROLE', severity: 'INFO',
    ref: 'accounts', detail: `${accountsWithoutRole} حساب نشط بدون دور معرّف`,
  })

  const passedRules = results.filter(r => r.passed).length
  return {
    totalRules: results.length,
    passedRules,
    results,
    issues,
    score: (passedRules / results.length) * 100,
  }
}
