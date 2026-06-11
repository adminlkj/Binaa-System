// ============================================================================
// خدمة الطباعة الموحدة - Unified Print Service
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Centralized print service - NO window.print() on pages.
// Each document gets its own A4 portrait template.
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

export type PrintDocumentType =
  | 'service-invoice'
  | 'rental-invoice'
  | 'extract'
  | 'purchase-order'
  | 'supplier-invoice'
  | 'tax-declaration'

export interface PrintOptions {
  type: PrintDocumentType
  data: Record<string, unknown>
  settings: {
    nameAr: string
    nameEn: string
    taxNumber: string | null
    address: string | null
    phone: string | null
    email: string | null
    logoUrl: string | null
    headerImage: string | null
    footerImage: string | null
    stamp: string | null
    currencySymbolImage: string | null
    defaultVatRate: number
  }
  lang?: 'ar' | 'en'
}

/**
 * Generate a print-ready HTML document
 */
export function generatePrintHTML(options: PrintOptions): string {
  const { type, data, settings, lang = 'ar' } = options
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const fontFamily = lang === 'ar' ? "'Cairo', 'Noto Sans Arabic', sans-serif" : "'Inter', sans-serif"

  const header = generateHeader(settings, lang)
  const footer = generateFooter(settings, lang)
  const body = generateDocumentBody(type, data, settings, lang)

  return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${getDocumentTitle(type, lang)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 11px;
      color: #333;
      direction: ${dir};
      background: white;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 20mm;
      margin: 0 auto;
      position: relative;
    }
    @media print {
      body { background: white; }
      .page { margin: 0; padding: 15mm 20mm; }
      .no-print { display: none !important; }
    }
    .header { width: 100%; margin-bottom: 20px; }
    .header img { width: 100%; max-height: 80px; object-fit: contain; }
    .company-info { text-align: ${lang === 'ar' ? 'right' : 'left'}; }
    .company-name { font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .company-details { font-size: 10px; color: #666; margin-top: 4px; }
    .doc-title { 
      text-align: center; 
      font-size: 18px; 
      font-weight: 700; 
      margin: 20px 0;
      padding: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 4px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 16px 0;
    }
    .info-item { }
    .info-label { font-size: 9px; color: #888; text-transform: uppercase; }
    .info-value { font-size: 11px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { 
      padding: 8px 10px; 
      text-align: ${lang === 'ar' ? 'right' : 'left'}; 
      border-bottom: 1px solid #e5e7eb;
      font-size: 10px;
    }
    th { 
      background: #f9fafb; 
      font-weight: 600; 
      font-size: 9px;
      text-transform: uppercase;
      color: #555;
    }
    .amount-cell { text-align: ${lang === 'ar' ? 'left' : 'right'}; font-variant-numeric: tabular-nums; direction: ltr; }
    .totals-section { margin-top: 16px; }
    .total-row { 
      display: flex; 
      justify-content: space-between; 
      padding: 6px 0; 
      border-bottom: 1px solid #f0f0f0;
    }
    .total-row.grand {
      font-weight: 700;
      font-size: 14px;
      background: #f0fdf4;
      padding: 10px;
      border-radius: 4px;
      border: 1px solid #bbf7d0;
    }
    .stamp-section { 
      margin-top: 30px; 
      text-align: center; 
    }
    .stamp-section img { 
      max-width: 140px; 
      max-height: 140px; 
      object-fit: contain; 
    }
    .qr-section {
      margin-top: 20px;
      text-align: center;
    }
    .qr-section img {
      width: 100px;
      height: 100px;
    }
    .footer { 
      position: absolute;
      bottom: 15mm;
      left: 20mm;
      right: 20mm;
    }
    .footer img { width: 100%; max-height: 50px; object-fit: contain; }
    .terms { 
      margin-top: 20px;
      padding: 10px;
      background: #f9fafb;
      border-radius: 4px;
      font-size: 9px;
      color: #666;
    }
    .print-button {
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 999;
      padding: 10px 20px;
      background: #059669;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      font-family: ${fontFamily};
    }
    .print-button:hover { background: #047857; }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 60px;
      color: rgba(0,0,0,0.03);
      font-weight: 700;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">
    ${lang === 'ar' ? 'طباعة' : 'Print'} 🖨️
  </button>
  <div class="page">
    ${header}
    <div class="doc-title">${getDocumentTitle(type, lang)}</div>
    ${body}
    ${data.terms ? `<div class="terms">${data.terms}</div>` : ''}
    <div class="stamp-section">
      ${settings.stamp ? `<img src="${settings.stamp}" alt="Stamp" />` : ''}
    </div>
    <div class="footer">
      ${footer}
    </div>
  </div>
</body>
</html>`
}

function generateHeader(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (settings.headerImage) {
    return `<div class="header"><img src="${settings.headerImage}" alt="Header" /></div>`
  }
  return `<div class="header">
    <div class="company-info">
      ${settings.logoUrl ? `<img src="${settings.logoUrl}" alt="Logo" style="max-height:50px; margin-bottom:8px;" />` : ''}
      <div class="company-name">${lang === 'ar' ? settings.nameAr : settings.nameEn}</div>
      <div class="company-details">
        ${settings.taxNumber ? `${lang === 'ar' ? 'الرقم الضريبي' : 'Tax No'}: ${settings.taxNumber}` : ''}
        ${settings.address ? ` | ${settings.address}` : ''}
        ${settings.phone ? ` | ${settings.phone}` : ''}
        ${settings.email ? ` | ${settings.email}` : ''}
      </div>
    </div>
  </div>`
}

function generateFooter(settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  if (settings.footerImage) {
    return `<img src="${settings.footerImage}" alt="Footer" />`
  }
  return `<div style="text-align:center; font-size:9px; color:#999; border-top:1px solid #eee; padding-top:8px;">
    ${lang === 'ar' ? settings.nameAr : settings.nameEn} 
    ${settings.address ? `| ${settings.address}` : ''}
    ${settings.phone ? `| ${settings.phone}` : ''}
  </div>`
}

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
    default:
      return '<p>Unsupported document type</p>'
  }
}

function formatMoneyPrint(value: number): string {
  return formatAmount(value, 'official') // ZATCA: no thousand separators
}

function generateInvoiceBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  return `
    <div class="info-grid">
      <div>
        <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No'}</div>
        <div class="info-value">${data.invoiceNo || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'العميل' : 'Client'}</div>
        <div class="info-value">${data.clientName || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'رقم العقد' : 'Contract No'}</div>
        <div class="info-value">${data.contractNo || '-'}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'السعر' : 'Price'}</th>
          <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="totals-section">
      <div class="total-row">
        <span>${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.subtotal) || 0)}</span>
      </div>
      <div class="total-row">
        <span>${lang === 'ar' ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.vatAmount) || 0)}</span>
      </div>
      ${data.includeDelivery && Number(data.deliveryAmount) > 0 ? `
      <div class="total-row">
        <span>${lang === 'ar' ? 'رسوم النقل' : 'Delivery Fees'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.deliveryAmount) || 0)}</span>
      </div>
      ` : ''}
      <div class="total-row grand">
        <span>${lang === 'ar' ? 'الإجمالي' : 'Grand Total'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.totalAmount) || 0)}</span>
      </div>
    </div>
  `
}

function generateExtractBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  return `
    <div class="info-grid">
      <div>
        <div class="info-label">${lang === 'ar' ? 'رقم المستخلص' : 'Extract No'}</div>
        <div class="info-value">${data.claimNo || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'المشروع' : 'Project'}</div>
        <div class="info-value">${data.projectName || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'نسبة الإنجاز' : 'Completion %'}</div>
        <div class="info-value">${data.percentage || 0}%</div>
      </div>
    </div>
    <div class="totals-section">
      <div class="total-row">
        <span>${lang === 'ar' ? 'قيمة العقد' : 'Contract Value'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.contractValue) || 0)}</span>
      </div>
      <div class="total-row">
        <span>${lang === 'ar' ? 'قيمة المستخلص' : 'Extract Amount'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.amount) || 0)}</span>
      </div>
      <div class="total-row">
        <span>${lang === 'ar' ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.vatAmount) || 0)}</span>
      </div>
      <div class="total-row grand">
        <span>${lang === 'ar' ? 'الإجمالي' : 'Grand Total'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.totalAmount) || 0)}</span>
      </div>
    </div>
  `
}

function generateSupplierInvoiceBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  return `
    <div class="info-grid">
      <div>
        <div class="info-label">${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice No'}</div>
        <div class="info-value">${data.invoiceNo || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'المورد' : 'Supplier'}</div>
        <div class="info-value">${data.supplierName || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'السعر' : 'Price'}</th>
          <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="totals-section">
      <div class="total-row">
        <span>${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.subtotal) || 0)}</span>
      </div>
      <div class="total-row">
        <span>${lang === 'ar' ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.vatAmount) || 0)}</span>
      </div>
      <div class="total-row grand">
        <span>${lang === 'ar' ? 'الإجمالي' : 'Grand Total'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.totalAmount) || 0)}</span>
      </div>
    </div>
  `
}

function generatePurchaseOrderBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  return `
    <div class="info-grid">
      <div>
        <div class="info-label">${lang === 'ar' ? 'رقم أمر الشراء' : 'PO No'}</div>
        <div class="info-value">${data.orderNo || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'المورد' : 'Supplier'}</div>
        <div class="info-value">${data.supplierName || ''}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'السعر' : 'Price'}</th>
          <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${item.description || ''}</td>
            <td>${item.quantity || 0}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${formatMoneyPrint(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

function generateTaxDeclarationBody(data: Record<string, unknown>, settings: PrintOptions['settings'], lang: 'ar' | 'en'): string {
  return `
    <div class="info-grid">
      <div>
        <div class="info-label">${lang === 'ar' ? 'السنة' : 'Year'}</div>
        <div class="info-value">${data.year || ''}</div>
      </div>
      <div>
        <div class="info-label">${lang === 'ar' ? 'الربع' : 'Quarter'}</div>
        <div class="info-value">Q${data.quarter || ''}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>${lang === 'ar' ? 'البند' : 'Item'}</th>
          <th>${lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
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
      <div class="total-row grand">
        <span>${lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span>
        <span class="amount-cell">${formatMoneyPrint(Number(data.netVat) || 0)}</span>
      </div>
    </div>
  `
}

function getDocumentTitle(type: PrintDocumentType, lang: 'ar' | 'en'): string {
  const titles: Record<PrintDocumentType, { ar: string; en: string }> = {
    'service-invoice': { ar: 'فاتورة خدمات', en: 'Service Invoice' },
    'rental-invoice': { ar: 'فاتورة تأجير معدات', en: 'Equipment Rental Invoice' },
    'extract': { ar: 'مستخلص', en: 'Progress Claim' },
    'purchase-order': { ar: 'أمر شراء', en: 'Purchase Order' },
    'supplier-invoice': { ar: 'فاتورة مورد', en: 'Supplier Invoice' },
    'tax-declaration': { ar: 'إقرار ضريبي', en: 'Tax Declaration' },
  }
  return titles[type][lang]
}
