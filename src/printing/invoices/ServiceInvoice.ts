// ============================================================================
// قالب فاتورة الخدمات - Service Invoice Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { getDefaultCSS } from '../shared/css'
import { bankInfoSection, signaturesSection, amountInWordsSection, termsSection, totalsSection } from '../shared/sections'

// ============ Template Implementation ============

export const ServiceInvoiceTemplate: DocumentTemplate = {
  category: 'invoice',

  requiresQR: true,
  requiresSignature: true,
  requiresBankInfo: true,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang: 'ar' | 'en'): string {
    return getDefaultCSS(lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const items = (data.items as Array<Record<string, unknown>>) || []
    const currency = getCurrencySymbol(settings, lang)
    const totalAmount = Number(data.totalAmount) || 0
    const subtotal = Number(data.subtotal) || 0
    const vatAmount = Number(data.vatAmount) || 0
    const vatRate = settings.defaultVatRate ?? 0.15

    // ─── Invoice Info Grid (NO status badge - official invoice) ───
    const infoGrid = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة / Invoice No' : 'Invoice No'}</div>
          <div class="info-value">${data.invoiceNo || data.id || ''}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'التاريخ / Date' : 'Date'}</div>
          <div class="info-value">${formatDate(data.date, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'تاريخ الاستحقاق / Due Date' : 'Due Date'}</div>
          <div class="info-value">${formatDate(data.dueDate, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
          <div class="info-value">${data.contractNo || '-'}</div>
        </div>
      </div>
    `

    // ─── Parties Section ───
    const partiesHtml = `
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'من / From' : 'From'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
          ${settings.address ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${settings.address}</span></div>` : ''}
          ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'إلى / To' : 'To'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'العميل' : 'Client'}</span><span class="value">${data.clientName || ''}</span></div>
          ${data.clientAddress ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${data.clientAddress}</span></div>` : ''}
          ${data.clientTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${data.clientTaxNumber}</span></div>` : ''}
        </div>
      </div>
    `

    // ─── Items Table ───
    const itemsTable = `
      <table class="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'الوصف / Description' : 'Description'}</th>
            <th>${lang === 'ar' ? 'الكمية / Qty' : 'Qty'}</th>
            <th class="amount-header">${lang === 'ar' ? `سعر الوحدة / Unit Price` : 'Unit Price'} (${currency})</th>
            <th class="amount-header">${lang === 'ar' ? `الإجمالي / Total` : 'Total'} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${item.description || ''}</td>
              <td style="text-align:center;">${item.quantity || 0}</td>
              <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
              <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `

    // ─── Totals ───
    const totalRows = [
      { label: lang === 'ar' ? `المجموع الفرعي / Subtotal` : 'Subtotal', value: subtotal },
      { label: lang === 'ar' ? `ضريبة القيمة المضافة ${vatRate * 100}% / VAT ${vatRate * 100}%` : `VAT ${vatRate * 100}%`, value: vatAmount },
    ]
    if (data.includeDelivery && Number(data.deliveryAmount) > 0) {
      totalRows.push({ label: lang === 'ar' ? 'رسوم النقل / Delivery Fees' : 'Delivery Fees', value: Number(data.deliveryAmount) || 0 })
    }
    totalRows.push({ label: lang === 'ar' ? 'الإجمالي شامل الضريبة / Grand Total incl. VAT' : 'Grand Total incl. VAT', value: totalAmount, isGrand: true })

    const fmtMoneyFn = (v: number) => fmtMoney(v, settings, lang)
    const totalsHtml = totalsSection(totalRows, settings, lang, fmtMoneyFn)

    // ─── Assemble all sections ───
    return `
      ${infoGrid}
      ${partiesHtml}
      ${itemsTable}
      ${totalsHtml}
      ${amountInWordsSection(totalAmount, lang)}
      ${bankInfoSection(settings, lang)}
      ${termsSection(data.terms as string | null | undefined, settings, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
