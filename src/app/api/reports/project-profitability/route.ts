import { requireAuthApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { calculatePOC } from '@/lib/accounting/ifrs15'
import { getProjectCostBreakdown, getBalanceByRole } from '@/lib/accounting/queries'
import { AccountRole } from '@/lib/account-roles'

// GET /api/reports/project-profitability?projectId=...
// تقرير ربحية المشروع — المصدر الموحّد: القيود اليومية المرحّلة فقط
// (JournalLine WHERE journalEntry.status='POSTED' AND deletedAt IS NULL)
//
// ⚠️  SSOT (P1-1-FIX / C2-C11): تم استبدال جميع المجاميع التشغيلية
//    (salesInvoice / purchaseInvoice / subcontractorInvoice / salary / expense
//     / equipmentCost / laborCost / equipmentFuelLog / progressClaim totals)
//    بقيم مشتقّة من JournalLine عبر `getProjectCostBreakdown`. لا يوجد
//    dual-source fallback بعد الآن — دائماً نستخدم القيمة من JournalLine.
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!projectId) {
      return NextResponse.json({ error: 'معرف المشروع مطلوب' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { name: true, nameAr: true } },
        costCenter: true,
        contracts: { select: { contractNo: true, totalValue: true, status: true, retentionPercent: true, advancePaymentPercent: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    // ===== المصدر الموحّد: getProjectCostBreakdown (JournalLine POSTED) =====
    const breakdown = await getProjectCostBreakdown(projectId, range)
    const role = (key: string): number => breakdown.byRole.get(key) || 0

    // ===== التكاليف حسب الدور المحاسبي =====
    const materials = role('PROJECT_COST')
    const subcontractors = role('SUBCONTRACTOR_COST')
    const salaries = role('PAYROLL_EXPENSE')
    const labor = role('PAYROLL_EXPENSE') // labor = نفس بند الأجور
    const projectExpenses =
      role('ADMIN_EXPENSE') +
      role('GOSI_EXPENSE') +
      role('DEPRECIATION_EXPENSE') +
      role('ZAKAT_EXPENSE') +
      role('OTHER')
    const equipmentCosts =
      role('FUEL_EXPENSE') +
      role('MAINTENANCE_EXPENSE') +
      role('DRIVER_EXPENSE') +
      role('TRANSPORT_EXPENSE') +
      role('RENTAL_DEPRECIATION')
    const fuel = role('FUEL_EXPENSE')

    const totalDirectCosts = breakdown.total
    const totalCost = breakdown.total // دائماً من JournalLine — لا fallback

    // ===== الإيرادات والضريبة من JournalLine =====
    const revenueFromJournal = breakdown.revenue
    const costFromJournal = breakdown.total

    // VAT من القيود المحاسبية على مركز تكلفة المشروع (SSOT)
    // (تُجمَع ضريبة المخرجات/المدخلات من حسابات VAT_OUTPUT/VAT_INPUT على CC)
    let vatCollected = 0
    let totalCollected = 0
    try {
      const ccId = breakdown.costCenterId
      if (ccId) {
        const vatOutputAccounts = await db.account.findMany({
          where: { accountRole: AccountRole.VAT_OUTPUT, isActive: true },
          select: { id: true },
        })
        if (vatOutputAccounts.length > 0) {
          const vatAgg = await db.journalLine.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              deletedAt: null,
              accountId: { in: vatOutputAccounts.map(a => a.id) },
              costCenterId: ccId,
              journalEntry: {
                status: 'POSTED',
                deletedAt: null,
                ...(range && (range.from || range.to) && {
                  date: {
                    ...(range.from && { gte: range.from }),
                    ...(range.to && { lte: range.to }),
                  },
                }),
              },
            },
          })
          // VAT_OUTPUT is LIABILITY (credit normal)
          vatCollected = toNumber(vatAgg._sum.credit) - toNumber(vatAgg._sum.debit)
        }

        // التحصيل = دائن CUSTOMER_AR على مركز تكلفة المشروع
        const collectedAR = await getBalanceByRole(
          [AccountRole.CUSTOMER_AR],
          range,
        )
        // ملاحظة: getBalanceByRole يُرجع الرصيد الموقّع لكل النظام. للحصول على
        // تحصيل المشروع نحتاج إلى تجميع الائتمان على CC المحدد. نُجمّع يدوياً:
        const arAccounts = await db.account.findMany({
          where: { accountRole: AccountRole.CUSTOMER_AR, isActive: true },
          select: { id: true },
        })
        if (arAccounts.length > 0) {
          const arAgg = await db.journalLine.aggregate({
            _sum: { credit: true },
            where: {
              deletedAt: null,
              accountId: { in: arAccounts.map(a => a.id) },
              costCenterId: ccId,
              journalEntry: {
                status: 'POSTED',
                deletedAt: null,
                ...(range && (range.from || range.to) && {
                  date: {
                    ...(range.from && { gte: range.from }),
                    ...(range.to && { lte: range.to }),
                  },
                }),
              },
            },
          })
          totalCollected = toNumber(arAgg._sum.credit)
        }
        void collectedAR // غير مُستخدم مباشرة (التحصيل يُحتسب على مستوى CC)
      }
    } catch (err) {
      console.error('[API] project-profitability VAT/AR aggregation failed:', err)
    }

    // ===== قيمة العقد والمستخلصات (بيانات تعاقدية - ليست مالية) =====
    const contractValue = project.contracts
      .filter(c => c.status === 'ACTIVE' || c.status === 'DRAFT')
      .reduce((s, c) => s + toNumber(c.totalValue), 0)

    // المستخلصات كمؤشرات تعاقدية (وليست إيراداً مالياً)
    const progressClaims = await db.progressClaim.findMany({
      where: { projectId, status: { not: 'REJECTED' } },
      select: { amount: true, totalAmount: true, retentionAmount: true, advanceDeduction: true },
    })
    const totalClaimed = progressClaims.reduce((s, c) => s + toNumber(c.amount), 0)
    const totalRetention = progressClaims.reduce((s, c) => s + toNumber(c.retentionAmount), 0)
    const totalAdvanceDeduction = progressClaims.reduce((s, c) => s + toNumber(c.advanceDeduction), 0)

    // ===== الإيراد المُفوتر من JournalLine (CUSTOMER_AR مدين على CC) =====
    let billedRevenue = 0
    try {
      const ccId = breakdown.costCenterId
      if (ccId) {
        const arAccounts = await db.account.findMany({
          where: { accountRole: AccountRole.CUSTOMER_AR, isActive: true },
          select: { id: true },
        })
        if (arAccounts.length > 0) {
          const arAgg = await db.journalLine.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              deletedAt: null,
              accountId: { in: arAccounts.map(a => a.id) },
              costCenterId: ccId,
              journalEntry: {
                status: 'POSTED',
                deletedAt: null,
                ...(range && (range.from || range.to) && {
                  date: {
                    ...(range.from && { gte: range.from }),
                    ...(range.to && { lte: range.to }),
                  },
                }),
              },
            },
          })
          // AR is ASSET (debit normal): المدين = فوترة، الدائن = تحصيل
          billedRevenue = toNumber(arAgg._sum.debit) - toNumber(arAgg._sum.credit)
          if (billedRevenue < 0) billedRevenue = 0
        }
      }
    } catch (err) {
      console.error('[API] project-profitability billed revenue aggregation failed:', err)
    }

    // ===== الإيراد المكتسب (POC) — IFRS 15 =====
    const asOfDate = dateTo ? new Date(dateTo) : new Date()
    let earnedRevenue = 0
    let percentComplete = 0
    let pocContractValue = 0
    let estimatedTotalCost = 0
    let pocGrossProfit = 0
    let pocGrossProfitPercent = 0
    try {
      const poc = await calculatePOC(project.id, asOfDate)
      earnedRevenue = poc.revenueToDate
      percentComplete = poc.percentComplete
      pocContractValue = poc.contractValue
      estimatedTotalCost = poc.totalEstimatedCost
      pocGrossProfit = poc.grossProfitToDate
      pocGrossProfitPercent = poc.grossProfitPercent
    } catch (err) {
      // fallback: استخدم إيراد GL (لا نستخدم billedRevenue كـ fallback مالي)
      console.error('[API] project-profitability calculatePOC failed:', err)
      earnedRevenue = revenueFromJournal
      pocContractValue = toNumber(project.contractValue) || contractValue
      estimatedTotalCost = toNumber(project.estimatedTotalCost) || pocContractValue
    }

    // الإيراد الإجمالي للربحية = الإيراد المكتسب (POC-based) — IFRS 15 compliant
    const totalRevenue = earnedRevenue
    const grossProfit = totalRevenue - totalCost
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        status: project.status,
        clientName: project.client.nameAr || project.client.name,
        costCenter: project.costCenter ? { id: project.costCenter.id, code: project.costCenter.code, name: project.costCenter.name } : null,
        contractValue,
      },
      revenue: {
        fromJournalEntries: revenueFromJournal,
        fromInvoices: billedRevenue, // الآن من GL (CUSTOMER_AR مدين على CC)
        // IFRS 15 — الإيراد المكتسب وفق نسبة الإنجاز
        earnedRevenue,
        billedRevenue,
        percentComplete: Math.round(percentComplete * 10000) / 100,
        pocContractValue,
        estimatedTotalCost,
        pocGrossProfit,
        pocGrossProfitPercent: Math.round(pocGrossProfitPercent * 100) / 100,
        vatCollected,
        totalCollected,
        totalClaimed,
        totalRetention,
        totalAdvanceDeduction,
      },
      costs: {
        fromJournalEntries: costFromJournal,
        direct: {
          materials,
          subcontractors,
          salaries,
          projectExpenses,
          equipmentCosts,
          labor,
          fuel,
        },
        totalDirect: totalDirectCosts,
      },
      summary: {
        totalRevenue,
        earnedRevenue,
        billedRevenue,
        percentComplete: Math.round(percentComplete * 10000) / 100,
        contractValue: pocContractValue || contractValue,
        estimatedTotalCost,
        totalCost,
        grossProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        collectionRate: totalRevenue > 0 ? Math.round((totalCollected / (totalRevenue + vatCollected)) * 10000) / 100 : 0,
        costToRevenueRatio: totalRevenue > 0 ? Math.round((totalCost / totalRevenue) * 10000) / 100 : 0,
        revenueSource: 'ifrs15-poc',
        costSource: 'posted-journal-entries',
      },
    })
  } catch (error) {
    console.error('[API] Project profitability report error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير ربحية المشروع' }, { status: 500 })
  }
}
