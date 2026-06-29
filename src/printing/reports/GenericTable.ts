// ============================================================================
// قالب الجدول العام - Generic Table Report Template
// نظام بِنَاء ERP - Binaa Construction ERP
// Handles: generic-table, purchase-request, goods-receipt,
//          attendance-report, equipment-report, fuel-report,
//          maintenance-report, work-team-report, resource-distribution,
//          journal-entry, trial-balance (fallback), account-statement
// ============================================================================

import type { DocumentTemplate } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { fmtMoney, getCurrencySymbol } from '../shared/utils'
import { signaturesSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'report',
  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang) {
    // Check if the report should use accounting CSS (for financial reports)
    // This is determined at render time via data.useAccountingCSS
    return getDefaultCSS(lang) + `
      .gt-currency-badge {
        display: inline-block;
        padding: 2px 8px;
        background: #f0fdf4;
        border: 1px solid #a7f3d0;
        border-radius: 10px;
        font-size: 8px;
        font-weight: 700;
        color: #065f46;
        margin-bottom: 6px;
      }
      .gt-section-title {
        font-size: 9px; font-weight: 700; color: #047857;
        text-transform: uppercase; letter-spacing: 0.4px;
        margin: 10px 0 4px;
        padding-bottom: 3px;
        border-bottom: 1px solid #d1fae5;
      }
      .gt-empty {
        text-align: center;
        color: #9ca3af;
        padding: 30px;
        font-size: 10px;
      }
    `
  },

  getBody(data, settings, lang) {
    const columns = (data.columns as Array<{ key: string; label: string; align?: string; type?: string }>) || []
    const rows = (data.rows as Array<Record<string, unknown>>) || []
    const showCurrency = (data.showCurrency as boolean) || false
    const currency = getCurrencySymbol(settings, lang)
    const sectionTitle = data.sectionTitle as string | undefined

    // Currency badge display
    const currencyBadge = showCurrency
      ? `<div class="gt-currency-badge">${lang === 'ar' ? 'العملة / Currency' : 'Currency'}: ${currency}</div>`
      : ''

    // Section title if provided
    const sectionTitleHtml = sectionTitle
      ? `<div class="gt-section-title">${sectionTitle}</div>`
      : ''

    // Determine if a column is an amount column
    const isAmountCol = (col: { align?: string; type?: string }): boolean => {
      return col.align === 'amount' || col.type === 'amount' || col.type === 'money'
    }

    return `
      ${sectionTitleHtml}
      ${currencyBadge}

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
            ${columns.map(col => `<th class="${isAmountCol(col) ? 'amount-header' : ''}">${col.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              ${columns.map(col => {
                const val = row[col.key]
                const isAmt = isAmountCol(col)
                const numVal = Number(val)
                const isEmpty = val === null || val === undefined || val === ''
                if (isAmt) {
                  return `<td class="amount-cell">${isEmpty ? '-' : fmtMoney(isNaN(numVal) ? 0 : numVal, settings, lang)}</td>`
                }
                return `<td>${isEmpty ? '' : val}</td>`
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<div class="gt-empty">' + (lang === 'ar' ? 'لا توجد بيانات للعرض / No data to display' : 'No data to display') + '</div>'}

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
  },
}
