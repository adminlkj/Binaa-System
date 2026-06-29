// ============================================================================
// نظام بِنَاء ERP - حارس إقفال الفترات المالية (DELEGATE)
// Binaa ERP - Period Closing Guard (Delegate to Unified Calendar)
// ============================================================================
//
// ⚠️  COMPATIBILITY SHIM — جميع القرارات تُتخذ في accounting-calendar.ts
//
// هذا الملف يحافظ على التوافق الخلفي للكود الذي يستورد من
// '@/lib/accounting/period-guard'. كل الدوال تُفوّض إلى التقويم الموحّد.
//
// الكود الجديد MUST يستورد من '@/lib/accounting/accounting-calendar' مباشرة.
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from './constants'

// Re-export the canonical calendar API for backward compatibility.
// Consumers that historically imported from '@/lib/accounting/period-guard'
// will get the unified implementation transparently.
export {
  getFiscalYearForDate,
  getPeriodForDate,
  checkPeriodStatus,
  assertPeriodOpen,
  lockPeriod,
  closePeriod,
  reopenPeriod,
  createFiscalYear,
  getFiscalYearsWithPeriods,
  AccountingCalendarError,
} from './accounting-calendar'

export type {
  PeriodStatus,
  FiscalYearStatus,
  PeriodInfo,
  CalendarCheckResult,
} from './accounting-calendar'

// Legacy type alias (some consumers imported PeriodCheckResult)
export type PeriodCheckResult = import('./accounting-calendar').CalendarCheckResult

/**
 * @deprecated Use getFiscalYearForDate from accounting-calendar instead.
 * Kept for backward compatibility.
 *
 * NOTE: The historical behavior returned a FiscalYear (not a period).
 * The canonical replacement is getFiscalYearForDate(date, tx).
 */
export async function getOpenPeriod(date: Date, tx?: PrismaTransaction) {
  const client = tx ?? db
  return client.fiscalYear.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN' },
  })
}
