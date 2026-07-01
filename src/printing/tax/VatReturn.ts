// ============================================================================
// قالب الإقرار الضريبي - VAT Return Template (ZATCA-compliant)
// نظام بِنَاء ERP - Binaa Construction ERP
//
// مطابق لنموذج إقرار ضريبة القيمة المضافة الصادر عن هيئة الزكاة والضريبة والجمارك
// (ZATCA - Zakat, Tax and Customs Authority) في المملكة العربية السعودية.
// يتبع نفس ترقيم الحقول والتصنيفات المعتمدة دولياً للاقرارات الضريبية.
//
// يستخدم ألوان القالب المخصصة من إعدادات الشركة (invoicePrimaryColor)
// ليتطابق الإقرار مع باقي مستندات النظام بصرياً.
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtPrint, formatDate } from '../shared/utils'
import { signaturesSection } from '../shared/sections'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'
import { escapeHtml } from '@/lib/escape-html'

// ============ Color helpers ============
/**
 * يحوّل لون hex إلى نسخة بشفافية معينة (rgba).
 * يستخدم لِتوليد ألوان خلفية فاتحة من اللون الأساسي للقالب.
 */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) || 0
  const g = parseInt(clean.substring(2, 4), 16) || 0
  const b = parseInt(clean.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * يولّد لوناً أغمق من اللون الأساسي (للحالات hover/active أو الحدود).
 */
function darkenHex(hex: string, factor = 0.15): string {
  const clean = hex.replace('#', '')
  const r = Math.max(0, Math.floor((parseInt(clean.substring(0, 2), 16) || 0) * (1 - factor)))
  const g = Math.max(0, Math.floor((parseInt(clean.substring(2, 4), 16) || 0) * (1 - factor)))
  const b = Math.max(0, Math.floor((parseInt(clean.substring(4, 6), 16) || 0) * (1 - factor)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export const template: DocumentTemplate = {
  category: 'tax',

  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: true,
  hasCustomFooter: true,

  getCSS(lang: 'ar' | 'en'): string {
    // أضف تنسيقات مخصصة للإقرار الضريبي فوق تنسيقات المحاسبة الافتراضية
    // ملاحظة: يجب إرجاع CSS خام فقط بدون وسوم <style> لأن print-service.ts
    // يغلّف النتيجة في وسم <style> واحد. وضع وسوم <style> هنا يسبب تداخلاً
    // يؤدي إلى ظهور أكواد CSS كنص داخل الصفحة المطبوعة.
    const baseCSS = getAccountingCSS(lang)
    return `
      ${baseCSS}
      .vat-form { font-family: 'Cairo', 'Noto Sans Arabic', 'Tajawal', sans-serif; color: #0f172a; }
        .vat-form-title {
          text-align: center;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 6px 0 2px 0;
          padding: 8px 0;
          border-top: 2px solid #0f172a;
          border-bottom: 2px solid #0f172a;
        }
        .vat-form-subtitle {
          text-align: center;
          font-size: 11px;
          color: #475569;
          margin-bottom: 10px;
        }
        .vat-section {
          margin-top: 10px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          overflow: hidden;
        }
        .vat-section-header {
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .vat-section-header .section-no {
          background: rgba(255,255,255,0.18);
          padding: 1px 8px;
          border-radius: 3px;
          font-size: 9.5px;
        }
        .vat-row {
          display: grid;
          grid-template-columns: 26px 1fr 130px 90px;
          align-items: center;
          padding: 5px 8px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 10px;
          gap: 4px;
        }
        .vat-row:last-child { border-bottom: none; }
        .vat-row .field-no {
          background: #f1f5f9;
          color: #475569;
          font-weight: 700;
          font-size: 9.5px;
          text-align: center;
          border-radius: 3px;
          padding: 2px 0;
          font-family: 'Courier New', monospace;
        }
        .vat-row .field-label { color: #1e293b; }
        .vat-row .field-amount {
          text-align: left;
          direction: ltr;
          font-variant-numeric: tabular-nums;
          color: #334155;
        }
        .vat-row .field-vat {
          text-align: left;
          direction: ltr;
          font-variant-numeric: tabular-nums;
          color: #047857;
          font-weight: 600;
        }
        .vat-row.total-row {
          background: #f8fafc;
          font-weight: 700;
          border-top: 2px solid #1e293b;
        }
        .vat-row.total-row .field-amount,
        .vat-row.total-row .field-vat {
          font-weight: 700;
          color: #0f172a;
        }
        .vat-net-box {
          margin-top: 12px;
          border: 2px solid #1e293b;
          border-radius: 4px;
          overflow: hidden;
        }
        .vat-net-header {
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 6px 10px;
          display: flex;
          justify-content: space-between;
        }
        .vat-net-row {
          display: grid;
          grid-template-columns: 30px 1fr 160px;
          align-items: center;
          padding: 6px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 10.5px;
        }
        .vat-net-row:last-child { border-bottom: none; }
        .vat-net-row .field-no {
          background: #f1f5f9;
          color: #475569;
          font-weight: 700;
          font-size: 10px;
          text-align: center;
          border-radius: 3px;
          padding: 2px 0;
          font-family: 'Courier New', monospace;
        }
        .vat-net-row.payable {
          background: #fef3c7;
        }
        .vat-net-row.refundable {
          background: #d1fae5;
        }
        .vat-net-row .field-amount {
          text-align: left;
          direction: ltr;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          font-size: 12px;
        }
        .vat-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 6px;
          margin: 8px 0;
        }
        .vat-info-box {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 5px 8px;
          background: #f8fafc;
        }
        .vat-info-label {
          font-size: 9px;
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .vat-info-value {
          font-size: 11px;
          color: #0f172a;
          font-weight: 700;
        }
        .vat-gl-verify {
          margin-top: 10px;
          padding: 8px 10px;
          border-radius: 4px;
          font-size: 10px;
        }
        .vat-gl-verify.matched {
          background: #d1fae5;
          border: 1px solid #6ee7b7;
          color: #065f46;
        }
        .vat-gl-verify.mismatched {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }
        .vat-gl-verify-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          font-weight: 700;
        }
        .vat-gl-verify-icon {
          width: 18px; height: 18px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700;
          font-size: 11px;
          color: white;
          flex-shrink: 0;
        }
        .vat-gl-verify.matched .vat-gl-verify-icon {
          background: #10b981;
        }
        .vat-gl-verify.mismatched .vat-gl-verify-icon {
          background: #ef4444;
        }
        .vat-gl-comparison {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
          margin-top: 4px;
          font-size: 9.5px;
        }
        .vat-gl-comparison-col {
          background: rgba(255,255,255,0.6);
          border-radius: 3px;
          padding: 4px 6px;
        }
        .vat-gl-comparison-label {
          font-size: 8.5px;
          color: #64748b;
          font-weight: 600;
          margin-bottom: 2px;
        }
        .vat-gl-comparison-value {
          font-weight: 700;
          direction: ltr;
          text-align: left;
          font-variant-numeric: tabular-nums;
        }
        .vat-amendment-banner {
          margin-top: 8px;
          padding: 6px 10px;
          background: #fef3c7;
          border: 1px solid #fcd34d;
          border-radius: 4px;
          font-size: 10px;
          color: #92400e;
          text-align: center;
          font-weight: 600;
        }
        .vat-cancelled-banner {
          margin-top: 8px;
          padding: 6px 10px;
          background: #fee2e2;
          border: 1px solid #fca5a5;
          border-radius: 4px;
          font-size: 10px;
          color: #991b1b;
          text-align: center;
          font-weight: 700;
        }
        .vat-payment-info {
          margin-top: 10px;
          padding: 8px 10px;
          background: #ecfdf5;
          border: 1px solid #6ee7b7;
          border-radius: 4px;
          font-size: 10px;
          color: #065f46;
        }
        .vat-payment-info-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .vat-payment-info-row strong { color: #064e3b; }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar'
      ? 'إقرار ضريبة القيمة المضافة'
      : 'Value Added Tax (VAT) Return'
    return generateAccountingHeader(settings, lang, title)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const year = (data.year as number) || new Date().getFullYear()
    const quarter = (data.quarter as number) || 1

    // الإجماليات
    const totalSales = (data.totalSales as number) || 0
    const outputVat = (data.outputVat as number) || 0
    const totalPurchases = (data.totalPurchases as number) || 0
    const inputVat = (data.inputVat as number) || 0
    const netVat = (data.netVat as number) || 0

    // تصنيف المبيعات (ZATCA)
    const standardRatedSales = (data.standardRatedSales as number) || 0
    const zeroRatedSales = (data.zeroRatedSales as number) || 0
    const exemptSales = (data.exemptSales as number) || 0
    const standardRatedSalesVat = (data.standardRatedSalesVat as number) || 0

    // تصنيف المشتريات (ZATCA)
    const standardRatedPurchases = (data.standardRatedPurchases as number) || 0
    const zeroRatedPurchases = (data.zeroRatedPurchases as number) || 0
    const exemptPurchases = (data.exemptPurchases as number) || 0
    const importsSubjectToVAT = (data.importsSubjectToVAT as number) || 0
    const standardRatedPurchasesVat = (data.standardRatedPurchasesVat as number) || 0

    // التحقق من دفتر اليومية
    const glOutputVat = (data.glOutputVat as number) || 0
    const glInputVat = (data.glInputVat as number) || 0
    const glMatch = data.glMatch as boolean

    // الفروقات (لعرضها بوضوح في بطاقة التحقق)
    const glDiffOutput = outputVat - glOutputVat
    const glDiffInput = inputVat - glInputVat

    // الحالة والدفع
    const status = (data.status as string) || 'DRAFT'
    const filedDate = data.filedDate as string | undefined
    const paymentDate = data.paymentDate as string | undefined
    const paymentRef = (data.paymentReference as string) || (data.paymentRef as string) || undefined
    const isAmendment = data.isAmendment as boolean
    const cancelledAt = data.cancelledAt as string | undefined
    const cancelledReason = data.cancelledReason as string
    const createdAt = data.createdAt as string | undefined

    // ===== ألوان القالب من إعدادات الشركة =====
    // نستخدم اللون الأساسي المُختار من شاشة الإعدادات → قوالب الفاتورة
    // ليكون الإقرار متناسقاً بصرياً مع باقي مستندات النظام.
    const primaryColor = settings.invoicePrimaryColor || '#0f766e'
    const primaryDark = darkenHex(primaryColor, 0.18)
    const primaryLight = hexToRgba(primaryColor, 0.08)
    const primaryLighter = hexToRgba(primaryColor, 0.04)

    // Quarter names
    const quarterNames = lang === 'ar'
      ? ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع']
      : ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
    const quarterName = quarterNames[quarter - 1] || `Q${quarter}`

    // Status labels
    const statusLabels: Record<string, { ar: string; en: string }> = {
      DRAFT: { ar: 'مسودة', en: 'Draft' },
      FILED: { ar: 'مُقر', en: 'Filed' },
      PAID: { ar: 'مدفوع', en: 'Paid' },
      CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
      AMENDED: { ar: 'معدل', en: 'Amended' },
    }
    const statusLabel = statusLabels[status]?.[lang] || status

    // صافي الضريبة: مستحق أو مسترد
    const isPayable = netVat >= 0
    const netLabel = isPayable
      ? (lang === 'ar' ? 'صافي ضريبة القيمة المضافة المستحقة' : 'Net VAT Payable')
      : (lang === 'ar' ? 'ضريبة القيمة المضافة المستحقة الاسترداد' : 'Net VAT Refundable')

    // ===== Helpers =====
    // تصدير الأرقام بفواصل الآلاف (كالإقرارات الضريبية العالمية) بدون رمز العملة
    const fmtNum = (v: number) => fmtPrint(v)

    // صف التصنيف
    const categoryRow = (
      fieldNo: string,
      label: string,
      amount: number,
      vat: number | null = null,
      isTotal = false
    ): string => {
      const cls = isTotal ? 'vat-row total-row' : 'vat-row'
      const vatCell = vat !== null
        ? `<div class="field-vat">${fmtNum(vat)}</div>`
        : `<div class="field-vat">—</div>`
      return `
        <div class="${cls}">
          <div class="field-no">${fieldNo}</div>
          <div class="field-label">${label}</div>
          <div class="field-amount">${fmtNum(amount)}</div>
          ${vatCell}
        </div>`
    }

    // صف صافي الضريبة
    const netRow = (
      fieldNo: string,
      label: string,
      amount: number,
      kind: 'payable' | 'refundable' | 'normal' = 'normal'
    ): string => {
      const cls = kind === 'payable' ? 'vat-net-row payable'
        : kind === 'refundable' ? 'vat-net-row refundable'
        : 'vat-net-row'
      return `
        <div class="${cls}">
          <div class="field-no">${fieldNo}</div>
          <div class="field-label">${label}</div>
          <div class="field-amount">${fmtNum(amount)}</div>
        </div>`
    }

    return `
      <style>
        /* تطبيق ألوان القالب المخصصة على الإقرار الضريبي */
        .vat-section-header { background: ${primaryColor} !important; }
        .vat-net-header { background: ${primaryColor} !important; }
        .vat-net-box { border-color: ${primaryDark} !important; }
        .vat-row.total-row { border-top-color: ${primaryColor} !important; }
        .vat-info-box { background: ${primaryLighter} !important; border-color: ${primaryColor}40 !important; }
        .vat-info-value { color: ${primaryDark} !important; }
        .vat-form-title { border-top-color: ${primaryColor} !important; border-bottom-color: ${primaryColor} !important; }
        .vat-row .field-no { background: ${primaryLight} !important; color: ${primaryDark} !important; }
        .vat-net-row .field-no { background: ${primaryLight} !important; color: ${primaryDark} !important; }
        .vat-net-row .field-amount { color: ${primaryDark} !important; }
        .vat-row .field-vat { color: ${primaryDark} !important; }
        @media print {
          .vat-section-header { background: ${primaryColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .vat-net-header { background: ${primaryColor} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .vat-info-box { background: ${primaryLighter} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .vat-row .field-no { background: ${primaryLight} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <div class="vat-form">
        <!-- عنوان النموذج -->
        <div class="vat-form-title">
          ${lang === 'ar'
            ? 'إقرار ضريبة القيمة المضافة — هيئة الزكاة والضريبة والجمارك'
            : 'Value Added Tax Return — Zakat, Tax and Customs Authority'}
        </div>
        <div class="vat-form-subtitle">
          ${lang === 'ar'
            ? 'المملكة العربية السعودية — نموذج VAT-301'
            : 'Kingdom of Saudi Arabia — Form VAT-301'}
        </div>

        ${isAmendment ? `
          <div class="vat-amendment-banner">
            ${lang === 'ar'
              ? '⚠ هذا الإقرار تعديل لإقرار سابق تم إلغاؤه'
              : '⚠ This is an amended return replacing a cancelled one'}
          </div>
        ` : ''}

        ${status === 'CANCELLED' ? `
          <div class="vat-cancelled-banner">
            ${lang === 'ar'
              ? `✗ تم إلغاء هذا الإقرار${cancelledReason ? ` — السبب: ${escapeHtml(cancelledReason)}` : ''}${cancelledAt ? ` — بتاريخ: ${formatDate(cancelledAt, lang)}` : ''}`
              : `✗ This return has been CANCELLED${cancelledReason ? ` — Reason: ${escapeHtml(cancelledReason)}` : ''}${cancelledAt ? ` — Date: ${formatDate(cancelledAt, lang)}` : ''}`}
          </div>
        ` : ''}

        <!-- بيانات المنشأة -->
        <div class="vat-info-grid">
          <div class="vat-info-box">
            <div class="vat-info-label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</div>
            <div class="vat-info-value" dir="ltr">${escapeHtml(settings.taxNumber || '—')}</div>
          </div>
          <div class="vat-info-box">
            <div class="vat-info-label">${lang === 'ar' ? 'السجل التجاري' : 'Commercial Reg.'}</div>
            <div class="vat-info-value" dir="ltr">${escapeHtml(settings.commercialReg || '—')}</div>
          </div>
          <div class="vat-info-box">
            <div class="vat-info-label">${lang === 'ar' ? 'فترة الإقرار' : 'Tax Period'}</div>
            <div class="vat-info-value">${escapeHtml(quarterName)} - ${escapeHtml(String(year))}</div>
          </div>
          <div class="vat-info-box">
            <div class="vat-info-label">${lang === 'ar' ? 'حالة الإقرار' : 'Status'}</div>
            <div class="vat-info-value">${escapeHtml(statusLabel)}</div>
          </div>
        </div>

        <!-- ============ القسم الأول: ضريبة المخرجات (المبيعات) ============ -->
        <div class="vat-section">
          <div class="vat-section-header">
            <span>
              ${lang === 'ar'
                ? 'القسم الأول: ضريبة المخرجات (المبيعات الخاضعة للضريبة)'
                : 'Section 1: Output VAT (Taxable Sales)'}
            </span>
            <span class="section-no">${lang === 'ar' ? 'حقل 1-5' : 'Fields 1-5'}</span>
          </div>

          ${categoryRow('1',
            lang === 'ar' ? 'إجمالي المبيعات الخاضعة للضريبة القياسية (15%)' : 'Total standard-rated sales (15%)',
            standardRatedSales,
            standardRatedSalesVat
          )}
          ${categoryRow('2',
            lang === 'ar' ? 'إجمالي المبيعات صفريه الضريبة (صادرات)' : 'Total zero-rated sales (exports)',
            zeroRatedSales,
            0
          )}
          ${categoryRow('3',
            lang === 'ar' ? 'إجمالي المبيعات المعفاة من الضريبة' : 'Total exempt sales',
            exemptSales,
            null
          )}
          ${categoryRow('4',
            lang === 'ar' ? 'إجمالي المبيعات (جميع الفئات)' : 'Total sales (all categories)',
            totalSales,
            null,
            true
          )}
          ${categoryRow('5',
            lang === 'ar' ? 'إجمالي ضريبة المخرجات المستحقة' : 'Total output VAT due',
            outputVat,
            outputVat,
            true
          )}
        </div>

        <!-- ============ القسم الثاني: ضريبة المدخلات (المشتريات) ============ -->
        <div class="vat-section">
          <div class="vat-section-header">
            <span>
              ${lang === 'ar'
                ? 'القسم الثاني: ضريبة المدخلات (المشتريات الخاضعة للضريبة)'
                : 'Section 2: Input VAT (Taxable Purchases)'}
            </span>
            <span class="section-no">${lang === 'ar' ? 'حقل 6-10' : 'Fields 6-10'}</span>
          </div>

          ${categoryRow('6',
            lang === 'ar' ? 'إجمالي المشتريات الخاضعة للضريبة القياسية (15%)' : 'Total standard-rated purchases (15%)',
            standardRatedPurchases,
            standardRatedPurchasesVat
          )}
          ${categoryRow('7',
            lang === 'ar' ? 'إجمالي المشتريات صفريه الضريبة' : 'Total zero-rated purchases',
            zeroRatedPurchases,
            0
          )}
          ${categoryRow('8',
            lang === 'ar' ? 'إجمالي المشتريات المعفاة من الضريبة' : 'Total exempt purchases',
            exemptPurchases,
            null
          )}
          ${categoryRow('9',
            lang === 'ar' ? 'الواردات الخاضعة للضريبة (احتساب عكسي)' : 'Imports subject to VAT (reverse charge)',
            importsSubjectToVAT,
            null
          )}
          ${categoryRow('10',
            lang === 'ar' ? 'إجمالي المشتريات (جميع الفئات)' : 'Total purchases (all categories)',
            totalPurchases,
            null,
            true
          )}
          ${categoryRow('11',
            lang === 'ar' ? 'إجمالي ضريبة المدخلات القابلة للخصم' : 'Total deductible input VAT',
            inputVat,
            inputVat,
            true
          )}
        </div>

        <!-- ============ القسم الثالث: صافي الضريبة المستحقة ============ -->
        <div class="vat-net-box">
          <div class="vat-net-header">
            <span>
              ${lang === 'ar'
                ? 'القسم الثالث: احتساب صافي ضريبة القيمة المضافة'
                : 'Section 3: Net VAT Calculation'}
            </span>
            <span class="section-no">${lang === 'ar' ? 'حقل 12-14' : 'Fields 12-14'}</span>
          </div>

          ${netRow('12',
            lang === 'ar' ? 'إجمالي ضريبة المخرجات (من الحقل 5)' : 'Total output VAT (from Field 5)',
            outputVat
          )}
          ${netRow('13',
            lang === 'ar' ? 'إجمالي ضريبة المدخلات (من الحقل 11)' : 'Total input VAT (from Field 11)',
            inputVat
          )}
          ${netRow('14',
            netLabel,
            Math.abs(netVat),
            isPayable ? 'payable' : 'refundable'
          )}
        </div>

        <!-- ============ التحقق من دفتر اليومية ============ -->
        <div class="vat-gl-verify ${glMatch ? 'matched' : 'mismatched'}">
          <div class="vat-gl-verify-header">
            <div class="vat-gl-verify-icon">${glMatch ? '✓' : '!'}</div>
            <span>${lang === 'ar' ? 'التحقق من دفتر اليومية' : 'General Ledger Verification'}</span>
          </div>
          <div style="margin-bottom:6px;">
            ${glMatch
              ? (lang === 'ar'
                  ? `الأرقام متطابقة مع القيود اليومية المنشورة لهذه الفترة.`
                  : `Figures match posted journal entries for this period.`)
              : (lang === 'ar'
                  ? `يوجد اختلاف بين أرقام الإقرار ودفتر اليومية. يرجى مراجعة القيود.`
                  : `Mismatch between return figures and general ledger. Please review journal entries.`)
            }
          </div>
          <div class="vat-gl-comparison">
            <div class="vat-gl-comparison-col">
              <div class="vat-gl-comparison-label">${lang === 'ar' ? 'ضريبة المخرجات' : 'Output VAT'}</div>
              <div style="display:flex;justify-content:space-between;gap:4px;">
                <span style="font-size:8.5px;color:#64748b;">${lang === 'ar' ? 'الإقرار' : 'Return'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(outputVat)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:4px;">
                <span style="font-size:8.5px;color:#64748b;">${lang === 'ar' ? 'اليومية' : 'GL'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(glOutputVat)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:4px;border-top:1px dashed currentColor;margin-top:2px;padding-top:2px;">
                <span style="font-size:8.5px;font-weight:700;">${lang === 'ar' ? 'الفرق' : 'Diff'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(glDiffOutput)}</span>
              </div>
            </div>
            <div class="vat-gl-comparison-col">
              <div class="vat-gl-comparison-label">${lang === 'ar' ? 'ضريبة المدخلات' : 'Input VAT'}</div>
              <div style="display:flex;justify-content:space-between;gap:4px;">
                <span style="font-size:8.5px;color:#64748b;">${lang === 'ar' ? 'الإقرار' : 'Return'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(inputVat)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:4px;">
                <span style="font-size:8.5px;color:#64748b;">${lang === 'ar' ? 'اليومية' : 'GL'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(glInputVat)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;gap:4px;border-top:1px dashed currentColor;margin-top:2px;padding-top:2px;">
                <span style="font-size:8.5px;font-weight:700;">${lang === 'ar' ? 'الفرق' : 'Diff'}:</span>
                <span class="vat-gl-comparison-value">${fmtNum(glDiffInput)}</span>
              </div>
            </div>
            <div class="vat-gl-comparison-col">
              <div class="vat-gl-comparison-label">${lang === 'ar' ? 'الحالة' : 'Status'}</div>
              <div style="font-weight:700;text-align:center;padding:4px 0;">
                ${glMatch
                  ? (lang === 'ar' ? '✓ متطابقة' : '✓ Matched')
                  : (lang === 'ar' ? '✗ اختلاف' : '✗ Mismatch')}
              </div>
            </div>
          </div>
        </div>

        <!-- ============ بيانات السداد ============ -->
        ${status === 'PAID' && paymentDate ? `
          <div class="vat-payment-info">
            <div class="vat-payment-info-row">
              <span><strong>${lang === 'ar' ? 'حالة السداد:' : 'Payment Status:'}</strong> ${lang === 'ar' ? 'مدفوع' : 'Paid'}</span>
              <span><strong>${lang === 'ar' ? 'تاريخ السداد:' : 'Payment Date:'}</strong> ${formatDate(paymentDate, lang)}</span>
            </div>
            ${paymentRef ? `
              <div class="vat-payment-info-row">
                <span><strong>${lang === 'ar' ? 'رقم مرجع السداد:' : 'Payment Reference:'}</strong> <span dir="ltr">${escapeHtml(paymentRef)}</span></span>
                <span></span>
              </div>
            ` : ''}
          </div>
        ` : status === 'FILED' ? `
          <div class="vat-payment-info" style="background:#fef3c7;border-color:#fcd34d;color:#92400e;">
            <div class="vat-payment-info-row">
              <span><strong>${lang === 'ar' ? 'حالة السداد:' : 'Payment Status:'}</strong> ${lang === 'ar' ? 'غير مدفوع — بانتظار السداد' : 'Not Paid — Pending'}</span>
              <span><strong>${lang === 'ar' ? 'تاريخ التقديم:' : 'Filed Date:'}</strong> ${filedDate ? formatDate(filedDate, lang) : '—'}</span>
            </div>
          </div>
        ` : ''}

        <!-- ============ تاريخ الإنشاء والملاحظات ============ -->
        <div style="margin-top:8px;font-size:9px;color:#64748b;text-align:center;">
          ${lang === 'ar'
            ? `تم إنشاء هذا الإقرار بتاريخ ${createdAt ? formatDate(createdAt, lang) : '—'} — جميع الأرقام محسوبة آلياً من العمليات الخاضعة للضريبة ومجمّدة عند التقديم.`
            : `This return was generated on ${createdAt ? formatDate(createdAt, lang) : '—'} — All figures are auto-calculated from taxable operations and frozen upon filing.`}
        </div>

        ${signaturesSection(settings, lang)}
      </div>
    `
  },
}
