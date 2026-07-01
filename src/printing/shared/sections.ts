// ============================================================================
// أقسام مشتركة للقوالب - Shared Template Sections (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { PrintSettings } from './types'
import { numberToArabicWords, numberToEnglishWords } from './utils'
import { escapeHtml } from '@/lib/escape-html'

// ============ Bank Info Section ============

export function bankInfoSection(settings: PrintSettings, lang: 'ar' | 'en', prefix = 'doc'): string {
  // AUDIT-2 S2 FIX: respect the `invoiceShowBankDetails` toggle.
  // The toggle defaults to `true` (bank info shown when banks are configured).
  // When explicitly `false`, return empty string — even if bankName/bankIban exist.
  if (settings.invoiceShowBankDetails === false) return ''

  if (!settings.bankName && !settings.bankIban) return ''

  if (prefix === 'ri') {
    return `
      <div class="ri-bank">
        <div class="ri-bank-title">${lang === 'ar' ? 'معلومات البنك / Bank Details' : 'Bank Details'}</div>
        <div class="ri-bank-grid">
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'اسم البنك / Bank Name' : 'Bank Name'}</div>
            <div class="ri-bank-item-value">${escapeHtml(settings.bankName || '-')}</div>
          </div>
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'الآيبان / IBAN' : 'IBAN'}</div>
            <div class="ri-bank-item-value">${escapeHtml(settings.bankIban || '-')}</div>
          </div>
          <div>
            <div class="ri-bank-item-label">${lang === 'ar' ? 'اسم الحساب / Account Name' : 'Account Name'}</div>
            <div class="ri-bank-item-value">${escapeHtml(settings.bankAccountName || '-')}</div>
          </div>
        </div>
      </div>
    `
  }

  return `
    <div class="bank-info">
      <div class="bank-info-title">${lang === 'ar' ? 'معلومات البنك / Bank Details' : 'Bank Details'}</div>
      <div class="bank-info-row">
        ${settings.bankName ? `<span>${lang === 'ar' ? 'البنك' : 'Bank'}: ${escapeHtml(settings.bankName)}</span>` : ''}
        ${settings.bankIban ? `<span>IBAN: ${escapeHtml(settings.bankIban)}</span>` : ''}
        ${settings.bankAccountName ? `<span>${lang === 'ar' ? 'الحساب' : 'Account'}: ${escapeHtml(settings.bankAccountName)}</span>` : ''}
      </div>
    </div>
  `
}

// ============ Signatures Section ============

/**
 * AUDIT-2 S3 FIX: render the company stamp according to `settings.stampPosition`.
 *
 * Positions:
 *   • 'after-signatures'  (default) — stamp rendered inside the signatures area
 *                    (alongside the signature boxes). Backward-compatible.
 *   • 'before-signatures' — stamp rendered in its own block above the signatures row.
 *   • 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center' | 'after-totals'
 *                    — stamp rendered as an absolutely-positioned overlay anchored
 *                      to the `.page` wrapper (the nearest positioned ancestor).
 *                      The signatures row is rendered WITHOUT the stamp area.
 *
 * The function still returns only the signatures section markup. The overlay
 * markup is appended at the end of the same return value so callers don't need
 * to be modified — the overlay anchors to `.page` regardless of where in the
 * body it appears.
 */
export function signaturesSection(settings: PrintSettings, lang: 'ar' | 'en', prefix = 'doc'): string {
  // Read stamp placement/size from settings (with sensible defaults)
  const stampW = settings.stampWidth ?? 140
  const stampH = settings.stampHeight ?? 140
  const stampOpacity = Number(settings.stampOpacity ?? 0.9)
  const stampRotation = settings.stampRotation ?? 0
  const stampOffsetX = settings.stampOffsetX ?? 0
  const stampOffsetY = settings.stampOffsetY ?? 0
  const showStamp = settings.invoiceShowStamp ?? false
  const showSignature = settings.invoiceShowSignature ?? true
  const stampPosition = settings.stampPosition || 'after-signatures'

  // Build the stamp <img> tag with inline styles. Used by both inline and overlay layouts.
  const stampImg = showStamp && settings.stamp
    ? `<img class="stamp-img" src="${escapeHtml(settings.stamp)}" alt="Stamp" style="width:${stampW}px;height:${stampH}px;object-fit:contain;opacity:${stampOpacity};transform:rotate(${stampRotation}deg) translate(${stampOffsetX}px,${stampOffsetY}px);" />`
    : ''

  // AUDIT-2 S3: when stampPosition is a corner / center / after-totals overlay,
  // the stamp is rendered as an absolutely-positioned <div> anchored to `.page`.
  // For these positions, the signatures row is rendered WITHOUT a stamp-area.
  const overlayPositions = new Set([
    'top-right', 'top-left', 'bottom-right', 'bottom-left', 'center', 'after-totals'
  ])
  const isOverlay = overlayPositions.has(stampPosition)

  // Build the overlay stamp HTML — appended after the signatures markup so it
  // visually anchors to the `.page` wrapper (which has `position: relative`).
  const buildOverlay = () => {
    if (!showStamp || !settings.stamp || !isOverlay) return ''
    // Determine corner offsets (px). Offset semantics mirror the on-screen preview.
    const top = `calc(20px + ${stampOffsetY}px)`
    const bottom = `calc(20px - ${stampOffsetY}px)`
    const left = `calc(20px + ${stampOffsetX}px)`
    const right = `calc(20px - ${stampOffsetX}px)`
    let posCss = ''
    if (stampPosition === 'top-right')      posCss = `top:${top};right:${right};`
    else if (stampPosition === 'top-left')  posCss = `top:${top};left:${left};`
    else if (stampPosition === 'bottom-right') posCss = `bottom:${bottom};right:${right};`
    else if (stampPosition === 'bottom-left')  posCss = `bottom:${bottom};left:${left};`
    else if (stampPosition === 'center') {
      // Center: use transform to true-center, then apply user offsets + rotation.
      posCss = `top:50%;left:50%;transform:translate(-50%, -50%) rotate(${stampRotation}deg) translate(${stampOffsetX}px, ${stampOffsetY}px);`
      return `<div class="stamp-overlay" style="position:absolute;z-index:5;pointer-events:none;${posCss}">${stampImg}</div>`
    } else if (stampPosition === 'after-totals') {
      // After-totals: place near the bottom of the page (above the footer).
      posCss = `bottom:80px;right:${right};`
    }
    return `<div class="stamp-overlay" style="position:absolute;z-index:5;pointer-events:none;${posCss}">${stampImg}</div>`
  }

  if (!showSignature && !showStamp) return ''

  if (prefix === 'ri') {
    // Rental-invoice layout — only render stamp inside signatures when position is
    // 'after-signatures' (default) or 'before-signatures'. For overlay positions,
    // signatures row is rendered without the stamp image.
    const stampInside = (stampPosition === 'after-signatures') && stampImg
    const stampBefore = (stampPosition === 'before-signatures') && stampImg
    const stampBeforeHtml = stampBefore
      ? `<div class="ri-signatures" style="grid-template-columns:1fr;margin-bottom:8px;">
           <div class="ri-sign-box" style="display:flex;justify-content:center;align-items:center;min-height:${stampH + 20}px;">
             ${stampImg}
             <div class="sign-label">${lang === 'ar' ? 'ختم الشركة / Company Stamp' : 'Company Stamp'}</div>
           </div>
         </div>`
      : ''

    if (!showSignature) {
      // Only show the stamp area (only when not an overlay — overlay handled separately)
      if (isOverlay) return buildOverlay()
      return `${stampBeforeHtml}
        <div class="ri-signatures" style="grid-template-columns:1fr;">
          <div class="ri-sign-box" style="display:flex;justify-content:center;align-items:center;min-height:${stampH + 20}px;">
            ${stampInside || ''}
            <div class="sign-label">${lang === 'ar' ? 'ختم الشركة / Company Stamp' : 'Company Stamp'}</div>
          </div>
        </div>`
    }
    return `${stampBeforeHtml}
      <div class="ri-signatures">
        <div class="ri-sign-box" style="min-height:${stampH + 20}px;">
          ${stampInside || ''}
          <div class="sign-label">${lang === 'ar' ? 'ختم وتوقيع الشركة / Company Stamp & Signature' : 'Company Stamp & Signature'}</div>
        </div>
        <div class="ri-sign-box">
          <div class="sign-label">${lang === 'ar' ? 'ختم وتوقيع العميل / Customer Stamp & Signature' : 'Customer Stamp & Signature'}</div>
        </div>
      </div>
      ${buildOverlay()}`
  }

  // Default (non-rental) layout
  const stampInside = (stampPosition === 'after-signatures') && stampImg
  const stampBefore = (stampPosition === 'before-signatures') && stampImg
  const stampBeforeHtml = stampBefore
    ? `<div class="stamp-area" style="min-height:${stampH + 10}px;text-align:${lang === 'ar' ? 'right' : 'left'};margin-bottom:8px;">
         ${stampImg}
       </div>`
    : ''

  // For overlay positions, skip the inline stamp-area entirely (only render signatures).
  const showInlineStampArea = !isOverlay && stampInside
  const signaturesRow = showSignature
    ? `
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المدير المالي' : 'CFO Signature'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المدير العام' : 'GM Signature'}</div>
      </div>
    `
    : ''

  return `${stampBeforeHtml}
    <div class="signatures-section">
      ${showInlineStampArea ? `<div class="stamp-area" style="min-height:${stampH + 10}px;">${stampImg}</div>` : ''}
      ${signaturesRow}
    </div>
    ${buildOverlay()}`
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
        ${escapeHtml(content)}
      </div>
    `
  }

  return `
    <div class="terms-section">
      <div class="terms-title">${lang === 'ar' ? 'الشروط والأحكام / Terms & Conditions' : 'Terms & Conditions'}</div>
      ${escapeHtml(content)}
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
