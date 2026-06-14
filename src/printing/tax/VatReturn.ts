// ============================================================================
// قالب الإقرار الضريبي - VAT Return Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { signaturesSection } from '../shared/sections'
import { getAccountingCSS } from '../shared/css'
import { generateAccountingHeader, generateAccountingFooter } from '../shared/headers-footers'

export const template: DocumentTemplate = {
  category: 'tax',

  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: true,
  hasCustomFooter: true,

  getCSS(lang: 'ar' | 'en'): string {
    return getAccountingCSS(lang)
  },

  getCustomHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
    const title = lang === 'ar' ? 'إقرار ضريبي / VAT Return' : 'VAT Return'
    return generateAccountingHeader(settings, lang, title)
  },

  getCustomFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
    return generateAccountingFooter(settings, lang)
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const currency = getCurrencySymbol(settings, lang)
    const year = (data.year as number) || new Date().getFullYear()
    const quarter = (data.quarter as number) || 1
    const totalSales = (data.totalSales as number) || 0
    const outputVat = (data.outputVat as number) || 0
    const totalPurchases = (data.totalPurchases as number) || 0
    const inputVat = (data.inputVat as number) || 0
    const netVat = (data.netVat as number) || 0
    const paymentStatus = data.paymentStatus as string | undefined
    const paymentDate = data.paymentDate as string | undefined
    const paymentRef = data.paymentRef as string | undefined

    // Quarter names
    const quarterNames = lang === 'ar'
      ? ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع']
      : ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter']
    const quarterName = quarterNames[quarter - 1] || `Q${quarter}`
    const periodDisplay = `${quarterName} - ${year}`

    // Row helper for VAT details
    const detailRow = (label: string, value: string, isBold = false): string => {
      const boldStyle = isBold ? 'font-weight:700;' : ''
      return `
        <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:10px;${boldStyle}">
          <span>${label}</span>
          <span style="direction:ltr;font-variant-numeric:tabular-nums;">${value}</span>
        </div>`
    }

    // Section header helper
    const sectionHeader = (title: string): string => {
      return `<div style="font-size:10.5px;font-weight:700;color:#1e293b;margin-top:14px;margin-bottom:4px;padding-bottom:3px;border-bottom:2px solid #047857;">${title}</div>`
    }

    return `
      <!-- Company Info -->
      ${sectionHeader(lang === 'ar' ? 'بيانات المنشأة / Company Information' : 'Company Information')}
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الرقم الضريبي / VAT Number' : 'VAT Number'}</div>
          <div class="info-value">${settings.taxNumber || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'السجل التجاري / Commercial Registration' : 'Commercial Registration'}</div>
          <div class="info-value">${settings.commercialReg || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'السنة / Year' : 'Year'}</div>
          <div class="info-value">${year}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'الربع / Quarter' : 'Quarter'}</div>
          <div class="info-value">${periodDisplay}</div>
        </div>
      </div>

      <!-- Output VAT Section -->
      ${sectionHeader(lang === 'ar' ? `ضريبة المخرجات / Output VAT (${currency})` : `Output VAT (${currency})`)}
      <div style="border:1px solid #e2e8f0;overflow:hidden;margin-top:8px;border-radius:4px;">
        ${detailRow(
          lang === 'ar' ? 'إجمالي المبيعات / Total Sales' : 'Total Sales',
          fmtMoney(totalSales, settings, lang)
        )}
        ${detailRow(
          lang === 'ar' ? 'ضريبة المخرجات / Output VAT' : 'Output VAT',
          fmtMoney(outputVat, settings, lang),
          true
        )}
      </div>

      <!-- Input VAT Section -->
      ${sectionHeader(lang === 'ar' ? `ضريبة المدخلات / Input VAT (${currency})` : `Input VAT (${currency})`)}
      <div style="border:1px solid #e2e8f0;overflow:hidden;margin-top:8px;border-radius:4px;">
        ${detailRow(
          lang === 'ar' ? 'إجمالي المشتريات / Total Purchases' : 'Total Purchases',
          fmtMoney(totalPurchases, settings, lang)
        )}
        ${detailRow(
          lang === 'ar' ? 'ضريبة المدخلات / Input VAT' : 'Input VAT',
          fmtMoney(inputVat, settings, lang),
          true
        )}
      </div>

      <!-- Net VAT Section -->
      <div style="margin-top:15px;">
        <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#1e293b;color:white;font-weight:700;font-size:12px;border-radius:4px;">
          <span>${lang === 'ar' ? `صافي الضريبة المستحقة / Net VAT Due (${currency})` : `Net VAT Due (${currency})`}</span>
          <span style="direction:ltr;font-variant-numeric:tabular-nums;font-size:13px;">${fmtMoney(netVat, settings, lang)}</span>
        </div>
      </div>

      <!-- Payment Details Section (plain text, no badge for official documents) -->
      ${paymentStatus ? `
        ${sectionHeader(lang === 'ar' ? 'بيانات السداد / Payment Details' : 'Payment Details')}
        <div style="border:1px solid #e2e8f0;overflow:hidden;margin-top:8px;border-radius:4px;">
          ${detailRow(
            lang === 'ar' ? 'حالة السداد / Payment Status' : 'Payment Status',
            paymentStatus === 'PAID'
              ? (lang === 'ar' ? 'مدفوع / Paid' : 'Paid')
              : paymentStatus === 'NOT_PAID' || paymentStatus === 'PENDING'
              ? (lang === 'ar' ? 'غير مدفوع / Not Paid' : 'Not Paid')
              : paymentStatus
          )}
          ${paymentDate ? detailRow(
            lang === 'ar' ? 'تاريخ السداد / Payment Date' : 'Payment Date',
            formatDate(paymentDate, lang)
          ) : ''}
          ${paymentRef ? detailRow(
            lang === 'ar' ? 'رقم المرجع / Payment Reference' : 'Payment Reference',
            paymentRef
          ) : ''}
        </div>
      ` : ''}

      ${signaturesSection(settings, lang)}
    `
  },
}
