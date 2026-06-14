// ============================================================================
// قالب سند الصرف/التحصيل - Payment Voucher Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// Handles: client-payment, supplier-payment, rental-payment,
//          expense-report, advance-voucher, petty-cash-voucher
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, formatDateShort, getCurrencySymbol } from '../shared/utils'
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
    const totalAmount = Number(data.amount) || Number(data.totalAmount) || 0
    const isClient = data.clientName !== undefined && data.clientName !== null
    const currency = getCurrencySymbol(settings, lang)

    // Determine document type label
    const isExpense = data.documentType === 'expense-report'
    const isAdvance = data.documentType === 'advance-voucher'
    const isPettyCash = data.documentType === 'petty-cash-voucher'

    const partyLabel = isClient
      ? (lang === 'ar' ? 'العميل / Client' : 'Client')
      : (lang === 'ar' ? 'المورد / Supplier' : 'Supplier')

    return `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم السند / Voucher No' : 'Voucher No'}</div>
          <div class="info-value">${data.paymentNo || data.receiptNo || data.id || ''}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'التاريخ / Date' : 'Date'}</div>
          <div class="info-value">${formatDateShort(data.date, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${partyLabel}</div>
          <div class="info-value">${data.clientName || data.supplierName || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'طريقة الدفع / Payment Method' : 'Payment Method'}</div>
          <div class="info-value">${data.paymentMethod || (lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer')}</div>
        </div>
      </div>

      ${data.referenceNo ? `
      <div class="info-grid" style="margin-top:4px;">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم المرجع / Reference' : 'Reference No'}</div>
          <div class="info-value">${data.referenceNo}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الحساب البنكي / Bank Account' : 'Bank Account'}</div>
          <div class="info-value">${data.bankAccount || '-'}</div>
        </div>
      </div>` : ''}

      ${data.description ? `
      <div style="margin:8px 0;padding:6px 10px;background:#f8fafc;border-radius:3px;border:1px solid #e2e8f0;">
        <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:2px;">${lang === 'ar' ? 'البيان / Description' : 'Description'}</div>
        <div style="font-size:9.5px;font-weight:500;color:#1e293b;">${data.description}</div>
      </div>` : ''}

      <div class="totals-section">
        <div class="totals-box">
          <div class="total-row grand">
            <span class="label">${lang === 'ar' ? `المبلغ / Amount (${currency})` : `Amount (${currency})`}</span>
            <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
          </div>
        </div>
      </div>

      ${amountInWordsSection(totalAmount, lang)}
      ${bankInfoSection(settings, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
