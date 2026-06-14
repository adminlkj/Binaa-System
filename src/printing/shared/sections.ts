// ============================================================================
// أقسام مشتركة للقوالب - Shared Template Sections (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { PrintSettings } from './types'
import { getCurrencySymbol, numberToArabicWords, numberToEnglishWords } from './utils'

// ============ Bank Info Section ============

export function bankInfoSection(settings: PrintSettings, lang: 'ar' | 'en', prefix = 'doc'): string {
  if (!settings.bankName && !settings.bankIban) return ''

  if (prefix === 'ri') {
    return `
      <div class="ri-bank">
        <div class="ri-bank-title">${lang === 'ar' ? 'معلومات البنك / Bank Details' : 'Bank Details'}</div>
        <div class="ri-bank-grid">
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'اسم البنك / Bank Name' : 'Bank Name'}</div>
            <div class="ri-bank-item-value">${settings.bankName || '-'}</div>
          </div>
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'الآيبان / IBAN' : 'IBAN'}</div>
            <div class="ri-bank-item-value">${settings.bankIban || '-'}</div>
          </div>
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'اسم الحساب / Account Name' : 'Account Name'}</div>
            <div class="ri-bank-item-value">${settings.bankAccountName || '-'}</div>
          </div>
        </div>
      </div>
    `
  }

  return `
    <div class="bank-info">
      <div class="bank-info-title">${lang === 'ar' ? 'معلومات البنك / Bank Details' : 'Bank Details'}</div>
      <div class="bank-info-row">
        ${settings.bankName ? `<span>${lang === 'ar' ? 'البنك' : 'Bank'}: ${settings.bankName}</span>` : ''}
        ${settings.bankIban ? `<span>IBAN: ${settings.bankIban}</span>` : ''}
        ${settings.bankAccountName ? `<span>${lang === 'ar' ? 'الحساب' : 'Account'}: ${settings.bankAccountName}</span>` : ''}
      </div>
    </div>
  `
}

// ============ Signatures Section ============

export function signaturesSection(settings: PrintSettings, lang: 'ar' | 'en', prefix = 'doc'): string {
  if (prefix === 'ri') {
    return `
      <div class="ri-signatures">
        <div class="ri-sign-box">
          ${settings.stamp ? `<img class="stamp-img" src="${settings.stamp}" alt="Stamp" />` : ''}
          <div class="sign-label">${lang === 'ar' ? 'ختم وتوقيع الشركة / Company Stamp & Signature' : 'Company Stamp & Signature'}</div>
        </div>
        <div class="ri-sign-box">
          <div class="sign-label">${lang === 'ar' ? 'ختم وتوقيع العميل / Customer Stamp & Signature' : 'Customer Stamp & Signature'}</div>
        </div>
      </div>
    `
  }

  return `
    <div class="signatures-section">
      <div class="stamp-area">
        ${settings.stamp ? `<img src="${settings.stamp}" alt="${lang === 'ar' ? 'ختم' : 'Stamp'}" />` : ''}
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المدير المالي' : 'CFO Signature'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المدير العام' : 'GM Signature'}</div>
      </div>
    </div>
  `
}

// ============ Amount in Words Section ============

export function amountInWordsSection(amount: number, lang: 'ar' | 'en', prefix = 'doc'): string {
  if (amount <= 0) return ''

  if (prefix === 'ri') {
    return `
      <div class="ri-amount-words">
        <div class="ri-amount-words-label">${lang === 'ar' ? 'المبلغ كتابة / Amount in Words' : 'Amount in Words'}</div>
        <div class="ri-amount-words-text">${numberToArabicWords(amount)}</div>
        <div class="ri-amount-words-en">${numberToEnglishWords(amount)}</div>
      </div>
    `
  }

  return `
    <div class="amount-words">
      <div class="amount-words-label">${lang === 'ar' ? 'المبلغ كتابة / Amount in Words' : 'Amount in Words'}</div>
      <div class="amount-words-text">
        ${numberToArabicWords(amount)}
        <br/>
        <span style="color:#a16207; font-size:8px;">${numberToEnglishWords(amount)}</span>
      </div>
    </div>
  `
}

// ============ Terms Section ============

export function termsSection(terms: string | null | undefined, settings: PrintSettings, lang: 'ar' | 'en', prefix = 'doc'): string {
  const content = terms || settings.invoiceTerms
  if (!content) return ''

  if (prefix === 'ri') {
    return `
      <div class="ri-terms">
        <div class="ri-terms-title">${lang === 'ar' ? 'الشروط والأحكام / Terms & Conditions' : 'Terms & Conditions'}</div>
        ${content}
      </div>
    `
  }

  return `
    <div class="terms-section">
      <div class="terms-title">${lang === 'ar' ? 'الشروط والأحكام / Terms & Conditions' : 'Terms & Conditions'}</div>
      ${content}
    </div>
  `
}

// ============ Approval Section (for Progress Claims) ============

export function approvalsSection(lang: 'ar' | 'en'): string {
  return `
    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد الاستشاري / Consultant' : 'Consultant Approval'}
        </div>
      </div>
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد المالك / Owner' : 'Owner Approval'}
        </div>
      </div>
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد المقاول / Contractor' : 'Contractor Approval'}
        </div>
      </div>
    </div>
  `
}

// ============ QR Code Section ============

export function qrCodeSection(qrDataUrl: string | undefined, tlvBase64: string, settings: PrintSettings, lang: 'ar' | 'en', prefix = 'ri'): string {
  if (!settings.taxNumber) return ''

  return `
    <div class="${prefix}-qr-box">
      ${qrDataUrl
        ? `<img class="${prefix}-qr-image" src="${qrDataUrl}" alt="ZATCA QR Code" style="display:block;width:100%;height:100%;object-fit:contain;" />`
        : `<canvas id="${prefix}-qr-canvas" style="display:none;"></canvas>
           <img id="${prefix}-qr-image" class="${prefix}-qr-image" alt="ZATCA QR Code" style="display:none;width:100%;height:100%;object-fit:contain;" />`
      }
      <div class="${prefix}-qr-label">${lang === 'ar' ? 'رمز الاستجابة السريعة - هيئة الزكاة والضريبة والجمارك' : 'ZATCA QR Code'}</div>
    </div>
  `
}

export function qrCodeScript(tlvBase64: string, prefix = 'ri'): string {
  return `
    <script>
      (function() {
        var tlvBase64 = "${tlvBase64}";
        var prefix = "${prefix}";
        function generateQR() {
          if (typeof QRCode === 'undefined') return;
          var canvas = document.getElementById(prefix + '-qr-canvas');
          if (!canvas) return;
          QRCode.toCanvas(canvas, tlvBase64, {
            width: 140,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
          }, function(error) {
            if (error) return;
            var img = document.getElementById(prefix + '-qr-image');
            if (img) {
              img.src = canvas.toDataURL('image/png');
              img.style.display = 'block';
            }
          });
        }
        if (typeof QRCode !== 'undefined') {
          generateQR();
        } else {
          var checkInterval = setInterval(function() {
            if (typeof QRCode !== 'undefined') {
              clearInterval(checkInterval);
              generateQR();
            }
          }, 200);
          setTimeout(function() { clearInterval(checkInterval); }, 5000);
        }
      })();
    </script>
  `
}

// ============ Print Actions Bar ============

export function printActionsBar(lang: 'ar' | 'en', prefix = 'doc'): string {
  if (prefix === 'ri') {
    return `
      <div class="ri-print-actions no-print">
        <button class="ri-btn-print" onclick="window.print()">${lang === 'ar' ? 'طباعة / Print' : 'Print'}</button>
        <button class="ri-btn-jpg" id="btn-export-jpg" onclick="exportAsImage('jpeg')">${lang === 'ar' ? 'JPG' : 'JPG'}</button>
        <button class="ri-btn-png" id="btn-export-png" onclick="exportAsImage('png')">${lang === 'ar' ? 'PNG' : 'PNG'}</button>
        <button class="ri-btn-close" onclick="window.close()">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
      </div>
    `
  }

  return `
    <div class="print-actions no-print">
      <button onclick="window.print()">${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      <button class="close-btn" onclick="window.close()">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </div>
  `
}

// ============ Totals Section ============

export interface TotalRow {
  label: string
  value: number
  isGrand?: boolean
}

export function totalsSection(rows: TotalRow[], settings: PrintSettings, lang: 'ar' | 'en', fmtMoneyFn: (v: number) => string, prefix = 'doc'): string {
  if (prefix === 'ri') {
    return `
      <div class="ri-totals-box">
        ${rows.map(r => `
          <div class="ri-total-row ${r.isGrand ? 'grand' : ''}">
            <span class="label">${r.label}</span>
            <span class="value">${fmtMoneyFn(r.value)}</span>
          </div>
        `).join('')}
      </div>
    `
  }

  return `
    <div class="totals-section">
      <div class="totals-box">
        ${rows.map(r => `
          <div class="total-row ${r.isGrand ? 'grand' : ''}">
            <span class="label">${r.label}</span>
            <span class="value">${fmtMoneyFn(r.value)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `
}
