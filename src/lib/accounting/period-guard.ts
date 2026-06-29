// ============================================================================
// نظام بِنَاء ERP - حارس إقفال الفترات المالية
// Binaa ERP - Period Closing Guard (Phase 1)
// ============================================================================
// يدعم إقفال الفترات المالية كمؤشر استشاري — المستخدم سيد النظام ومديره.
// القاعدة العامة: النظام يساعد المستخدم ولا يمنعه من إنشاء العمليات في أي
// فترة يحتاجها (بما في ذلك الفترات المغلقة لأغراض التسوية أو التعديل الرجعي).
//
// السلوك الحالي:
//   - يكتشف إذا كانت الفترة/السنة مغلقة ويسجل تنبيهاً (console.warn)
//   - لا يرمي خطأً — يسمح بالترحيل دائماً (المستخدم يقرر)
//   - يمكن تفعيل المنع الصارم عبر options.strict=true (للاستخدام الاستثنائي)
// ============================================================================

import { db } from '@/lib/db'

type TxClient = typeof db | any

export interface PeriodCheckResult {
  /** هل الفترة مغلقة؟ */
  isClosed: boolean
  /** نوع الإغلاق (سنوي/شهري) */
  closingType?: 'YEARLY' | 'MONTHLY' | 'FISCAL_YEAR'
  /** اسم السنة المالية المغلقة (إن وجدت) */
  fiscalYearName?: string
  /** رسالة وصفية */
  message?: string
}

/**
 * يتحقق من حالة الفترة لتاريخ معيّن.
 * يعيد معلومات الإغلاق دون رمي خطأ — المستخدم سيد النظام.
 *
 * @param date تاريخ القيد
 * @param tx optional transaction client
 * @param options.strict — إذا true، يرمي خطأً عند الإغلاق (للاستخدام الاستثنائي)
 */
export async function assertPeriodOpen(
  date: Date,
  tx?: TxClient,
  options?: { allowAdminOverride?: boolean; strict?: boolean }
): Promise<void> {
  // Admin override: skip all checks entirely (system manager / system entries)
  if (options?.allowAdminOverride) return

  const client = tx ?? db
  const check = await checkPeriodStatus(date, client)

  // Default: advisory only (warn). User is master — system informs, not blocks.
  if (check.isClosed) {
    if (options?.strict) {
      throw new Error(check.message || `الفترة مغلقة — لا يمكن الترحيل`)
    }
    // Just warn — allow the operation
    console.warn(`[PeriodGuard] تنبيه استشاري: ${check.message}`)
  }
}

/**
 * يجلب حالة الفترة لتاريخ معيّن دون رمي أي خطأ.
 * يستخدم لعرض المؤشرات في الواجهة (مثلاً: "هذه الفترة مغلقة")
 */
export async function checkPeriodStatus(date: Date, tx?: TxClient): Promise<PeriodCheckResult> {
  const client = tx ?? db

  // 1) ابحث عن FiscalYear التي تحتوي هذا التاريخ
  try {
    const fiscalYear = await client.fiscalYear.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
    })
    if (fiscalYear && fiscalYear.status === 'CLOSED') {
      return {
        isClosed: true,
        closingType: 'FISCAL_YEAR',
        fiscalYearName: fiscalYear.name,
        message: `السنة المالية ${fiscalYear.name} مغلقة — الترحيل مسموح بصفة استثنائية بناءً على طلب المدير`,
      }
    }
  } catch {
    // ignore — table might not exist yet
  }

  // 2) ابحث عن PeriodClosing records (سنوي أو شهري)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  try {
    const closing = await client.periodClosing.findFirst({
      where: {
        OR: [
          { type: 'YEARLY', year },
          { type: 'MONTHLY', year, month },
        ],
        status: 'CLOSED',
      },
    })
    if (closing) {
      return {
        isClosed: true,
        closingType: closing.type as 'YEARLY' | 'MONTHLY',
        message: `الفترة مغلقة بإقفال صريح (${closing.type} ${year}/${month}) — الترحيل مسموح بصفة استثنائية`,
      }
    }
  } catch {
    // ignore
  }

  return { isClosed: false }
}

/**
 * يجلب الفترة المفتوحة لتاريخ معيّن
 */
export async function getOpenPeriod(date: Date, tx?: TxClient) {
  const client = tx ?? db
  return client.fiscalYear.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN' },
  })
}
