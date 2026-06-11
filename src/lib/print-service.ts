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
          <div class="info-value">${formatMoneyPrint(Number(data.hourlyRate) || 0)} ${currency}</div>
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
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
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
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span class="value">${formatMoneyPrint(Number(data.subtotal) || 0)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</span>
          <span class="value">${formatMoneyPrint(Number(data.vatAmount) || 0)}</span>
        </div>
        ${data.includeDelivery && Number(data.deliveryAmount) > 0 ? `
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'رسوم النقل' : 'Delivery Fees'}</span>
          <span class="value">${formatMoneyPrint(Number(data.deliveryAmount) || 0)}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${formatMoneyPrint(totalAmount)} ${currency}</span>
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
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
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
          <td class="amount-cell">${formatMoneyPrint(Number(data.contractValue) || 0)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'قيمة المستخلص' : 'Claim Amount'}</td>
          <td class="amount-cell">${formatMoneyPrint(Number(data.amount) || 0)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</td>
          <td class="amount-cell">${formatMoneyPrint(Number(data.vatAmount) || 0)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${formatMoneyPrint(totalAmount)} ${currency}</span>
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
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
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
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span class="value">${formatMoneyPrint(Number(data.subtotal) || 0)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lang === 'ar' ? `ضريبة القيمة المضافة (${(settings.defaultVatRate * 100).toFixed(0)}%)` : `VAT (${(settings.defaultVatRate * 100).toFixed(0)}%)`}</span>
          <span class="value">${formatMoneyPrint(Number(data.vatAmount) || 0)}</span>
        </div>
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي شامل الضريبة' : 'Grand Total incl. VAT'}</span>
          <span class="value">${formatMoneyPrint(totalAmount)} ${currency}</span>
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
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
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
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
          <span class="value">${formatMoneyPrint(Number(data.totalAmount) || 0)} ${currency}</span>
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
          <td class="amount-cell">${formatMoneyPrint(Number(data.totalSales) || 0)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'ضريبة المخرجات' : 'Output VAT'}</td>
          <td class="amount-cell">${formatMoneyPrint(Number(data.outputVat) || 0)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'إجمالي المشتريات' : 'Total Purchases'}</td>
          <td class="amount-cell">${formatMoneyPrint(Number(data.totalPurchases) || 0)}</td>
        </tr>
        <tr>
          <td>${lang === 'ar' ? 'ضريبة المدخلات' : 'Input VAT'}</td>
          <td class="amount-cell">${formatMoneyPrint(Number(data.inputVat) || 0)}</td>
        </tr>
      </tbody>
    </table>
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
          <span class="value">${formatMoneyPrint(Number(data.netVat) || 0)} ${currency}</span>
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
  const currency = getCurrencySymbol(settings, lang)

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
              return `<td class="${isAmount ? 'amount-cell' : ''}">${isAmount ? formatMoneyPrint(Number(val) || 0) : (val ?? '')}</td>`
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
            <span class="value">${formatMoneyPrint(t.value)} ${currency}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    ${signaturesSection(settings, lang)}
  `
}

// ============ Payment Voucher Body ============
function generatePaymentVoucherBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const currency = getCurrencySymbol(settings, lang)
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
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
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
          <span class="value">${formatMoneyPrint(totalAmount)} ${currency}</span>
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
        <tr><td>${lang === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.basicSalary) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'بدل سكن' : 'Housing Allowance'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.housingAllowance) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'بدل نقل' : 'Transport Allowance'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.transportAllowance) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'الإجمالي قبل الخصومات' : 'Gross Salary'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.grossSalary) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'خصم تأمينات' : 'GOSI Deduction'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.gosiDeduction) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'سلف' : 'Advance'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.advance) || 0)}</td></tr>
        <tr><td>${lang === 'ar' ? 'خصومات أخرى' : 'Other Deductions'}</td><td class="amount-cell">${formatMoneyPrint(Number(data.otherDeductions) || 0)}</td></tr>
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row grand">
          <span class="label">${lang === 'ar' ? 'صافي الراتب' : 'Net Salary'}</span>
          <span class="value">${formatMoneyPrint(Number(data.netSalary) || 0)} ${currency}</span>
        </div>
      </div>
    </div>

    ${amountInWordsSection(Number(data.netSalary) || 0, lang)}
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
    case 'service-invoice':
    case 'rental-invoice':
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
    case 'generic-table':
    case 'delivery-order':
    case 'purchase-request':
    case 'goods-receipt':
    case 'attendance-report':
    case 'rental-contract':
    case 'equipment-report':
    case 'fuel-report':
    case 'maintenance-report':
    case 'timesheet-report':
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

  const header = generateHeader(settings, lang, title, subtitle)
  const footer = generateFooter(settings, lang)
  const body = generateDocumentBody(type, data, settings, lang)
  const css = getSharedCSS(lang)
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"

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
