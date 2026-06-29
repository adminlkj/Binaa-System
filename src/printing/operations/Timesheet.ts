// ============================================================================
// قالب سجل حضور المعدات - Equipment Timesheet Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, getMonthName, getCurrencySymbol } from '../shared/utils'
import { bankInfoSection, signaturesSection, amountInWordsSection, totalsSection, type TotalRow } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'operation',
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
    const operatingHours = Number(data.operatingHours) || 0
    const hourlyRate = Number(data.hourlyRate) || 0
    const subtotal = Number(data.subtotal) || (operatingHours * hourlyRate)
    const vatRate = settings.defaultVatRate ?? 0.15
    const vatAmount = Number(data.vatAmount) || (subtotal * vatRate)
    const deliveryFees = Number(data.deliveryFees) || 0
    const deliveryFeesTaxable = data.deliveryFeesTaxable === true || data.deliveryFeesTaxable === 'true'
    const deliveryVat = deliveryFeesTaxable ? deliveryFees * vatRate : 0
    const totalAmount = Number(data.totalAmount) || (subtotal + vatAmount + deliveryFees + deliveryVat)

    const month = Number(data.month) || 0
    const year = Number(data.year) || 0
    const monthName = getMonthName(month, lang)
    const periodLabel = month && year ? `${monthName} ${year}` : ''

    const fmtMoneyFn = (v: number) => fmtMoney(v, settings, lang)

    // ─── Info Grid (NO status badge - official document) ───
    const infoGrid = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
          <div class="info-value">${data.contractNo || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الفترة / Period' : 'Period'}</div>
          <div class="info-value">${periodLabel || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة / Invoice No' : 'Invoice No'}</div>
          <div class="info-value">${data.invoiceNo || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'العملة / Currency' : 'Currency'}</div>
          <div class="info-value">${currency}</div>
        </div>
      </div>
    `

    // ─── Parties Section ───
    const partiesHtml = `
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'بيانات المعدة / Equipment' : 'Equipment'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'المعدة / Equipment' : 'Equipment'}</span><span class="value">${data.equipmentName || data.equipmentNameAr || '-'}</span></div>
          ${data.equipmentCode ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الكود / Code' : 'Code'}</span><span class="value">${data.equipmentCode}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'العميل / Client' : 'Client'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم / Name' : 'Name'}</span><span class="value">${data.clientName || data.clientNameAr || '-'}</span></div>
          ${data.projectName ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'المشروع / Project' : 'Project'}</span><span class="value">${data.projectName}</span></div>` : ''}
        </div>
      </div>
    `

    // ─── Operating Data Section ───
    const operatingDataHtml = `
      <div class="rental-equipment-section">
        <div class="section-title">${lang === 'ar' ? 'بيانات التشغيل / Operating Data' : 'Operating Data'}</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'ساعات التشغيل / Operating Hours' : 'Operating Hours'}</div>
            <div class="info-value">${operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">${lang === 'ar' ? `سعر الساعة / Hourly Rate (${currency})` : `Hourly Rate (${currency})`}</div>
            <div class="info-value">${fmtMoney(hourlyRate, settings, lang)}</div>
          </div>
          ${data.salesOrderNo ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'رقم طلب البيع / Sales Order' : 'Sales Order'}</div>
            <div class="info-value">${data.salesOrderNo}</div>
          </div>` : ''}
          ${data.purchaseOrderNo ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء / Purchase Order' : 'Purchase Order'}</div>
            <div class="info-value">${data.purchaseOrderNo}</div>
          </div>` : ''}
        </div>
      </div>
    `

    // ─── Totals ───
    const totalRows: TotalRow[] = [
      { label: lang === 'ar' ? `المجموع الفرعي / Subtotal (${operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'} × ${fmtMoney(hourlyRate, settings, lang)})` : `Subtotal (${operatingHours} hrs × ${fmtMoney(hourlyRate, settings, lang)})`, value: subtotal },
      { label: lang === 'ar' ? `ضريبة القيمة المضافة ${vatRate * 100}% / VAT ${vatRate * 100}%` : `VAT ${vatRate * 100}%`, value: vatAmount },
    ]
    if (deliveryFees > 0) {
      totalRows.push({ label: lang === 'ar' ? 'رسوم النقل / Delivery Fees' : 'Delivery Fees', value: deliveryFees })
      if (deliveryFeesTaxable && deliveryVat > 0) {
        totalRows.push({ label: lang === 'ar' ? 'ضريبة رسوم النقل / Delivery VAT' : 'Delivery VAT', value: deliveryVat })
      }
    }
    totalRows.push({ label: lang === 'ar' ? `الإجمالي شامل الضريبة / Grand Total incl. VAT (${currency})` : `Grand Total incl. VAT (${currency})`, value: totalAmount, isGrand: true })

    const totalsHtml = totalsSection(totalRows, settings, lang, fmtMoneyFn)

    // ─── Assemble all sections ───
    return `
      ${infoGrid}
      ${partiesHtml}
      ${operatingDataHtml}
      ${totalsHtml}
      ${amountInWordsSection(totalAmount, lang)}
      ${bankInfoSection(settings, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
