// ============================================================================
// محرك الطباعة المركزي - Central Print Service
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Each document type is routed to its own independent template.
// No more shared template that tries to be everything.
// ============================================================================

import type { PrintDocumentType, PrintOptions, DocumentTemplate, PrintSettings } from './shared/types'
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
  'journal-entry': GenericTableTemplate,
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
  const { title, subtitle } = getDocumentTitle(type, lang)
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"

  // Get the appropriate template
  const template = getTemplate(type)

  // Generate CSS from the template
  const css = template.getCSS(lang)

  // Generate body from the template
  const body = template.getBody(data, settings, lang)

  // Generate header
  const header = template.hasCustomHeader && template.getCustomHeader
    ? template.getCustomHeader(settings, lang)
    : generateDefaultHeader(settings, lang, title, subtitle)

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

  return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${lang === 'ar' ? settings.nameAr : settings.nameEn}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  ${extraHeadLinks}
  <style>${css}</style>
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
export type { PrintDocumentType, PrintOptions, PrintSettings } from './shared/types'
