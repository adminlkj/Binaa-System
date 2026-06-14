// ============================================================================
// قالب مسير الراتب - Salary Slip Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, getCurrencySymbol } from '../shared/utils'
import { signaturesSection, amountInWordsSection, totalsSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'financial',
  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang) {
    return getDefaultCSS(lang)
  },

  getBody(data, settings, lang) {
    const currency = getCurrencySymbol(settings, lang)

    const fmtFn = (v: number) => fmtMoney(v, settings, lang)

    return `
      <div class="info-grid-3">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الموظف / Employee' : 'Employee'}</div>
          <div class="info-value">${data.employeeName || ''}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الشهر / Month' : 'Month'}</div>
          <div class="info-value">${data.month || ''}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'السنة / Year' : 'Year'}</div>
          <div class="info-value">${data.year || ''}</div>
        </div>
      </div>

      <table class="doc-table">
        <thead>
          <tr>
            <th>${lang === 'ar' ? 'البند / Item' : 'Item'}</th>
            <th class="amount-header">${lang === 'ar' ? `المبلغ / Amount (${currency})` : `Amount (${currency})`}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>${lang === 'ar' ? 'الراتب الأساسي / Basic Salary' : 'Basic Salary'}</td><td class="amount-cell">${fmtMoney(Number(data.basicSalary) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'بدل سكن / Housing Allowance' : 'Housing Allowance'}</td><td class="amount-cell">${fmtMoney(Number(data.housingAllowance) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'بدل نقل / Transport Allowance' : 'Transport Allowance'}</td><td class="amount-cell">${fmtMoney(Number(data.transportAllowance) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'الإجمالي قبل الخصومات / Gross Salary' : 'Gross Salary'}</td><td class="amount-cell">${fmtMoney(Number(data.grossSalary) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'خصم تأمينات / GOSI Deduction' : 'GOSI Deduction'}</td><td class="amount-cell">${fmtMoney(Number(data.gosiDeduction) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'سلف / Advance' : 'Advance'}</td><td class="amount-cell">${fmtMoney(Number(data.advance) || 0, settings, lang)}</td></tr>
          <tr><td>${lang === 'ar' ? 'خصومات أخرى / Other Deductions' : 'Other Deductions'}</td><td class="amount-cell">${fmtMoney(Number(data.otherDeductions) || 0, settings, lang)}</td></tr>
        </tbody>
      </table>

      ${totalsSection(
        [
          { label: lang === 'ar' ? `صافي الراتب / Net Salary (${currency})` : `Net Salary (${currency})`, value: Number(data.netSalary) || 0, isGrand: true },
        ],
        settings,
        lang,
        fmtFn
      )}

      ${amountInWordsSection(Number(data.netSalary) || 0, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
