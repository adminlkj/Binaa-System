// ============================================================================
// محرك الطباعة المركزي - Central Print Service
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Each document type is routed to its own independent template.
// No more shared template that tries to be everything.
// ============================================================================

import type { PrintDocumentType, PrintOptions, DocumentTemplate } from './shared/types'
import { getDocumentTitle } from './shared/utils'
import { printActionsBar } from './shared/sections'
import { generateDefaultHeader, generateDefaultFooter } from './shared/headers-footers'

// ============ Template Registry ============
// Each document type maps to exactly ONE template

import { ServiceInvoiceTemplate } from './invoices/ServiceInvoice'
import { RentalInvoiceTemplate } from './invoices/RentalInvoice'
import { SupplierInvoiceTemplate } from './invoices/SupplierInvoice'
import { template as ProgressClaimTemplate } from './projects/ProgressClaim'
import { template as PurchaseOrderTemplate } from './procurement/PurchaseOrder'
import { template as DeliveryOrderTemplate } from './procurement/DeliveryOrder'
import { template as TimesheetTemplate } from './operations/Timesheet'
import { template as TrialBalanceTemplate } from './accounting/TrialBalance'
import { template as GeneralLedgerTemplate } from './accounting/GeneralLedger'
import { template as IncomeStatementTemplate } from './accounting/IncomeStatement'
import { template as BalanceSheetTemplate } from './accounting/BalanceSheet'
import { template as JournalEntryTemplate } from './accounting/JournalEntry'
import { template as VatReturnTemplate } from './tax/VatReturn'
import { template as PaymentVoucherTemplate } from './financial/PaymentVoucher'
import { template as SalarySlipTemplate } from './financial/SalarySlip'
import { template as RentalContractTemplate } from './financial/RentalContract'
import { template as GenericTableTemplate } from './reports/GenericTable'

const templateRegistry: Record<string, DocumentTemplate> = {
  // فواتير
  'service-invoice': ServiceInvoiceTemplate,
  'rental-invoice': RentalInvoiceTemplate,
  'supplier-invoice': SupplierInvoiceTemplate,
  // مشاريع
  'progress-claim': ProgressClaimTemplate,
  'extract': ProgressClaimTemplate, // backward compatibility
  // مشتريات
  'purchase-order': PurchaseOrderTemplate,
  'delivery-order': DeliveryOrderTemplate,
  // عمليات
  'timesheet': TimesheetTemplate,
  'timesheet-report': TimesheetTemplate, // backward compatibility
  // محاسبة
  'trial-balance': TrialBalanceTemplate,
  'general-ledger': GeneralLedgerTemplate,
  'income-statement': IncomeStatementTemplate,
  'balance-sheet': BalanceSheetTemplate,
  'journal-entry': JournalEntryTemplate,
  // ضريبي
  'vat-return': VatReturnTemplate,
  'tax-declaration': VatReturnTemplate, // backward compatibility
  // مالي
  'client-payment': PaymentVoucherTemplate,
  'supplier-payment': PaymentVoucherTemplate,
  'rental-payment': PaymentVoucherTemplate,
  'expense-report': PaymentVoucherTemplate,
  'advance-voucher': PaymentVoucherTemplate,
  'petty-cash-voucher': PaymentVoucherTemplate,
  'salary-slip': SalarySlipTemplate,
  'rental-contract': RentalContractTemplate,
  // تقارير
  'equipment-report': GenericTableTemplate,
  'fuel-report': GenericTableTemplate,
  'maintenance-report': GenericTableTemplate,
  'work-team-report': GenericTableTemplate,
  'resource-distribution': GenericTableTemplate,
  'attendance-report': GenericTableTemplate,
  'purchase-request': GenericTableTemplate,
  'goods-receipt': GenericTableTemplate,
  'account-statement': GenericTableTemplate,
  'generic-table': GenericTableTemplate,
}

// ============ Get Template ============

export function getTemplate(type: PrintDocumentType): DocumentTemplate {
  const template = templateRegistry[type]
  if (!template) {
    console.warn(`No template found for type "${type}", falling back to GenericTable`)
    return GenericTableTemplate
  }
  return template
}

// ============ Main HTML Generator ============

/**
 * Generate a print-ready HTML document using the appropriate template.
 * Each document type gets its own template with proper formatting.
 */
export function generatePrintHTML(options: PrintOptions): string {
  const { type, data, settings, lang = 'ar' } = options
  const { title } = getDocumentTitle(type, lang)

  // Get the appropriate template
  const template = getTemplate(type)

  // Generate CSS from the template
  const css = template.getCSS(lang)

  // Generate body from the template
  const body = template.getBody(data, settings, lang)

  // Generate header
  const header = template.hasCustomHeader && template.getCustomHeader
    ? template.getCustomHeader(settings, lang)
    : generateDefaultHeader(settings, lang, title, getDocumentTitle(type, lang).subtitle)

  // Generate footer
  const footer = template.hasCustomFooter && template.getCustomFooter
    ? template.getCustomFooter(settings, lang)
    : generateDefaultFooter(settings, lang)

  // Determine body wrapper class based on template type
  const isRentalInvoice = type === 'rental-invoice'
  const bodyWrapperClass = isRentalInvoice ? 'ri-body' : 'doc-body'

  // Print actions bar
  const actionsBar = printActionsBar(lang, isRentalInvoice ? 'ri' : 'doc')

  // Extra scripts
  const extraScripts = template.getExtraScripts ? template.getExtraScripts(data, settings, lang) : ''

  // Extra head links: QR library for templates that require QR, html2canvas for rental invoice
  const needsQR = template.requiresQR && settings.taxNumber
  const extraHeadLinks = isRentalInvoice
    ? `
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>`
    : needsQR
      ? `
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>`
      : ''

  // === Template color override ===
  // The user picks a primary + accent color in Settings → Invoice Templates.
  // The print CSS uses hardcoded emerald shades by default; we override those
  // shades here so the printed invoice reflects the user's color choice.
  // We compute darker shades by darkening the primary color.
  const primaryColor = settings.invoicePrimaryColor || '#0f766e'
  const accentColor = settings.invoiceAccentColor || '#34d399'
  // Lighten/darken helpers (hex → hex)
  const lighten = (hex: string, amt: number) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, ((n >> 16) & 0xff) + amt)
    const g = Math.min(255, ((n >> 8) & 0xff) + amt)
    const b = Math.min(255, (n & 0xff) + amt)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }
  const darken = (hex: string, amt: number) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, ((n >> 16) & 0xff) - amt)
    const g = Math.max(0, ((n >> 8) & 0xff) - amt)
    const b = Math.max(0, (n & 0xff) - amt)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }
  const hexToRgba = (hex: string, alpha: number) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = (n >> 16) & 0xff
    const g = (n >> 8) & 0xff
    const b = n & 0xff
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  void accentColor // reserved for future per-element accent styling
  const primaryDark = darken(primaryColor, 30)
  const primaryDarker = darken(primaryColor, 50)
  const primaryLight = lighten(primaryColor, 30)
  const primaryLighterRgba = hexToRgba(primaryColor, 0.08)
  // Override CSS using !important — replace every emerald shade used by the
  // print templates with the user's chosen primary color (and its shades).
  const colorOverrideCSS = `
    /* === User-selected template colors (from Settings → Invoice Templates) === */
    .ri-header, .ri-footer { background: linear-gradient(135deg, ${primaryDarker} 0%, ${primaryDark} 40%, ${primaryColor} 100%) !important; }
    .ri-header-title-box { background: ${primaryDark} !important; }
    .ri-total-row.grand, .ri-table thead tr { background: ${primaryColor} !important; }
    .ri-rental-data-title, .ri-section-title, .ri-totals-box-title { color: ${primaryColor} !important; }
    .ri-info-section { border-top: 3px solid ${primaryColor} !important; }
    .ri-totals-box { border-color: ${primaryColor} !important; }
    .ri-total-row.grand { background: ${primaryColor} !important; color: white !important; }
    .ri-table thead tr th { background: ${primaryColor} !important; border-color: ${primaryDark} !important; }
    .ri-amount-words { background: ${primaryLighterRgba} !important; border-color: ${primaryColor} !important; }
    .ri-amount-words-label { color: ${primaryColor} !important; }
    .ri-btn-print { background: ${primaryColor} !important; }
    .ri-btn-print:hover { background: ${primaryDark} !important; }
    .ri-rental-data { border-color: ${primaryLight} !important; }
    .ri-rental-data-title { background: ${primaryLighterRgba} !important; }
    .ri-party-card { border-color: ${primaryLight} !important; }
    .ri-party-title { background: ${primaryColor} !important; color: white !important; }
    .doc-header { background: ${primaryLighterRgba} !important; border-bottom: 3px solid ${primaryColor} !important; }
    .doc-footer { background: ${primaryColor} !important; color: white !important; }
    .doc-footer .company-info { color: white !important; }
    .header-doc-title-section { background: ${primaryColor} !important; }
    .header-doc-title { color: white !important; }
    .stamp-img { max-width: ${settings.stampWidth ?? 140}px !important; max-height: ${settings.stampHeight ?? 140}px !important; opacity: ${Number(settings.stampOpacity ?? 0.9)} !important; transform: rotate(${settings.stampRotation ?? 0}deg) translate(${settings.stampOffsetX ?? 0}px, ${settings.stampOffsetY ?? 0}px) !important; }
  `

  // Font family override
  const fontOverrideCSS = settings.invoiceFontFamily && settings.invoiceFontFamily !== 'default'
    ? `* { font-family: '${settings.invoiceFontFamily}', 'Cairo', 'Noto Sans Arabic', sans-serif !important; }`
    : ''

  return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${lang === 'ar' ? settings.nameAr : settings.nameEn}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  ${settings.invoiceFontFamily && settings.invoiceFontFamily !== 'default' ? `<link href="https://fonts.googleapis.com/css2?family=${settings.invoiceFontFamily}:wght@400;500;600;700;800&display=swap" rel="stylesheet" />` : ''}
  ${extraHeadLinks}
  <style>${css}
  ${colorOverrideCSS}
  ${fontOverrideCSS}</style>
</head>
<body>
  ${actionsBar}
  <div class="page" ${isRentalInvoice ? 'id="invoice-page"' : ''}>
    ${header}
    <div class="${bodyWrapperClass}">
      ${body}
    </div>
    <div style="height:${isRentalInvoice ? '40' : '50'}px;"></div>
    ${footer}
  </div>
  ${extraScripts}
</body>
</html>`
}

// Re-export types for backward compatibility
export type { PrintDocumentType, PrintOptions } from './shared/types'
