// ============================================================================
// نظام بِنَاء ERP - التقويم المحاسبي الموحّد
// Binaa ERP - Unified Accounting Calendar
// ============================================================================
//
// المصدر الوحيد (Single Source of Truth) لحالة الفترات المالية:
//
//   FiscalYear (سنوي)
//      ↓
//   FiscalPeriod (شهري، 12 فترة لكل سنة)
//      ↓
//   الحالة: OPEN | LOCKED | CLOSED
//
// كل العمليات على الفترات MUST تمر عبر هذا الملف:
//   - assertPeriodOpen(date)     — يتحقق أن التاريخ في فترة مفتوحة
//   - getPeriodForDate(date)     — يجلب الفترة التي تحتوي التاريخ
//   - getFiscalYearForDate(date) — يجلب السنة المالية التي تحتوي التاريخ
//   - closePeriod(periodId)      — إقفال فترة شهرية
//   - closeFiscalYear(yearId)    — إقفال سنوي كامل (يُقفل كل الفترات + قيد إقفال)
//   - reopenPeriod(periodId)     — إعادة فتح فترة (admin override)
//   - reopenFiscalYear(yearId)   — إعادة فتح سنة (يعكس قيد الإقفال)
//   - lockPeriod(periodId)       — قفل مؤقت (يقبل الترحيل بشرط موافقة المدير)
//
// لا يمكن لأي API تجاوز هذا التقويم. guard.ts يستدعي assertPeriodOpen()
// في R6 لكل قيد جديد، فلا يمكن إنشاء قيد في فترة مغلقة إلا عبر admin override
// صريح.
//
// PeriodClosing model يُستخدم فقط كسجل تدقيق (audit log) لعمليات الإقفال
// السابقة — لا يُتحقق منه كـ state machine مستقل.
// ============================================================================

import { db } from '@/lib/db'
import type { PrismaTransaction } from './constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeriodStatus = 'OPEN' | 'LOCKED' | 'CLOSED'
export type FiscalYearStatus = 'OPEN' | 'CLOSING' | 'CLOSED'

export interface PeriodInfo {
  id: string
  fiscalYearId: string
  periodNo: number // 1-12
  startDate: Date
  endDate: Date
  status: PeriodStatus
  fiscalYear: {
    id: string
    name: string
    status: FiscalYearStatus
    startDate: Date
    endDate: Date
  }
}

export interface CalendarCheckResult {
  /** هل التاريخ في فترة مفتوحة؟ */
  isOpen: boolean
  /** هل التاريخ في فترة مقفلة مؤقتاً (LOCKED)؟ */
  isLocked: boolean
  /** هل التاريخ في فترة مُقفلة إقفالاً نهائياً (CLOSED)؟ */
  isClosed: boolean
  /** الفترة التي تحتوي التاريخ (إن وُجدت) */
  period?: PeriodInfo
  /** رسالة وصفية */
  message: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AccountingCalendarError extends Error {
  code: string
  details?: Record<string, unknown>
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AccountingCalendarError'
    this.code = code
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * اجلب السنة المالية التي تحتوي التاريخ المحدد.
 * تُرجع null إذا لم توجد سنة مالية تغطي هذا التاريخ.
 */
export async function getFiscalYearForDate(
  date: Date,
  tx?: PrismaTransaction
) {
  const client = tx ?? db
  return client.fiscalYear.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
  })
}

/**
 * اجلب الفترة الشهرية التي تحتوي التاريخ المحدد.
 * تُرجع null إذا لم توجد فترة تغطي هذا التاريخ.
 */
export async function getPeriodForDate(
  date: Date,
  tx?: PrismaTransaction
): Promise<PeriodInfo | null> {
  const client = tx ?? db
  const period = await client.fiscalPeriod.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
    include: {
      fiscalYear: {
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
      },
    },
  })
  if (!period) return null
  return {
    id: period.id,
    fiscalYearId: period.fiscalYearId,
    periodNo: period.periodNo,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status as PeriodStatus,
    fiscalYear: {
      id: period.fiscalYear.id,
      name: period.fiscalYear.name,
      status: period.fiscalYear.status as FiscalYearStatus,
      startDate: period.fiscalYear.startDate,
      endDate: period.fiscalYear.endDate,
    },
  }
}

/**
 * تحقق من حالة الفترة لتاريخ معيّن — المصدر الموحّد لكل القرارات.
 *
 * يتحقق من FiscalPeriod.status (المرجع الوحيد للحالة):
 *   - OPEN: الترحيل مسموح
 *   - LOCKED: الترحيل يتطلب موافقة المدير (allowAdminOverride)
 *   - CLOSED: الترحيل ممنوع إلا بإعادة فتح صريحة
 *
 * @param date تاريخ القيد
 * @param tx optional transaction client
 * @returns CalendarCheckResult
 */
export async function checkPeriodStatus(
  date: Date,
  tx?: PrismaTransaction
): Promise<CalendarCheckResult> {
  const period = await getPeriodForDate(date, tx)

  if (!period) {
    // No fiscal period covers this date — allow by default (system is permissive
    // when no calendar is configured, matching the historical behavior).
    return {
      isOpen: true,
      isLocked: false,
      isClosed: false,
      message: 'لا توجد فترة مالية مُعرّفة لهذا التاريخ — الترحيل مسموح',
    }
  }

  // Also check the parent fiscal year status
  if (period.fiscalYear.status === 'CLOSED') {
    return {
      isOpen: false,
      isLocked: false,
      isClosed: true,
      period,
      message: `السنة المالية ${period.fiscalYear.name} مُقفلة — يجب إعادة فتحها قبل الترحيل`,
    }
  }

  if (period.status === 'CLOSED') {
    return {
      isOpen: false,
      isLocked: false,
      isClosed: true,
      period,
      message: `الفترة ${period.fiscalYear.name} / شهر ${period.periodNo} مُقفلة — يجب إعادة فتحها قبل الترحيل`,
    }
  }

  if (period.status === 'LOCKED') {
    return {
      isOpen: false,
      isLocked: true,
      isClosed: false,
      period,
      message: `الفترة ${period.fiscalYear.name} / شهر ${period.periodNo} مقفلة مؤقتاً — الترحيل يتطلب موافقة المدير`,
    }
  }

  return {
    isOpen: true,
    isLocked: false,
    isClosed: false,
    period,
    message: `الفترة ${period.fiscalYear.name} / شهر ${period.periodNo} مفتوحة`,
  }
}

/**
 * تحقق أن التاريخ في فترة مفتوحة — يُرمي خطأً إذا كانت الفترة مغلقة.
 *
 * هذا هو الـ API الوحيد الذي يستدعيه guard.ts في R6. لا يجوز لأي كود آخر
 * التحقق من حالة الفترة بشكل مستقل.
 *
 * @param date تاريخ القيد
 * @param tx optional transaction client
 * @param options.allowAdminOverride — إذا true، يتجاوز الفحص (للإدخالات النظامية)
 * @param options.allowLocked — إذا true، يسمح بالترحيل في الفترات المقفلة مؤقتاً
 *
 * @throws AccountingCalendarError إذا كانت الفترة مغلقة (CLOSED) ولم يُمرّر allowAdminOverride
 */
export async function assertPeriodOpen(
  date: Date,
  tx?: PrismaTransaction,
  options?: { allowAdminOverride?: boolean; allowLocked?: boolean }
): Promise<void> {
  // Admin override: skip all checks entirely (system manager / system entries)
  if (options?.allowAdminOverride) return

  const check = await checkPeriodStatus(date, tx)

  if (check.isOpen) return

  if (check.isLocked && options?.allowLocked) {
    // Locked periods can be posted to with explicit allowLocked=true
    // (admin acknowledges the period is locked but chooses to post anyway)
    return
  }

  if (check.isClosed) {
    throw new AccountingCalendarError(
      'PERIOD_CLOSED',
      check.message,
      { date: date.toISOString(), period: check.period }
    )
  }

  if (check.isLocked) {
    throw new AccountingCalendarError(
      'PERIOD_LOCKED',
      check.message,
      { date: date.toISOString(), period: check.period }
    )
  }
}

// ---------------------------------------------------------------------------
// Write operations (close / reopen / lock)
// ---------------------------------------------------------------------------

/**
 * قفل فترة شهري مؤقتاً (LOCKED). يسمح بإعادة الفتح بسهولة.
 * لا يُنشئ قيد إقفال — مجرد تغيير حالة.
 */
export async function lockPeriod(
  periodId: string,
  tx?: PrismaTransaction,
  options?: { closedBy?: string; notes?: string }
): Promise<void> {
  const client = tx ?? db
  const period = await client.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } })
  if (period.status !== 'OPEN') {
    throw new AccountingCalendarError(
      'PERIOD_NOT_OPEN',
      `لا يمكن قفل فترة بحالة ${period.status}`,
      { periodId, currentStatus: period.status }
    )
  }
  await client.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: 'LOCKED' },
  })
  // Record in PeriodClosing audit log (type=MONTHLY, status=LOCKED)
  await client.periodClosing.upsert({
    where: {
      year_month_type: {
        year: period.endDate.getFullYear(),
        month: period.endDate.getMonth() + 1,
        type: 'MONTHLY',
      },
    },
    update: { status: 'LOCKED', closedBy: options?.closedBy || null },
    create: {
      year: period.endDate.getFullYear(),
      month: period.endDate.getMonth() + 1,
      type: 'MONTHLY',
      status: 'LOCKED',
      closedBy: options?.closedBy || null,
    },
  })
}

/**
 * إقفال فترة شهري إقفالاً نهائياً (CLOSED).
 * يتطلب أن تكون الفترة OPEN أو LOCKED.
 * لا يُنشئ قيد إقفال (الإقفال الشهري لا يتطلب قيداً — فقط الإقفال السنوي).
 */
export async function closePeriod(
  periodId: string,
  tx?: PrismaTransaction,
  options?: { closedBy?: string; notes?: string }
): Promise<void> {
  const client = tx ?? db
  const period = await client.fiscalPeriod.findUniqueOrThrow({
    where: { id: periodId },
    include: { fiscalYear: true },
  })
  if (period.status === 'CLOSED') {
    throw new AccountingCalendarError(
      'PERIOD_ALREADY_CLOSED',
      `الفترة ${period.fiscalYear.name} / شهر ${period.periodNo} مُقفلة بالفعل`,
      { periodId }
    )
  }
  if (period.fiscalYear.status === 'CLOSED') {
    throw new AccountingCalendarError(
      'FISCAL_YEAR_CLOSED',
      `السنة المالية ${period.fiscalYear.name} مُقفلة — لا يمكن إقفال فترة فيها`,
      { periodId, fiscalYearId: period.fiscalYearId }
    )
  }
  await client.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: 'CLOSED' },
  })
  // Record in PeriodClosing audit log
  await client.periodClosing.upsert({
    where: {
      year_month_type: {
        year: period.endDate.getFullYear(),
        month: period.endDate.getMonth() + 1,
        type: 'MONTHLY',
      },
    },
    update: {
      status: 'CLOSED',
      closedBy: options?.closedBy || null,
      closedAt: new Date(),
    },
    create: {
      year: period.endDate.getFullYear(),
      month: period.endDate.getMonth() + 1,
      type: 'MONTHLY',
      status: 'CLOSED',
      closedBy: options?.closedBy || null,
      closedAt: new Date(),
    },
  })
}

/**
 * إعادة فتح فترة شهري (OPEN).
 * يتطلب أن تكون الفترة CLOSED أو LOCKED.
 * إذا كانت السنة المالية مُقفلة، يجب إعادة فتحها أولاً.
 */
export async function reopenPeriod(
  periodId: string,
  tx?: PrismaTransaction,
  _options?: { reopenedBy?: string; notes?: string }
): Promise<void> {
  const client = tx ?? db
  const period = await client.fiscalPeriod.findUniqueOrThrow({
    where: { id: periodId },
    include: { fiscalYear: true },
  })
  if (period.status === 'OPEN') {
    throw new AccountingCalendarError(
      'PERIOD_ALREADY_OPEN',
      `الفترة ${period.fiscalYear.name} / شهر ${period.periodNo} مفتوحة بالفعل`,
      { periodId }
    )
  }
  if (period.fiscalYear.status === 'CLOSED') {
    throw new AccountingCalendarError(
      'FISCAL_YEAR_CLOSED',
      `السنة المالية ${period.fiscalYear.name} مُقفلة — يجب إعادة فتح السنة أولاً قبل إعادة فتح الفترة`,
      { periodId, fiscalYearId: period.fiscalYearId }
    )
  }
  await client.fiscalPeriod.update({
    where: { id: periodId },
    data: { status: 'OPEN' },
  })
  // Update PeriodClosing audit log
  await client.periodClosing.updateMany({
    where: {
      year: period.endDate.getFullYear(),
      month: period.endDate.getMonth() + 1,
      type: 'MONTHLY',
    },
    data: {
      status: 'REOPENED',
    },
  })
}

// ---------------------------------------------------------------------------
// Calendar initialization
// ---------------------------------------------------------------------------

/**
 * أنشئ سنة مالية جديدة بـ 12 فترة شهرية.
 * إذا كانت السنة موجودة مسبقاً، تُرجع السنة الموجودة دون تعديل.
 *
 * @param name اسم السنة (مثال: "2025")
 * @param startDate تاريخ بداية السنة
 * @param endDate تاريخ نهاية السنة
 */
export async function createFiscalYear(
  name: string,
  startDate: Date,
  endDate: Date,
  tx?: PrismaTransaction
) {
  const client = tx ?? db
  const existing = await client.fiscalYear.findUnique({ where: { name } })
  if (existing) return existing

  const fy = await client.fiscalYear.create({
    data: {
      name,
      startDate,
      endDate,
      status: 'OPEN',
    },
  })

  // Create 12 monthly periods
  const periods: Array<{
    fiscalYearId: string
    periodNo: number
    startDate: Date
    endDate: Date
    status: string
  }> = []
  const current = new Date(startDate)
  while (current <= endDate) {
    const periodNo = current.getMonth() + 1
    const periodStart = new Date(current.getFullYear(), current.getMonth(), 1)
    const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999)
    periods.push({
      fiscalYearId: fy.id,
      periodNo,
      startDate: periodStart,
      endDate: periodEnd,
      status: 'OPEN',
    })
    current.setMonth(current.getMonth() + 1)
  }
  await client.fiscalPeriod.createMany({ data: periods })

  return fy
}

/**
 * اجلب جميع السنوات المالية مع فتراتها.
 */
export async function getFiscalYearsWithPeriods(tx?: PrismaTransaction) {
  const client = tx ?? db
  return client.fiscalYear.findMany({
    include: {
      periods: { orderBy: { periodNo: 'asc' } },
    },
    orderBy: { startDate: 'desc' },
  })
}
