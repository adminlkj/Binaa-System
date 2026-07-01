// ============================================================================
// قالب أمر الشراء - Purchase Order Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, formatDateShort, getCurrencySymbol } from '../shared/utils'
import { signaturesSection, totalsSection } from '../shared/sections'
import { escapeHtml } from '@/lib/escape-html'

export const template: DocumentTemplate = {
  category: 'procurement',
  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang) {
    return getDefaultCSS(lang)
  },

  getBody(data, settings, lang) {
    const items = (data.items as Array<Record<string, unknown>>) || []
    const currency = getCurrencySymbol(settings, lang)
    const totalAmount = Number(data.totalAmount) || 0

    return `
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'الطالب / Buyer' : 'Buyer'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة / Company' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
          ${settings.address ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان / Address' : 'Address'}</span><span class="value">${escapeHtml(settings.address)}</span></div>` : ''}
          ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي / VAT No' : 'VAT No'}</span><span class="value">${escapeHtml(settings.taxNumber)}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'المورد / Supplier' : 'Supplier'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم / Name' : 'Name'}</span><span class="value">${escapeHtml(data.supplierName || '')}</span></div>
          ${data.supplierAddress ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان / Address' : 'Address'}</span><span class="value">${escapeHtml(data.supplierAddress)}</span></div>` : ''}
          ${data.supplierTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي / VAT No' : 'VAT No'}</span><span class="value">${escapeHtml(data.supplierTaxNumber)}</span></div>` : ''}
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء / PO No' : 'PO No'}</div>
          <div class="info-value">${escapeHtml(data.orderNo || data.id || '')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'التاريخ / Date' : 'Date'}</div>
          <div class="info-value">${formatDateShort(data.date, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'المشروع / Project' : 'Project'}</div>
          <div class="info-value">${escapeHtml(data.projectName || '-')}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'طريقة الدفع / Payment Terms' : 'Payment Terms'}</div>
          <div class="info-value">${escapeHtml(data.paymentTerms || '-')}</div>
        </div>
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'الوصف / Description' : 'Description'}</th>
            <th>${lang === 'ar' ? 'الكمية / Qty' : 'Qty'}</th>
            <th class="amount-header">${lang === 'ar' ? `سعر الوحدة / Unit Price (${currency})` : `Unit Price (${currency})`}</th>
            <th class="amount-header">${lang === 'ar' ? `الإجمالي / Total (${currency})` : `Total (${currency})`}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${escapeHtml(item.description || '')}</td>
              <td style="text-align:center;">${item.quantity || 0}</td>
              <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
              <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${totalsSection(
        [
          { label: lang === 'ar' ? `الإجمالي / Total (${currency})` : `Total (${currency})`, value: totalAmount, isGrand: true },
        ],
        settings,
        lang,
        (v: number) => fmtMoney(v, settings, lang)
      )}

      ${signaturesSection(settings, lang)}
    `
  },
}
