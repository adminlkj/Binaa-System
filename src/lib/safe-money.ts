// ============================================================================
// نظام بِنَاء ERP - مساعد العمليات المالية الآمنة (safeMoney)
// Binaa ERP - Safe Money Arithmetic Helper
// ============================================================================
//
// القاعدة الذهبية: لا يُسمح بأي حساب على JS number للقيم المالية.
// كل الحسابات المالية MUST تمر عبر Decimal (decimal.js) للحفاظ على الدقة.
//
// النقطة العائمة (Float64) تفقد الدقة بعد 2^53 (~9 كوادريليون). للريال السعودي
// مع الـ halalas (خانتان عشريتان) يصبح الحد الآمن ~9 تريليون ريال فقط، لكن
// الأخطر هو تراكم أخطاء التقريب في الإهلاك (60 شهر) و IFRS 15 والإقفال السنوي.
//
// كل دالة هنا تأخذ Money (Decimal | string | number | null) وتُعيد Decimal.
// في حدود الـ DB: استخدم toPrismaDecimal(). في حدود الـ JSON: toNumberForJson().
//
// ============================================================================

import { Prisma } from '@prisma/client'
import Decimal from 'decimal.js'

// SOCPA / ZATCA standard: rounding to 2 decimal places (halala), ROUND_HALF_UP
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

export type Money = Decimal | string | number | null | undefined

export const ZERO = new Decimal('0')
export const ONE = new Decimal('1')
export const HUNDRED = new Decimal('100')
export const TOLERANCE = new Decimal('0.01') // 1 halala — tighter than the old 0.5 SAR VAT epsilon
export const SAUDI_VAT_RATE = new Decimal('0.15')

/** تحويل أي قيمة إلى Decimal بأمان. null/undefined/NaN → ZERO. */
export function toDecimal(value: Money): Decimal {
  if (value === null || value === undefined) return ZERO
  if (value instanceof Decimal) return value
  if (typeof value === 'string') {
    if (value.trim() === '') return ZERO
    const d = new Decimal(value)
    return d.isNaN() ? ZERO : d
  }
  if (typeof value === 'number') return Number.isFinite(value) ? new Decimal(value) : ZERO
  // Prisma.Decimal is a subclass of Decimal.js Decimal, so instanceof works,
  // but be defensive for any other duck-typed value.
  try {
    const d = new Decimal(value as any)
    return d.isNaN() ? ZERO : d
  } catch {
    return ZERO
  }
}

/** جمع مبلغين. */
export const addMoney = (a: Money, b: Money): Decimal => toDecimal(a).plus(toDecimal(b))
/** طرح b من a. */
export const subMoney = (a: Money, b: Money): Decimal => toDecimal(a).minus(toDecimal(b))
/** ضرب مبلغين. */
export const mulMoney = (a: Money, b: Money): Decimal => toDecimal(a).times(toDecimal(b))
/** قسمة a على b (يُخطئ عند القسمة على صفر). */
export const divMoney = (a: Money, b: Money): Decimal => {
  const bb = toDecimal(b)
  if (bb.isZero()) throw new Error('safeMoney: division by zero')
  return toDecimal(a).div(bb)
}
/** تقريب لخانتين عشريتين (halala) بأسلوب ROUND_HALF_UP المتوافق مع SOCPA/ZATCA. */
export const round2Money = (a: Money): Decimal => toDecimal(a).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
/** القيمة المطلقة. */
export const absMoney = (a: Money): Decimal => toDecimal(a).abs()
/** سالب القيمة. */
export const negMoney = (a: Money): Decimal => toDecimal(a).neg()
/** مقارنة: -1 if a<b, 0 if eq, 1 if a>b. */
export const cmpMoney = (a: Money, b: Money): number => toDecimal(a).comparedTo(toDecimal(b))
/** هل يتساوى a و b ضمن التسامح (1 halala افتراضياً)؟ */
export const eqMoney = (a: Money, b: Money, tol: Money = TOLERANCE): boolean =>
  toDecimal(a).minus(toDecimal(b)).abs().lte(toDecimal(tol))
/** هل القيمة صفر ضمن التسامح؟ */
export const isZeroMoney = (a: Money, tol: Money = TOLERANCE): boolean =>
  toDecimal(a).abs().lte(toDecimal(tol))
/** هل القيمة موجبة (> التسامح)؟ */
export const isPositiveMoney = (a: Money, tol: Money = TOLERANCE): boolean =>
  toDecimal(a).gt(toDecimal(tol))
/** هل القيمة سالبة (< -التسامح)؟ */
export const isNegativeMoney = (a: Money, tol: Money = TOLERANCE): boolean =>
  toDecimal(a).lt(toDecimal(tol).neg())
/** أكبر قيمة. */
export const maxMoney = (a: Money, b: Money): Decimal => Decimal.max(toDecimal(a), toDecimal(b))
/** أصغر قيمة. */
export const minMoney = (a: Money, b: Money): Decimal => Decimal.min(toDecimal(a), toDecimal(b))

/** جمع مصفوفة من القيم. */
export const sumMoney = (values: Money[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), ZERO)

/** صافي الرصيد = مدين - دائن (قد يكون سالباً). */
export const netDebitMoney = (debit: Money, credit: Money): Decimal =>
  subMoney(debit, credit)

/** حدد الرصيد الطبيعي للحساب: الأصول/المصروف → مدين، الخصوم/حقوق الملكية/الإيراد → دائن. */
export function normalBalance(type: string): 'DEBIT' | 'CREDIT' {
  if (type === 'ASSET' || type === 'EXPENSE') return 'DEBIT'
  if (type === 'LIABILITY' || type === 'EQUITY' || type === 'REVENUE') return 'CREDIT'
  return 'DEBIT' // safe default
}

/** الرصيد الموقّع: موجب إذا في جهته الطبيعية، سالب إذا عكسها. */
export function signedBalance(type: string, debit: Money, credit: Money): Decimal {
  const net = netDebitMoney(debit, credit)
  return normalBalance(type) === 'DEBIT' ? net : net.neg()
}

/** تحويل Decimal إلى Prisma.Decimal للكتابة لقاعدة البيانات. */
export const toPrismaDecimal = (a: Money): Prisma.Decimal =>
  new Prisma.Decimal(toDecimal(a).toString())

/**
 * تحويل Decimal إلى JS number — **فقط** عند حدود الـ JSON / API response.
 * لا تستخدمه أبداً في منتصف حساب مالي.
 */
export const toNumberForJson = (a: Money): number => toDecimal(a).toNumber()

/** سلسلة نصية بدقة كاملة (للتخزين/المقارنة). */
export const toStringMoney = (a: Money): string => toDecimal(a).toFixed(2)

// ---------------------------------------------------------------------------
// VAT helpers (السعودية 15%)
// ---------------------------------------------------------------------------

/** احسب ضريبة القيمة المضافة لمبلغ معين (افتراضياً 15%). */
export const computeVat = (subtotal: Money, rate: Money = SAUDI_VAT_RATE): Decimal =>
  round2Money(mulMoney(subtotal, rate))

/** احسب الإجمالي شامل الضريبة. */
export const computeTotalWithVat = (subtotal: Money, rate: Money = SAUDI_VAT_RATE): Decimal =>
  round2Money(addMoney(subtotal, computeVat(subtotal, rate)))

/** استخرج المبلغ الصافي من الإجمالي شامل الضريبة. */
export const extractSubtotalFromTotal = (totalWithVat: Money, rate: Money = SAUDI_VAT_RATE): Decimal => {
  const r = toDecimal(rate)
  return round2Money(divMoney(totalWithVat, addMoney(ONE, r)))
}
