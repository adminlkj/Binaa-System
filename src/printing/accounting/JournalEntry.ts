// ============================================================================
// قالب قيد يومية - Journal Entry Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'
import { signaturesSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'accounting',

  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: true,
  hasCustomFooter: true,

  getCSS(lang: 'ar' | 'en'): string {
    return getAccountingCSS(lang) + `
      .je-description-box {
        padding: 8px 12px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        margin-bottom: 10px;
        font-size: 10px;
        line-height: 1.6;
      }
      .je-description-label {
        font-weight: 700;
        color: #374151;
        margin-bottom: 4px;
      }
      .je-source {
        font-size: 9px;
        color: #6b7280;
        margin-top: 4px;
      }
      .je-balance-check {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        margin-top: 8px;
        border-radius: 3px;
        font-size: 8px;
        font-weight: 700;
      }
      .je-balance-check.balanced {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
      }
      .je-balance-check.not-balanced {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
      .code-cell {
        font-family: 'Inter', 'Cairo', sans-serif;
        font-size: 8px;
        font-weight: 600;
        color: #64748b;
        direction: ltr;
        text-align: center;
      }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'قيد يومية / Journal Entry' : 'Journal Entry'
    const subtitle = lang === 'ar' ? 'Journal Entry' : 'قيد يومية'
    return generateAccountingHeader(settings, lang, title, subtitle)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const entryNo = (data.entryNo as string) || ''
    const date = data.date as string | undefined
    const description = (data.description as string) || ''
    const source = (data.source as string) || ''
    const lines = (data.lines as Array<{ accountCode: string; accountName: string; accountNameEn?: string; debit: number; credit: number }>) || []
    const totalDebit = (data.totalDebit as number) || 0
    const totalCredit = (data.totalCredit as number) || 0
    const currency = getCurrencySymbol(settings, lang)

    // Labels
    const lbl = lang === 'ar' ? {
      entryNo: 'رقم القيد',
      date: 'التاريخ',
      description: 'البيان',
      source: 'المصدر',
      linesTable: 'تفصيل القيد / Entry Lines',
      accountCode: 'رمز الحساب',
      accountName: 'اسم الحساب',
      debit: 'مدين',
      credit: 'دائن',
      total: 'الإجمالي',
      balanceCheck: 'التحقق من التوازن / Balance Check',
      balanced: 'متوازن ✓',
      notBalanced: 'غير متوازن ✗',
      noDescription: 'لا يوجد بيان',
    } : {
      entryNo: 'Entry No.',
      date: 'Date',
      description: 'Description',
      source: 'Source',
      linesTable: 'Entry Lines',
      accountCode: 'Account Code',
      accountName: 'Account Name',
      debit: 'Debit',
      credit: 'Credit',
      total: 'Total',
      balanceCheck: 'Balance Check',
      balanced: 'Balanced ✓',
      notBalanced: 'Not Balanced ✗',
      noDescription: 'No description',
    }

    // Entry info section
    const entryInfoHtml = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.entryNo}</div>
          <div class="info-value">${entryNo}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.date}</div>
          <div class="info-value">${date ? formatDate(date, lang) : '-'}</div>
        </div>
      </div>
    `

    // Description box
    const descriptionHtml = description ? `
      <div class="je-description-box">
        <div class="je-description-label">${lbl.description}</div>
        <div>${description}</div>
        ${source ? `<div class="je-source">${lbl.source}: ${source}</div>` : ''}
      </div>
    ` : ''

    // Lines table
    const hasCodes = lines.some(l => l.accountCode)
    const rows = lines.map((line, i) => {
      const displayName = lang === 'ar' ? line.accountName : (line.accountNameEn || line.accountName)
      return `
        <tr>
          <td class="row-num">${i + 1}</td>
          ${hasCodes ? `<td class="code-cell">${line.accountCode || ''}</td>` : ''}
          <td>${displayName}</td>
          <td class="amount-cell">${line.debit ? fmtMoney(line.debit, settings, lang) : '-'}</td>
          <td class="amount-cell">${line.credit ? fmtMoney(line.credit, settings, lang) : '-'}</td>
        </tr>
      `
    }).join('')

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    return `
      ${entryInfoHtml}
      ${descriptionHtml}

      <div class="section-title">${lbl.linesTable}</div>
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            ${hasCodes ? `<th style="width:70px;">${lbl.accountCode}</th>` : ''}
            <th>${lbl.accountName}</th>
            <th class="amount-header">${lbl.debit} (${currency})</th>
            <th class="amount-header">${lbl.credit} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${hasCodes ? 3 : 2}"><strong>${lbl.total}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalDebit, settings, lang)}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalCredit, settings, lang)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="je-balance-check ${isBalanced ? 'balanced' : 'not-balanced'}">
        <span>${lbl.balanceCheck}</span>
        <span>${isBalanced ? lbl.balanced : lbl.notBalanced}</span>
      </div>

      ${signaturesSection(settings, lang)}
    `
  },
}
