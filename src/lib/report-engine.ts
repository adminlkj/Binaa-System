// ============================================================================
// نظام بِنَاء ERP - محرك التقارير (Compat Layer)
// Binaa ERP - Report Engine (Backward Compatibility Wrapper)
// ============================================================================
//
// ⚠️  COMPATIBILITY SHIM — DO NOT ADD NEW LOGIC HERE
//
// تم توحيد جميع دوال القراءة في `@/lib/accounting/queries` (Single Source of
// Truth). هذا الملف مجرد إعادة تصدير للتوافق الخلفي — أي كود يستورد من
// `@/lib/report-engine` سيستمر بالعمل دون تغيير.
//
// الكود الجديد MUST يستورد من `@/lib/accounting/queries` مباشرةً.
// ============================================================================

export {
  // Account lookups
  getAccountByCode,
  // Account-level balances
  getAccountBalancesByType,
  getBalanceByRole,
  getBalanceByType,
  getAccountBalance,
  // Trial balance
  getTrialBalance,
  // Statements
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  // General ledger
  getGeneralLedger,
  // Project / cost center
  buildProjectCostCenterMap,
  getProjectBalances,
  getProjectCostBreakdown,
  getCostCenterReport,
  // VAT
  getVATReconciliation,
  // Consistency check
  verifyNumericalConsistency,
} from '@/lib/accounting/queries'

// Re-export the types that consumers historically imported from this module.
export type {
  AccountBalance,
  TrialBalanceRow,
  TrialBalanceResult,
  IncomeStatementData,
  BalanceSheetData,
  CashFlowData,
  GeneralLedgerLine,
  GeneralLedgerData,
  CostCenterBalance,
  VATReconciliationData,
} from '@/lib/accounting/queries'

// DateRange type was historically exported from here
export type { DateRange } from '@/lib/accounting/constants'
