// ============================================================================
// قالب مستخلص أعمال - Progress Claim Template (Professional Invoice Style)
// نظام بِنَاء ERP - Binaa Construction ERP
//
// يستخدم نفس قالب فاتورة الخدمات الاحترافي:
//   - شعار الشركة + اسم الشركة + رقم ضريبي + سجل تجاري
//   - لافتة "فاتورة ضريبية بديلة" (مطابقة ZATCA)
//   - شبكة معلومات (رقم المستخلص، التاريخ، رقم العقد، نسبة الإنجاز)
//   - قسم الأطراف (من الشركة / إلى العميل)
//   - جدول البنود (وصف المستخلص + المبلغ)
//   - المجاميع (المجموع الفرعي + ضريبة القيمة المضافة + الإجمالي)
//   - رمز QR لهيئة الزكاة والضريبة
//   - المبلغ كتابةً (عربي + إنجليزي)
//   - معلومات البنك
//   - الشروط والأحكام
//   - التوقيعات
// يطبق ألوان القالب المخصصة من الإعدادات.
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, formatMoneyPrint, getCurrencySymbol, encodeZATCATLV, getAmountInWords } from '../shared/utils'
import { getDefaultCSS } from '../shared/css'
import { bankInfoSection, signaturesSection, amountInWordsSection, termsSection, totalsSection, qrCodeSection, qrCodeScript } from '../shared/sections'

// ============ Template Implementation ============
export const template: DocumentTemplate = {
  category: 'project',

  requiresQR: true,
  requiresSignature: true,
  requiresBankInfo: true,
  requiresAmountInWords: true,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang: 'ar' | 'en'): string {
    return getDefaultCSS(lang) + `
      .zatca-tax-banner {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px;
        margin: 0 0 10px 0;
        padding: 8px 14px;
        background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%);
        color: #fff;
        border-radius: 6px;
        border-left: 4px solid #b45309;
      }
      .zatca-tax-banner-title {
        font-size: 14px; font-weight: 800; letter-spacing: 0.4px;
      }
      .zatca-tax-banner-title-en {
        font-size: 10px; font-weight: 600; opacity: 0.85;
        margin-top: 1px;
      }
      .zatca-tax-banner-meta {
        font-size: 8.5px; opacity: 0.92; text-align: ${lang === 'ar' ? 'left' : 'right'};
        line-height: 1.45;
      }
      .claim-progress-box {
        margin-top: 8px;
        padding: 8px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        font-size: 10px;
      }
      .claim-progress-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .claim-progress-label {
        font-size: 8.5px;
        color: #64748b;
        font-weight: 600;
        text-transform: uppercase;
      }
      .claim-progress-value {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
        direction: ltr;
        text-align: ${lang === 'ar' ? 'right' : 'left'};
      }
    `
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const currency = getCurrencySymbol(settings, lang)

    // البيانات الأساسية للمستخلص
    const claimNo = (data.claimNo as string) || ''
    const date = data.date as string | undefined
    const projectName = (data.projectName as string) || ''
    const contractNo = (data.contractNo as string) || ''
    const contractValue = (data.contractValue as number) || 0
    const percentage = Number(data.percentage) || 0
    const previousPercentage = Number(data.previousPercentage) || 0
    const cumulativePercentage = Number(data.cumulativePercentage) || percentage
    const amount = Number(data.amount) || 0
    const vatAmount = Number(data.vatAmount) || 0
    const totalAmount = Number(data.totalAmount) || 0
    const vatRate = Number(data.vatRate ?? settings.defaultVatRate) || 0.15
    const notes = (data.notes as string | null | undefined) || null

    // بيانات العميل (للقسم "إلى / To")
    const clientName = (data.clientName as string) || ''
    const clientAddress = (data.clientAddress as string) || ''
    const clientTaxNumber = (data.clientTaxNumber as string) || ''

    // ─── لافتة فاتورة ضريبية بديلة (ZATCA-compliant) ───
    // مستخلص الأعمال يُعتبر "فاتورة ضريبية بديلة" وفق ZATCA لأنه يمثل
    // إيراداً خاضعاً لضريبة القيمة المضافة للمقاولين.
    const zatcaBanner = `
      <div class="zatca-tax-banner">
        <div>
          <div class="zatca-tax-banner-title">${lang === 'ar' ? 'فاتورة ضريبية بديلة - مستخلص' : 'Substituted Tax Invoice - Claim'}</div>
          <div class="zatca-tax-banner-title-en">${lang === 'ar' ? 'Substituted Tax Invoice' : 'فاتورة ضريبية بديلة'}</div>
        </div>
        <div class="zatca-tax-banner-meta">
          ${settings.taxNumber ? `<div>${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}: ${settings.taxNumber}</div>` : ''}
          <div>${lang === 'ar' ? 'مستخلص أعمال' : 'Progress Claim'}</div>
        </div>
      </div>
    `

    // ─── شبكة معلومات المستخلص ───
    const infoGrid = `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم المستخلص / Claim No' : 'Claim No'}</div>
          <div class="info-value">${claimNo}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'التاريخ / Date' : 'Date'}</div>
          <div class="info-value">${date ? formatDate(date, lang) : '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم العقد / Contract No' : 'Contract No'}</div>
          <div class="info-value">${contractNo || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'المشروع / Project' : 'Project'}</div>
          <div class="info-value">${projectName || '-'}</div>
        </div>
      </div>
    `

    // ─── قسم الأطراف (من الشركة / إلى العميل) ───
    const partiesHtml = `
      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'من / From' : 'From'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الشركة' : 'Company'}</span><span class="value">${lang === 'ar' ? settings.nameAr : settings.nameEn}</span></div>
          ${settings.address ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${settings.address}</span></div>` : ''}
          ${settings.taxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${settings.taxNumber}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'إلى / To' : 'To'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'العميل' : 'Client'}</span><span class="value">${clientName || '-'}</span></div>
          ${clientAddress ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'العنوان' : 'Address'}</span><span class="value">${clientAddress}</span></div>` : ''}
          ${clientTaxNumber ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}</span><span class="value">${clientTaxNumber}</span></div>` : ''}
        </div>
      </div>
    `

    // ─── صندوق نسب الإنجاز (مرئي بوضوح) ───
    const progressBox = `
      <div class="claim-progress-box">
        <div class="claim-progress-item">
          <div class="claim-progress-label">${lang === 'ar' ? 'نسبة الأعمال السابقة' : 'Previous %'}</div>
          <div class="claim-progress-value">${previousPercentage.toFixed(2)}%</div>
        </div>
        <div class="claim-progress-item">
          <div class="claim-progress-label">${lang === 'ar' ? 'نسبة المستخلص الحالي' : 'Current %'}</div>
          <div class="claim-progress-value">${percentage.toFixed(2)}%</div>
        </div>
        <div class="claim-progress-item">
          <div class="claim-progress-label">${lang === 'ar' ? 'النسبة التراكمية' : 'Cumulative %'}</div>
          <div class="claim-progress-value">${cumulativePercentage.toFixed(2)}%</div>
        </div>
      </div>
    `

    // ─── جدول البنود (وصف المستخلص + الكمية + سعر الوحدة + الإجمالي) ───
    // نعرض المستخلص كبند واحد مع وصف يوضح المشروع والعقد والنسبة
    // نُجزّئ الوصف لتفادي القوالب النصية المتداخلة (nested template literals)
    const contractLabelAr = contractNo ? ` - العقد ${contractNo}` : ''
    const contractLabelEn = contractNo ? ` - Contract ${contractNo}` : ''
    const notesLabelAr = notes ? ` - ${notes}` : ''
    const notesLabelEn = notes ? ` - ${notes}` : ''
    const itemDescription = lang === 'ar'
      ? `مستخلص رقم ${claimNo} - ${projectName}${contractLabelAr}${notesLabelAr}`
      : `Claim No. ${claimNo} - ${projectName}${contractLabelEn}${notesLabelEn}`

    const items = [
      {
        description: itemDescription,
        quantity: 1,
        unitPrice: amount,
        totalPrice: amount,
      },
    ]

    // ترويسة الجدول
    const descHeader = lang === 'ar' ? 'الوصف / Description' : 'Description'
    const qtyHeader = lang === 'ar' ? 'الكمية / Qty' : 'Qty'
    const unitPriceHeader = lang === 'ar' ? 'سعر الوحدة / Unit Price' : 'Unit Price'
    const totalHeader = lang === 'ar' ? 'الإجمالي / Total' : 'Total'

    // بنود الجدول
    const itemsRows = items.map((item, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${item.description}</td>
              <td style="text-align:center;">${item.quantity}</td>
              <td class="amount-cell">${fmtMoney(item.unitPrice, settings, lang)}</td>
              <td class="amount-cell">${fmtMoney(item.totalPrice, settings, lang)}</td>
            </tr>
          `).join('')

    const itemsTable = `
      <table class="doc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${descHeader}</th>
            <th>${qtyHeader}</th>
            <th class="amount-header">${unitPriceHeader} (${currency})</th>
            <th class="amount-header">${totalHeader} (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `

    // ─── المجاميع (المجموع الفرعي + ضريبة القيمة المضافة + الإجمالي) ───
    const subtotal = amount // مبلغ المستخلص قبل الضريبة
    const vatPct = vatRate * 100
    const subtotalLabel = lang === 'ar' ? 'المجموع الفرعي / Subtotal' : 'Subtotal'
    const vatLabel = lang === 'ar' ? `ضريبة القيمة المضافة ${vatPct}% / VAT ${vatPct}%` : `VAT ${vatPct}%`
    const grandTotalLabel = lang === 'ar' ? 'الإجمالي شامل الضريبة / Grand Total incl. VAT' : 'Grand Total incl. VAT'
    const totalRows = [
      { label: subtotalLabel, value: subtotal },
      { label: vatLabel, value: vatAmount },
      { label: grandTotalLabel, value: totalAmount, isGrand: true },
    ]

    const fmtMoneyFn = (v: number) => fmtMoney(v, settings, lang)
    const totalsHtml = totalsSection(totalRows, settings, lang, fmtMoneyFn)

    // ─── رمز QR لهيئة الزكاة والضريبة (ZATCA) ───
    const sellerName = lang === 'ar' ? settings.nameAr : settings.nameEn
    const vatNumber = settings.taxNumber || ''
    const invoiceDateStr = date ? new Date(date).toISOString().split('T')[0] : ''
    const totalStr = formatMoneyPrint(totalAmount)
    const vatTotalStr = formatMoneyPrint(vatAmount)
    const tlvBase64 = encodeZATCATLV(sellerName, vatNumber, invoiceDateStr, totalStr, vatTotalStr)
    const qrDataUrl = data.qrDataUrl as string | undefined

    // تجميع المجاميع و QR جنباً إلى جنب إذا كان هناك رقم ضريبي
    const totalsAndQrHtml = settings.taxNumber
      ? `
        <div class="doc-totals-qr-wrapper">
          ${totalsHtml}
          ${qrCodeSection(qrDataUrl, tlvBase64, settings, lang, 'doc')}
        </div>
        ${!qrDataUrl && settings.taxNumber ? qrCodeScript(tlvBase64, 'doc') : ''}
      `
      : totalsHtml

    // ─── تجميع كل الأقسام ───
    return `
      ${zatcaBanner}
      ${infoGrid}
      ${partiesHtml}
      ${progressBox}
      ${itemsTable}
      ${totalsAndQrHtml}
      ${amountInWordsSection(totalAmount, lang)}
      ${bankInfoSection(settings, lang)}
      ${termsSection(notes, settings, lang)}
      ${signaturesSection(settings, lang)}
    `
  },
}
