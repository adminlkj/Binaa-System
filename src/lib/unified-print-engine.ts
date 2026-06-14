// ============================================================================
// محرك الطباعة الموحد - Unified Print Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Single entry point for all document printing.
// Wraps the modular printing system and adds missing document types.
// All templates use centralized company settings and include ZATCA QR for invoices.
// ============================================================================

import {
  generatePrintHTML,
  getTemplate,
} from '@/printing'
import type { PrintDocumentType, PrintOptions, PrintSettings, DocumentTemplate } from '@/printing'
import { generateZatcaTLV } from './zatca-qr'

// ============ Extended Document Types ============
// These types extend the base PrintDocumentType with additional document types
// not yet in the modular printing system.

export type UnifiedDocumentType =
  | PrintDocumentType
  // Operational (mapped aliases)
  | 'sales-invoice'
  // Project
  | 'boq'
  | 'change-order'
  // HR
  | 'employee-contract'

// ============ Type Aliases ============
// Map alternate names to the canonical template names

const typeAliases: Record<string, PrintDocumentType> = {
  'sales-invoice': 'service-invoice',
  'extract': 'progress-claim',
  'timesheet-report': 'timesheet',
  'tax-declaration': 'vat-return',
}

// ============ Document Type Categories ============

export type DocumentCategory =
  | 'operational'   // فواتير وأوامر التشغيل
  | 'project'       // مستندات المشاريع
  | 'accounting'    // تقارير المحاسبة
  | 'hr'            // الموارد البشرية

/** Invoice types that require ZATCA QR code */
const INVOICE_TYPES_REQUIRING_QR: UnifiedDocumentType[] = [
  'sales-invoice',
  'service-invoice',
  'rental-invoice',
  'supplier-invoice',
]

/** Document category classification */
const documentCategories: Record<string, DocumentCategory> = {
  // Operational
  'sales-invoice': 'operational',
  'service-invoice': 'operational',
  'rental-invoice': 'operational',
  'supplier-invoice': 'operational',
  'purchase-order': 'operational',
  'delivery-order': 'operational',
  // Project
  'boq': 'project',
  'progress-claim': 'project',
  'change-order': 'project',
  // Accounting
  'trial-balance': 'accounting',
  'general-ledger': 'accounting',
  'income-statement': 'accounting',
  'balance-sheet': 'accounting',
  // HR
  'salary-slip': 'hr',
  'employee-contract': 'hr',
}

// ============ Template Functions for Missing Types ============

/**
 * Generate BOQ (Bill of Quantities) template body.
 * Shows a table of items with description, quantity, unit, unit price, and total.
 */
function generateBOQBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
  const items = (data.items as Array<Record<string, unknown>>) || []
  const currency = lang === 'ar'
    ? (settings.currencySymbolAr || settings.currencySymbol || 'ر.س')
    : (settings.currencySymbolEn || settings.currencySymbol || 'SAR')
  const totalAmount = Number(data.totalAmount) || 0
  const subtotal = Number(data.subtotal) || 0
  const vatAmount = Number(data.vatAmount) || 0
  const vatRate = settings.defaultVatRate ?? 0.15

  const lbl = lang === 'ar' ? {
    projectInfo: 'بيانات المشروع',
    projectName: 'اسم المشروع',
    boqNo: 'رقم كشف الكميات',
    date: 'التاريخ',
    contractNo: 'رقم العقد',
    items: 'بنود كشف الكميات',
    desc: 'الوصف',
    qty: 'الكمية',
    unit: 'الوحدة',
    unitPrice: 'سعر الوحدة',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    vat: `ضريبة القيمة المضافة ${vatRate * 100}%`,
    grandTotal: 'الإجمالي شامل الضريبة',
    notes: 'ملاحظات',
  } : {
    projectInfo: 'Project Information',
    projectName: 'Project Name',
    boqNo: 'BOQ No.',
    date: 'Date',
    contractNo: 'Contract No.',
    items: 'Bill of Quantities Items',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    total: 'Total',
    subtotal: 'Subtotal',
    vat: `VAT ${vatRate * 100}%`,
    grandTotal: 'Grand Total incl. VAT',
    notes: 'Notes',
  }

  const fmtMoney = (v: number) => `${v.toFixed(2)} ${currency}`

  return `
    <!-- Project Info -->
    <div class="section-title">${lbl.projectInfo}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.boqNo}</div>
        <div class="info-value">${data.boqNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.date}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.projectName}</div>
        <div class="info-value">${data.projectName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.contractNo}</div>
        <div class="info-value">${data.contractNo || '-'}</div>
      </div>
    </div>

    <!-- Items Table -->
    <div class="section-title">${lbl.items}</div>
    <table class="doc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>${lbl.desc}</th>
          <th>${lbl.qty}</th>
          <th>${lbl.unit}</th>
          <th class="amount-header">${lbl.unitPrice} (${currency})</th>
          <th class="amount-header">${lbl.total} (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, i) => `
          <tr>
            <td class="row-num">${i + 1}</td>
            <td>${item.description || ''}</td>
            <td style="text-align:center;">${item.quantity || 0}</td>
            <td style="text-align:center;">${(item.unit as string) || '-'}</td>
            <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0)}</td>
            <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lbl.subtotal}</span>
          <span class="value">${fmtMoney(subtotal)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lbl.vat}</span>
          <span class="value">${fmtMoney(vatAmount)}</span>
        </div>
        <div class="total-row grand">
          <span class="label">${lbl.grandTotal}</span>
          <span class="value">${fmtMoney(totalAmount)}</span>
        </div>
      </div>
    </div>

    ${data.notes ? `
      <div class="terms-section">
        <div class="terms-title">${lbl.notes}</div>
        ${data.notes}
      </div>
    ` : ''}

    <!-- Signatures -->
    <div class="signatures-section">
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المقاول' : 'Contractor Signature'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المالك' : 'Owner Signature'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع الاستشاري' : 'Consultant Signature'}</div>
      </div>
    </div>
  `
}

/**
 * Generate Change Order template body.
 * Shows details of contract modifications with before/after values.
 */
function generateChangeOrderBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
  const currency = lang === 'ar'
    ? (settings.currencySymbolAr || settings.currencySymbol || 'ر.س')
    : (settings.currencySymbolEn || settings.currencySymbol || 'SAR')
  const totalAmount = Number(data.totalAmount) || 0
  const vatAmount = Number(data.vatAmount) || 0
  const vatRate = settings.defaultVatRate ?? 0.15
  const items = (data.items as Array<Record<string, unknown>>) || []

  const lbl = lang === 'ar' ? {
    changeOrderInfo: 'بيانات أمر التغيير',
    changeOrderNo: 'رقم أمر التغيير',
    date: 'التاريخ',
    projectInfo: 'بيانات المشروع',
    projectName: 'اسم المشروع',
    contractNo: 'رقم العقد',
    originalContractValue: 'قيمة العقد الأصلية',
    changeDescription: 'وصف التغيير',
    reason: 'السبب',
    items: 'البنود المتغيرة',
    desc: 'الوصف',
    qty: 'الكمية',
    unitPrice: 'سعر الوحدة',
    total: 'الإجمالي',
    changeAmount: 'مبلغ التغيير',
    newContractValue: 'قيمة العقد الجديدة',
    subtotal: 'المجموع الفرعي',
    vat: `ضريبة القيمة المضافة ${vatRate * 100}%`,
    grandTotal: 'الإجمالي شامل الضريبة',
  } : {
    changeOrderInfo: 'Change Order Information',
    changeOrderNo: 'Change Order No.',
    date: 'Date',
    projectInfo: 'Project Information',
    projectName: 'Project Name',
    contractNo: 'Contract No.',
    originalContractValue: 'Original Contract Value',
    changeDescription: 'Change Description',
    reason: 'Reason',
    items: 'Changed Items',
    desc: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit Price',
    total: 'Total',
    changeAmount: 'Change Amount',
    newContractValue: 'New Contract Value',
    subtotal: 'Subtotal',
    vat: `VAT ${vatRate * 100}%`,
    grandTotal: 'Grand Total incl. VAT',
  }

  const fmtMoney = (v: number) => `${v.toFixed(2)} ${currency}`

  return `
    <!-- Change Order Info -->
    <div class="section-title">${lbl.changeOrderInfo}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.changeOrderNo}</div>
        <div class="info-value">${data.changeOrderNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.date}</div>
        <div class="info-value">${data.date ? new Date(data.date as string).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</div>
      </div>
    </div>

    <!-- Project Info -->
    <div class="section-title">${lbl.projectInfo}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.projectName}</div>
        <div class="info-value">${data.projectName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.contractNo}</div>
        <div class="info-value">${data.contractNo || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.originalContractValue}</div>
        <div class="info-value">${fmtMoney(Number(data.originalContractValue) || 0)}</div>
      </div>
    </div>

    <!-- Change Description -->
    ${data.description ? `
      <div class="section-title">${lbl.changeDescription}</div>
      <div style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;margin-bottom:12px;font-size:10.5px;">
        ${data.description}
      </div>
    ` : ''}

    ${data.reason ? `
      <div class="section-title">${lbl.reason}</div>
      <div style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;margin-bottom:12px;font-size:10.5px;">
        ${data.reason}
      </div>
    ` : ''}

    <!-- Changed Items Table -->
    ${items.length > 0 ? `
      <div class="section-title">${lbl.items}</div>
      <table class="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${lbl.desc}</th>
            <th>${lbl.qty}</th>
            <th class="amount-header">${lbl.unitPrice} (${currency})</th>
            <th class="amount-header">${lbl.total} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${item.description || ''}</td>
              <td style="text-align:center;">${item.quantity || 0}</td>
              <td class="amount-cell">${fmtMoney(Number(item.unitPrice) || 0)}</td>
              <td class="amount-cell">${fmtMoney(Number(item.totalPrice) || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="label">${lbl.changeAmount}</span>
          <span class="value">${fmtMoney(Number(data.changeAmount) || totalAmount)}</span>
        </div>
        <div class="total-row">
          <span class="label">${lbl.vat}</span>
          <span class="value">${fmtMoney(vatAmount)}</span>
        </div>
        <div class="total-row grand">
          <span class="label">${lbl.grandTotal}</span>
          <span class="value">${fmtMoney(totalAmount)}</span>
        </div>
        <div class="total-row" style="border-top:2px solid #047857;margin-top:6px;padding-top:6px;">
          <span class="label" style="font-weight:700;color:#047857;">${lbl.newContractValue}</span>
          <span class="value" style="font-weight:700;color:#047857;">${fmtMoney(Number(data.newContractValue) || 0)}</span>
        </div>
      </div>
    </div>

    <!-- Approvals -->
    <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد المقاول / Contractor' : 'Contractor Approval'}
        </div>
      </div>
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد المالك / Owner' : 'Owner Approval'}
        </div>
      </div>
      <div style="border:1px dashed #cbd5e1;border-radius:4px;padding:10px;text-align:center;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="border-top:1px solid #e2e8f0;margin-top:25px;padding-top:4px;font-size:7.5px;font-weight:600;color:#64748b;">
          ${lang === 'ar' ? 'اعتماد الاستشاري / Consultant' : 'Consultant Approval'}
        </div>
      </div>
    </div>
  `
}

/**
 * Generate Employee Contract template body.
 */
function generateEmployeeContractBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
  const currency = lang === 'ar'
    ? (settings.currencySymbolAr || settings.currencySymbol || 'ر.س')
    : (settings.currencySymbolEn || settings.currencySymbol || 'SAR')

  const lbl = lang === 'ar' ? {
    contractInfo: 'بيانات العقد',
    contractNo: 'رقم العقد',
    date: 'تاريخ العقد',
    employeeInfo: 'بيانات الموظف',
    employeeName: 'اسم الموظف',
    nationalId: 'رقم الهوية',
    position: 'المسمى الوظيفي',
    department: 'القسم',
    contractDetails: 'تفاصيل العقد',
    contractType: 'نوع العقد',
    startDate: 'تاريخ البدء',
    endDate: 'تاريخ الانتهاء',
    salary: 'الراتب الأساسي',
    allowances: 'البدلات',
    totalSalary: 'إجمالي الراتب',
    terms: 'الشروط والأحكام',
  } : {
    contractInfo: 'Contract Information',
    contractNo: 'Contract No.',
    date: 'Contract Date',
    employeeInfo: 'Employee Information',
    employeeName: 'Employee Name',
    nationalId: 'National ID',
    position: 'Position',
    department: 'Department',
    contractDetails: 'Contract Details',
    contractType: 'Contract Type',
    startDate: 'Start Date',
    endDate: 'End Date',
    salary: 'Basic Salary',
    allowances: 'Allowances',
    totalSalary: 'Total Salary',
    terms: 'Terms & Conditions',
  }

  const fmtDate = (d: unknown) => {
    if (!d) return ''
    try {
      return new Date(d as string).toLocaleDateString(
        lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' }
      )
    } catch { return String(d) }
  }

  const fmtMoney = (v: number) => `${v.toFixed(2)} ${currency}`

  return `
    <!-- Contract Info -->
    <div class="section-title">${lbl.contractInfo}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.contractNo}</div>
        <div class="info-value">${data.contractNo || data.id || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.date}</div>
        <div class="info-value">${fmtDate(data.date)}</div>
      </div>
    </div>

    <!-- Employee Info -->
    <div class="section-title">${lbl.employeeInfo}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.employeeName}</div>
        <div class="info-value">${data.employeeName || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.nationalId}</div>
        <div class="info-value">${data.nationalId || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.position}</div>
        <div class="info-value">${data.position || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.department}</div>
        <div class="info-value">${data.department || '-'}</div>
      </div>
    </div>

    <!-- Contract Details -->
    <div class="section-title">${lbl.contractDetails}</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${lbl.contractType}</div>
        <div class="info-value">${data.contractType || '-'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.startDate}</div>
        <div class="info-value">${fmtDate(data.startDate)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">${lbl.endDate}</div>
        <div class="info-value">${fmtDate(data.endDate)}</div>
      </div>
    </div>

    <!-- Salary Breakdown -->
    <table class="doc-table" style="margin-top:12px;">
      <thead>
        <tr>
          <th>#</th>
          <th>${lang === 'ar' ? 'البيان / Description' : 'Description'}</th>
          <th class="amount-header">${lang === 'ar' ? `المبلغ / Amount (${currency})` : `Amount (${currency})`}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-num">1</td>
          <td>${lbl.salary}</td>
          <td class="amount-cell">${fmtMoney(Number(data.basicSalary || data.salary) || 0)}</td>
        </tr>
        <tr>
          <td class="row-num">2</td>
          <td>${lbl.allowances}</td>
          <td class="amount-cell">${fmtMoney(Number(data.allowances) || 0)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td></td>
          <td><strong>${lbl.totalSalary}</strong></td>
          <td class="amount-cell"><strong>${fmtMoney(Number(data.totalSalary) || 0)}</strong></td>
        </tr>
      </tfoot>
    </table>

    ${data.terms ? `
      <div class="terms-section">
        <div class="terms-title">${lbl.terms}</div>
        ${data.terms}
      </div>
    ` : ''}

    <!-- Signatures -->
    <div class="signatures-section">
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع الموظف' : 'Employee Signature'}</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">${lang === 'ar' ? 'توقيع المدير' : 'Manager Signature'}</div>
      </div>
      ${settings.stamp ? `
        <div class="stamp-area">
          <img src="${settings.stamp}" alt="${lang === 'ar' ? 'ختم' : 'Stamp'}" />
        </div>
      ` : ''}
    </div>
  `
}

// ============ Custom Template Registry ============
// Templates for document types not in the modular printing system

interface CustomTemplate {
  category: DocumentCategory
  getBody: (data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en') => string
  requiresQR: boolean
  requiresSignature: boolean
  titleAr: string
  titleEn: string
}

const customTemplates: Record<string, CustomTemplate> = {
  'boq': {
    category: 'project',
    getBody: generateBOQBody,
    requiresQR: false,
    requiresSignature: true,
    titleAr: 'كشف كميات',
    titleEn: 'Bill of Quantities',
  },
  'change-order': {
    category: 'project',
    getBody: generateChangeOrderBody,
    requiresQR: false,
    requiresSignature: true,
    titleAr: 'أمر تغيير',
    titleEn: 'Change Order',
  },
  'employee-contract': {
    category: 'hr',
    getBody: generateEmployeeContractBody,
    requiresQR: false,
    requiresSignature: true,
    titleAr: 'عقد عمل',
    titleEn: 'Employment Contract',
  },
}

// ============ Main Function: generateDocument ============

/**
 * Generate a complete print-ready HTML document.
 *
 * This is the single entry point for all document printing in the system.
 * It routes to the appropriate template based on document type, applies
 * company settings, and includes ZATCA QR codes for invoices.
 *
 * @param documentType - The type of document to generate
 * @param data - The document data (from API/database)
 * @param companySettings - Company settings from CompanySetting model
 * @param lang - Language for the document ('ar' or 'en')
 * @returns Complete HTML document string ready for printing
 */
export function generateDocument(
  documentType: UnifiedDocumentType,
  data: Record<string, unknown>,
  companySettings: PrintSettings,
  lang: 'ar' | 'en' = 'ar',
): string {
  // Resolve type aliases
  const resolvedType = (typeAliases[documentType] || documentType) as PrintDocumentType

  // Check if this is a custom template (not in modular system)
  const customTemplate = customTemplates[documentType]

  if (customTemplate) {
    // Generate using custom template
    return generateCustomDocument(documentType, customTemplate, data, companySettings, lang)
  }

  // For invoice types, automatically add ZATCA QR data if not already present
  if (INVOICE_TYPES_REQUIRING_QR.includes(documentType) && companySettings.taxNumber && !data.qrDataUrl) {
    const sellerName = lang === 'ar' ? companySettings.nameAr : companySettings.nameEn
    const vatNumber = companySettings.taxNumber
    const invoiceDate = data.date
      ? new Date(data.date as string).toISOString().split('T')[0]
      : ''
    const totalAmount = Number(data.totalAmount) || 0
    const vatAmount = Number(data.vatAmount) || 0

    try {
      const tlvBase64 = generateZatcaTLV({
        sellerName,
        vatNumber,
        invoiceDate,
        totalAmount: totalAmount.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
      })
      // Store the TLV base64 so the template can generate QR from it
      data._zatcaTlvBase64 = tlvBase64
    } catch {
      // ZATCA QR generation failed, continue without it
    }
  }

  // Use the modular printing system
  return generatePrintHTML({
    type: resolvedType,
    data,
    settings: companySettings,
    lang,
  })
}

/**
 * Generate a document using a custom template (for types not in the modular system).
 */
function generateCustomDocument(
  documentType: string,
  customTemplate: CustomTemplate,
  data: Record<string, unknown>,
  settings: PrintSettings,
  lang: 'ar' | 'en',
): string {
  const fontFamily = "'Cairo', 'Noto Sans Arabic', 'Inter', sans-serif"
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const textAlign = lang === 'ar' ? 'right' : 'left'
  const amountAlign = lang === 'ar' ? 'left' : 'right'
  const title = lang === 'ar' ? customTemplate.titleAr : customTemplate.titleEn
  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn

  const css = `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontFamily};
      font-size: 10.5px;
      color: #1e293b;
      direction: ${dir};
      background: #e2e8f0;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4 portrait; margin: 12mm 10mm; }
    @media print {
      body { background: white; }
      .page { margin: 0; box-shadow: none; width: 100%; min-height: auto; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm; min-height: 297mm;
      margin: 0 auto; background: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
      padding: 14mm 12mm; position: relative;
    }
    .doc-header {
      display: flex; align-items: center; gap: 10px;
      border-bottom: 2px solid #047857; padding-bottom: 8px; margin-bottom: 14px;
    }
    .header-logo {
      width: 48px; height: 48px; object-fit: contain; border-radius: 4px;
    }
    .header-company { flex: 1; }
    .header-company-name { font-size: 14px; font-weight: 700; color: #047857; }
    .header-company-details {
      font-size: 7.5px; color: #64748b;
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px;
    }
    .header-doc-title-section { text-align: ${textAlign}; }
    .header-doc-title {
      font-size: 13px; font-weight: 700; color: #047857;
      background: #ecfdf5; padding: 4px 12px; border-radius: 4px;
    }
    .section-title {
      font-size: 9.5px; font-weight: 700; color: #047857;
      border-bottom: 1px solid #a7f3d0; padding-bottom: 3px; margin: 10px 0 6px;
    }
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 8px;
    }
    .info-item {}
    .info-label { font-size: 7.5px; color: #6b7280; font-weight: 600; }
    .info-value { font-size: 10px; font-weight: 600; color: #1e293b; }
    .doc-table {
      width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9.5px;
    }
    .doc-table th {
      background: #f0fdf4; color: #047857; font-weight: 600;
      padding: 5px 6px; text-align: ${textAlign};
      border: 1px solid #a7f3d0; font-size: 8px;
    }
    .doc-table td {
      padding: 4px 6px; border: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .doc-table tfoot td {
      background: #f0fdf4; font-weight: 700;
      border-top: 2px solid #047857;
    }
    .row-num { text-align: center; font-size: 8px; color: #9ca3af; width: 24px; }
    .amount-cell { text-align: ${amountAlign}; font-variant-numeric: tabular-nums; }
    .amount-header { text-align: ${amountAlign}; }
    .totals-section { margin-top: 10px; display: flex; justify-content: flex-end; }
    .totals-box {
      width: 260px; border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden;
    }
    .total-row {
      display: flex; justify-content: space-between;
      padding: 4px 10px; font-size: 9.5px;
      border-bottom: 1px solid #e5e7eb;
    }
    .total-row.grand {
      background: #f0fdf4; font-weight: 700; color: #047857;
      border-bottom: none; font-size: 10.5px;
    }
    .total-row .label { color: #374151; }
    .total-row .value { font-variant-numeric: tabular-nums; }
    .signatures-section {
      display: flex; justify-content: space-between; margin-top: 24px; gap: 16px;
    }
    .signature-box {
      flex: 1; text-align: center; padding-top: 40px;
      border-top: 1px solid #cbd5e1;
    }
    .signature-line { font-size: 8px; color: #64748b; font-weight: 600; }
    .stamp-area { width: 80px; }
    .stamp-area img { width: 100%; opacity: 0.7; }
    .terms-section {
      margin-top: 12px; padding: 8px 10px;
      border: 1px solid #e5e7eb; border-radius: 4px;
      font-size: 9px; color: #374151;
    }
    .terms-title {
      font-size: 9.5px; font-weight: 700; color: #047857;
      margin-bottom: 4px;
    }
    .doc-footer {
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 6px 12mm; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between;
      font-size: 7px; color: #94a3b8;
    }
    .print-actions {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px; z-index: 9999;
    }
    .print-actions button {
      padding: 6px 16px; border-radius: 6px; border: none;
      font-size: 12px; cursor: pointer; font-family: ${fontFamily};
    }
    .print-actions button:first-child { background: #047857; color: white; }
    .print-actions .close-btn { background: #f1f5f9; color: #374151; }
  `

  const body = customTemplate.getBody(data, settings, lang)

  // Build header
  const header = `
    <div class="doc-header">
      ${settings.logoUrl
        ? `<img class="header-logo" src="${settings.logoUrl}" alt="Logo" />`
        : '<div class="header-logo" style="display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#047857;background:#f0fdf4;">ب</div>'
      }
      <div class="header-company">
        <div class="header-company-name">${companyName}</div>
        <div class="header-company-details">
          ${settings.taxNumber ? `<span>${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
          ${settings.commercialReg ? `<span>${lang === 'ar' ? 'س.ت' : 'CR'}: ${settings.commercialReg}</span>` : ''}
          ${settings.address ? `<span>${settings.address}</span>` : ''}
          ${settings.phone ? `<span>${settings.phone}</span>` : ''}
        </div>
      </div>
      <div class="header-doc-title-section">
        <div class="header-doc-title">${title}</div>
      </div>
    </div>
  `

  const footer = `
    <div class="doc-footer">
      <div>
        ${companyName}
        ${settings.address ? ` | ${settings.address}` : ''}
        ${settings.phone ? ` | ${settings.phone}` : ''}
      </div>
      <span>${lang === 'ar' ? 'بِنَاء ERP' : 'Binaa ERP'}</span>
    </div>
  `

  return `<!DOCTYPE html>
<html lang="${lang === 'ar' ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${companyName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="print-actions no-print">
    <button onclick="window.print()">${lang === 'ar' ? 'طباعة' : 'Print'}</button>
    <button class="close-btn" onclick="window.close()">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
  </div>
  <div class="page">
    ${header}
    <div class="doc-body">
      ${body}
    </div>
    ${footer}
  </div>
</body>
</html>`
}

// ============ Utility Functions ============

/**
 * Get the category of a document type.
 */
export function getDocumentCategory(type: UnifiedDocumentType): DocumentCategory {
  return documentCategories[type] || 'operational'
}

/**
 * Check if a document type requires ZATCA QR code.
 */
export function requiresZatcaQR(type: UnifiedDocumentType): boolean {
  return INVOICE_TYPES_REQUIRING_QR.includes(type)
}

/**
 * Get all supported document types.
 */
export function getSupportedDocumentTypes(): UnifiedDocumentType[] {
  const baseTypes: PrintDocumentType[] = [
    'service-invoice', 'rental-invoice', 'supplier-invoice',
    'progress-claim', 'purchase-order', 'delivery-order',
    'timesheet', 'trial-balance', 'general-ledger',
    'income-statement', 'balance-sheet', 'vat-return',
    'client-payment', 'supplier-payment', 'rental-payment',
    'expense-report', 'advance-voucher', 'petty-cash-voucher',
    'salary-slip', 'rental-contract',
    'equipment-report', 'fuel-report', 'maintenance-report',
    'work-team-report', 'resource-distribution', 'attendance-report',
    'purchase-request', 'goods-receipt', 'journal-entry',
    'account-statement', 'generic-table',
  ]
  const additionalTypes: UnifiedDocumentType[] = [
    'sales-invoice', 'boq', 'change-order', 'employee-contract',
  ]
  return [...baseTypes, ...additionalTypes] as UnifiedDocumentType[]
}

// Re-export types for convenience
export type { PrintSettings, PrintOptions, DocumentTemplate }
export { generatePrintHTML, getTemplate }
