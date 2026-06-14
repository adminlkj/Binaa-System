// ============================================================================
// قالب فاتورة التأجير - Rental Invoice Template
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatMoneyPrint, getCurrencySymbol, formatDate, formatDeliveryMonth, encodeZATCATLV } from '../shared/utils'
import { getRentalInvoiceCSS } from '../shared/css'
import { bankInfoSection, signaturesSection, amountInWordsSection, termsSection, qrCodeSection, qrCodeScript } from '../shared/sections'
import { generateRentalInvoiceHeader, generateRentalInvoiceFooter } from '../shared/headers-footers'

// ============ Template Implementation ============

export const RentalInvoiceTemplate: DocumentTemplate = {
  category: 'invoice',

  requiresQR: true,
  requiresSignature: true,
  requiresBankInfo: true,
  requiresAmountInWords: true,
  hasCustomHeader: true,
  hasCustomFooter: true,

  getCSS(lang: 'ar' | 'en'): string {
    return getRentalInvoiceCSS(lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const items = (data.items as Array<Record<string, unknown>>) || []
    const currency = getCurrencySymbol(settings, lang)
    const totalAmount = Number(data.totalAmount) || 0
    const subtotal = Number(data.subtotal) || 0
    const netAmount = Number(data.netAmount) || subtotal
    const vatAmount = Number(data.vatAmount) || 0
    const vatRate = settings.defaultVatRate ?? 0.15

    // ─── Section 1: Invoice Info (NO STATUS) ───
    const invoiceInfoSection = `
      <div class="ri-info-section">
        <div class="ri-info-item">
          <div class="ri-info-label">${lang === 'ar' ? 'رقم الفاتورة / Invoice No' : 'Invoice No'}</div>
          <div class="ri-info-value">${data.invoiceNo || data.id || ''}</div>
        </div>
        <div class="ri-info-item">
          <div class="ri-info-label">${lang === 'ar' ? 'تاريخ الفاتورة / Invoice Date' : 'Invoice Date'}</div>
          <div class="ri-info-value">${formatDate(data.date, lang)}</div>
        </div>
        <div class="ri-info-item">
          <div class="ri-info-label">${lang === 'ar' ? 'تاريخ الاستحقاق / Due Date' : 'Due Date'}</div>
          <div class="ri-info-value">${formatDate(data.dueDate, lang)}</div>
        </div>
        <div class="ri-info-item">
          <div class="ri-info-label">${lang === 'ar' ? 'شروط السداد / Payment Terms' : 'Payment Terms'}</div>
          <div class="ri-info-value">${(data.paymentTerms as string) || (lang === 'ar' ? 'حسب العقد' : 'As per contract')}</div>
        </div>
      </div>
    `

    // ─── Section 2: Rental Data Section ───
    const hasRentalData = data.contractNo || data.salesOrderNo || data.purchaseOrderNo || data.deliveryOrderNo || data.timesheetNo || data.equipmentName || data.workLocation || data.deliveryMonth || data.operatingHours
    const rentalDataSection = hasRentalData ? `
      <div class="ri-rental-data">
        <div class="ri-rental-data-title">${lang === 'ar' ? '⚙ بيانات التأجير / Rental Data' : '⚙ Rental Data'}</div>
        <div class="ri-rental-data-grid">
          ${data.contractNo ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
            <div class="ri-rental-data-value">${data.contractNo}</div>
          </div>` : ''}
          ${data.salesOrderNo ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'رقم طلب البيع / Sales Order' : 'Sales Order'}</div>
            <div class="ri-rental-data-value">${data.salesOrderNo}</div>
          </div>` : ''}
          ${data.purchaseOrderNo ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'رقم طلب شراء العميل / Customer PO' : 'Customer PO'}</div>
            <div class="ri-rental-data-value">${data.purchaseOrderNo}</div>
          </div>` : ''}
          ${data.deliveryOrderNo ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'رقم أمر التوصيل / Delivery Order' : 'Delivery Order'}</div>
            <div class="ri-rental-data-value">${data.deliveryOrderNo}</div>
          </div>` : ''}
          ${data.timesheetNo ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'رقم التايم شيت / Timesheet' : 'Timesheet'}</div>
            <div class="ri-rental-data-value">${data.timesheetNo}</div>
          </div>` : ''}
          ${data.deliveryMonth ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'شهر التشغيل / Operating Month' : 'Operating Month'}</div>
            <div class="ri-rental-data-value">${formatDeliveryMonth(data.deliveryMonth, lang)}</div>
          </div>` : ''}
          ${data.equipmentName ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'المعدة / Equipment' : 'Equipment'}</div>
            <div class="ri-rental-data-value">${data.equipmentName}</div>
          </div>` : ''}
          ${data.operatingHours != null ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'ساعات التشغيل / Operating Hours' : 'Operating Hours'}</div>
            <div class="ri-rental-data-value">${data.operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'}</div>
          </div>` : ''}
          ${data.workLocation ? `<div class="ri-rental-data-item">
            <div class="ri-rental-data-label">${lang === 'ar' ? 'الموقع / Location' : 'Location'}</div>
            <div class="ri-rental-data-value">${data.workLocation}</div>
          </div>` : ''}
        </div>
      </div>
    ` : ''

    // ─── Section 3: Parties ───
    const partiesSectionHtml = `
      <div class="ri-parties">
        <div class="ri-party-card">
          <div class="ri-party-title">${lang === 'ar' ? 'من / From' : 'From'}</div>
          <div class="ri-party-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
          ${settings.address ? `<div class="ri-party-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${settings.address}</span></div>` : ''}
          ${settings.taxNumber ? `<div class="ri-party-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
          ${settings.commercialReg ? `<div class="ri-party-row"><span class="label">${lang === 'ar' ? 'سجل تجاري' : 'CR No'}</span><span class="value">${settings.commercialReg}</span></div>` : ''}
        </div>
        <div class="ri-party-card">
          <div class="ri-party-title">${lang === 'ar' ? 'إلى / To' : 'To'}</div>
          <div class="ri-party-row"><span class="label">${lang === 'ar' ? 'العميل' : 'Client'}</span><span class="value">${data.clientName || ''}</span></div>
          ${data.clientAddress ? `<div class="ri-party-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${data.clientAddress}</span></div>` : ''}
          ${data.clientTaxNumber ? `<div class="ri-party-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${data.clientTaxNumber}</span></div>` : ''}
        </div>
      </div>
    `

    // ─── Section 4: Items Table (include delivery fees as line item) ───
    const tableRows = items.map((item, i) => `
      <tr>
        <td class="row-num">${i + 1}</td>
        <td>${item.description || ''}</td>
        <td style="text-align:center;">${item.quantity || 0}</td>
        <td>${(item.unit as string) || (lang === 'ar' ? 'ساعة' : 'hr')}</td>
        <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
        <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
      </tr>
    `).join('')

    // NOTE: Delivery fees are already included as an item in the items array by the API
    // (itemType: 'DELIVERY'), so we do NOT add a separate delivery row here.

    const itemsTable = `
      <table class="ri-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'الوصف / Description' : 'Description'}</th>
            <th>${lang === 'ar' ? 'الكمية / Qty' : 'Qty'}</th>
            <th>${lang === 'ar' ? 'الوحدة / Unit' : 'Unit'}</th>
            <th class="amount-header">${lang === 'ar' ? `سعر الوحدة / Unit Price` : 'Unit Price'} (${currency})</th>
            <th class="amount-header">${lang === 'ar' ? `الإجمالي / Total` : 'Total'} (${currency})</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `

    // ─── Section 5: Billing Summary with QR side-by-side ───
    const totalBeforeVat = netAmount

    // Generate ZATCA TLV base64 string for QR code
    const sellerName = lang === 'ar' ? settings.nameAr : settings.nameEn
    const vatNumber = settings.taxNumber || ''
    const invoiceDate = data.date ? new Date(data.date as string).toISOString().split('T')[0] : ''
    const totalStr = formatMoneyPrint(totalAmount)
    const vatTotalStr = formatMoneyPrint(vatAmount)
    const tlvBase64 = encodeZATCATLV(sellerName, vatNumber, invoiceDate, totalStr, vatTotalStr)
    const qrDataUrl = data.qrDataUrl as string | undefined

    const billingAndQrSection = `
      <div class="ri-totals-qr-wrapper">
        <div class="ri-totals-box">
          <div class="ri-total-row">
            <span class="label">${lang === 'ar' ? 'المجموع قبل الضريبة / Subtotal' : 'Subtotal'}</span>
            <span class="value">${fmtMoney(totalBeforeVat, settings, lang)}</span>
          </div>
          <div class="ri-total-row">
            <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة ${vatRate * 100}% / VAT ${vatRate * 100}%` : `VAT ${vatRate * 100}%`}</span>
            <span class="value">${fmtMoney(vatAmount, settings, lang)}</span>
          </div>
          <div class="ri-total-row grand">
            <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة / Grand Total' : 'Grand Total incl. VAT'}</span>
            <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
          </div>
        </div>
        ${settings.taxNumber ? qrCodeSection(qrDataUrl, tlvBase64, settings, lang) : ''}
      </div>
      ${!qrDataUrl && settings.taxNumber ? qrCodeScript(tlvBase64) : ''}
    `

    // ─── Section 6: Amount in Words ───
    const amountWordsHtml = amountInWordsSection(totalAmount, lang, 'ri')

    // ─── Section 7: Bank Info ───
    const bankHtml = bankInfoSection(settings, lang, 'ri')

    // ─── Section 8: Signatures ───
    const signaturesHtml = signaturesSection(settings, lang, 'ri')

    // ─── Section 9: Terms ───
    const termsHtml = termsSection(data.terms as string | null | undefined, settings, lang, 'ri')

    // ─── Assemble all sections ───
    return `
      ${invoiceInfoSection}
      ${rentalDataSection}
      ${partiesSectionHtml}
      ${itemsTable}
      ${billingAndQrSection}
      ${amountWordsHtml}
      ${bankHtml}
      ${termsHtml}
      ${signaturesHtml}
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateRentalInvoiceHeader(settings, lang)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateRentalInvoiceFooter(settings, lang)
  },

  getExtraScripts(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const invNo = (data.invoiceNo as string) || (data.id as string) || 'invoice'

    return `
      <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
      <script>
        function exportAsImage(format) {
          var page = document.getElementById('invoice-page');
          if (!page) return;
          var btnJpg = document.getElementById('btn-export-jpg');
          var btnPng = document.getElementById('btn-export-png');
          if (btnJpg) btnJpg.classList.add('ri-export-loading');
          if (btnPng) btnPng.classList.add('ri-export-loading');
          // Hide action buttons temporarily
          var actions = document.querySelector('.ri-print-actions');
          if (actions) actions.style.display = 'none';
          html2canvas(page, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: page.scrollWidth,
            height: page.scrollHeight,
          }).then(function(canvas) {
            if (actions) actions.style.display = 'flex';
            if (btnJpg) btnJpg.classList.remove('ri-export-loading');
            if (btnPng) btnPng.classList.remove('ri-export-loading');
            var link = document.createElement('a');
            var ext = format === 'jpeg' ? 'jpg' : 'png';
            link.download = '${invNo}.' + ext;
            link.href = canvas.toDataURL('image/' + format, 0.95);
            link.click();
          }).catch(function(err) {
            if (actions) actions.style.display = 'flex';
            if (btnJpg) btnJpg.classList.remove('ri-export-loading');
            if (btnPng) btnPng.classList.remove('ri-export-loading');
            console.error('Export failed:', err);
            alert('${lang === 'ar' ? 'فشل في تصدير الصورة' : 'Failed to export image'}');
          });
        }
      </script>
    `
  },
}
