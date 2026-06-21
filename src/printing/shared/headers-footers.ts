// ============================================================================
// مولدات الهيدر والفوتر - Header & Footer Generators (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { PrintSettings } from './types'
import { getCurrencySymbol } from './utils'

// ============ Default Header ============

export function generateDefaultHeader(settings: PrintSettings, lang: 'ar' | 'en', docTitle: string, docSubtitle?: string): string {
  const currency = getCurrencySymbol(settings, lang)

  if (settings.headerImage) {
    return `<div class="custom-header"><img src="${settings.headerImage}" alt="Header" /></div>`
  }

  return `
    <div class="doc-header">
      ${settings.logoUrl ? `<img class="header-logo" src="${settings.logoUrl}" alt="Logo" />` : '<div class="header-logo" style="display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#047857;background:#f0fdf4;">ب</div>'}
      <div class="header-company">
        <div class="header-company-name">${lang === 'ar' ? settings.nameAr : settings.nameEn}</div>
        <div class="header-company-details">
          ${settings.taxNumber ? `<span>${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
          ${settings.commercialReg ? `<span>${lang === 'ar' ? 'س.ت' : 'CR'}: ${settings.commercialReg}</span>` : ''}
          ${settings.address ? `<span>${settings.address}</span>` : ''}
          ${settings.phone ? `<span>${settings.phone}</span>` : ''}
          ${settings.email ? `<span>${settings.email}</span>` : ''}
          ${settings.website ? `<span>${settings.website}</span>` : ''}
          <span>${currency}</span>
        </div>
      </div>
      <div class="header-doc-title-section">
        <div class="header-doc-title">${docTitle}</div>
        ${docSubtitle ? `<div class="header-doc-subtitle">${docSubtitle}</div>` : ''}
      </div>
    </div>
  `
}

// ============ Default Footer ============

export function generateDefaultFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
  if (settings.footerImage) {
    return `<div class="custom-footer"><img src="${settings.footerImage}" alt="Footer" /></div>`
  }

  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn
  return `
    <div class="doc-footer">
      <div class="company-info">
        <span>${companyName}</span>
        ${settings.address ? `<span>| ${settings.address}</span>` : ''}
        ${settings.phone ? `<span>| ${settings.phone}</span>` : ''}
        ${settings.email ? `<span>| ${settings.email}</span>` : ''}
        ${settings.taxNumber ? `<span>| ${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
      </div>
    </div>
  `
}

// ============ Rental Invoice Header ============

export function generateRentalInvoiceHeader(settings: PrintSettings, lang: 'ar' | 'en'): string {
  if (settings.headerImage) {
    return `<div class="ri-custom-header"><img src="${settings.headerImage}" alt="Header" /></div>`
  }

  return `
    <div class="ri-header">
      ${settings.logoUrl
        ? `<img class="ri-header-logo" src="${settings.logoUrl}" alt="Logo" />`
        : '<div class="ri-header-logo-placeholder">ب</div>'
      }
      <div class="ri-header-company">
        <div class="ri-header-company-name">${lang === 'ar' ? settings.nameAr : settings.nameEn}</div>
        <div class="ri-header-company-name-en">${lang === 'ar' ? settings.nameEn : settings.nameAr}</div>
        <div class="ri-header-details">
          ${settings.commercialReg ? `<span>${lang === 'ar' ? 'س.ت' : 'CR'}: ${settings.commercialReg}</span>` : ''}
          ${settings.taxNumber ? `<span>${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
          ${settings.address ? `<span>${settings.address}</span>` : ''}
          ${settings.phone ? `<span>${settings.phone}</span>` : ''}
          ${settings.email ? `<span>${settings.email}</span>` : ''}
        </div>
      </div>
      <div class="ri-header-title-box">
        <div class="ri-header-title">${lang === 'ar' ? 'فاتورة ضريبية' : 'Tax Invoice'}</div>
        <div class="ri-header-title-en">${lang === 'ar' ? 'Tax Invoice' : 'فاتورة ضريبية'}</div>
      </div>
    </div>
  `
}

// ============ Rental Invoice Footer ============

export function generateRentalInvoiceFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
  if (settings.footerImage) {
    return `<div class="ri-custom-footer"><img src="${settings.footerImage}" alt="Footer" /></div>`
  }

  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn
  return `
    <div class="ri-footer">
      <div class="company-info">
        <span>${companyName}</span>
        ${settings.address ? `<span>| ${settings.address}</span>` : ''}
        ${settings.phone ? `<span>| ${settings.phone}</span>` : ''}
        ${settings.email ? `<span>| ${settings.email}</span>` : ''}
        ${settings.taxNumber ? `<span>| ${lang === 'ar' ? 'ض.ر' : 'VAT'}: ${settings.taxNumber}</span>` : ''}
      </div>
    </div>
  `
}

// ============ Accounting Header (simple, clean) ============

export function generateAccountingHeader(settings: PrintSettings, lang: 'ar' | 'en', title: string, subtitle?: string): string {
  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn

  return `
    <div class="acct-header">
      <div class="acct-header-company">${companyName}</div>
      ${settings.taxNumber ? `<div style="font-size:8px;color:#64748b;">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT No'}: ${settings.taxNumber}</div>` : ''}
      ${settings.commercialReg ? `<div style="font-size:8px;color:#64748b;">${lang === 'ar' ? 'السجل التجاري' : 'CR'}: ${settings.commercialReg}</div>` : ''}
      <div class="acct-header-title">${title}</div>
      ${subtitle ? `<div class="acct-header-subtitle">${subtitle}</div>` : ''}
    </div>
  `
}

// ============ Accounting Footer ============

export function generateAccountingFooter(settings: PrintSettings, lang: 'ar' | 'en'): string {
  const companyName = lang === 'ar' ? settings.nameAr : settings.nameEn
  return `
    <div class="doc-footer">
      <div class="company-info">
        <span>${companyName}</span>
        ${settings.address ? `<span>| ${settings.address}</span>` : ''}
        ${settings.phone ? `<span>| ${settings.phone}</span>` : ''}
      </div>
    </div>
  `
}
