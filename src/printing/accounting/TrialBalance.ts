// ============================================================================
// قالب ميزان المراجعة - Trial Balance Template
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { signaturesSection } from '../shared/sections'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'

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
      .code-cell {
        font-family: 'Inter', 'Cairo', sans-serif;
        font-size: 8px;
        font-weight: 600;
        color: #64748b;
        direction: ltr;
        text-align: center;
      }
      .balance-check-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        margin-top: 8px;
        border-radius: 3px;
        font-size: 8px;
        font-weight: 700;
      }
      .balance-check-row.balanced {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
      }
      .balance-check-row.not-balanced {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'ميزان مراجعة / Trial Balance' : 'Trial Balance'
    const subtitle = lang === 'ar' ? 'Trial Balance' : 'ميزان مراجعة'
    return generateAccountingHeader(settings, lang, title, subtitle)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const accounts = (data.accounts as Array<{ name: string; nameEn: string; code?: string; debit: number; credit: number }>) || []
    const totalDebit = (data.totalDebit as number) || 0
    const totalCredit = (data.totalCredit as number) || 0
    const period = data.period as string | undefined
    const date = data.date as string | undefined
    const currency = getCurrencySymbol(settings, lang)

    // Bilingual column headers
    const colNum = '#'
    const colCode = lang === 'ar' ? 'الرمز / Code' : 'Code'
    const colAccount = lang === 'ar' ? 'الحساب / Account' : 'Account'
    const colDebit = lang === 'ar' ? 'مدين / Debit' : 'Debit'
    const colCredit = lang === 'ar' ? 'دائن / Credit' : 'Credit'
    const totalLabel = lang === 'ar' ? 'الإجمالي / Total' : 'Total'
    const balanceCheck = lang === 'ar' ? 'التحقق من التوازن / Balance Check' : 'Balance Check'
    const balanced = lang === 'ar' ? 'متوازن ✓' : 'Balanced ✓'
    const notBalanced = lang === 'ar' ? 'غير متوازن ✗' : 'Not Balanced ✗'

    // Period/date info line with currency
    let periodInfo = ''
    if (period) {
      periodInfo = `<div class="acct-header-subtitle">${lang === 'ar' ? 'الفترة / Period' : 'Period'}: ${period} &nbsp;|&nbsp; ${lang === 'ar' ? 'العملة / Currency' : 'Currency'}: ${currency}</div>`
    } else if (date) {
      periodInfo = `<div class="acct-header-subtitle">${lang === 'ar' ? 'التاريخ / Date' : 'Date'}: ${formatDate(date, lang)} &nbsp;|&nbsp; ${lang === 'ar' ? 'العملة / Currency' : 'Currency'}: ${currency}</div>`
    } else {
      periodInfo = `<div class="acct-header-subtitle">${lang === 'ar' ? 'العملة / Currency' : 'Currency'}: ${currency}</div>`
    }

    // Check if any account has a code
    const hasCodes = accounts.some(a => a.code)

    const rows = accounts.map((acc, i) => {
      const displayName = lang === 'ar' ? acc.name : (acc.nameEn || acc.name)
      return `
        <tr>
          <td class="row-num">${i + 1}</td>
          ${hasCodes ? `<td class="code-cell">${acc.code || ''}</td>` : ''}
          <td>${displayName}</td>
          <td class="amount-cell">${acc.debit ? fmtMoney(acc.debit, settings, lang) : '-'}</td>
          <td class="amount-cell">${acc.credit ? fmtMoney(acc.credit, settings, lang) : '-'}</td>
        </tr>`
    }).join('')

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    return `
      ${periodInfo}
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:30px;">${colNum}</th>
            ${hasCodes ? `<th style="width:70px;">${colCode}</th>` : ''}
            <th>${colAccount}</th>
            <th class="amount-header">${colDebit}</th>
            <th class="amount-header">${colCredit}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${hasCodes ? 3 : 2}"><strong>${totalLabel}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalDebit, settings, lang)}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalCredit, settings, lang)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="balance-check-row ${isBalanced ? 'balanced' : 'not-balanced'}">
        <span>${balanceCheck}</span>
        <span>${isBalanced ? balanced : notBalanced}</span>
      </div>

      ${signaturesSection(settings, lang)}
    `
  },
}
