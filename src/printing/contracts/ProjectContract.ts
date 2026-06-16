// ============================================================================
// قالب عقد مشروع - Project Contract Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { getDefaultCSS } from '../shared/css'
import { bankInfoSection, signaturesSection, amountInWordsSection, termsSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'project',

  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: true,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang: 'ar' | 'en'): string {
    return getDefaultCSS(lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const contractNo = (data.contractNo as string) || ''
    const date = data.date as string | undefined
    const projectName = (data.projectName as string) || ''
    const projectCode = (data.projectCode as string) || ''
    const clientName = (data.clientName as string) || ''
    const clientAddress = (data.clientAddress as string) || ''
    const clientTaxNumber = (data.clientTaxNumber as string) || ''
    const clientPhone = (data.clientPhone as string) || ''
    const clientEmail = (data.clientEmail as string) || ''
    const contractValue = (data.contractValue as number) || 0
    const vatRate = settings.defaultVatRate ?? 0.15
    const vatAmount = (data.vatAmount as number) || contractValue * vatRate
    const totalAmount = (data.totalAmount as number) || contractValue + vatAmount
    const retentionPercentage = (data.retentionPercentage as number) || 0
    const advancePercentage = (data.advancePercentage as number) || 0
    const startDate = data.startDate as string | undefined
    const endDate = data.endDate as string | undefined
    const description = (data.description as string) || ''
    const changeOrders = (data.changeOrders as Array<Record<string, unknown>>) || []
    const currency = getCurrencySymbol(settings, lang)

    // Labels
    const lbl = lang === 'ar' ? {
      contractInfo: 'بيانات العقد / Contract Information',
      contractNo: 'رقم العقد',
      date: 'تاريخ العقد',
      projectInfo: 'بيانات المشروع / Project Information',
      projectName: 'اسم المشروع',
      projectCode: 'كود المشروع',
      clientInfo: 'بيانات العميل / Client Information',
      clientName: 'اسم العميل',
      clientAddress: 'العنوان',
      clientTaxNumber: 'الرقم الضريبي',
      clientPhone: 'الهاتف',
      clientEmail: 'البريد الإلكتروني',
      financialTerms: 'الشروط المالية / Financial Terms',
      contractValue: 'قيمة العقد',
      vatAmount: `ضريبة القيمة المضافة ${vatRate * 100}%`,
      totalAmount: 'الإجمالي شامل الضريبة',
      retentionPercentage: 'نسبة الاستقطاع',
      advancePercentage: 'نسبة السلفة',
      duration: 'مدة العقد / Contract Duration',
      startDate: 'تاريخ البداية',
      endDate: 'تاريخ النهاية',
      paymentTerms: 'شروط السداد / Payment Terms',
      changeOrdersTitle: 'أوامر التغيير / Change Orders',
      changeOrderNo: 'رقم أمر التغيير',
      changeDescription: 'الوصف',
      changeAmount: 'المبلغ',
      newContractValue: 'قيمة العقد الجديدة',
      scopeOfWork: 'نطاق العمل / Scope of Work',
      percent: '%',
    } : {
      contractInfo: 'Contract Information',
      contractNo: 'Contract No.',
      date: 'Contract Date',
      projectInfo: 'Project Information',
      projectName: 'Project Name',
      projectCode: 'Project Code',
      clientInfo: 'Client Information',
      clientName: 'Client Name',
      clientAddress: 'Address',
      clientTaxNumber: 'VAT Number',
      clientPhone: 'Phone',
      clientEmail: 'Email',
      financialTerms: 'Financial Terms',
      contractValue: 'Contract Value',
      vatAmount: `VAT ${vatRate * 100}%`,
      totalAmount: 'Total Including VAT',
      retentionPercentage: 'Retention %',
      advancePercentage: 'Advance %',
      duration: 'Contract Duration',
      startDate: 'Start Date',
      endDate: 'End Date',
      paymentTerms: 'Payment Terms',
      changeOrdersTitle: 'Change Orders',
      changeOrderNo: 'Change Order No.',
      changeDescription: 'Description',
      changeAmount: 'Amount',
      newContractValue: 'New Contract Value',
      scopeOfWork: 'Scope of Work',
      percent: '%',
    }

    // Change orders table
    const changeOrdersHtml = changeOrders.length > 0 ? `
      <div class="section-title">${lbl.changeOrdersTitle}</div>
      <table class="doc-table" style="margin-top:6px;">
        <thead>
          <tr>
            <th>#</th>
            <th>${lbl.changeOrderNo}</th>
            <th>${lbl.changeDescription}</th>
            <th class="amount-header">${lbl.changeAmount} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${changeOrders.map((co, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${co.orderNo || co.changeOrderNo || ''}</td>
              <td>${co.description || ''}</td>
              <td class="amount-cell">${fmtMoney(Number(co.changeAmount || co.amount) || 0, settings, lang)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''

    // Scope of work
    const scopeHtml = description ? `
      <div class="section-title">${lbl.scopeOfWork}</div>
      <div style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;font-size:10px;line-height:1.7;">
        ${description}
      </div>
    ` : ''

    // Payment terms
    const paymentTermsText = (data.paymentTerms as string) || settings.invoiceTerms || ''
    const paymentTermsHtml = paymentTermsText ? `
      <div class="section-title">${lbl.paymentTerms}</div>
      <div style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;font-size:10px;line-height:1.7;">
        ${paymentTermsText}
      </div>
    ` : ''

    return `
      <!-- Contract Info -->
      <div class="section-title">${lbl.contractInfo}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.contractNo}</div>
          <div class="info-value">${contractNo}</div>
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
        ${projectCode ? `<div class="info-item">
          <div class="info-label">${lbl.projectCode}</div>
          <div class="info-value">${projectCode}</div>
        </div>` : ''}
      </div>

      <!-- Client Info -->
      <div class="section-title">${lbl.clientInfo}</div>
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-row"><span class="label">${lbl.clientName}</span><span class="value">${clientName}</span></div>
          ${clientAddress ? `<div class="party-card-row"><span class="label">${lbl.clientAddress}</span><span class="value">${clientAddress}</span></div>` : ''}
          ${clientTaxNumber ? `<div class="party-card-row"><span class="label">${lbl.clientTaxNumber}</span><span class="value">${clientTaxNumber}</span></div>` : ''}
          ${clientPhone ? `<div class="party-card-row"><span class="label">${lbl.clientPhone}</span><span class="value">${clientPhone}</span></div>` : ''}
          ${clientEmail ? `<div class="party-card-row"><span class="label">${lbl.clientEmail}</span><span class="value">${clientEmail}</span></div>` : ''}
        </div>
      </div>

      <!-- Financial Terms -->
      <div class="section-title">${lbl.financialTerms}</div>
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
            <td>${lbl.contractValue}</td>
            <td class="amount-cell">${fmtMoney(contractValue, settings, lang)}</td>
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

      <!-- Retention & Advance -->
      <div class="info-grid" style="margin-top:8px;">
        ${retentionPercentage > 0 ? `<div class="info-item">
          <div class="info-label">${lbl.retentionPercentage}</div>
          <div class="info-value">${retentionPercentage}${lbl.percent}</div>
        </div>` : ''}
        ${advancePercentage > 0 ? `<div class="info-item">
          <div class="info-label">${lbl.advancePercentage}</div>
          <div class="info-value">${advancePercentage}${lbl.percent}</div>
        </div>` : ''}
      </div>

      <!-- Duration -->
      <div class="section-title">${lbl.duration}</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lbl.startDate}</div>
          <div class="info-value">${startDate ? formatDate(startDate, lang) : '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.endDate}</div>
          <div class="info-value">${endDate ? formatDate(endDate, lang) : '-'}</div>
        </div>
      </div>

      <!-- Scope of Work -->
      ${scopeHtml}

      <!-- Change Orders -->
      ${changeOrdersHtml}

      <!-- Amount in Words -->
      ${amountInWordsSection(totalAmount, lang)}

      <!-- Payment Terms -->
      ${paymentTermsHtml}

      <!-- Bank Info -->
      ${bankInfoSection(settings, lang)}

      <!-- Signatures -->
      ${signaturesSection(settings, lang)}
    `
  },
}
