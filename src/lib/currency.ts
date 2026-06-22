// ============================================================================
// نظام بِنَاء ERP - مركز العملات والتنسيق
// Binaa ERP - Currency Helper (Phase 3-A)
// ============================================================================

import { db } from '@/lib/db'

export interface CurrencyInfo {
  code: string
  symbolAr: string
  symbolEn: string
  name: string
}

export const DEFAULT_CURRENCY: CurrencyInfo = {
  code: 'SAR',
  symbolAr: 'ر.س',
  symbolEn: 'SAR',
  name: 'ريال سعودي',
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  SAR: { code: 'SAR', symbolAr: 'ر.س', symbolEn: 'SAR', name: 'ريال سعودي' },
  USD: { code: 'USD', symbolAr: 'د.أ', symbolEn: 'USD', name: 'دولار أمريكي' },
  EUR: { code: 'EUR', symbolAr: 'يورو', symbolEn: 'EUR', name: 'يورو' },
  GBP: { code: 'GBP', symbolAr: 'ج.إ', symbolEn: 'GBP', name: 'جنيه إسترليني' },
  AED: { code: 'AED', symbolAr: 'د.إ', symbolEn: 'AED', name: 'درهم إماراتي' },
  KWD: { code: 'KWD', symbolAr: 'د.ك', symbolEn: 'KWD', name: 'دينار كويتي' },
  BHD: { code: 'BHD', symbolAr: 'د.ب', symbolEn: 'BHD', name: 'دينار بحريني' },
  QAR: { code: 'QAR', symbolAr: 'ر.ق', symbolEn: 'QAR', name: 'ريال قطري' },
  OMR: { code: 'OMR', symbolAr: 'ر.ع', symbolEn: 'OMR', name: 'ريال عماني' },
  EGP: { code: 'EGP', symbolAr: 'ج.م', symbolEn: 'EGP', name: 'جنيه مصري' },
  JOD: { code: 'JOD', symbolAr: 'د.أ', symbolEn: 'JOD', name: 'دينار أردني' },
  LBP: { code: 'LBP', symbolAr: 'ل.ل', symbolEn: 'LBP', name: 'ليرة لبنانية' },
  TRY: { code: 'TRY', symbolAr: 'ل.ت', symbolEn: 'TRY', name: 'ليرة تركية' },
  CNY: { code: 'CNY', symbolAr: 'ي.ص', symbolEn: 'CNY', name: 'يوان صيني' },
  JPY: { code: 'JPY', symbolAr: 'ي.ي', symbolEn: 'JPY', name: 'ين ياباني' },
  INR: { code: 'INR', symbolAr: 'ر.ه', symbolEn: 'INR', name: 'روبية هندية' },
  PKR: { code: 'PKR', symbolAr: 'ر.ب', symbolEn: 'PKR', name: 'روبية باكستانية' },
  DZD: { code: 'DZD', symbolAr: 'د.ج', symbolEn: 'DZD', name: 'دينار جزائري' },
  MAD: { code: 'MAD', symbolAr: 'د.م', symbolEn: 'MAD', name: 'درهم مغربي' },
  TND: { code: 'TND', symbolAr: 'د.ت', symbolEn: 'TND', name: 'دينار تونسي' },
  LYD: { code: 'LYD', symbolAr: 'د.ل', symbolEn: 'LYD', name: 'دينار ليبي' },
  IQD: { code: 'IQD', symbolAr: 'د.ع', symbolEn: 'IQD', name: 'دينار عراقي' },
}

export function getCurrency(code?: string): CurrencyInfo {
  if (!code) return DEFAULT_CURRENCY
  return CURRENCIES[code.toUpperCase()] || DEFAULT_CURRENCY
}

/**
 * يجلب عملة الشركة من الإعدادات (مع fallback إلى SAR)
 */
export async function getCompanyCurrency(): Promise<CurrencyInfo> {
  try {
    const settings = await db.companySetting.findFirst()
    if (settings?.currency) {
      return getCurrency(settings.currency)
    }
  } catch {
    // ignore — fallback to default
  }
  return DEFAULT_CURRENCY
}

/**
 * تنسيق مبلغ مع رمز العملة
 */
export function formatAmount(
  amount: number,
  currency?: CurrencyInfo,
  locale: 'ar' | 'en' = 'ar'
): string {
  const cur = currency || DEFAULT_CURRENCY
  const formatted = amount.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return locale === 'ar' ? `${formatted} ${cur.symbolAr}` : `${cur.symbolEn} ${formatted}`
}

/**
 * تنسيق للقوالب المطبوعة (بدون فاصلة آلاف لتفادي مشاكل الـ RTL)
 */
export function formatAmountForPrint(
  amount: number,
  currencyCode?: string,
  locale: 'ar' | 'en' = 'ar'
): string {
  const cur = getCurrency(currencyCode)
  const formatted = Number(amount || 0).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return locale === 'ar' ? `${formatted} ${cur.symbolAr}` : `${formatted} ${cur.symbolEn}`
}

/**
 * تنسيق رقم فقط (بدون رمز العملة)
 */
export function formatAmountNumber(amount: number, locale: 'ar' | 'en' = 'ar'): string {
  return Number(amount || 0).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
