// ============================================================================
// قالب فاتورة المورد - Supplier Invoice Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, formatMoneyPrint, getCurrencySymbol, encodeZATCATLV } from '../shared/utils'
import { getDefaultCSS } from '../shared/css'
import { signaturesSection, amountInWordsSection, totalsSection, qrCodeSection, qrCodeScript } from '../shared/sections'

// ============ Template Implementation ============

export const SupplierInvoiceTemplate: DocumentTemplate = {
  category: 'invoice',

  requiresQR: true,
  requiresSignature: true,
  requiresBankInfo: false,
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

    // ─── Invoice Info Grid ───
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
      </div>
    `

    // ─── Parties Section (Supplier / Buyer) ───
    const partiesHtml = `
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'المورد / Supplier' : 'Supplier'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم' : 'Name'}</span><span class="value">${data.supplierName || ''}</span></div>
          ${data.supplierTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${data.supplierTaxNumber}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'المشتري / Buyer' : 'Buyer'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
          ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
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
            <th class="amount-header">${lang === 'ar' ? 'السعر / Price' : 'Price'} (${currency})</th>
            <th class="amount-header">${lang === 'ar' ? 'الإجمالي / Total' : 'Total'} (${currency})</th>
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
      { label: lang === 'ar' ? 'المجموع الفرعي / Subtotal' : 'Subtotal', value: subtotal },
      { label: lang === 'ar' ? `ضريبة القيمة المضافة ${vatRate * 100}% / VAT ${vatRate * 100}%` : `VAT ${vatRate * 100}%`, value: vatAmount },
      { label: lang === 'ar' ? 'الإجمالي شامل الضريبة / Grand Total incl. VAT' : 'Grand Total incl. VAT', value: totalAmount, isGrand: true },
    ]

    const fmtMoneyFn = (v: number) => fmtMoney(v, settings, lang)
    const totalsHtml = totalsSection(totalRows, settings, lang, fmtMoneyFn)

    // ─── ZATCA QR Code ───
    const sellerName = lang === 'ar' ? settings.nameAr : settings.nameEn
    const vatNumber = settings.taxNumber || ''
    const invoiceDate = data.date ? new Date(data.date as string).toISOString().split('T')[0] : ''
    const totalStr = formatMoneyPrint(totalAmount)
    const vatTotalStr = formatMoneyPrint(vatAmount)
    const tlvBase64 = encodeZATCATLV(sellerName, vatNumber, invoiceDate, totalStr, vatTotalStr)
    const qrDataUrl = data.qrDataUrl as string | undefined

    // Wrap totals and QR side-by-side if we have a tax number
    const totalsAndQrHtml = settings.taxNumber
      ? `
        <div class="doc-totals-qr-wrapper">
          ${totalsHtml}
          ${qrCodeSection(qrDataUrl, tlvBase64, settings, lang, 'doc')}
        </div>
        ${!qrDataUrl && settings.taxNumber ? qrCodeScript(tlvBase64, 'doc') : ''}
      `
      : totalsHtml

    // ─── Assemble all sections ───
    return `
      ${infoGrid}
      ${partiesHtml}
      ${itemsTable}
      ${totalsAndQrHtml}
      ${amountInWordsSection(totalAmount, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
