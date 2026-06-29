// ============================================================================
// قالب عقد التأجير - Rental Contract Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, formatDate, getMonthName, getCurrencySymbol } from '../shared/utils'
import { bankInfoSection, signaturesSection, amountInWordsSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'financial',
  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: true,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang) {
    return getDefaultCSS(lang)
  },

  getBody(data, settings, lang) {
    const currency = getCurrencySymbol(settings, lang)

    // Pricing type labels (bilingual)
    const pricingTypeMap: Record<string, { ar: string; en: string }> = {
      'HOURLY': { ar: 'بالساعة', en: 'Hourly' },
      'DAILY': { ar: 'باليوم', en: 'Daily' },
      'MONTHLY': { ar: 'بالشهر', en: 'Monthly' },
      'LUMP_SUM': { ar: 'مقطوع', en: 'Lump Sum' },
    }
    const pricingType = data.pricingType as string
    const pricingLabel = pricingTypeMap[pricingType]
      ? (lang === 'ar' ? pricingTypeMap[pricingType].ar : pricingTypeMap[pricingType].en)
      : (pricingType || '—')

    // Rate display based on pricing type
    const rateDisplay = pricingType === 'HOURLY'
      ? fmtMoney(Number(data.hourlyRate) || 0, settings, lang) + (lang === 'ar' ? '/ساعة' : '/hr')
      : pricingType === 'DAILY'
      ? fmtMoney(Number(data.dailyRate) || 0, settings, lang) + (lang === 'ar' ? '/يوم' : '/day')
      : pricingType === 'MONTHLY'
      ? fmtMoney(Number(data.monthlyRate) || 0, settings, lang) + (lang === 'ar' ? '/شهر' : '/month')
      : fmtMoney(Number(data.lumpSumAmount) || 0, settings, lang)

    // Timesheets table
    const timesheets = (data.timesheets as Array<Record<string, unknown>>) || []

    const tsRows = timesheets.map((ts, i) => {
      const m = Number(ts.month) || 0
      const y = Number(ts.year) || 0
      const monthName = getMonthName(m, lang)
      const period = m && y ? `${monthName} ${y}` : '—'
      const hours = Number(ts.operatingHours) || 0

      // Timesheet status - plain text for official documents (no badge)
      const tsStatusMap: Record<string, { ar: string; en: string }> = {
        'DRAFT': { ar: 'مسودة', en: 'Draft' },
        'SUBMITTED': { ar: 'مقدم', en: 'Submitted' },
        'APPROVED': { ar: 'معتمد', en: 'Approved' },
        'INVOICED': { ar: 'مفوتر', en: 'Invoiced' },
      }
      const tsStatus = tsStatusMap[ts.status as string]
      const tsStatusText = tsStatus
        ? (lang === 'ar' ? tsStatus.ar : tsStatus.en)
        : (ts.status || '—')

      return `<tr>
        <td class="row-num">${i + 1}</td>
        <td>${period}</td>
        <td style="text-align:center;">${hours} ${lang === 'ar' ? 'ساعة / hrs' : 'hrs'}</td>
        <td>${tsStatusText}</td>
      </tr>`
    }).join('')

    const totalAmount = Number(data.totalAmount) || 0

    return `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
          <div class="info-value">${data.contractNo || '—'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'نوع التسعير / Pricing Type' : 'Pricing Type'}</div>
          <div class="info-value">${pricingLabel}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? `السعر / Rate (${currency})` : `Rate (${currency})`}</div>
          <div class="info-value">${rateDisplay}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'تاريخ البداية / Start Date' : 'Start Date'}</div>
          <div class="info-value">${formatDate(data.startDate, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'تاريخ النهاية / End Date' : 'End Date'}</div>
          <div class="info-value">${formatDate(data.endDate, lang)}</div>
        </div>
      </div>

      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'بيانات المعدة / Equipment Details' : 'Equipment Details'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'المعدة / Equipment' : 'Equipment'}</span><span class="value">${data.equipmentName || data.equipmentNameAr || '—'}</span></div>
          ${data.equipmentCode ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الكود / Code' : 'Code'}</span><span class="value">${data.equipmentCode}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'العميل / Client' : 'Client'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم / Name' : 'Name'}</span><span class="value">${data.clientName || '—'}</span></div>
          ${data.clientPhone ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الهاتف / Phone' : 'Phone'}</span><span class="value">${data.clientPhone}</span></div>` : ''}
        </div>
      </div>

      ${data.projectName ? `
      <div class="rental-equipment-section">
        <div class="section-title">${lang === 'ar' ? 'بيانات المشروع / Project Info' : 'Project Info'}</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'المشروع / Project' : 'Project'}</div>
            <div class="info-value">${data.projectName}</div>
          </div>
          ${data.projectCode ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'كود المشروع / Project Code' : 'Project Code'}</div>
            <div class="info-value">${data.projectCode}</div>
          </div>` : ''}
        </div>
      </div>` : ''}

      ${(data.deliveryFees && Number(data.deliveryFees) > 0) || data.salesOrderNo || data.purchaseOrderNo ? `
      <div class="rental-equipment-section">
        <div class="section-title">${lang === 'ar' ? 'بيانات التوصيل والمراجع / Delivery & References' : 'Delivery & References'}</div>
        <div class="info-grid">
          ${Number(data.deliveryFees) > 0 ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? `رسوم النقل / Delivery Fees (${currency})` : `Delivery Fees (${currency})`}</div>
            <div class="info-value">${fmtMoney(Number(data.deliveryFees) || 0, settings, lang)}</div>
          </div>` : ''}
          ${data.salesOrderNo ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'رقم طلب البيع / Sales Order' : 'Sales Order'}</div>
            <div class="info-value">${data.salesOrderNo}</div>
          </div>` : ''}
          ${data.purchaseOrderNo ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء / Purchase Order' : 'Purchase Order'}</div>
            <div class="info-value">${data.purchaseOrderNo}</div>
          </div>` : ''}
        </div>
      </div>` : ''}

      ${totalAmount > 0 ? `
      <div class="totals-section">
        <div class="totals-box">
          <div class="total-row grand">
            <span class="label">${lang === 'ar' ? `القيمة الإجمالية / Total Value (${currency})` : `Total Value (${currency})`}</span>
            <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
          </div>
        </div>
      </div>

      ${amountInWordsSection(totalAmount, lang)}` : ''}

      ${timesheets.length > 0 ? `
      <hr class="section-divider" />
      <h3 style="font-size:12px;font-weight:700;margin-bottom:8px;">${lang === 'ar' ? 'سجلات التشغيل / Timesheets' : 'Timesheets'}</h3>
      <table class="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'الفترة / Period' : 'Period'}</th>
            <th>${lang === 'ar' ? 'ساعات التشغيل / Operating Hours' : 'Operating Hours'}</th>
            <th>${lang === 'ar' ? 'الحالة / Status' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>${tsRows}</tbody>
      </table>` : ''}

      ${data.additionalTerms ? `
      <div class="terms-section">
        <div class="terms-title">${lang === 'ar' ? 'الشروط الإضافية / Additional Terms' : 'Additional Terms'}</div>
        ${data.additionalTerms}
      </div>` : ''}

      ${bankInfoSection(settings, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
