// ============================================================================
// أدوات الطباعة المشتركة - Shared Print Utilities
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { PrintSettings } from './types'

// ============ Amount Formatting ============

/** Format amount for print display with 2 decimal places (SAR standard) */
export function formatMoneyPrint(value: number): string {
  const safe = (typeof value === 'number' && !isNaN(value)) ? value : 0
  return safe.toFixed(2)
}

/** Format for print display with thousand separators and 2 decimals */
export function fmtPrint(value: number): string {
  const safe = (typeof value === 'number' && !isNaN(value)) ? value : 0
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Format amount for display with 2 decimal places (official prints) */
export function formatAmountOfficial(value: number): string {
  const safe = (typeof value === 'number' && !isNaN(value)) ? value : 0
  return safe.toFixed(2)
}

// ============ Currency Display ============

export function getCurrencySymbol(settings: PrintSettings, lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return settings.currencySymbolAr || settings.currencySymbol || 'ر.س'
  }
  return settings.currencySymbolEn || settings.currencySymbol || 'SAR'
}

/**
 * Detect if a currency symbol image is an SVG (already supports transparency).
 * Handles both URL paths (e.g., "/uploads/cur.svg") and data URLs
 * (e.g., "data:image/svg+xml;base64,...").
 */
function isSvgImage(src: string): boolean {
  const lower = src.toLowerCase().trim()
  return lower.startsWith('data:image/svg') || lower.endsWith('.svg') || lower.includes('.svg?')
}

/**
 * Render the currency symbol as inline HTML for print templates.
 *
 * - If `currencySymbolImage` is set:
 *   - For SVG: embed directly (SVGs already support transparency).
 *   - For PNG/JPG: apply `mix-blend-mode: multiply` so any dark/white
 *     background becomes invisible on white paper.
 *   - Image height matches surrounding text (`height: 0.9em`).
 * - Otherwise, fall back to the configured text symbol
 *   (`currencySymbolAr` / `currencySymbolEn` / `currencySymbol`), which
 *   defaults to the Saudi Riyal Unicode symbol "﷼" (U+FDFC) per
 *   `company-settings/route.ts`.
 *
 * This is the SINGLE source of truth for currency symbol rendering in
 * print templates. All monetary amounts should go through `fmtMoney`,
 * which delegates here.
 */
export function getCurrencyDisplay(settings: PrintSettings, lang: 'ar' | 'en'): string {
  if (settings.currencySymbolImage) {
    const altText = lang === 'ar'
      ? (settings.currencySymbolAr || settings.currencySymbol || 'ر.س')
      : (settings.currencySymbolEn || settings.currencySymbol || 'SAR')
    const isSvg = isSvgImage(settings.currencySymbolImage)
    // SVG already has transparency — no blend mode needed.
    // PNG/JPG get `mix-blend-mode: multiply` so dark/white backgrounds
    // blend invisibly into the white paper.
    const blendStyle = isSvg ? '' : 'mix-blend-mode:multiply;'
    const style = `${blendStyle}height:0.9em;width:auto;vertical-align:middle;display:inline-block;margin:0 2px;`
    return `<img class="ri-currency-img" style="${style}" src="${settings.currencySymbolImage}" alt="${altText}" />`
  }
  // Fall back to configured text symbol (defaults to "﷼" per company-settings)
  return lang === 'ar'
    ? (settings.currencySymbolAr || settings.currencySymbol || 'ر.س')
    : (settings.currencySymbolEn || settings.currencySymbol || 'SAR')
}

/**
 * Format a money value with currency symbol for print templates.
 * Uses currency symbol image if available, otherwise text.
 *
 * This is the canonical money formatter for ALL print templates.
 * It delegates symbol rendering to `getCurrencyDisplay`, which is the
 * single place that handles the currency symbol image logic.
 */
export function fmtMoney(value: number, settings: PrintSettings, lang: 'ar' | 'en'): string {
  const formatted = formatMoneyPrint(value)
  const symbol = getCurrencyDisplay(settings, lang)
  if (lang === 'ar') {
    return `${formatted} ${symbol}`
  }
  return `${symbol} ${formatted}`
}

export function getCurrencyName(settings: PrintSettings, lang: 'ar' | 'en'): string {
  // Use configured currency name if available, otherwise default to Saudi Riyal
  if (lang === 'ar') {
    return settings.currencySymbolAr === 'د.إ' ? 'درهم إماراتي' : settings.currencySymbolAr === 'د.ك' ? 'دينار كويتي' : settings.currencySymbolAr === 'ر.ق' ? 'ريال قطري' : settings.currencySymbolAr === 'ر.ع' ? 'ريال عماني' : settings.currencySymbolAr === 'د.ب' ? 'دينار بحريني' : 'ريال سعودي'
  }
  return settings.currencySymbolEn === 'AED' ? 'UAE Dirham' : settings.currencySymbolEn === 'KWD' ? 'Kuwaiti Dinar' : settings.currencySymbolEn === 'QAR' ? 'Qatari Riyal' : settings.currencySymbolEn === 'OMR' ? 'Omani Rial' : settings.currencySymbolEn === 'BHD' ? 'Bahraini Dinar' : 'Saudi Riyal'
}

// ============ Date Formatting ============

export function formatDate(d: unknown, lang: 'ar' | 'en'): string {
  if (!d) return ''
  try {
    return new Date(d as string).toLocaleDateString(
      lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    )
  } catch {
    return String(d)
  }
}

export function formatDateShort(d: unknown, lang: 'ar' | 'en'): string {
  if (!d) return ''
  try {
    return new Date(d as string).toLocaleDateString(
      lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US'
    )
  } catch {
    return String(d)
  }
}

// ============ Amount in Words ============

export function numberToArabicWords(amount: number, currencyName = 'ريالاً سعودياً', subCurrency = 'هللة'): string {
  if (amount === 0) return `صفر ${currencyName} فقط لا غير`
  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
  function below1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) { const t = Math.floor(n / 10); const o = n % 10; return o === 0 ? tens[t] : ones[o] + ' و' + tens[t] }
    const h = Math.floor(n / 100); const r = n % 100; return r === 0 ? hundreds[h] : hundreds[h] + ' و' + below1000(r)
  }
  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 1000) return below1000(n)
    if (n < 1000000) { const th = Math.floor(n / 1000); const r = n % 1000; let w = th === 1 ? 'ألف' : th === 2 ? 'ألفان' : th <= 10 ? below1000(th) + ' آلاف' : below1000(th) + ' ألفاً'; return r === 0 ? w : w + ' و' + below1000(r) }
    if (n < 1000000000) { const m = Math.floor(n / 1000000); const r = n % 1000000; let w = m === 1 ? 'مليون' : m === 2 ? 'مليونان' : m <= 10 ? below1000(m) + ' ملايين' : below1000(m) + ' مليوناً'; return r === 0 ? w : w + ' و' + convert(r) }
    const b = Math.floor(n / 1000000000); const r = n % 1000000000; let w = b === 1 ? 'مليار' : b === 2 ? 'ملياران' : below1000(b) + ' ملياراً'; return r === 0 ? w : w + ' و' + convert(r)
  }
  let result = ''
  if (riyals > 0) result = convert(riyals) + ' ' + currencyName
  if (halalas > 0) { if (riyals > 0) result += ' و'; result += convert(halalas) + ' ' + subCurrency }
  return result + ' فقط لا غير'
}

export function numberToEnglishWords(amount: number, currencyName = 'Saudi Riyals', subCurrency = 'Halalas'): string {
  if (amount === 0) return `Zero ${currencyName} only`
  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function below1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) { const t = Math.floor(n / 10); const o = n % 10; return o === 0 ? tens[t] : tens[t] + '-' + ones[o] }
    const h = Math.floor(n / 100); const r = n % 100; return r === 0 ? ones[h] + ' Hundred' : ones[h] + ' Hundred and ' + below1000(r)
  }
  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 1000) return below1000(n)
    if (n < 1000000) { const th = Math.floor(n / 1000); const r = n % 1000; return r === 0 ? below1000(th) + ' Thousand' : below1000(th) + ' Thousand ' + below1000(r) }
    if (n < 1000000000) { const m = Math.floor(n / 1000000); const r = n % 1000000; return r === 0 ? below1000(m) + ' Million' : below1000(m) + ' Million ' + convert(r) }
    const b = Math.floor(n / 1000000000); const r = n % 1000000000; return r === 0 ? below1000(b) + ' Billion' : below1000(b) + ' Billion ' + convert(r)
  }
  let result = ''
  if (riyals > 0) result = convert(riyals) + ' ' + currencyName
  if (halalas > 0) { if (riyals > 0) result += ' and '; result += convert(halalas) + ' ' + subCurrency }
  return result + ' only'
}

export function getAmountInWords(amount: number, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? numberToArabicWords(amount) : numberToEnglishWords(amount)
}

// ============ ZATCA TLV Encoding ============

export function encodeZATCATLV(sellerName: string, vatNumber: string, date: string, total: string, vatTotal: string): string {
  // Isomorphic TLV encoder — works in BOTH browser and Node (no Buffer dependency).
  // Uses TextEncoder + Uint8Array (Web Standards) + btoa (browser) / Buffer (Node fallback).
  const encoder = new TextEncoder()
  const encodeTag = (tag: number, value: string): Uint8Array => {
    const valBytes = encoder.encode(value)
    const out = new Uint8Array(2 + valBytes.length)
    out[0] = tag
    out[1] = valBytes.length
    out.set(valBytes, 2)
    return out
  }
  const tags = [
    encodeTag(0x01, sellerName),
    encodeTag(0x02, vatNumber),
    encodeTag(0x03, date),
    encodeTag(0x04, total),
    encodeTag(0x05, vatTotal),
  ]
  const totalLen = tags.reduce((s, t) => s + t.length, 0)
  const tlv = new Uint8Array(totalLen)
  let offset = 0
  for (const t of tags) {
    tlv.set(t, offset)
    offset += t.length
  }
  // Convert to base64 isomorphically
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < tlv.length; i++) binary += String.fromCharCode(tlv[i])
    return btoa(binary)
  }
  // Node fallback
  return Buffer.from(tlv).toString('base64')
}

// ============ Document Title Map ============

export function getDocumentTitle(type: string, lang: 'ar' | 'en'): { title: string; subtitle: string } {
  const titles: Record<string, { ar: string; en: string; subAr?: string; subEn?: string }> = {
    'service-invoice': { ar: 'فاتورة خدمات', en: 'Service Invoice' },
    'rental-invoice': { ar: 'فاتورة تأجير معدات', en: 'Equipment Rental Invoice' },
    'supplier-invoice': { ar: 'فاتورة مورد', en: 'Supplier Invoice' },
    'progress-claim': { ar: 'مستخلص أعمال', en: 'Progress Claim' },
    'extract': { ar: 'مستخلص أعمال', en: 'Progress Claim' },
    'purchase-order': { ar: 'أمر شراء', en: 'Purchase Order' },
    'delivery-order': { ar: 'أمر تسليم', en: 'Delivery Order' },
    'timesheet': { ar: 'سجل حضور معدات', en: 'Equipment Timesheet' },
    'timesheet-report': { ar: 'سجل حضور معدات', en: 'Equipment Timesheet' },
    'trial-balance': { ar: 'ميزان مراجعة', en: 'Trial Balance' },
    'general-ledger': { ar: 'دفتر الأستاذ', en: 'General Ledger' },
    'income-statement': { ar: 'قائمة الدخل', en: 'Income Statement' },
    'balance-sheet': { ar: 'الميزانية العمومية', en: 'Balance Sheet' },
    'vat-return': { ar: 'إقرار ضريبي', en: 'VAT Return' },
    'tax-declaration': { ar: 'إقرار ضريبي', en: 'VAT Return' },
    'client-payment': { ar: 'سند تحصيل', en: 'Collection Receipt' },
    'supplier-payment': { ar: 'سند صرف', en: 'Payment Voucher' },
    'rental-payment': { ar: 'سند تحصيل إيجار', en: 'Rental Collection Receipt' },
    'expense-report': { ar: 'سند مصروف', en: 'Expense Voucher' },
    'advance-voucher': { ar: 'سند سلفة', en: 'Advance Voucher' },
    'petty-cash-voucher': { ar: 'سند صرف نقدي', en: 'Petty Cash Voucher' },
    'salary-slip': { ar: 'مسير راتب', en: 'Salary Slip' },
    'rental-contract': { ar: 'عقد تأجير', en: 'Rental Contract' },
    'equipment-report': { ar: 'تقرير معدات', en: 'Equipment Report' },
    'fuel-report': { ar: 'تقرير وقود', en: 'Fuel Report' },
    'maintenance-report': { ar: 'تقرير صيانة', en: 'Maintenance Report' },
    'work-team-report': { ar: 'تقرير فريق عمل', en: 'Work Team Report' },
    'resource-distribution': { ar: 'تقرير توزيع الموارد', en: 'Resource Distribution Report' },
    'attendance-report': { ar: 'تقرير الحضور', en: 'Attendance Report' },
    'purchase-request': { ar: 'طلب شراء', en: 'Purchase Request' },
    'goods-receipt': { ar: 'محضر استلام', en: 'Goods Receipt' },
    'journal-entry': { ar: 'قيد يومية', en: 'Journal Entry' },
    'account-statement': { ar: 'كشف حساب', en: 'Account Statement' },
    'generic-table': { ar: 'تقرير', en: 'Report' },
  }
  const t = titles[type] || titles['generic-table']
  return {
    title: lang === 'ar' ? t.ar : t.en,
    subtitle: t.subAr && lang === 'ar' ? t.subAr : (t.subEn || '')
  }
}

// ============ Status Badge ============

export function statusBadge(status: string | undefined | null, lang: 'ar' | 'en', prefix = ''): string {
  if (!status) return ''
  const statusMap: Record<string, { ar: string; en: string; cls: string }> = {
    'DRAFT': { ar: 'مسودة', en: 'Draft', cls: `${prefix}status-draft` },
    'ACTIVE': { ar: 'نشط', en: 'Active', cls: `${prefix}status-active` },
    'SENT': { ar: 'مرسل', en: 'Sent', cls: `${prefix}status-active` },
    'PAID': { ar: 'مدفوع', en: 'Paid', cls: `${prefix}status-paid` },
    'PARTIALLY_PAID': { ar: 'مدفوع جزئياً', en: 'Partially Paid', cls: `${prefix}status-partial` },
    'OVERDUE': { ar: 'متأخر', en: 'Overdue', cls: `${prefix}status-overdue` },
    'CANCELLED': { ar: 'ملغي', en: 'Cancelled', cls: `${prefix}status-cancelled` },
    'APPROVED': { ar: 'معتمد', en: 'Approved', cls: `${prefix}status-active` },
    'COMPLETED': { ar: 'مكتمل', en: 'Completed', cls: `${prefix}status-paid` },
    'PENDING': { ar: 'في الانتظار', en: 'Pending', cls: `${prefix}status-draft` },
    'DELIVERED': { ar: 'تم التوصيل', en: 'Delivered', cls: `${prefix}status-active` },
    'RETURNED': { ar: 'تم الإرجاع', en: 'Returned', cls: `${prefix}status-paid` },
    'SUBMITTED': { ar: 'مقدم', en: 'Submitted', cls: `${prefix}status-active` },
    'INVOICED': { ar: 'مفوتر', en: 'Invoiced', cls: `${prefix}status-paid` },
    'UNDER_REVIEW': { ar: 'قيد المراجعة', en: 'Under Review', cls: `${prefix}status-partial` },
    'EXPIRED': { ar: 'منتهي', en: 'Expired', cls: `${prefix}status-cancelled` },
    'TERMINATED': { ar: 'فسخ', en: 'Terminated', cls: `${prefix}status-overdue` },
  }
  const s = statusMap[status]
  if (!s) return ''
  return `<span class="${prefix}status-badge ${s.cls}">${lang === 'ar' ? s.ar : s.en}</span>`
}

// ============ Month Names ============

const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function getMonthName(month: number, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? (arabicMonths[month - 1] || '') : (englishMonths[month - 1] || '')
}

/** Format delivery month like "2026-08" to readable period */
export function formatDeliveryMonth(dm: unknown, lang: 'ar' | 'en'): string {
  if (!dm) return ''
  const str = String(dm)
  const match = str.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const [, y, m] = match
    const monthNum = parseInt(m, 10)
    if (monthNum >= 1 && monthNum <= 12) {
      const date = new Date(parseInt(y), monthNum - 1, 1)
      const monthName = date.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { month: 'long', year: 'numeric' })
      const lastDay = new Date(parseInt(y), monthNum, 0).getDate()
      const fromStr = `01/${m}/${y}`
      const toStr = `${lastDay}/${m}/${y}`
      return `${monthName}<br/><span style="font-size:8px;color:#94a3b8">${lang === 'ar' ? 'من' : 'From'} ${fromStr} ${lang === 'ar' ? 'إلى' : 'to'} ${toStr}</span>`
    }
  }
  return str
}
