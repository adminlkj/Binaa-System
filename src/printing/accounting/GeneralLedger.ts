// ============================================================================
// قالب دفتر الأستاذ العام - General Ledger Template
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { signaturesSection } from '../shared/sections'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'
import { escapeHtml } from '@/lib/escape-html'

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
      .gl-account-code {
        font-family: 'Inter', 'Cairo', sans-serif;
        font-size: 9px;
        font-weight: 700;
        color: #047857;
        direction: ltr;
      }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'الأستاذ العام / General Ledger' : 'General Ledger'
    const subtitle = lang === 'ar' ? 'General Ledger' : 'الأستاذ العام'
    return generateAccountingHeader(settings, lang, title, subtitle)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const accountName = (data.accountName as string) || ''
    const accountNameEn = (data.accountNameEn as string) || ''
    const accountCode = (data.accountCode as string) || ''
    const entries = (data.entries as Array<{ date: string; description: string; reference?: string; debit: number; credit: number; balance: number }>) || []
    const openingBalance = (data.openingBalance as number) || 0
    const closingBalance = (data.closingBalance as number) || 0
    const totalDebit = (data.totalDebit as number) || entries.reduce((s, e) => s + (e.debit || 0), 0)
    const totalCredit = (data.totalCredit as number) || entries.reduce((s, e) => s + (e.credit || 0), 0)
    const period = data.period as string | undefined
    const currency = getCurrencySymbol(settings, lang)

    // Bilingual labels
    const lbl = lang === 'ar' ? {
      account: 'الحساب / Account',
      accountCode: 'رمز الحساب / Account Code',
      period: 'الفترة / Period',
      currency: 'العملة / Currency',
      openingBalance: 'رصيد افتتاحي / Opening Balance',
      closingBalance: 'رصيد ختامي / Closing Balance',
      totalDebit: 'إجمالي المدين / Total Debit',
      totalCredit: 'إجمالي الدائن / Total Credit',
      colNum: '#',
      colDate: 'التاريخ / Date',
      colRef: 'المرجع / Ref',
      colDesc: 'الوصف / Description',
      colDebit: 'مدين / Debit',
      colCredit: 'دائن / Credit',
      colBalance: 'الرصيد / Balance',
    } : {
      account: 'Account',
      accountCode: 'Account Code',
      period: 'Period',
      currency: 'Currency',
      openingBalance: 'Opening Balance',
      closingBalance: 'Closing Balance',
      totalDebit: 'Total Debit',
      totalCredit: 'Total Credit',
      colNum: '#',
      colDate: 'Date',
      colRef: 'Ref',
      colDesc: 'Description',
      colDebit: 'Debit',
      colCredit: 'Credit',
      colBalance: 'Balance',
    }

    // Account info
    const accountDisplay = lang === 'ar' ? accountName : (accountNameEn || accountName)

    // Period info with currency
    let periodInfo = ''
    if (period) {
      periodInfo = `<div class="acct-header-subtitle">${lbl.period}: ${escapeHtml(period)} &nbsp;|&nbsp; ${lbl.currency}: ${escapeHtml(currency)}</div>`
    } else {
      periodInfo = `<div class="acct-header-subtitle">${lbl.currency}: ${escapeHtml(currency)}</div>`
    }

    // Check if any entry has a reference
    const hasRef = entries.some(e => e.reference)

    // Table rows
    const rows = entries.map((entry, i) => {
      return `
        <tr>
          <td class="row-num">${i + 1}</td>
          <td style="white-space:nowrap;">${formatDate(entry.date, lang)}</td>
          ${hasRef ? `<td class="code-cell">${escapeHtml(entry.reference || '')}</td>` : ''}
          <td>${escapeHtml(entry.description)}</td>
          <td class="amount-cell">${entry.debit ? fmtMoney(entry.debit, settings, lang) : '-'}</td>
          <td class="amount-cell">${entry.credit ? fmtMoney(entry.credit, settings, lang) : '-'}</td>
          <td class="amount-cell">${fmtMoney(entry.balance, settings, lang)}</td>
        </tr>`
    }).join('')

    return `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.account}</div>
          <div class="info-value">${escapeHtml(accountDisplay)}</div>
        </div>
        ${accountCode ? `<div class="info-item">
          <div class="info-label">${lbl.accountCode}</div>
          <div class="info-value gl-account-code">${escapeHtml(accountCode)}</div>
        </div>` : ''}
        <div class="info-item">
          <div class="info-label">${lbl.openingBalance}</div>
          <div class="info-value">${fmtMoney(openingBalance, settings, lang)}</div>
        </div>
      </div>
      ${periodInfo}
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width:30px;">${lbl.colNum}</th>
            <th style="width:80px;">${lbl.colDate}</th>
            ${hasRef ? `<th style="width:70px;">${lbl.colRef}</th>` : ''}
            <th>${lbl.colDesc}</th>
            <th class="amount-header">${lbl.colDebit}</th>
            <th class="amount-header">${lbl.colCredit}</th>
            <th class="amount-header">${lbl.colBalance}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${hasRef ? 4 : 3}"><strong>${lbl.totalDebit}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalDebit, settings, lang)}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalCredit, settings, lang)}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(closingBalance, settings, lang)}</strong></td>
          </tr>
          <tr>
            <td colspan="${hasRef ? 4 : 3}" style="border-top:1px solid #94a3b8;"><strong>${lbl.closingBalance}</strong></td>
            <td colspan="2"></td>
            <td class="amount-cell" style="border-top:1px solid #94a3b8;"><strong>${fmtMoney(closingBalance, settings, lang)}</strong></td>
          </tr>
        </tfoot>
      </table>
      ${signaturesSection(settings, lang)}
    `
  },
}
