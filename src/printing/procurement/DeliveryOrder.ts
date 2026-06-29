// ============================================================================
// قالب أمر التسليم - Delivery Order Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate } from '../shared/types'
import { getDefaultCSS } from '../shared/css'
import { formatDate } from '../shared/utils'
import { signaturesSection } from '../shared/sections'

export const template: DocumentTemplate = {
  category: 'procurement',
  requiresQR: false,
  requiresSignature: true,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang) {
    return getDefaultCSS(lang)
  },

  getBody(data, settings, lang) {
    return `
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'رقم الأمر / Order No' : 'Order No'}</div>
          <div class="info-value">${data.orderNo || data.id || '—'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'تاريخ التوصيل / Delivery Date' : 'Delivery Date'}</div>
          <div class="info-value">${formatDate(data.deliveryDate, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'تاريخ الإرجاع / Return Date' : 'Return Date'}</div>
          <div class="info-value">${data.returnDate ? formatDate(data.returnDate, lang) : '—'}</div>
        </div>
        ${data.projectName ? `<div class="info-item">
          <div class="info-label">${lang === 'ar' ? 'المشروع / Project' : 'Project'}</div>
          <div class="info-value">${data.projectName}</div>
        </div>` : ''}
      </div>

      <div class="parties-section">
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'بيانات المعدة / Equipment' : 'Equipment'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'المعدة / Equipment' : 'Equipment'}</span><span class="value">${data.equipmentName || data.equipmentNameAr || '—'}</span></div>
          ${data.equipmentCode ? `<div class="party-card-row"><span class="label">${lang === 'ar' ? 'الكود / Code' : 'Code'}</span><span class="value">${data.equipmentCode}</span></div>` : ''}
        </div>
        <div class="party-card">
          <div class="party-card-title">${lang === 'ar' ? 'العميل / Client' : 'Client'}</div>
          <div class="party-card-row"><span class="label">${lang === 'ar' ? 'الاسم / Name' : 'Name'}</span><span class="value">${data.clientName || '—'}</span></div>
        </div>
      </div>

      ${data.site ? `
      <div class="rental-equipment-section">
        <div class="section-title">${lang === 'ar' ? 'بيانات الموقع / Site Info' : 'Site Info'}</div>
        <div class="info-grid">
          ${data.site ? `<div class="info-item">
            <div class="info-label">${lang === 'ar' ? 'الموقع / Site' : 'Site'}</div>
            <div class="info-value">${data.site}</div>
          </div>` : ''}
        </div>
      </div>` : ''}

      ${data.notes ? `
      <div class="terms-section">
        <div class="terms-title">${lang === 'ar' ? 'ملاحظات / Notes' : 'Notes'}</div>
        ${data.notes}
      </div>` : ''}

      ${signaturesSection(settings, lang)}
    `
  },
}
