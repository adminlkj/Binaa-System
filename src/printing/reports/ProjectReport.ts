// ============================================================================
// قالب كشف مشروع - Project Report Template (Professional ERP)
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

import type { DocumentTemplate, PrintSettings } from '../shared/types'
import { fmtMoney, formatDate, getCurrencySymbol } from '../shared/utils'
import { getDefaultCSS } from '../shared/css'

export const template: DocumentTemplate = {
  category: 'report',

  requiresQR: false,
  requiresSignature: false,
  requiresBankInfo: false,
  requiresAmountInWords: false,
  hasCustomHeader: false,
  hasCustomFooter: false,

  getCSS(lang: 'ar' | 'en'): string {
    return getDefaultCSS(lang) + `
      .report-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin: 10px 0;
      }
      .report-kpi-card {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 8px 10px;
        text-align: center;
      }
      .report-kpi-label {
        font-size: 8px;
        font-weight: 600;
        color: #6b7280;
        margin-bottom: 4px;
      }
      .report-kpi-value {
        font-size: 12px;
        font-weight: 800;
        color: #1e293b;
      }
      .report-kpi-value.positive { color: #059669; }
      .report-kpi-value.negative { color: #dc2626; }
      .report-progress-bar {
        width: 100%;
        height: 6px;
        background: #e5e7eb;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 4px;
      }
      .report-progress-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.3s ease;
      }
      .report-category-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid #f3f4f6;
        font-size: 10px;
      }
      .report-category-row:last-child {
        border-bottom: none;
      }
      .report-category-name {
        font-weight: 600;
        color: #374151;
      }
      .report-category-amount {
        font-family: 'Inter', 'Cairo', sans-serif;
        font-weight: 700;
        direction: ltr;
      }
      .report-status-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 8px;
        font-weight: 700;
      }
      .report-status-active { background: #ecfdf5; color: #065f46; }
      .report-status-completed { background: #eff6ff; color: #1e40af; }
      .report-status-pending { background: #fffbeb; color: #92400e; }
      .report-status-cancelled { background: #fef2f2; color: #991b1b; }
    `
  },

  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string {
    const projectName = (data.projectName as string) || ''
    const projectCode = (data.projectCode as string) || ''
    const clientName = (data.clientName as string) || ''
    const contractValue = (data.contractValue as number) || 0
    const status = (data.status as string) || 'ACTIVE'
    const currency = getCurrencySymbol(settings, lang)

    // Financial summary
    const revenue = (data.revenue as number) || 0
    const costs = (data.costs as number) || 0
    const margin = (data.margin as number) || (revenue - costs)
    const marginPercentage = revenue > 0 ? ((margin / revenue) * 100) : 0
    const progressPercentage = (data.progressPercentage as number) || 0

    // Cost breakdown
    const costBreakdown = (data.costBreakdown as Array<{ category: string; categoryAr?: string; categoryEn?: string; amount: number; percentage?: number }>) || []
    const materialsCost = (data.materialsCost as number) || 0
    const laborCost = (data.laborCost as number) || 0
    const equipmentCost = (data.equipmentCost as number) || 0
    const subcontractsCost = (data.subcontractsCost as number) || 0
    const otherCost = (data.otherCost as number) || 0

    // Progress claims
    const totalClaimed = (data.totalClaimed as number) || 0
    const totalApproved = (data.totalApproved as number) || 0
    const totalPaid = (data.totalPaid as number) || 0
    const outstandingAmount = (data.outstandingAmount as number) || (totalApproved - totalPaid)

    // Receivables
    const totalReceivable = (data.totalReceivable as number) || 0
    const overdueAmount = (data.overdueAmount as number) || 0

    // Dates
    const startDate = data.startDate as string | undefined
    const endDate = data.endDate as string | undefined

    // Labels
    const lbl = lang === 'ar' ? {
      projectInfo: 'بيانات المشروع / Project Information',
      projectName: 'اسم المشروع',
      projectCode: 'كود المشروع',
      clientName: 'العميل',
      contractValue: 'قيمة العقد',
      status: 'الحالة',
      financialSummary: 'الملخص المالي / Financial Summary',
      revenue: 'الإيرادات',
      costs: 'التكاليف',
      margin: 'الربح',
      marginPercentage: 'نسبة الربح',
      progress: 'نسبة الإنجاز',
      costBreakdown: 'تفصيل التكاليف / Cost Breakdown',
      materials: 'مواد',
      labor: 'عمالة',
      equipment: 'معدات',
      subcontracts: 'مقاولين من الباطن',
      other: 'أخرى',
      progressClaims: 'المستخلصات / Progress Claims',
      totalClaimed: 'إجمالي المطالبات',
      totalApproved: 'إجمالي المعتمد',
      totalPaid: 'إجمالي المدفوع',
      outstanding: 'المستحق',
      receivables: 'المستحقات / Receivables',
      totalReceivable: 'إجمالي المستحقات',
      overdue: 'متأخرات',
      duration: 'المدة / Duration',
      startDate: 'تاريخ البداية',
      endDate: 'تاريخ النهاية',
      amount: 'المبلغ',
      percentage: 'النسبة',
    } : {
      projectInfo: 'Project Information',
      projectName: 'Project Name',
      projectCode: 'Project Code',
      clientName: 'Client',
      contractValue: 'Contract Value',
      status: 'Status',
      financialSummary: 'Financial Summary',
      revenue: 'Revenue',
      costs: 'Costs',
      margin: 'Margin',
      marginPercentage: 'Margin %',
      progress: 'Progress',
      costBreakdown: 'Cost Breakdown',
      materials: 'Materials',
      labor: 'Labor',
      equipment: 'Equipment',
      subcontracts: 'Subcontracts',
      other: 'Other',
      progressClaims: 'Progress Claims',
      totalClaimed: 'Total Claimed',
      totalApproved: 'Total Approved',
      totalPaid: 'Total Paid',
      outstanding: 'Outstanding',
      receivables: 'Receivables',
      totalReceivable: 'Total Receivable',
      overdue: 'Overdue',
      duration: 'Duration',
      startDate: 'Start Date',
      endDate: 'End Date',
      amount: 'Amount',
      percentage: '%',
    }

    // Status badge
    const statusMap: Record<string, { ar: string; en: string; cls: string }> = {
      'ACTIVE': { ar: 'نشط', en: 'Active', cls: 'report-status-active' },
      'COMPLETED': { ar: 'مكتمل', en: 'Completed', cls: 'report-status-completed' },
      'PENDING': { ar: 'في الانتظار', en: 'Pending', cls: 'report-status-pending' },
      'CANCELLED': { ar: 'ملغي', en: 'Cancelled', cls: 'report-status-cancelled' },
      'DRAFT': { ar: 'مسودة', en: 'Draft', cls: 'report-status-pending' },
    }
    const statusInfo = statusMap[status] || statusMap['ACTIVE']
    const statusText = lang === 'ar' ? statusInfo.ar : statusInfo.en

    // Build cost breakdown items
    const defaultCostBreakdown = [
      { category: 'materials', categoryAr: lbl.materials, categoryEn: lbl.materials, amount: materialsCost },
      { category: 'labor', categoryAr: lbl.labor, categoryEn: lbl.labor, amount: laborCost },
      { category: 'equipment', categoryAr: lbl.equipment, categoryEn: lbl.equipment, amount: equipmentCost },
      { category: 'subcontracts', categoryAr: lbl.subcontracts, categoryEn: lbl.subcontracts, amount: subcontractsCost },
      { category: 'other', categoryAr: lbl.other, categoryEn: lbl.other, amount: otherCost },
    ]
    const breakdownItems = costBreakdown.length > 0 ? costBreakdown : defaultCostBreakdown.filter(c => c.amount > 0)

    return `
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
        <div class="info-item">
          <div class="info-label">${lbl.clientName}</div>
          <div class="info-value">${clientName}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.contractValue}</div>
          <div class="info-value">${fmtMoney(contractValue, settings, lang)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">${lbl.status}</div>
          <div class="info-value"><span class="report-status-badge ${statusInfo.cls}">${statusText}</span></div>
        </div>
        ${startDate ? `<div class="info-item">
          <div class="info-label">${lbl.startDate}</div>
          <div class="info-value">${formatDate(startDate, lang)}</div>
        </div>` : ''}
        ${endDate ? `<div class="info-item">
          <div class="info-label">${lbl.endDate}</div>
          <div class="info-value">${formatDate(endDate, lang)}</div>
        </div>` : ''}
      </div>

      <!-- Financial Summary KPIs -->
      <div class="section-title">${lbl.financialSummary}</div>
      <div class="report-kpi-grid">
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.revenue} (${currency})</div>
          <div class="report-kpi-value">${fmtMoney(revenue, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.costs} (${currency})</div>
          <div class="report-kpi-value">${fmtMoney(costs, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.margin} (${currency})</div>
          <div class="report-kpi-value ${margin >= 0 ? 'positive' : 'negative'}">${fmtMoney(margin, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.marginPercentage}</div>
          <div class="report-kpi-value ${marginPercentage >= 0 ? 'positive' : 'negative'}">${marginPercentage.toFixed(1)}${lbl.percentage}</div>
        </div>
      </div>

      <!-- Progress Bar -->
      ${progressPercentage > 0 ? `
      <div style="margin:8px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:9px;font-weight:600;color:#374151;">${lbl.progress}</span>
          <span style="font-size:10px;font-weight:800;color:#059669;">${progressPercentage.toFixed(1)}${lbl.percentage}</span>
        </div>
        <div class="report-progress-bar">
          <div class="report-progress-fill" style="width:${Math.min(progressPercentage, 100)}%;background:${progressPercentage >= 80 ? '#059669' : progressPercentage >= 50 ? '#d97706' : '#6b7280'};"></div>
        </div>
      </div>
      ` : ''}

      <!-- Cost Breakdown -->
      ${breakdownItems.length > 0 ? `
      <div class="section-title">${lbl.costBreakdown}</div>
      <table class="doc-table" style="margin-top:6px;">
        <thead>
          <tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'البيان / Category' : 'Category'}</th>
            <th class="amount-header">${lbl.amount} (${currency})</th>
            <th class="amount-header">${lbl.percentage}</th>
          </tr>
        </thead>
        <tbody>
          ${breakdownItems.map((item, i) => {
            const name = lang === 'ar' ? (item.categoryAr || item.category) : (item.categoryEn || item.category)
            const pct = costs > 0 ? ((item.amount / costs) * 100).toFixed(1) : '0.0'
            return `
              <tr>
                <td class="row-num">${i + 1}</td>
                <td>${name}</td>
                <td class="amount-cell">${fmtMoney(item.amount, settings, lang)}</td>
                <td style="text-align:center;">${pct}${lbl.percentage}</td>
              </tr>
            `
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>${lang === 'ar' ? 'إجمالي التكاليف / Total Costs' : 'Total Costs'}</strong></td>
            <td class="amount-cell"><strong>${fmtMoney(costs, settings, lang)}</strong></td>
            <td style="text-align:center;"><strong>100${lbl.percentage}</strong></td>
          </tr>
        </tfoot>
      </table>
      ` : ''}

      <!-- Progress Claims Summary -->
      <div class="section-title">${lbl.progressClaims}</div>
      <div class="report-kpi-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.totalClaimed} (${currency})</div>
          <div class="report-kpi-value">${fmtMoney(totalClaimed, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.totalApproved} (${currency})</div>
          <div class="report-kpi-value">${fmtMoney(totalApproved, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.totalPaid} (${currency})</div>
          <div class="report-kpi-value" style="color:#059669;">${fmtMoney(totalPaid, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.outstanding} (${currency})</div>
          <div class="report-kpi-value" style="color:${outstandingAmount > 0 ? '#dc2626' : '#059669'};">${fmtMoney(outstandingAmount, settings, lang)}</div>
        </div>
      </div>

      <!-- Receivables Status -->
      ${(totalReceivable > 0 || overdueAmount > 0) ? `
      <div class="section-title">${lbl.receivables}</div>
      <div class="report-kpi-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.totalReceivable} (${currency})</div>
          <div class="report-kpi-value">${fmtMoney(totalReceivable, settings, lang)}</div>
        </div>
        <div class="report-kpi-card">
          <div class="report-kpi-label">${lbl.overdue} (${currency})</div>
          <div class="report-kpi-value" style="color:${overdueAmount > 0 ? '#dc2626' : '#059669'};">${fmtMoney(overdueAmount, settings, lang)}</div>
        </div>
      </div>
      ` : ''}
    `
  },
}
