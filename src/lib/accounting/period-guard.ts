// ============================================================================
// نظام بِنَاء ERP - حارس إقفال الفترات المالية
// Binaa ERP - Period Closing Guard (Phase 1)
// ============================================================================
// يمنع ترحيل قيود إلى فترات مغلقة — متطلب IFRS / GAAP أساسي
// ============================================================================

import { db } from '@/lib/db'

type TxClient = typeof db | any

/**
 * يتحقق إن كانت الفترة مفتوحة للترحيل
 * @param date تاريخ القيد
 * @param tx optional transaction client
 * @throws Error إذا كانت الفترة مغلقة
 */
export async function assertPeriodOpen(date: Date, tx?: TxClient): Promise<void> {
  const client = tx ?? db

  // 1) ابحث عن FiscalYear التي تحتوي هذا التاريخ
  const fiscalYear = await client.fiscalYear.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
  })
  if (fiscalYear && fiscalYear.status === 'CLOSED') {
    throw new Error(`السنة المالية ${fiscalYear.name} مغلقة — لا يمكن الترحيل`)
  }

  // 2) ابحث عن PeriodClosing records (سنوي أو شهري)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const closing = await client.periodClosing.findFirst({
    where: {
      OR: [
        { periodType: 'YEARLY', year },
        { periodType: 'MONTHLY', year, periodNo: month },
      ],
      status: 'CLOSED',
    },
  })
  if (closing) {
    throw new Error(`الفترة مغلقة بإقفال صريح (${closing.periodType} ${year}/${month}) — لا يمكن الترحيل`)
  }
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
