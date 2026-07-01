// ============================================================================
// قالب قائمة الدخل - Income Statement Template
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, getCurrencySymbol } from '../shared/utils'
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
    const paddingStart = lang === 'ar' ? 'padding-right' : 'padding-left'

    return getAccountingCSS(lang) + `
      /* ──── INCOME STATEMENT SPECIFIC ──── */
      .is-section {
        margin-top: 10px;
      }
      .is-section-box {
        border: 1px solid #cbd5e1;
        border-radius: 0;
        overflow: hidden;
        margin-top: 4px;
      }
      .is-row {
        display: flex;
        justify-content: space-between;
        padding: 5px 12px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 9px;
      }
      .is-row:last-child {
        border-bottom: none;
      }
      .is-row.is-subtotal {
        background: #f8fafc;
        font-weight: 700;
        border-top: 2px solid #94a3b8;
        border-bottom: none;
        font-size: 9.5px;
      }
      .is-row.is-indent {
        ${paddingStart}: 28px;
        color: #475569;
      }
      .is-row .is-label {
        color: #1e293b;
      }
      .is-row .is-amount {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        font-family: 'Inter', 'Cairo', sans-serif;
        font-weight: 500;
      }
      .is-row.is-subtotal .is-amount {
        font-weight: 700;
        font-size: 10px;
      }
      .is-grand-row {
        display: flex;
        justify-content: space-between;
        padding: 10px 12px;
        background: #047857;
        color: white;
        font-weight: 700;
        font-size: 11px;
        border-radius: 0;
        margin-top: 12px;
      }
      .is-grand-row .is-amount {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        font-family: 'Inter', 'Cairo', sans-serif;
        font-size: 12px;
      }
      .is-grand-row.is-loss {
        background: #991b1b;
      }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'قائمة الدخل / Income Statement' : 'Income Statement'
    const subtitle = lang === 'ar' ? 'Income Statement' : 'قائمة الدخل'
    return generateAccountingHeader(settings, lang, title, subtitle)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const period = data.period as string | undefined
    const projectRevenue = (data.projectRevenue as number) || 0
    const rentalRevenue = (data.rentalRevenue as number) || 0
    const otherRevenue = (data.otherRevenue as number) || 0
    const totalRevenue = (data.totalRevenue as number) || 0
    const projectCost = (data.projectCost as number) || 0
    const rentalCost = (data.rentalCost as number) || 0
    const totalDirectCosts = (data.totalDirectCosts as number) || 0
    const grossProfit = (data.grossProfit as number) || 0
    const adminExpenses = (data.adminExpenses as number) || 0
    const depreciationExpenses = (data.depreciationExpenses as number) || 0
    const financialExpenses = (data.financialExpenses as number) || 0
    const totalIndirectCosts = (data.totalIndirectCosts as number) || 0
    const netProfit = (data.netProfit as number) || 0
    const currency = getCurrencySymbol(settings, lang)

    // Bilingual labels
    const lbl = lang === 'ar' ? {
      period: 'الفترة / Period',
      currency: 'العملة / Currency',
      revenues: 'الإيرادات / Revenues',
      projectRevenue: 'إيرادات المشاريع / Project Revenue',
      rentalRevenue: 'إيرادات التأجير / Rental Revenue',
      otherRevenue: 'إيرادات أخرى / Other Revenue',
      totalRevenue: 'إجمالي الإيرادات / Total Revenue',
      directCosts: 'التكاليف المباشرة / Direct Costs',
      projectCost: 'تكاليف المشاريع / Project Costs',
      rentalCost: 'تكاليف التأجير / Rental Costs',
      totalDirectCosts: 'إجمالي التكاليف المباشرة / Total Direct Costs',
      grossProfit: 'مجمل الربح / Gross Profit',
      indirectCosts: 'التكاليف غير المباشرة / Indirect Costs',
      adminExpenses: 'المصاريف الإدارية والعمومية / Admin & General Expenses',
      depreciationExpenses: 'الإهلاك / Depreciation',
      financialExpenses: 'المصاريف المالية / Financial Expenses',
      totalIndirectCosts: 'إجمالي التكاليف غير المباشرة / Total Indirect Costs',
      netProfit: 'صافي الربح / Net Profit',
      netLoss: 'صافي الخسارة / Net Loss',
    } : {
      period: 'Period',
      currency: 'Currency',
      revenues: 'Revenues',
      projectRevenue: 'Project Revenue',
      rentalRevenue: 'Rental Revenue',
      otherRevenue: 'Other Revenue',
      totalRevenue: 'Total Revenue',
      directCosts: 'Direct Costs',
      projectCost: 'Project Costs',
      rentalCost: 'Rental Costs',
      totalDirectCosts: 'Total Direct Costs',
      grossProfit: 'Gross Profit',
      indirectCosts: 'Indirect Costs',
      adminExpenses: 'Admin & General Expenses',
      depreciationExpenses: 'Depreciation',
      financialExpenses: 'Financial Expenses',
      totalIndirectCosts: 'Total Indirect Costs',
      netProfit: 'Net Profit',
      netLoss: 'Net Loss',
    }

    const periodInfo = period
      ? `<div class="acct-header-subtitle">${lbl.period}: ${escapeHtml(period)} &nbsp;|&nbsp; ${lbl.currency}: ${escapeHtml(currency)}</div>`
      : `<div class="acct-header-subtitle">${lbl.currency}: ${escapeHtml(currency)}</div>`

    const isLoss = netProfit < 0

    return `
      ${periodInfo}

      <div class="is-section">
        <div class="section-title">${lbl.revenues}</div>
        <div class="is-section-box">
          <div class="is-row is-indent">
            <span class="is-label">${lbl.projectRevenue}</span>
            <span class="is-amount">${fmtMoney(projectRevenue, settings, lang)}</span>
          </div>
          <div class="is-row is-indent">
            <span class="is-label">${lbl.rentalRevenue}</span>
            <span class="is-amount">${fmtMoney(rentalRevenue, settings, lang)}</span>
          </div>
          ${otherRevenue ? `<div class="is-row is-indent">
            <span class="is-label">${lbl.otherRevenue}</span>
            <span class="is-amount">${fmtMoney(otherRevenue, settings, lang)}</span>
          </div>` : ''}
          <div class="is-row is-subtotal">
            <span class="is-label">${lbl.totalRevenue}</span>
            <span class="is-amount">${fmtMoney(totalRevenue, settings, lang)}</span>
          </div>
        </div>
      </div>

      <div class="is-section">
        <div class="section-title">${lbl.directCosts}</div>
        <div class="is-section-box">
          <div class="is-row is-indent">
            <span class="is-label">${lbl.projectCost}</span>
            <span class="is-amount">${fmtMoney(projectCost, settings, lang)}</span>
          </div>
          <div class="is-row is-indent">
            <span class="is-label">${lbl.rentalCost}</span>
            <span class="is-amount">${fmtMoney(rentalCost, settings, lang)}</span>
          </div>
          ${totalDirectCosts ? `<div class="is-row is-subtotal">
            <span class="is-label">${lbl.totalDirectCosts}</span>
            <span class="is-amount">${fmtMoney(totalDirectCosts, settings, lang)}</span>
          </div>` : ''}
        </div>
      </div>

      <div class="is-section">
        <div class="section-title">${lbl.grossProfit}</div>
        <div class="is-section-box">
          <div class="is-row is-subtotal">
            <span class="is-label">${lbl.grossProfit}</span>
            <span class="is-amount">${fmtMoney(grossProfit, settings, lang)}</span>
          </div>
        </div>
      </div>

      <div class="is-section">
        <div class="section-title">${lbl.indirectCosts}</div>
        <div class="is-section-box">
          <div class="is-row is-indent">
            <span class="is-label">${lbl.adminExpenses}</span>
            <span class="is-amount">${fmtMoney(adminExpenses, settings, lang)}</span>
          </div>
          ${depreciationExpenses ? `<div class="is-row is-indent">
            <span class="is-label">${lbl.depreciationExpenses}</span>
            <span class="is-amount">${fmtMoney(depreciationExpenses, settings, lang)}</span>
          </div>` : ''}
          ${financialExpenses ? `<div class="is-row is-indent">
            <span class="is-label">${lbl.financialExpenses}</span>
            <span class="is-amount">${fmtMoney(financialExpenses, settings, lang)}</span>
          </div>` : ''}
          ${totalIndirectCosts ? `<div class="is-row is-subtotal">
            <span class="is-label">${lbl.totalIndirectCosts}</span>
            <span class="is-amount">${fmtMoney(totalIndirectCosts, settings, lang)}</span>
          </div>` : ''}
        </div>
      </div>

      <div class="is-grand-row ${isLoss ? 'is-loss' : ''}">
        <span>${isLoss ? lbl.netLoss : lbl.netProfit}</span>
        <span class="is-amount">${fmtMoney(Math.abs(netProfit), settings, lang)}</span>
      </div>

      ${signaturesSection(settings, lang)}
    `
  },
}
