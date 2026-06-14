// ============================================================================
// قالب الميزانية العمومية - Balance Sheet Template
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, getCurrencySymbol } from '../shared/utils'
import { signaturesSection } from '../shared/sections'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'

interface BalanceSheetItem {
  name: string
  nameEn?: string
  code?: string
  amount: number
}

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
      /* ──── BALANCE SHEET SPECIFIC ──── */
      .bs-section {
        margin-top: 10px;
      }
      .bs-section-box {
        border: 1px solid #cbd5e1;
        border-radius: 0;
        overflow: hidden;
        margin-top: 4px;
      }
      .bs-row {
        display: flex;
        justify-content: space-between;
        padding: 5px 12px;
        border-bottom: 1px solid #f1f5f9;
        font-size: 9px;
      }
      .bs-row:last-child {
        border-bottom: none;
      }
      .bs-row.bs-subtotal {
        background: #f1f5f9;
        font-weight: 700;
        border-top: 2px solid #1e293b;
        border-bottom: none;
        font-size: 9.5px;
      }
      .bs-row.bs-indent {
        ${paddingStart}: 15px;
        color: #475569;
      }
      .bs-row .bs-label {
        color: #1e293b;
      }
      .bs-row .bs-amount {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        font-family: 'Inter', 'Cairo', sans-serif;
        font-weight: 500;
      }
      .bs-row.bs-subtotal .bs-amount {
        font-weight: 700;
        font-size: 10px;
      }
      .bs-row.bs-subtotal .bs-label {
        font-weight: 700;
      }
      .bs-grand-row {
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
      .bs-grand-row .bs-amount {
        direction: ltr;
        font-variant-numeric: tabular-nums;
        font-family: 'Inter', 'Cairo', sans-serif;
        font-size: 12px;
      }
      .bs-verification {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        margin-top: 8px;
        border-radius: 3px;
        font-size: 8px;
        font-weight: 700;
      }
      .bs-verification.balanced {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
      }
      .bs-verification.not-balanced {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }
    `
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'الميزانية العمومية / Balance Sheet' : 'Balance Sheet'
    const subtitle = lang === 'ar' ? 'Balance Sheet' : 'الميزانية العمومية'
    return generateAccountingHeader(settings, lang, title, subtitle)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const period = data.period as string | undefined
    const currentAssets = (data.currentAssets as BalanceSheetItem[]) || []
    const nonCurrentAssets = (data.nonCurrentAssets as BalanceSheetItem[]) || []
    const totalCurrentAssets = (data.totalCurrentAssets as number) || 0
    const totalNonCurrentAssets = (data.totalNonCurrentAssets as number) || 0
    const totalAssets = (data.totalAssets as number) || 0
    const currentLiabilities = (data.currentLiabilities as BalanceSheetItem[]) || []
    const nonCurrentLiabilities = (data.nonCurrentLiabilities as BalanceSheetItem[]) || []
    const totalCurrentLiabilities = (data.totalCurrentLiabilities as number) || 0
    const totalNonCurrentLiabilities = (data.totalNonCurrentLiabilities as number) || 0
    const totalLiabilities = (data.totalLiabilities as number) || 0
    const equity = (data.equity as BalanceSheetItem[]) || []
    const totalEquity = (data.totalEquity as number) || 0
    const currentYearEarnings = (data.currentYearEarnings as number) || 0
    const currency = getCurrencySymbol(settings, lang)

    // Bilingual labels
    const lbl = lang === 'ar' ? {
      period: 'الفترة / Period',
      currency: 'العملة / Currency',
      asOfDate: 'كما في تاريخ / As of Date',
      assets: 'الأصول / Assets',
      currentAssets: 'الأصول المتداولة / Current Assets',
      nonCurrentAssets: 'الأصول غير المتداولة / Non-Current Assets',
      totalCurrentAssets: 'إجمالي الأصول المتداولة / Total Current Assets',
      totalNonCurrentAssets: 'إجمالي الأصول غير المتداولة / Total Non-Current Assets',
      totalAssets: 'إجمالي الأصول / Total Assets',
      liabilities: 'الالتزامات / Liabilities',
      currentLiabilities: 'الالتزامات المتداولة / Current Liabilities',
      nonCurrentLiabilities: 'الالتزامات غير المتداولة / Non-Current Liabilities',
      totalCurrentLiabilities: 'إجمالي الالتزامات المتداولة / Total Current Liabilities',
      totalNonCurrentLiabilities: 'إجمالي الالتزامات غير المتداولة / Total Non-Current Liabilities',
      totalLiabilities: 'إجمالي الالتزامات / Total Liabilities',
      equity: 'حقوق الملكية / Equity',
      currentYearEarnings: 'أرباح السنة الحالية / Current Year Earnings',
      totalEquity: 'إجمالي حقوق الملكية / Total Equity',
      totalLiabilitiesAndEquity: 'إجمالي الالتزامات وحقوق الملكية / Total Liabilities & Equity',
      balanceCheck: 'التحقق / Balance Check',
      balanced: 'متوازن ✓ / Balanced ✓',
      notBalanced: 'غير متوازن ✗ / Not Balanced ✗',
    } : {
      period: 'Period',
      currency: 'Currency',
      asOfDate: 'As of Date',
      assets: 'Assets',
      currentAssets: 'Current Assets',
      nonCurrentAssets: 'Non-Current Assets',
      totalCurrentAssets: 'Total Current Assets',
      totalNonCurrentAssets: 'Total Non-Current Assets',
      totalAssets: 'Total Assets',
      liabilities: 'Liabilities',
      currentLiabilities: 'Current Liabilities',
      nonCurrentLiabilities: 'Non-Current Liabilities',
      totalCurrentLiabilities: 'Total Current Liabilities',
      totalNonCurrentLiabilities: 'Total Non-Current Liabilities',
      totalLiabilities: 'Total Liabilities',
      equity: 'Equity',
      currentYearEarnings: 'Current Year Earnings',
      totalEquity: 'Total Equity',
      totalLiabilitiesAndEquity: 'Total Liabilities & Equity',
      balanceCheck: 'Balance Check',
      balanced: 'Balanced ✓',
      notBalanced: 'Not Balanced ✗',
    }

    const periodInfo = period
      ? `<div class="acct-header-subtitle">${lbl.asOfDate}: ${period} &nbsp;|&nbsp; ${lbl.currency}: ${currency}</div>`
      : `<div class="acct-header-subtitle">${lbl.currency}: ${currency}</div>`

    // Helper: render items list
    const renderItemRows = (items: BalanceSheetItem[]): string => {
      return items.map(item => {
        const displayName = lang === 'ar' ? item.name : (item.nameEn || item.name)
        return `
          <div class="bs-row bs-indent">
            <span class="bs-label">${item.code ? `<span style="color:#64748b;font-family:'Inter',sans-serif;font-size:8px;direction:ltr;">${item.code}</span> - ` : ''}${displayName}</span>
            <span class="bs-amount">${fmtMoney(item.amount, settings, lang)}</span>
          </div>`
      }).join('')
    }

    // Helper: render a section with items and total
    const renderSection = (sectionTitle: string, subSections: Array<{ title: string; items: BalanceSheetItem[]; subtotalLabel: string; subtotalValue: number }>, totalLabel: string, totalValue: number): string => {
      const subSectionHtml = subSections.map(sub => {
        if (sub.items.length === 0) return ''
        return `
          <div style="margin-top:2px;">
            <div class="bs-row" style="background:#f8fafc;font-weight:600;font-size:8.5px;color:#334155;border-bottom:1px solid #e2e8f0;">
              <span>${sub.title}</span>
            </div>
            ${renderItemRows(sub.items)}
            <div class="bs-row bs-subtotal" style="border-top:1px solid #94a3b8;">
              <span class="bs-label">${sub.subtotalLabel}</span>
              <span class="bs-amount">${fmtMoney(sub.subtotalValue, settings, lang)}</span>
            </div>
          </div>
        `
      }).join('')

      return `
        <div class="bs-section">
          <div class="section-title">${sectionTitle}</div>
          <div class="bs-section-box">
            ${subSectionHtml}
            <div class="bs-row bs-subtotal" style="background:#e2e8f0;border-top:2px solid #1e293b;">
              <span class="bs-label">${totalLabel}</span>
              <span class="bs-amount">${fmtMoney(totalValue, settings, lang)}</span>
            </div>
          </div>
        </div>
      `
    }

    // Fallback for when structured data isn't available (backward compatibility)
    const legacyAssets = (data.assets as BalanceSheetItem[]) || []
    const legacyLiabilities = (data.liabilities as BalanceSheetItem[]) || []
    const legacyEquity = (data.equity as BalanceSheetItem[]) || []
    const useStructuredData = currentAssets.length > 0 || nonCurrentAssets.length > 0 || currentLiabilities.length > 0 || nonCurrentLiabilities.length > 0

    let assetsHtml: string
    let liabilitiesHtml: string
    let equityHtml: string

    if (useStructuredData) {
      // Structured balance sheet with current/non-current breakdown
      assetsHtml = renderSection(
        lbl.assets,
        [
          { title: lbl.currentAssets, items: currentAssets, subtotalLabel: lbl.totalCurrentAssets, subtotalValue: totalCurrentAssets },
          { title: lbl.nonCurrentAssets, items: nonCurrentAssets, subtotalLabel: lbl.totalNonCurrentAssets, subtotalValue: totalNonCurrentAssets },
        ].filter(s => s.items.length > 0),
        lbl.totalAssets,
        totalAssets
      )

      liabilitiesHtml = renderSection(
        lbl.liabilities,
        [
          { title: lbl.currentLiabilities, items: currentLiabilities, subtotalLabel: lbl.totalCurrentLiabilities, subtotalValue: totalCurrentLiabilities },
          { title: lbl.nonCurrentLiabilities, items: nonCurrentLiabilities, subtotalLabel: lbl.totalNonCurrentLiabilities, subtotalValue: totalNonCurrentLiabilities },
        ].filter(s => s.items.length > 0),
        lbl.totalLiabilities,
        totalLiabilities
      )

      equityHtml = renderSection(
        lbl.equity,
        [{ title: lbl.equity, items: equity, subtotalLabel: lbl.totalEquity, subtotalValue: totalEquity }],
        lbl.totalEquity,
        totalEquity + currentYearEarnings
      )
    } else {
      // Legacy flat structure
      assetsHtml = renderSection(lbl.assets, [{ title: lbl.assets, items: legacyAssets, subtotalLabel: lbl.totalAssets, subtotalValue: totalAssets }], lbl.totalAssets, totalAssets)
      liabilitiesHtml = renderSection(lbl.liabilities, [{ title: lbl.liabilities, items: legacyLiabilities, subtotalLabel: lbl.totalLiabilities, subtotalValue: totalLiabilities }], lbl.totalLiabilities, totalLiabilities)
      equityHtml = renderSection(lbl.equity, [{ title: lbl.equity, items: legacyEquity, subtotalLabel: lbl.totalEquity, subtotalValue: totalEquity }], lbl.totalEquity, totalEquity)
    }

    // Grand total verification
    const totalLE = totalLiabilities + totalEquity + currentYearEarnings
    const isBalanced = Math.abs(totalAssets - totalLE) < 0.01

    return `
      ${periodInfo}

      ${assetsHtml}
      ${liabilitiesHtml}
      ${equityHtml}

      <div class="bs-grand-row">
        <span>${lbl.totalLiabilitiesAndEquity}</span>
        <span class="bs-amount">${fmtMoney(totalLE, settings, lang)}</span>
      </div>

      <div class="bs-verification ${isBalanced ? 'balanced' : 'not-balanced'}">
        <span>${lbl.balanceCheck}: ${lbl.totalAssets} = ${fmtMoney(totalAssets, settings, lang)}</span>
        <span>${isBalanced ? lbl.balanced : lbl.notBalanced}</span>
      </div>

      ${signaturesSection(settings, lang)}
    `
  },
}
