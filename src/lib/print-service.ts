// ============================================================================
// خدمة الطباعة الموحدة الاحترافية - Professional Unified Print Service
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Centralized print service - NO window.print() on pages.
// Each document gets its own professional A4 portrait template with:
// - Company header with logo, name, address, tax number
// - Professional document body
// - Currency display (SAR/ر.س)
// - Amount in words (Arabic + English)
// - Company footer with contact info
// - Stamp & signature sections
// ============================================================================

// Inline format function for print service (avoids import from client component)
function formatAmount(value: number, mode: 'system' | 'official' = 'official'): string {
  if (mode === 'official') {
    return value.toFixed(2)
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatMoneyPrint(value: number): string {
  return formatAmount(value, 'official')
}

// ============ Document Types ============
export type PrintDocumentType =
  | 'service-invoice'
  | 'rental-invoice'
  | 'extract'
  | 'purchase-order'
  | 'supplier-invoice'
  | 'tax-declaration'
  | 'delivery-order'
  | 'purchase-request'
  | 'goods-receipt'
  | 'salary-slip'
  | 'attendance-report'
  | 'client-payment'
  | 'supplier-payment'
  | 'rental-payment'
  | 'expense-report'
  | 'advance-voucher'
  | 'petty-cash-voucher'
  | 'rental-contract'
  | 'equipment-report'
  | 'fuel-report'
  | 'maintenance-report'
  | 'timesheet-report'
  | 'work-team-report'
  | 'resource-distribution'
  | 'journal-entry'
  | 'trial-balance'
  | 'account-statement'
  | 'generic-table'

export interface PrintOptions {
  type: PrintDocumentType
  data: Record<string, unknown>
  settings: {
    nameAr: string
    nameEn: string
    taxNumber: string | null
    commercialReg: string | null
    address: string | null
    phone: string | null
    email: string | null
    website: string | null
    logoUrl: string | null
    headerImage: string | null
    footerImage: string | null
    stamp: string | null
    currencySymbolImage: string | null
    currencySymbol: string | null
    currencySymbolAr: string | null
    currencySymbolEn: string | null
    defaultVatRate: number
    bankName: string | null
    bankIban: string | null
    bankAccountName: string | null
    invoiceTerms: string | null
  }
  lang?: 'ar' | 'en'
}

// ============ Currency Display ============
function getCurrencySymbol(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return settings.currencySymbolAr || settings.currencySymbol || 'ر.س'
  }
  return settings.currencySymbolEn || settings.currencySymbol || 'SAR'
}

function getCurrencyName(lang: 'ar' | 'en'): string {
  return lang === 'ar' ? 'ريال سعودي' : 'Saudi Riyal'
}

// ============ Amount in Words (Inline) ============
function numberToArabicWords(amount: number): string {
  if (amount === 0) return 'صفر ريالاً سعودياً فقط لا غير'
  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة']
  function below1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) { const t = Math.floor(n / 10); const o = n % 10; return o === 0 ? tens[t] : ones[o] + ' و' + tens[t] }
    const h = Math.floor(n / 100); const r = n % 100; return r === 0 ? hundreds[h] : hundreds[h] + ' و' + below1000(r)
  }
  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 1000) return below1000(n)
    if (n < 1000000) { const th = Math.floor(n / 1000); const r = n % 1000; let w = th === 1 ? 'ألف' : th === 2 ? 'ألفان' : th <= 10 ? below1000(th) + ' آلاف' : below1000(th) + ' ألفاً'; return r === 0 ? w : w + ' و' + below1000(r) }
    if (n < 1000000000) { const m = Math.floor(n / 1000000); const r = n % 1000000; let w = m === 1 ? 'مليون' : m === 2 ? 'مليونان' : m <= 10 ? below1000(m) + ' ملايين' : below1000(m) + ' مليوناً'; return r === 0 ? w : w + ' و' + convert(r) }
    const b = Math.floor(n / 1000000000); const r = n % 1000000000; let w = b === 1 ? 'مليار' : b === 2 ? 'ملياران' : below1000(b) + ' ملياراً'; return r === 0 ? w : w + ' و' + convert(r)
  }
  let result = ''
  if (riyals > 0) result = convert(riyals) + ' ريالاً سعودياً'
  if (halalas > 0) { if (riyals > 0) result += ' و'; result += convert(halalas) + ' هللة' }
  return result + ' فقط لا غير'
}

function numberToEnglishWords(amount: number): string {
  if (amount === 0) return 'Zero Saudi Riyals only'
  const riyals = Math.floor(amount)
  const halalas = Math.round((amount - riyals) * 100)
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function below1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) { const t = Math.floor(n / 10); const o = n % 10; return o === 0 ? tens[t] : tens[t] + '-' + ones[o] }
    const h = Math.floor(n / 100); const r = n % 100; return r === 0 ? ones[h] + ' Hundred' : ones[h] + ' Hundred and ' + below1000(r)
  }
  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 1000) return below1000(n)
    if (n < 1000000) { const th = Math.floor(n / 1000); const r = n % 1000; return r === 0 ? below1000(th) + ' Thousand' : below1000(th) + ' Thousand ' + below1000(r) }
    if (n < 1000000000) { const m = Math.floor(n / 1000000); const r = n % 1000000; return r === 0 ? below1000(m) + ' Million' : below1000(m) + ' Million ' + convert(r) }
    const b = Math.floor(n / 1000000000); const r = n % 1000000000; return r === 0 ? below1000(b) + ' Billion' : below1000(b) + ' Billion ' + convert(r)
  }
  let result = ''
  if (riyals > 0) result = convert(riyals) + ' Saudi Riyals'
  if (halalas > 0) { if (riyals > 0) result += ' and '; result += convert(halalas) + ' Halalas' }
  return result + ' only'
}

function getAmountInWords(amount: number, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? numberToArabicWords(amount) : numberToEnglishWords(amount)
}

// ============ Shared CSS ============
function getSharedCSS(lang: 'ar' | 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'

  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 11px;
      color: #1a1a1a;
      direction: ${dir};
      background: #e5e7eb;
      line-height: 1.6;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; box-shadow: none; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto 20px;
      background: white;
      box-shadow: 0 2px 20px rgba(0,0,0,0.1);
      position: relative;
      overflow: hidden;
    }
    /* ──── HEADER ──── */
    .doc-header {
      background: linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%);
      color: white;
      padding: 18px 25px;
      display: flex;
      align-items: center;
      gap: 15px;
      position: relative;
    }
    .doc-header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24);
    }
    .header-logo {
      width: 60px;
      height: 60px;
      border-radius: 10px;
      background: white;
      padding: 4px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .header-company {
      flex: 1;
    }
    .header-company-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .header-company-details {
      font-size: 9px;
      opacity: 0.9;
      margin-top: 3px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .header-company-details span {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .header-doc-title-section {
      flex-shrink: 0;
      text-align: center;
      background: rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 8px 16px;
      backdrop-filter: blur(4px);
    }
    .header-doc-title {
      font-size: 14px;
      font-weight: 700;
    }
    .header-doc-subtitle {
      font-size: 9px;
      opacity: 0.85;
      margin-top: 2px;
    }
    /* ──── CUSTOM HEADER IMAGE ──── */
    .custom-header img {
      width: 100%;
      max-height: 100px;
      object-fit: contain;
    }
    /* ──── BODY ──── */
    .doc-body {
      padding: 20px 25px 10px;
    }
    /* ──── INFO GRID ──── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 20px;
      margin: 12px 0;
    }
    .info-grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px 20px;
      margin: 12px 0;
    }
    .info-item {
      padding: 6px 10px;
      background: #f9fafb;
      border-radius: 4px;
      border-right: 3px solid #059669;
      border-left: none;
    }
    [dir="ltr"] .info-item {
      border-right: none;
      border-left: 3px solid #059669;
    }
    .info-label {
      font-size: 8px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-value {
      font-size: 11px;
      font-weight: 600;
      color: #1a1a1a;
    }
    /* ──── RENTAL EQUIPMENT SECTION ──── */
    .rental-equipment-section {
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 12px;
      margin: 12px 0;
      background: #fffbeb;
    }
    .rental-equipment-section .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #92400e;
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid #fbbf24;
    }
    .rental-equipment-section .info-grid {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .rental-equipment-section .info-item {
      border-right-color: #f59e0b;
      background: #fefce8;
    }
    /* ──── PARTIES SECTION ──── */
    .parties-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 15px 0;
    }
    .party-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
    }
    .party-card-title {
      font-size: 9px;
      font-weight: 700;
      color: #059669;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid #e5e7eb;
    }
    .party-card-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      font-size: 10px;
    }
    .party-card-row .label { color: #6b7280; }
    .party-card-row .value { font-weight: 600; color: #1a1a1a; }
    /* ──── TABLE ──── */
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .doc-table thead {
      background: linear-gradient(135deg, #065f46, #047857);
    }
    .doc-table thead th {
      padding: 10px 12px;
      color: white;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: ${textAlign};
    }
    .doc-table thead th.amount-header {
      text-align: ${amountAlign};
    }
    .doc-table tbody tr {
      border-bottom: 1px solid #f3f4f6;
      transition: background 0.15s;
    }
    .doc-table tbody tr:nth-child(even) {
      background: #f9fafb;
    }
    .doc-table tbody tr:hover {
      background: #f0fdf4;
    }
    .doc-table tbody td {
      padding: 8px 12px;
      font-size: 10px;
      text-align: ${textAlign};
    }
    .doc-table tbody td.amount-cell {
      text-align: ${amountAlign};
      font-variant-numeric: tabular-nums;
      direction: ltr;
      font-weight: 500;
    }
    /* ──── CURRENCY SYMBOL IMAGE ──── */
    .ri-currency-img {
      height: 1.3em;
      width: auto;
      max-width: 2em;
      vertical-align: middle;
      display: inline;
      object-fit: contain;
      mix-blend-mode: multiply;
    }
    .doc-header .ri-currency-img {
      mix-blend-mode: screen;
    }
    .doc-table tbody td.row-num {
      text-align: center;
      color: #9ca3af;
      font-weight: 600;
      width: 35px;
    }
    /* ──── TOTALS SECTION ──── */
    .totals-section {
      margin-top: 15px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box {
      width: 280px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 12px;
      font-size: 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    .total-row .label { color: #6b7280; }
    .total-row .value { font-weight: 600; direction: ltr; }
    .total-row.grand {
      background: linear-gradient(135deg, #065f46, #047857);
      color: white;
      font-size: 13px;
      font-weight: 700;
      padding: 10px 12px;
      border-bottom: none;
    }
    .total-row.grand .label { color: rgba(255,255,255,0.9); }
    .total-row.grand .value { color: white; font-size: 14px; }
    /* ──── AMOUNT IN WORDS ──── */
    .amount-words {
      margin-top: 12px;
      padding: 10px 14px;
      background: #fefce8;
      border: 1px dashed #fbbf24;
      border-radius: 6px;
      font-size: 10px;
    }
    .amount-words-label {
      font-size: 8px;
      font-weight: 700;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 3px;
    }
    .amount-words-text {
      color: #78350f;
      font-weight: 600;
      line-height: 1.5;
    }
    /* ──── BANK INFO ──── */
    .bank-info {
      margin-top: 12px;
      padding: 10px 14px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 6px;
      font-size: 9px;
    }
    .bank-info-title {
      font-weight: 700;
      color: #0369a1;
      margin-bottom: 5px;
    }
    .bank-info-row {
      display: flex;
      gap: 15px;
      color: #0c4a6e;
    }
    .bank-info-row span { font-weight: 600; }
    /* ──── TERMS ──── */
    .terms-section {
      margin-top: 12px;
      padding: 10px 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 9px;
      color: #6b7280;
    }
    .terms-title {
      font-weight: 700;
      color: #374151;
      margin-bottom: 4px;
    }
    /* ──── STAMP & SIGNATURE ──── */
    .signatures-section {
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .stamp-area {
      text-align: center;
    }
    .stamp-area img {
      max-width: 120px;
      max-height: 120px;
      object-fit: contain;
    }
    .signature-box {
      text-align: center;
      min-width: 160px;
    }
    .signature-line {
      border-top: 1px dashed #9ca3af;
      margin-top: 40px;
      padding-top: 5px;
      font-size: 9px;
      color: #6b7280;
    }
    /* ──── FOOTER ──── */
    .doc-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: #f9fafb;
      border-top: 2px solid #059669;
      padding: 8px 25px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #9ca3af;
    }
    .doc-footer .company-info {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .doc-footer .page-info {
      font-weight: 600;
    }
    .custom-footer img {
      width: 100%;
      max-height: 60px;
      object-fit: contain;
    }
    /* ──── STATUS BADGE ──── */
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-active { background: #d1fae5; color: #065f46; }
    .status-paid { background: #d1fae5; color: #065f46; }
    .status-partial { background: #dbeafe; color: #1e40af; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-cancelled { background: #f3f4f6; color: #6b7280; }
    /* ──── DIVIDER ──── */
    .section-divider {
      border: none;
      border-top: 1px dashed #d1d5db;
      margin: 12px 0;
    }
    /* ──── PRINT BUTTON ──── */
    .print-actions {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      display: flex;
      gap: 8px;
    }
    .print-actions button {
      padding: 8px 20px;
      background: #059669;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: ${fontFamily};
      box-shadow: 0 2px 8px rgba(5,150,105,0.3);
      transition: all 0.2s;
    }
    .print-actions button:hover {
      background: #047857;
      box-shadow: 0 4px 12px rgba(5,150,105,0.4);
      transform: translateY(-1px);
    }
    .print-actions .close-btn {
      background: #6b7280;
      box-shadow: 0 2px 8px rgba(107,114,128,0.3);
    }
    .print-actions .close-btn:hover {
      background: #4b5563;
    }
    /* ──── WATERMARK ──── */
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      color: rgba(0,0,0,0.03);
      font-weight: 700;
      pointer-events: none;
      white-space: nowrap;
    }
  `
}

// ============ Header Generator ============
function generateHeader(settings: PrintOptions['settings'], lang: 'ar' | 'en', docTitle: string, docSubtitle?: string): string {
  const currency = getCurrencySymbol(settings, lang)

  if (settings.headerImage) {
    return `<div class="custom-header"><img src="${settings.headerImage}" alt="Header" /></div>`
  }

  return `
    <div class="doc-header">
      ${settings.logoUrl ? `<img class="header-logo" src="${settings.logoUrl}" alt="Logo" />` : '<div class="header-logo" style="display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#059669;">ب</div>'}
      <div class="header-company">
        <div class="header-company-name">${lang === 'ar' ? settings.nameAr : settings.nameEn}</div>
        <div class="header-company-details">
          ${settings.taxNumber ? `<span>📋 ${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
          ${settings.commercialReg ? `<span>🏢 ${lang === 'ar' ? 'س.ت' : 'CR'}: ${settings.commercialReg}</span>` : ''}
          ${settings.address ? `<span>📍 ${settings.address}</span>` : ''}
          ${settings.phone ? `<span>📞 ${settings.phone}</span>` : ''}
          ${settings.email ? `<span>✉ ${settings.email}</span>` : ''}
          ${settings.website ? `<span>🌐 ${settings.website}</span>` : ''}
          <span>💰 ${currency}</span>
        </div>
      </div>
      <div class="header-doc-title-section">
        <div class="header-doc-title">${docTitle}</div>
        ${docSubtitle ? `<div class="header-doc-subtitle">${docSubtitle}</div>` : ''}
      </div>
    </div>
  `
}

// ============ Footer Generator ============
function generateFooter(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (settings.footerImage) {
    return `<div class="custom-footer"><img src="${settings.footerImage}" alt="Footer" /></div>`
  }

  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn
  return `
    <div class="doc-footer">
      <div class="company-info">
        <span>${companyName}</span>
        ${settings.address ? `<span>| ${settings.address}</span>` : ''}
        ${settings.phone ? `<span>| ${settings.phone}</span>` : ''}
        ${settings.email ? `<span>| ${settings.email}</span>` : ''}
        ${settings.taxNumber ? `<span>| ${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
      </div>
      <div class="page-info">
        ${lang === 'ar' ? 'نظام بِنَاء ERP' : 'Binaa ERP'}
      </div>
    </div>
  `
}

// ============ Document Title Map ============
function getDocumentTitle(type: PrintDocumentType, lang: 'ar' | 'en'): { title: string; subtitle: string } {
  const titles: Record<PrintDocumentType, { ar: string; en: string; subAr?: string; subEn?: string }> = {
    'service-invoice': { ar: 'فاتورة خدمات', en: 'Service Invoice' },
    'rental-invoice': { ar: 'فاتورة تأجير معدات', en: 'Equipment Rental Invoice' },
    'extract': { ar: 'مستخلص أعمال', en: 'Progress Claim' },
    'purchase-order': { ar: 'أمر شراء', en: 'Purchase Order' },
    'supplier-invoice': { ar: 'فاتورة مورد', en: 'Supplier Invoice' },
    'tax-declaration': { ar: 'إقرار ضريبي', en: 'Tax Declaration' },
    'delivery-order': { ar: 'أمر تسليم', en: 'Delivery Order' },
    'purchase-request': { ar: 'طلب شراء', en: 'Purchase Request' },
    'goods-receipt': { ar: 'محضر استلام', en: 'Goods Receipt' },
    'salary-slip': { ar: 'مسير راتب', en: 'Salary Slip' },
    'attendance-report': { ar: 'تقرير الحضور', en: 'Attendance Report' },
    'client-payment': { ar: 'سند تحصيل', en: 'Collection Receipt' },
    'supplier-payment': { ar: 'سند صرف', en: 'Payment Voucher' },
    'rental-payment': { ar: 'سند تحصيل إيجار', en: 'Rental Collection Receipt' },
    'expense-report': { ar: 'سند مصروف', en: 'Expense Voucher' },
    'advance-voucher': { ar: 'سند سلفة', en: 'Advance Voucher' },
    'petty-cash-voucher': { ar: 'سند صرف نقدي', en: 'Petty Cash Voucher' },
    'rental-contract': { ar: 'عقد تأجير', en: 'Rental Contract' },
    'equipment-report': { ar: 'تقرير معدات', en: 'Equipment Report' },
    'fuel-report': { ar: 'تقرير وقود', en: 'Fuel Report' },
    'maintenance-report': { ar: 'تقرير صيانة', en: 'Maintenance Report' },
    'timesheet-report': { ar: 'سجل حضور معدات', en: 'Equipment Timesheet' },
    'work-team-report': { ar: 'تقرير فريق عمل', en: 'Work Team Report' },
    'resource-distribution': { ar: 'تقرير توزيع الموارد', en: 'Resource Distribution Report' },
    'journal-entry': { ar: 'قيد يومية', en: 'Journal Entry' },
    'trial-balance': { ar: 'ميزان مراجعة', en: 'Trial Balance' },
    'account-statement': { ar: 'كشف حساب', en: 'Account Statement' },
    'generic-table': { ar: 'تقرير', en: 'Report' },
  }
  const t = titles[type] || titles['generic-table']
  return {
    title: lang === 'ar' ? t.ar : t.en,
    subtitle: t.subAr && lang === 'ar' ? t.subAr : (t.subEn || '')
  }
}

// ============ Status Badge ============
function statusBadge(status: string | undefined | null, lang: 'ar' | 'en'): string {
  if (!status) return ''
  const statusMap: Record<string, { ar: string; en: string; cls: string }> = {
    'DRAFT': { ar: 'مسودة', en: 'Draft', cls: 'status-draft' },
    'ACTIVE': { ar: 'نشط', en: 'Active', cls: 'status-active' },
    'SENT': { ar: 'مرسل', en: 'Sent', cls: 'status-active' },
    'PAID': { ar: 'مدفوع', en: 'Paid', cls: 'status-paid' },
    'PARTIALLY_PAID': { ar: 'مدفوع جزئياً', en: 'Partially Paid', cls: 'status-partial' },
    'OVERDUE': { ar: 'متأخر', en: 'Overdue', cls: 'status-overdue' },
    'CANCELLED': { ar: 'ملغي', en: 'Cancelled', cls: 'status-cancelled' },
    'APPROVED': { ar: 'معتمد', en: 'Approved', cls: 'status-active' },
    'COMPLETED': { ar: 'مكتمل', en: 'Completed', cls: 'status-paid' },
  }
  const s = statusMap[status]
  if (!s) return ''
  return `<span class="status-badge ${s.cls}">${lang === 'ar' ? s.ar : s.en}</span>`
}

// ============ Bank Info Section ============
function bankInfoSection(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (!settings.bankName && !settings.bankIban) return ''
  return `
    <div class="bank-info">
      <div class="bank-info-title">${lang === 'ar' ? '🏦 معلومات البنك' : '🏦 Bank Details'}</div>
      <div class="bank-info-row">
        ${settings.bankName ? `<span>${lang === 'ar' ? 'البنك' : 'Bank'}: ${settings.bankName}</span>` : ''}
        ${settings.bankIban ? `<span>IBAN: ${settings.bankIban}</span>` : ''}
        ${settings.bankAccountName ? `<span>${lang === 'ar' ? 'اسم الحساب' : 'Account'}: ${settings.bankAccountName}</span>` : ''}
      </div>
    </div>
  `
}

// ============ Signatures Section ============
function signaturesSection(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
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

// ============ Amount In Words Section ============
function amountInWordsSection(amount: number, lang: 'ar' | 'en'): string {
  if (amount <= 0) return ''
  return `
    <div class="amount-words">
      <div class="amount-words-label">${lang === 'ar' ? '💰 المبلغ كتابة' : '💰 Amount in Words'}</div>
      <div class="amount-words-text">
        ${numberToArabicWords(amount)}
        <br/>
        <span style="color:#9ca3af; font-size:9px;">${numberToEnglishWords(amount)}</span>
      </div>
    </div>
  `
}

// ============ ZATCA TLV Encoding (Inline for print service) ============
function encodeZATCATLV(sellerName: string, vatNumber: string, date: string, total: string, vatTotal: string): string {
  // TLV encoding: Tag (1 byte) + Length (1 byte) + Value
  const encodeTag = (tag: number, value: string): Buffer => {
    const buf = Buffer.from(value, 'utf8')
    return Buffer.concat([Buffer.from([tag, buf.length]), buf])
  }
  const tlv = Buffer.concat([
    encodeTag(0x01, sellerName),
    encodeTag(0x02, vatNumber),
    encodeTag(0x03, date),
    encodeTag(0x04, total),
    encodeTag(0x05, vatTotal),
  ])
  return tlv.toString('base64')
}

// ============ Rental Invoice CSS ============
function getRentalInvoiceCSS(lang: 'ar' | 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'

  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 10px;
      color: #1e293b;
      direction: ${dir};
      background: #e2e8f0;
      line-height: 1.5;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; box-shadow: none; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto 20px;
      background: white;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      position: relative;
      overflow: hidden;
    }

    /* ──── HEADER ──── */
    .ri-header {
      background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%);
      color: white;
      padding: 20px 28px 16px;
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .ri-header::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, #d97706, #f59e0b, #d97706);
    }
    .ri-header-logo {
      width: 72px; height: 72px;
      border-radius: 12px;
      background: white;
      padding: 5px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .ri-header-logo-placeholder {
      width: 72px; height: 72px;
      border-radius: 12px;
      background: rgba(255,255,255,0.15);
      display: flex; align-items: center; justify-content: center;
      font-size: 30px; font-weight: 800; color: #d97706;
      flex-shrink: 0;
    }
    .ri-header-company {
      flex: 1;
      min-width: 0;
    }
    .ri-header-company-name {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
      line-height: 1.3;
    }
    .ri-header-company-name-en {
      font-size: 11px;
      opacity: 0.8;
      font-weight: 400;
      margin-top: 1px;
    }
    .ri-header-details {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin-top: 6px;
      font-size: 8.5px;
      opacity: 0.9;
    }
    .ri-header-details span {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .ri-header-title-box {
      flex-shrink: 0;
      text-align: center;
      background: rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px 18px;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255,255,255,0.2);
      align-self: center;
    }
    .ri-header-title {
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .ri-header-title-en {
      font-size: 9px;
      opacity: 0.85;
      margin-top: 2px;
    }

    /* ──── CUSTOM HEADER IMAGE ──── */
    .ri-custom-header img {
      width: 100%;
      max-height: 100px;
      object-fit: contain;
    }

    /* ──── BODY ──── */
    .ri-body {
      padding: 16px 28px 8px;
    }

    /* ──── INVOICE INFO ──── */
    .ri-info-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 20px;
      margin: 0 0 14px;
    }
    .ri-info-item {
      padding: 5px 10px;
      background: #f8fafc;
      border-radius: 4px;
      border-right: 3px solid #047857;
    }
    [dir="ltr"] .ri-info-item {
      border-right: none;
      border-left: 3px solid #047857;
    }
    .ri-info-label {
      font-size: 7.5px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 1px;
    }
    .ri-info-value {
      font-size: 10px;
      font-weight: 600;
      color: #1e293b;
    }

    /* ──── PARTIES SECTION ──── */
    .ri-parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin: 0 0 14px;
    }
    .ri-party-card {
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #fafafa;
    }
    .ri-party-title {
      font-size: 8px;
      font-weight: 700;
      color: #047857;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    .ri-party-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 9px;
    }
    .ri-party-row .label { color: #64748b; }
    .ri-party-row .value { font-weight: 600; color: #1e293b; }

    /* ──── ITEMS TABLE ──── */
    .ri-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 14px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .ri-table thead {
      background: linear-gradient(135deg, #064e3b, #047857);
    }
    .ri-table thead th {
      padding: 8px 10px;
      color: white;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: ${textAlign};
      white-space: nowrap;
    }
    .ri-table thead th.amount-header {
      text-align: ${amountAlign};
    }
    .ri-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    .ri-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .ri-table tbody td {
      padding: 6px 10px;
      font-size: 9px;
      text-align: ${textAlign};
    }
    .ri-table tbody td.amount-cell {
      text-align: ${amountAlign};
      font-variant-numeric: tabular-nums;
      direction: ltr;
      font-weight: 500;
    }
    .ri-table tbody td.row-num {
      text-align: center;
      color: #94a3b8;
      font-weight: 600;
      width: 30px;
    }

    /* ──── BILLING SUMMARY ──── */
    .ri-totals {
      margin: 0 0 12px;
      display: flex;
      justify-content: flex-end;
    }
    .ri-totals-box {
      width: 280px;
      border: 1.5px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .ri-total-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 12px;
      font-size: 9.5px;
      border-bottom: 1px solid #f1f5f9;
    }
    .ri-total-row .label { color: #64748b; }
    .ri-total-row .value { font-weight: 600; direction: ltr; }
    .ri-total-row.grand {
      background: linear-gradient(135deg, #064e3b, #047857);
      color: white;
      font-size: 12px;
      font-weight: 700;
      padding: 8px 12px;
      border-bottom: none;
    }
    .ri-total-row.grand .label { color: rgba(255,255,255,0.9); }
    .ri-total-row.grand .value { color: white; font-size: 13px; }

    /* ──── AMOUNT IN WORDS ──── */
    .ri-amount-words {
      margin: 0 0 10px;
      padding: 8px 12px;
      background: #fffbeb;
      border: 1px dashed #f59e0b;
      border-radius: 6px;
      font-size: 9px;
    }
    .ri-amount-words-label {
      font-size: 7.5px;
      font-weight: 700;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .ri-amount-words-text {
      color: #78350f;
      font-weight: 600;
      line-height: 1.5;
    }
    .ri-amount-words-en {
      color: #94a3b8;
      font-size: 8px;
      margin-top: 2px;
    }

    /* ──── QR CODE SECTION ──── */
    .ri-qr-section {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 0 0 10px;
      padding: 8px 12px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
    }
    .ri-qr-image {
      width: 100px;
      height: 100px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .ri-qr-info {
      flex: 1;
      font-size: 8px;
      color: #64748b;
    }
    .ri-qr-title {
      font-weight: 700;
      color: #065f46;
      font-size: 9px;
      margin-bottom: 4px;
    }

    /* ──── BANK INFO ──── */
    .ri-bank {
      margin: 0 0 10px;
      padding: 8px 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      font-size: 8.5px;
    }
    .ri-bank-title {
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 4px;
      font-size: 9px;
    }
    .ri-bank-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
      color: #1e3a5f;
    }
    .ri-bank-item-label {
      color: #64748b;
      font-size: 7.5px;
    }
    .ri-bank-item-value {
      font-weight: 600;
      color: #1e293b;
      font-size: 9px;
      direction: ltr;
      unicode-bidi: plaintext;
    }

    /* ──── SIGNATURES ──── */
    .ri-signatures {
      margin: 14px 0 8px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .ri-sign-box {
      border: 1.5px dashed #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      min-height: 80px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .ri-sign-box .sign-label {
      font-size: 8px;
      color: #64748b;
      font-weight: 600;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
    }
    .ri-sign-box .stamp-img {
      max-width: 80px;
      max-height: 60px;
      object-fit: contain;
      margin: 0 auto;
    }

    /* ──── TERMS ──── */
    .ri-terms {
      margin: 0 0 8px;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 8px;
      color: #64748b;
    }
    .ri-terms-title {
      font-weight: 700;
      color: #334155;
      margin-bottom: 3px;
      font-size: 8.5px;
    }

    /* ──── FOOTER ──── */
    .ri-footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      background: #f1f5f9;
      border-top: 2px solid #047857;
      padding: 6px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #94a3b8;
    }
    .ri-footer .company-info {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .ri-custom-footer img {
      width: 100%;
      max-height: 50px;
      object-fit: contain;
    }

    /* ──── STATUS BADGE ──── */
    .ri-status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 8px;
      font-weight: 700;
    }
    .ri-status-draft { background: #fef3c7; color: #92400e; }
    .ri-status-active { background: #d1fae5; color: #065f46; }
    .ri-status-paid { background: #d1fae5; color: #065f46; }
    .ri-status-partial { background: #dbeafe; color: #1e40af; }
    .ri-status-overdue { background: #fee2e2; color: #991b1b; }
    .ri-status-cancelled { background: #f3f4f6; color: #6b7280; }
    .ri-status-sent { background: #d1fae5; color: #065f46; }
    .ri-status-approved { background: #d1fae5; color: #065f46; }
    .ri-status-completed { background: #d1fae5; color: #065f46; }

    /* ──── CURRENCY SYMBOL IMAGE ──── */
    .ri-currency-img {
      height: 1.3em;
      width: auto;
      max-width: 2em;
      vertical-align: middle;
      display: inline;
      object-fit: contain;
      /* Remove white/light background from currency symbol images */
      mix-blend-mode: multiply;
    }
    /* For dark backgrounds (footer, headers), use screen blend instead */
    .ri-footer .ri-currency-img,
    .ri-header .ri-currency-img {
      mix-blend-mode: screen;
    }

    /* ──── WATERMARK ──── */
    .ri-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      color: rgba(0,0,0,0.03);
      font-weight: 700;
      pointer-events: none;
      white-space: nowrap;
    }

    /* ──── PRINT ACTIONS ──── */
    .ri-print-actions {
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      display: flex;
      gap: 8px;
    }
    .ri-print-actions button {
      padding: 8px 18px;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: ${fontFamily};
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.2s;
    }
    .ri-print-actions button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .ri-btn-print { background: #047857; }
    .ri-btn-print:hover { background: #065f46; }
    .ri-btn-jpg { background: #d97706; }
    .ri-btn-jpg:hover { background: #b45309; }
    .ri-btn-png { background: #7c3aed; }
    .ri-btn-png:hover { background: #6d28d9; }
    .ri-btn-close { background: #6b7280; }
    .ri-btn-close:hover { background: #4b5563; }
    .ri-export-loading {
      opacity: 0.6;
      pointer-events: none;
    }

    /* ──── DIVIDER ──── */
    .ri-divider {
      border: none;
      border-top: 1px dashed #d1d5db;
      margin: 10px 0;
    }
  `
}

// ============ Rental Invoice Header ============
function generateRentalInvoiceHeader(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const currency = getCurrencySymbol(settings, lang)

  if (settings.headerImage) {
    return `<div class="ri-custom-header"><img src="${settings.headerImage}" alt="Header" /></div>`
  }

  return `
    <div class="ri-header">
      ${settings.logoUrl
        ? `<img class="ri-header-logo" src="${settings.logoUrl}" alt="Logo" />`
        : '<div class="ri-header-logo-placeholder">ب</div>'
      }
      <div class="ri-header-company">
        <div class="ri-header-company-name">${lang === 'ar' ? settings.nameAr : settings.nameEn}</div>
        <div class="ri-header-company-name-en">${lang === 'ar' ? settings.nameEn : settings.nameAr}</div>
        <div class="ri-header-details">
          ${settings.commercialReg ? `<span>${lang === 'ar' ? 'ض.ر' : 'CR'}: ${settings.commercialReg}</span>` : ''}
          ${settings.taxNumber ? `<span>${lang === 'ar' ? 'س.ت' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
          ${settings.address ? `<span>${settings.address}</span>` : ''}
          ${settings.phone ? `<span>${settings.phone}</span>` : ''}
          ${settings.email ? `<span>${settings.email}</span>` : ''}
          <span>${currency}</span>
        </div>
      </div>
      <div class="ri-header-title-box">
        <div class="ri-header-title">${lang === 'ar' ? 'فاتورة ضريبية' : 'Tax Invoice'}</div>
        <div class="ri-header-title-en">${lang === 'ar' ? 'Tax Invoice' : 'فاتورة ضريبية'}</div>
      </div>
    </div>
  `
}

// ============ Rental Invoice Footer ============
function generateRentalInvoiceFooter(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (settings.footerImage) {
    return `<div class="ri-custom-footer"><img src="${settings.footerImage}" alt="Footer" /></div>`
  }

  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn
  return `
    <div class="ri-footer">
      <div class="company-info">
        <span>${companyName}</span>
        ${settings.address ? `<span>| ${settings.address}</span>` : ''}
        ${settings.phone ? `<span>| ${settings.phone}</span>` : ''}
        ${settings.email ? `<span>| ${settings.email}</span>` : ''}
        ${settings.taxNumber ? `<span>| ${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
      </div>
      <span>${lang === 'ar' ? 'نظام بِنَاء ERP' : 'Binaa ERP'}</span>
    </div>
  `
}

// ============ Rental Invoice Status Badge ============
function rentalStatusBadge(status: string | undefined | null, lang: 'ar' | 'en'): string {
  if (!status) return ''
  const map: Record<string, { ar: string; en: string; cls: string }> = {
    'DRAFT': { ar: 'مسودة', en: 'Draft', cls: 'ri-status-draft' },
    'ACTIVE': { ar: 'نشط', en: 'Active', cls: 'ri-status-active' },
    'SENT': { ar: 'مرسل', en: 'Sent', cls: 'ri-status-sent' },
    'PAID': { ar: 'مدفوع', en: 'Paid', cls: 'ri-status-paid' },
    'PARTIALLY_PAID': { ar: 'مدفوع جزئياً', en: 'Partially Paid', cls: 'ri-status-partial' },
    'OVERDUE': { ar: 'متأخر', en: 'Overdue', cls: 'ri-status-overdue' },
    'CANCELLED': { ar: 'ملغي', en: 'Cancelled', cls: 'ri-status-cancelled' },
    'APPROVED': { ar: 'معتمد', en: 'Approved', cls: 'ri-status-approved' },
    'COMPLETED': { ar: 'مكتمل', en: 'Completed', cls: 'ri-status-completed' },
  }
  const s = map[status]
  if (!s) return ''
  return `<span class="ri-status-badge ${s.cls}">${lang === 'ar' ? s.ar : s.en}</span>`
}

// ============ Currency Display ============
function currencyDisplay(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (settings.currencySymbolImage) {
    return `<img class="ri-currency-img" src="${settings.currencySymbolImage}" alt="SAR" />`
  }
  return lang === 'ar' ? 'ر.س' : 'SAR'
}

/**
 * Format a money value with currency symbol for print templates.
 * Uses currency symbol image if available, otherwise text.
 * This should be used for ALL amount displays in print templates.
 */
function fmtMoney(value: number, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const formatted = formatMoneyPrint(value)
  const symbol = currencyDisplay(settings, lang)
  // Arabic: number then symbol (RTL) | English: symbol then number
  if (lang === 'ar') {
    return `${formatted} ${symbol}`
  }
  return `${symbol} ${formatted}`
}

// ============ Rental Invoice Body Generator ============
function generateRentalInvoiceBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  const currency = getCurrencySymbol(settings, lang)
  const totalAmount = Number(data.totalAmount) || 0
  const subtotal = Number(data.subtotal) || 0
  const vatAmount = Number(data.vatAmount) || 0
  const vatRate = settings.defaultVatRate || 0.15
  const deliveryFees = Number(data.deliveryAmount || data.deliveryFees) || 0
  const includeDelivery = data.includeDelivery === true || deliveryFees > 0

  // Compute delivery VAT if applicable
  const deliveryFeesTaxable = data.deliveryFeesTaxable === true || data.deliveryFeesTaxable === 'true'
  const deliveryVat = deliveryFeesTaxable ? deliveryFees * vatRate : 0

  // Date formatting
  const formatDate = (d: unknown) => {
    if (!d) return ''
    try {
      return new Date(d as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    } catch {
      return String(d)
    }
  }

  // ─── Section 1: Invoice Info ───
  const invoiceInfoSection = `
    <div class="ri-info-section">
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'رقم الفاتورة / Invoice No' : 'Invoice No'}</div>
        <div class="ri-info-value">${data.invoiceNo || data.id || ''}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'شروط السداد / Payment Terms' : 'Payment Terms'}</div>
        <div class="ri-info-value">${(data.paymentTerms as string) || (lang === 'ar' ? 'حسب العقد' : 'As per contract')}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'تاريخ الفاتورة / Invoice Date' : 'Invoice Date'}</div>
        <div class="ri-info-value">${formatDate(data.date)}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'الحالة / Status' : 'Status'}</div>
        <div class="ri-info-value">${rentalStatusBadge(data.status as string, lang)}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'تاريخ الاستحقاق / Due Date' : 'Due Date'}</div>
        <div class="ri-info-value">${formatDate(data.dueDate)}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'فترة التسليم / Delivery Period' : 'Delivery Period'}</div>
        <div class="ri-info-value">${(data.deliveryMonth as string) || '-'}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
        <div class="ri-info-value">${data.contractNo || '-'}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'ساعات التشغيل / Operating Hours' : 'Operating Hours'}</div>
        <div class="ri-info-value">${data.operatingHours != null ? `${data.operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'}` : '-'}</div>
      </div>
      <div class="ri-info-item">
        <div class="ri-info-label">${lang === 'ar' ? 'رقم طلب البيع / Sales Order' : 'Sales Order'}</div>
        <div class="ri-info-value">${data.salesOrderNo || '-'}</div>
      </div>
    </div>
  `

  // ─── Section 2: Parties ───
  const partiesSection = `
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

  // ─── Section 3: Items Table ───
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

  // ─── Section 4: Billing Summary ───
  const billingSummary = `
    <div class="ri-totals">
      <div class="ri-totals-box">
        <div class="ri-total-row">
          <span class="label">${lang === 'ar' ? 'المجموع الفرعي / Subtotal' : 'Subtotal'}</span>
          <span class="value">${fmtMoney(subtotal, settings, lang)}</span>
        </div>
        ${includeDelivery ? `
        <div class="ri-total-row">
          <span class="label">${lang === 'ar' ? 'رسوم النقل / Delivery Fees' : 'Delivery Fees'}</span>
          <span class="value">${fmtMoney(deliveryFees, settings, lang)}</span>
        </div>
        ${deliveryFeesTaxable && deliveryVat > 0 ? `
        <div class="ri-total-row">
          <span class="label">${lang === 'ar' ? 'ضريبة رسوم النقل / Delivery VAT' : 'Delivery VAT'}</span>
          <span class="value">${fmtMoney(deliveryVat, settings, lang)}</span>
        </div>
        ` : ''}` : ''}
        <div class="ri-total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة ${vatRate * 100}% / VAT ${vatRate * 100}%` : `VAT ${vatRate * 100}%`}</span>
          <span class="value">${fmtMoney(vatAmount, settings, lang)}</span>
        </div>
        <div class="ri-total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة / Grand Total' : 'Grand Total incl. VAT'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>
  `

  // ─── Section 5: Amount in Words ───
  const amountWordsHtml = totalAmount > 0 ? `
    <div class="ri-amount-words">
      <div class="ri-amount-words-label">${lang === 'ar' ? 'المبلغ كتابة / Amount in Words' : 'Amount in Words'}</div>
      <div class="ri-amount-words-text">${numberToArabicWords(totalAmount)}</div>
      <div class="ri-amount-words-en">${numberToEnglishWords(totalAmount)}</div>
    </div>
  ` : ''

  // ─── Section 6: QR Code ───
  // Generate ZATCA TLV base64 string for QR code
  const sellerName = lang === 'ar' ? settings.nameAr : settings.nameEn
  const vatNumber = settings.taxNumber || ''
  const invoiceDate = data.date ? new Date(data.date as string).toISOString().split('T')[0] : ''
  const totalStr = formatMoneyPrint(totalAmount)
  const vatTotalStr = formatMoneyPrint(vatAmount)
  const tlvBase64 = encodeZATCATLV(sellerName, vatNumber, invoiceDate, totalStr, vatTotalStr)

  // QR code image: use server-generated data URL if provided, otherwise use inline fallback
  const qrDataUrl = data.qrDataUrl as string | undefined

  const qrSection = settings.taxNumber ? `
    <div class="ri-qr-section">
      ${qrDataUrl
        ? `<img class="ri-qr-image" src="${qrDataUrl}" alt="ZATCA QR Code" style="display:block;" />`
        : `<canvas id="ri-qr-canvas" style="display:none;"></canvas>
           <img id="ri-qr-image" class="ri-qr-image" alt="ZATCA QR Code" style="display:none;" />`
      }
      <div class="ri-qr-info">
        <div class="ri-qr-title">${lang === 'ar' ? 'رمز الاستجابة السريعة - هيئة الزكاة والضريبة والجمارك' : 'ZATCA QR Code'}</div>
        <div>${lang === 'ar' ? 'اسم البائع' : 'Seller'}: ${sellerName}</div>
        <div>${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}: ${vatNumber}</div>
        <div>${lang === 'ar' ? 'تاريخ الفاتورة' : 'Invoice Date'}: ${invoiceDate}</div>
        <div>${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Total incl. VAT'}: ${fmtMoney(totalAmount, settings, lang)}</div>
        <div>${lang === 'ar' ? 'مبلغ الضريبة' : 'VAT Amount'}: ${fmtMoney(vatAmount, settings, lang)}</div>
      </div>
    </div>
    ${!qrDataUrl ? `
    <script>
      (function() {
        var tlvBase64 = "${tlvBase64}";
        function generateQR() {
          if (typeof QRCode === 'undefined') return;
          var canvas = document.getElementById('ri-qr-canvas');
          if (!canvas) return;
          QRCode.toCanvas(canvas, tlvBase64, {
            width: 100,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
          }, function(error) {
            if (error) return;
            var img = document.getElementById('ri-qr-image');
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
    ` : ''}
  ` : ''

  // ─── Section 7: Bank Info ───
  const bankHtml = (settings.bankName || settings.bankIban || settings.bankAccountName) ? `
    <div class="ri-bank">
      <div class="ri-bank-title">${lang === 'ar' ? '🏦 معلومات البنك / Bank Details' : '🏦 Bank Details'}</div>
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
  ` : ''

  // ─── Section 8: Signatures ───
  const signaturesHtml = `
    <div class="ri-signatures">
      <div class="ri-sign-box">
        ${settings.stamp ? `<img class="stamp-img" src="${settings.stamp}" alt="Stamp" />` : ''}
        <div class="sign-label">${lang === 'ar' ? 'ختم الشركة وتوقيعها / Company Stamp & Signature' : 'Company Stamp & Signature'}</div>
      </div>
      <div class="ri-sign-box">
        <div class="sign-label">${lang === 'ar' ? 'ختم العميل وتوقيعه / Customer Stamp & Signature' : 'Customer Stamp & Signature'}</div>
      </div>
    </div>
  `

  // ─── Section 9: Terms ───
  const termsHtml = (data.terms || settings.invoiceTerms) ? `
    <div class="ri-terms">
      <div class="ri-terms-title">${lang === 'ar' ? '📝 الشروط والأحكام / Terms & Conditions' : '📝 Terms & Conditions'}</div>
      ${(data.terms as string) || settings.invoiceTerms || ''}
    </div>
  ` : ''

  // ─── Assemble all sections ───
  return `
    ${invoiceInfoSection}
    ${partiesSection}
    ${itemsTable}
    ${billingSummary}
    ${amountWordsHtml}
    ${qrSection}
    ${bankHtml}
    ${termsHtml}
    ${signaturesHtml}
  `
}

// ============ Document Body Generators ============

function generateInvoiceBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  const currency = getCurrencySymbol(settings, lang)
  const totalAmount = Number(data.totalAmount) || 0
  const isRental = data.invoiceType === 'RENTAL'

  // Rental-specific info section
  const rentalSection = isRental && (data.equipmentName || data.operatingHours || data.hourlyRate) ? `
    <div class="rental-equipment-section">
      <div class="section-title">${lang === 'ar' ? '⚙️ بيانات المعدة والإيجار / Equipment & Rental Data' : '⚙️ Equipment & Rental Data'}</div>
      <div class="info-grid">
        ${data.equipmentName ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'المعدة' : 'Equipment'}</div>
          <div class="info-value">${data.equipmentName}</div>
        </div>` : ''}
        ${data.operatingHours != null ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'ساعات التشغيل' : 'Operating Hours'}</div>
          <div class="info-value">${data.operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'}</div>
        </div>` : ''}
        ${data.hourlyRate != null ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</div>
          <div class="info-value">${fmtMoney(Number(data.hourlyRate) || 0, settings, lang)}</div>
        </div>` : ''}
        ${data.deliveryMonth ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'فترة الإيجار' : 'Rental Period'}</div>
          <div class="info-value">${data.deliveryMonth}</div>
        </div>` : ''}
        ${data.salesOrderNo ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم طلب البيع' : 'Sales Order No'}</div>
          <div class="info-value">${data.salesOrderNo}</div>
        </div>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div class="parties-section">
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '🏘️ من :' : '🏘️ From:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
        ${settings.address ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${settings.address}</span></div>` : ''}
        ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'Tax No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
      </div>
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '👤 إلى :' : '👤 To:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'العميل' : 'Client'}</span><span class="value">${data.clientName || ''}</span></div>
        ${data.clientAddress ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${data.clientAddress}</span></div>` : ''}
        ${data.clientTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'Tax No'}</span><span class="value">${data.clientTaxNumber}</span></div>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No'}</div>
        <div class="info-value">${data.invoiceNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US') : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم العقد' : 'Contract No'}</div>
        <div class="info-value">${data.contractNo || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الحالة' : 'Status'}</div>
        <div class="info-value">${statusBadge(data.status as string, lang)}</div>
      </div>
    </div>

    ${rentalSection}

    <table class="doc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th class="amount-header">${lang === 'ar' ? 'السعر' : 'Price'} (${currency})</th>
          <th class="amount-header">${lang === 'ar' ? 'الإجمالي' : 'Total'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td class="row-num">${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
            <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span class="value">${fmtMoney(Number(data.subtotal) || 0, settings, lang)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</span>
          <span class="value">${fmtMoney(Number(data.vatAmount) || 0, settings, lang)}</span>
        </div>
        ${data.includeDelivery && Number(data.deliveryAmount) > 0 ? `
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'رسوم النقل' : 'Delivery Fees'}</span>
          <span class="value">${fmtMoney(Number(data.deliveryAmount) || 0, settings, lang)}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(totalAmount, lang)}
    ${bankInfoSection(settings, lang)}
    ${data.terms || settings.invoiceTerms ? `
    <div class="terms-section">
      <div class="terms-title">${lang === 'ar' ? '📝 الشروط والأحكام' : '📝 Terms & Conditions'}</div>
      ${(data.terms as string) || settings.invoiceTerms || ''}
    </div>` : ''}
    ${signaturesSection(settings, lang)}
  `
}

function generateExtractBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const currency = getCurrencySymbol(settings, lang)
  const totalAmount = Number(data.totalAmount) || 0

  return `
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم المستخلص' : 'Claim No'}</div>
        <div class="info-value">${data.claimNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US') : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'المشروع' : 'Project'}</div>
        <div class="info-value">${data.projectName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'نسبة الإنجاز' : 'Completion %'}</div>
        <div class="info-value">${data.percentage || 0}%</div>
      </div>
    </div>

    <table class="doc-table">
      <thead>
        <tr>
          <th>${lang === 'ar' ? 'البيان' : 'Description'}</th>
          <th class="amount-header">${lang === 'ar' ? 'المبلغ' : 'Amount'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${lang === 'ar' ? 'قيمة العقد' : 'Contract Value'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.contractValue) || 0, settings, lang)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'قيمة المستخلص' : 'Claim Amount'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.amount) || 0, settings, lang)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</td>
          <td class="amount-cell">${fmtMoney(Number(data.vatAmount) || 0, settings, lang)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(totalAmount, lang)}
    ${signaturesSection(settings, lang)}
  `
}

function generateSupplierInvoiceBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  const currency = getCurrencySymbol(settings, lang)
  const totalAmount = Number(data.totalAmount) || 0

  return `
    <div class="parties-section">
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '🏢 المورد :' : '🏢 Supplier:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم' : 'Name'}</span><span class="value">${data.supplierName || ''}</span></div>
        ${data.supplierTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'Tax No'}</span><span class="value">${data.supplierTaxNumber}</span></div>` : ''}
      </div>
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '🏢 المشتري :' : '🏢 Buyer:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
        ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'Tax No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No'}</div>
        <div class="info-value">${data.invoiceNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US') : ''}</div>
      </div>
    </div>

    <table class="doc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th class="amount-header">${lang === 'ar' ? 'السعر' : 'Price'} (${currency})</th>
          <th class="amount-header">${lang === 'ar' ? 'الإجمالي' : 'Total'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td class="row-num">${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
            <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span class="value">${fmtMoney(Number(data.subtotal) || 0, settings, lang)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</span>
          <span class="value">${fmtMoney(Number(data.vatAmount) || 0, settings, lang)}</span>
        </div>
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(totalAmount, lang)}
    ${signaturesSection(settings, lang)}
  `
}

function generatePurchaseOrderBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  const currency = getCurrencySymbol(settings, lang)

  return `
    <div class="parties-section">
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '🏢 الطالب :' : '🏢 Buyer:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
        ${settings.address ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${settings.address}</span></div>` : ''}
      </div>
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '🏭 المورد :' : '🏭 Supplier:'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم' : 'Name'}</span><span class="value">${data.supplierName || ''}</span></div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء' : 'PO No'}</div>
        <div class="info-value">${data.orderNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US') : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الحالة' : 'Status'}</div>
        <div class="info-value">${statusBadge(data.status as string, lang)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'المشروع' : 'Project'}</div>
        <div class="info-value">${data.projectName || '-'}</div>
      </div>
    </div>

    <table class="doc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th class="amount-header">${lang === 'ar' ? 'السعر' : 'Price'} (${currency})</th>
          <th class="amount-header">${lang === 'ar' ? 'الإجمالي' : 'Total'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td class="row-num">${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0, settings, lang)}</td>
            <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0, settings, lang)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
          <span class="value">${fmtMoney(Number(data.totalAmount) || 0, settings, lang)}</span>
        </div>
      </div>
    </div>
    ${signaturesSection(settings, lang)}
  `
}

function generateTaxDeclarationBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const currency = getCurrencySymbol(settings, lang)

  return `
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'السنة' : 'Year'}</div>
        <div class="info-value">${data.year || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الربع' : 'Quarter'}</div>
        <div class="info-value">Q${data.quarter || ''}</div>
      </div>
    </div>
    <table class="doc-table">
      <thead>
        <tr>
          <th>${lang === 'ar' ? 'البند' : 'Item'}</th>
          <th class="amount-header">${lang === 'ar' ? 'المبلغ' : 'Amount'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.totalSales) || 0, settings, lang)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'ضريبة المخرجات' : 'Output VAT'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.outputVat) || 0, settings, lang)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'إجمالي المشتريات' : 'Total Purchases'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.totalPurchases) || 0, settings, lang)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'ضريبة المدخلات' : 'Input VAT'}</td>
          <td class="amount-cell">${fmtMoney(Number(data.inputVat) || 0, settings, lang)}</td>
        </tr>
      </tbody>
    </table>
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
          <span class="value">${fmtMoney(Number(data.netVat) || 0, settings, lang)}</span>
        </div>
      </div>
    </div>
    ${signaturesSection(settings, lang)}
  `
}

// ============ Generic Table Report Body ============
function generateGenericTableBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const columns = (data.columns as Array<{ key: string; label: string; align?: string }>) || []
  const rows = (data.rows as Array<Record<string, unknown>>) || []

  return `
    ${data.infoItems ? `
    <div class="info-grid">
      ${(data.infoItems as Array<{ label: string; value: string }>).map(item => `
        <div class="info-item">
          <div class="info-label">${item.label}</div>
          <div class="info-value">${item.value}</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${columns.length > 0 ? `
    <table class="doc-table">
      <thead>
        <tr>
          <th>#</th>
          ${columns.map(col => `<th class="${col.align === 'amount' ? 'amount-header' : ''}">${col.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, i) => `
          <tr>
            <td class="row-num">${i + 1}</td>
            ${columns.map(col => {
              const val = row[col.key]
              const isAmount = col.align === 'amount'
              return `<td class="${isAmount ? 'amount-cell' : ''}">${isAmount ? fmtMoney(Number(val) || 0, settings, lang) : (val ?? '')}</td>`
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<p style="text-align:center;color:#9ca3af;padding:30px;">No data to display</p>'}

    ${data.totals ? `
    <div class="totals-section">
      <div class="totals-box">
        ${(data.totals as Array<{ label: string; value: number; isGrand?: boolean }>).map(t => `
          <div class="total-row ${t.isGrand ? 'grand' : ''}">
            <span class="label">${t.label}</span>
            <span class="value">${fmtMoney(t.value, settings, lang)}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    ${signaturesSection(settings, lang)}
  `
}

// ============ Payment Voucher Body ============
function generatePaymentVoucherBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const totalAmount = Number(data.amount) || Number(data.totalAmount) || 0
  const isClient = data.clientName !== undefined && data.clientName !== null

  return `
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم السند' : 'Voucher No'}</div>
        <div class="info-value">${data.paymentNo || data.receiptNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US') : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${isClient ? (lang === 'ar' ? 'العميل' : 'Client') : (lang === 'ar' ? 'المورد' : 'Supplier')}</div>
        <div class="info-value">${data.clientName || data.supplierName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</div>
        <div class="info-value">${data.paymentMethod || (lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer')}</div>
      </div>
    </div>

    ${data.description ? `
    <div style="margin:10px 0;padding:8px 12px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb;">
      <span style="font-size:9px;color:#9ca3af;">${lang === 'ar' ? 'البيان' : 'Description'}</span><br/>
      <span style="font-size:11px;font-weight:500;">${data.description}</span>
    </div>` : ''}

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'المبلغ' : 'Amount'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(totalAmount, lang)}
    ${bankInfoSection(settings, lang)}
    ${signaturesSection(settings, lang)}
  `
}

// ============ Salary Slip Body ============
function generateSalarySlipBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const currency = getCurrencySymbol(settings, lang)

  return `
    <div class="info-grid-3">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الموظف' : 'Employee'}</div>
        <div class="info-value">${data.employeeName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الشهر' : 'Month'}</div>
        <div class="info-value">${data.month || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'السنة' : 'Year'}</div>
        <div class="info-value">${data.year || ''}</div>
      </div>
    </div>

    <table class="doc-table">
      <thead>
        <tr>
          <th>${lang === 'ar' ? 'البند' : 'Item'}</th>
          <th class="amount-header">${lang === 'ar' ? 'المبلغ' : 'Amount'} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>${lang === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</td><td class="amount-cell">${fmtMoney(Number(data.basicSalary) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'بدل سكن' : 'Housing Allowance'}</td><td class="amount-cell">${fmtMoney(Number(data.housingAllowance) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'بدل نقل' : 'Transport Allowance'}</td><td class="amount-cell">${fmtMoney(Number(data.transportAllowance) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'الإجمالي قبل الخصومات' : 'Gross Salary'}</td><td class="amount-cell">${fmtMoney(Number(data.grossSalary) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'خصم تأمينات' : 'GOSI Deduction'}</td><td class="amount-cell">${fmtMoney(Number(data.gosiDeduction) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'سلف' : 'Advance'}</td><td class="amount-cell">${fmtMoney(Number(data.advance) || 0, settings, lang)}</td></tr>
        <tr><td>${lang === 'ar' ? 'خصومات أخرى' : 'Other Deductions'}</td><td class="amount-cell">${fmtMoney(Number(data.otherDeductions) || 0, settings, lang)}</td></tr>
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'صافي الراتب' : 'Net Salary'}</span>
          <span class="value">${fmtMoney(Number(data.netSalary) || 0, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(Number(data.netSalary) || 0, lang)}
    ${signaturesSection(settings, lang)}
  `
}

// ============ Timesheet Body ============
function generateTimesheetBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const operatingHours = Number(data.operatingHours) || 0
  const hourlyRate = Number(data.hourlyRate) || 0
  const subtotal = Number(data.subtotal) || (operatingHours * hourlyRate)
  const vatRate = settings.defaultVatRate || 0.15
  const vatAmount = Number(data.vatAmount) || (subtotal * vatRate)
  const deliveryFees = Number(data.deliveryFees) || 0
  const deliveryFeesTaxable = data.deliveryFeesTaxable === true || data.deliveryFeesTaxable === 'true'
  const deliveryVat = deliveryFeesTaxable ? deliveryFees * vatRate : 0
  const totalAmount = Number(data.totalAmount) || (subtotal + vatAmount + deliveryFees + deliveryVat)

  const month = Number(data.month) || 0
  const year = Number(data.year) || 0
  const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthName = lang === 'ar' ? (arabicMonths[month - 1] || '') : (englishMonths[month - 1] || '')
  const periodLabel = month && year ? `${monthName} ${year}` : ''

  // Status map for timesheet-specific statuses
  const tsStatusMap: Record<string, { ar: string; en: string; cls: string }> = {
    'DRAFT': { ar: 'مسودة', en: 'Draft', cls: 'status-draft' },
    'SUBMITTED': { ar: 'مقدم', en: 'Submitted', cls: 'status-active' },
    'APPROVED': { ar: 'معتمد', en: 'Approved', cls: 'status-active' },
    'INVOICED': { ar: 'مفوتر', en: 'Invoiced', cls: 'status-paid' },
  }
  const statusVal = data.status as string
  const statusInfo = tsStatusMap[statusVal]
  const statusBadgeHtml = statusInfo
    ? `<span class="status-badge ${statusInfo.cls}">${lang === 'ar' ? statusInfo.ar : statusInfo.en}</span>`
    : (statusVal || '')

  return `
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم العقد' : 'Contract No'}</div>
        <div class="info-value">${data.contractNo || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الفترة' : 'Period'}</div>
        <div class="info-value">${periodLabel || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'الحالة' : 'Status'}</div>
        <div class="info-value">${statusBadgeHtml}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No'}</div>
        <div class="info-value">${data.invoiceNo || '-'}</div>
      </div>
    </div>

    <div class="parties-section">
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '⚙️ بيانات المعدة' : '⚙️ Equipment'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'المعدة' : 'Equipment'}</span><span class="value">${data.equipmentName || data.equipmentNameAr || '-'}</span></div>
        ${data.equipmentCode ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الكود' : 'Code'}</span><span class="value">${data.equipmentCode}</span></div>` : ''}
      </div>
      <div class="party-card">
        <div class="party-card-title">${lang === 'ar' ? '👤 العميل' : '👤 Client'}</div>
        <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم' : 'Name'}</span><span class="value">${data.clientName || data.clientNameAr || '-'}</span></div>
        ${data.projectName ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'المشروع' : 'Project'}</span><span class="value">${data.projectName}</span></div>` : ''}
      </div>
    </div>

    <div class="rental-equipment-section">
      <div class="section-title">${lang === 'ar' ? '⏱️ بيانات التشغيل / Operating Data' : '⏱️ Operating Data'}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'ساعات التشغيل' : 'Operating Hours'}</div>
          <div class="info-value">${operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</div>
          <div class="info-value">${fmtMoney(hourlyRate, settings, lang)}</div>
        </div>
        ${data.salesOrderNo ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم طلب البيع' : 'Sales Order'}</div>
          <div class="info-value">${data.salesOrderNo}</div>
        </div>` : ''}
        ${data.purchaseOrderNo ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء' : 'Purchase Order'}</div>
          <div class="info-value">${data.purchaseOrderNo}</div>
        </div>` : ''}
      </div>
    </div>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `المجموع الفرعي (${operatingHours} ${lang === 'ar' ? 'ساعة' : 'hrs'} × ${formatMoneyPrint(hourlyRate)})` : `Subtotal (${operatingHours} hrs × ${formatMoneyPrint(hourlyRate)})`}</span>
          <span class="value">${fmtMoney(subtotal, settings, lang)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة (${(vatRate * 100).toFixed(0)}%)` : `VAT (${(vatRate * 100).toFixed(0)}%)`}</span>
          <span class="value">${fmtMoney(vatAmount, settings, lang)}</span>
        </div>
        ${deliveryFees > 0 ? `<div class="total-row">
          <span class="label">${lang === 'ar' ? 'رسوم النقل' : 'Delivery Fees'}</span>
          <span class="value">${fmtMoney(deliveryFees, settings, lang)}</span>
        </div>
        ${deliveryFeesTaxable && deliveryVat > 0 ? `<div class="total-row">
          <span class="label">${lang === 'ar' ? 'ضريبة رسوم النقل' : 'Delivery VAT'}</span>
          <span class="value">${fmtMoney(deliveryVat, settings, lang)}</span>
        </div>` : ''}` : ''}
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${fmtMoney(totalAmount, settings, lang)}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(totalAmount, lang)}
    ${bankInfoSection(settings, lang)}
    ${signaturesSection(settings, lang)}
  `
}

// ============ Dispatch Body Generator ============
function generateDocumentBody(
  type: PrintDocumentType,
  data: Record<string, unknown>,
  settings: PrintOptions['settings'],
  lang: 'ar' | 'en'
): string {
  switch (type) {
    case 'rental-invoice':
      return generateRentalInvoiceBody(data, settings, lang)
    case 'service-invoice':
      return generateInvoiceBody(data, settings, lang)
    case 'extract':
      return generateExtractBody(data, settings, lang)
    case 'supplier-invoice':
      return generateSupplierInvoiceBody(data, settings, lang)
    case 'purchase-order':
      return generatePurchaseOrderBody(data, settings, lang)
    case 'tax-declaration':
      return generateTaxDeclarationBody(data, settings, lang)
    case 'client-payment':
    case 'supplier-payment':
    case 'rental-payment':
    case 'expense-report':
    case 'advance-voucher':
    case 'petty-cash-voucher':
      return generatePaymentVoucherBody(data, settings, lang)
    case 'salary-slip':
      return generateSalarySlipBody(data, settings, lang)
    case 'timesheet-report':
      return generateTimesheetBody(data, settings, lang)
    case 'generic-table':
    case 'delivery-order':
    case 'purchase-request':
    case 'goods-receipt':
    case 'attendance-report':
    case 'rental-contract':
    case 'equipment-report':
    case 'fuel-report':
    case 'maintenance-report':
    case 'work-team-report':
    case 'resource-distribution':
    case 'journal-entry':
    case 'trial-balance':
    case 'account-statement':
      return generateGenericTableBody(data, settings, lang)
    default:
      return generateGenericTableBody(data, settings, lang)
  }
}

// ============ Main HTML Generator ============
/**
 * Generate a print-ready HTML document with professional design
 */
export function generatePrintHTML(options: PrintOptions): string {
  const { type, data, settings, lang = 'ar' } = options
  const { title, subtitle } = getDocumentTitle(type, lang)
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"

  // Check if this is a rental invoice - use specialized template
  const isRentalInvoice = type === 'rental-invoice'

  if (isRentalInvoice) {
    const header = generateRentalInvoiceHeader(settings, lang)
    const footer = generateRentalInvoiceFooter(settings, lang)
    const body = generateRentalInvoiceBody(data, settings, lang)
    const css = getRentalInvoiceCSS(lang)
    const invNo = (data.invoiceNo as string) || (data.id as string) || 'invoice'

    return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${lang === 'ar' ? settings.nameAr : settings.nameEn}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <style>${css}</style>
</head>
<body>
  <div class="ri-print-actions no-print">
    <button class="ri-btn-print" onclick="window.print()">🖨️ ${lang === 'ar' ? 'طباعة / Print' : 'Print'}</button>
    <button class="ri-btn-jpg" id="btn-export-jpg" onclick="exportAsImage('jpeg')">📸 ${lang === 'ar' ? 'تحميل JPG / Download JPG' : 'Download JPG'}</button>
    <button class="ri-btn-png" id="btn-export-png" onclick="exportAsImage('png')">🖼️ ${lang === 'ar' ? 'تحميل PNG / Download PNG' : 'Download PNG'}</button>
    <button class="ri-btn-close" onclick="window.close()">✕ ${lang === 'ar' ? 'إغلاق / Close' : 'Close'}</button>
  </div>
  <div class="page" id="invoice-page">
    ${header}
    <div class="ri-body">
      ${body}
    </div>
    <div style="height:40px;"></div>
    ${footer}
  </div>
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
</body>
</html>`
  }

  // Default template for other document types
  const header = generateHeader(settings, lang, title, subtitle)
  const footer = generateFooter(settings, lang)
  const body = generateDocumentBody(type, data, settings, lang)
  const css = getSharedCSS(lang)

  return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${lang === 'ar' ? settings.nameAr : settings.nameEn}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="print-actions no-print">
    <button onclick="window.print()">🖨️ ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
    <button class="close-btn" onclick="window.close()">✕ ${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
  </div>
  <div class="page">
    ${header}
    <div class="doc-body">
      ${body}
    </div>
    <div style="height:50px;"></div>
    ${footer}
  </div>
</body>
</html>`
}
