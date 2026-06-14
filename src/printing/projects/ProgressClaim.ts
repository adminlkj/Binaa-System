// ============================================================================
// قالب مستخلص أعمال - Progress Claim Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { amountInWordsSection, approvalsSection } from '../shared/sections'
import { getDefaultCSS } from '../shared/css'

export const template: DocumentTemplate = {
  category: 'project',

  requiresQR: false,
  requiresSignature: false,
  requiresBankInfo: false,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang: 'ar' | 'en'): string {
    return getDefaultCSS(lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const claimNo = (data.claimNo as string) || ''
    const date = data.date as string | undefined
    const projectName = (data.projectName as string) || ''
    const contractNo = (data.contractNo as string) || ''
    const contractValue = (data.contractValue as number) || 0
    const previousPercentage = (data.previousPercentage as number) || 0
    const currentPercentage = (data.currentPercentage as number) || 0
    const cumulativePercentage = (data.cumulativePercentage as number) || 0
    const amount = (data.amount as number) || 0
    const vatAmount = (data.vatAmount as number) || 0
    const totalAmount = (data.totalAmount as number) || 0
    const vatRate = settings.defaultVatRate ?? 0.15
    const currency = getCurrencySymbol(settings, lang)

    // Labels
    const lbl = lang === 'ar' ? {
      claimInfo: 'بيانات المستخلص',
      claimNo: 'رقم المستخلص',
      date: 'التاريخ',
      projectInfo: 'بيانات المشروع',
      projectName: 'اسم المشروع',
      contractInfo: 'بيانات العقد',
      contractNo: 'رقم العقد',
      contractValue: 'قيمة العقد',
      percentageBreakdown: 'تفصيل النسب',
      previousPercentage: 'نسبة الأعمال السابقة',
      currentPercentage: 'نسبة أعمال المستخلص الحالي',
      cumulativePercentage: 'النسبة التراكمية',
      amountTable: 'تفصيل المبالغ',
      claimAmount: 'مبلغ المستخلص',
      vatAmount: `ضريبة القيمة المضافة ${vatRate * 100}%`,
      totalAmount: 'الإجمالي شامل الضريبة',
      percent: '%',
    } : {
      claimInfo: 'Claim Information',
      claimNo: 'Claim No.',
      date: 'Date',
      projectInfo: 'Project Information',
      projectName: 'Project Name',
      contractInfo: 'Contract Information',
      contractNo: 'Contract No.',
      contractValue: 'Contract Value',
      percentageBreakdown: 'Percentage Breakdown',
      previousPercentage: 'Previous Work Percentage',
      currentPercentage: 'Current Claim Percentage',
      cumulativePercentage: 'Cumulative Percentage',
      amountTable: 'Amount Breakdown',
      claimAmount: 'Claim Amount',
      vatAmount: `VAT ${vatRate * 100}%`,
      totalAmount: 'Total Including VAT',
      percent: '%',
    }

    const pctFormat = (val: number): string => val.toFixed(2)

    return `
      <!-- Claim Info -->
      <div class="section-title">${lbl.claimInfo}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.claimNo}</div>
          <div class="info-value">${claimNo}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.date}</div>
          <div class="info-value">${date ? formatDate(date, lang) : '-'}</div>
        </div>
      </div>

      <!-- Project Info -->
      <div class="section-title">${lbl.projectInfo}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.projectName}</div>
          <div class="info-value">${projectName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.contractNo}</div>
          <div class="info-value">${contractNo}</div>
        </div>
      </div>

      <!-- Contract Info -->
      <div class="section-title">${lbl.contractInfo}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.contractValue}</div>
          <div class="info-value">${fmtMoney(contractValue, settings, lang)}</div>
        </div>
      </div>

      <!-- Percentage Breakdown -->
      <div class="section-title">${lbl.percentageBreakdown}</div>
      <table class="doc-table" style="margin-top:6px;">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'البيان / Description' : 'Description'}</th>
            <th class="amount-header">${lang === 'ar' ? 'النسبة / Percentage' : 'Percentage'}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-num">1</td>
            <td>${lbl.previousPercentage}</td>
            <td class="amount-cell">${pctFormat(previousPercentage)}${lbl.percent}</td>
          </tr>
          <tr>
            <td class="row-num">2</td>
            <td>${lbl.currentPercentage}</td>
            <td class="amount-cell">${pctFormat(currentPercentage)}${lbl.percent}</td>
          </tr>
          <tr>
            <td class="row-num">3</td>
            <td>${lbl.cumulativePercentage}</td>
            <td class="amount-cell" style="font-weight:700;">${pctFormat(cumulativePercentage)}${lbl.percent}</td>
          </tr>
        </tbody>
      </table>

      <!-- Amount Breakdown -->
      <div class="section-title">${lbl.amountTable}</div>
      <table class="doc-table" style="margin-top:6px;">
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
            <td>${lbl.claimAmount}</td>
            <td class="amount-cell">${fmtMoney(amount, settings, lang)}</td>
          </tr>
          <tr>
            <td class="row-num">2</td>
            <td>${lbl.vatAmount}</td>
            <td class="amount-cell">${fmtMoney(vatAmount, settings, lang)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td><strong>${lbl.totalAmount}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(totalAmount, settings, lang)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- Amount in Words -->
      ${amountInWordsSection(totalAmount, lang)}

      <!-- Approvals Section -->
      ${approvalsSection(lang)}
    `
  },
}
