import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { toNumber } from '@/lib/decimal'
import { getProjectCostBreakdown } from '@/lib/report-engine'
import { calculatePOC } from '@/lib/accounting/ifrs15'

// GET: Project Cost Sheet Report
// المصدر الحقيقي الوحيد: القيود اليومية المرحّلة (JournalEntry.status = 'POSTED')
// مع عرض القيمة التعاقدية والربح من بيانات العقد
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!projectId) {
      return NextResponse.json({ error: 'يرجى تحديد المشروع' }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { name: true, nameAr: true } },
        contracts: { select: { contractNo: true, totalValue: true, status: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    const range = (dateFrom || dateTo) ? {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(dateTo) : undefined,
    } : undefined

    // ===== المصدر الحقيقي: القيود المرحّلة عبر مركز التكلفة =====
    const gl = await getProjectCostBreakdown(projectId, range)

    // ===== تجميع التكاليف حسب الدور المحاسبي =====
    const r = (role: string) => gl.byRole.get(role) || 0

    const materials = r('PROJECT_COST')
    const subcontractors = r('SUBCONTRACTOR_COST')
    const labor = r('PAYROLL_EXPENSE')
    const salaries = r('PAYROLL_EXPENSE') // رواتب = نفس بند الأجور
    const equipmentFuel = r('FUEL_EXPENSE')
    const equipmentMaintenance = r('MAINTENANCE_EXPENSE')
    const equipmentOperations = r('DRIVER_EXPENSE') + r('TRANSPORT_EXPENSE') + r('RENTAL_DEPRECIATION')
    const projectExpenses = r('ADMIN_EXPENSE') + r('GOSI_EXPENSE') + r('DEPRECIATION_EXPENSE') + r('ZAKAT_EXPENSE') + r('OTHER')

    const totalCost = gl.total
    const revenueFromJournal = gl.revenue

    // ===== قيمة العقد من بيانات العقد (ليست تقريراً مالياً، بل قيمة تعاقدية) =====
    const contractValue = toNumber(project.contractValue) ||
      project.contracts
        .filter(c => c.status === 'ACTIVE' || c.status === 'DRAFT')
        .reduce((s, c) => s + toNumber(c.totalValue), 0)

    // ===== الإيراد المُفوتر (billed) من فواتير المبيعات =====
    const salesInvoices = await db.salesInvoice.findMany({
      where: {
        projectId,
        status: { not: 'CANCELLED' },
        ...(range && (range.from || range.to) && {
          date: {
            ...(range.from && { gte: range.from }),
            ...(range.to && { lte: range.to }),
          },
        }),
      },
      select: { netAmount: true },
    })
    const billedRevenue = salesInvoices.reduce((s, i) => s + toNumber(i.netAmount), 0)

    // ===== الإيراد المكتسب (POC) — IFRS 15 =====
    // استبدلنا الـ fallback القديم (contractValue كإيراد) بحساب POC الصحيح
    const asOfDate = range?.to ?? new Date()
    let earnedRevenue = 0
    let percentComplete = 0
    let estimatedTotalCost = toNumber(project.estimatedTotalCost) || contractValue
    let pocContractValue = contractValue
    try {
      const poc = await calculatePOC(project.id, asOfDate)
      earnedRevenue = poc.revenueToDate
      percentComplete = poc.percentComplete
      estimatedTotalCost = poc.totalEstimatedCost || estimatedTotalCost
      pocContractValue = poc.contractValue || contractValue
    } catch (err) {
      // fallback: استخدم إيراد GL لو فشل calculatePOC (لا نستخدم contractValue كإيراد)
      console.error('[API] project-costs calculatePOC failed:', err)
      earnedRevenue = revenueFromJournal
    }

    // ===== الربح = الإيراد المكتسب − التكلفة الإجمالية (IFRS 15 compliant) =====
    const grossProfit = earnedRevenue - totalCost
    const profitMargin = earnedRevenue > 0 ? (grossProfit / earnedRevenue) * 100 : 0

    // ===== الضريبة من القيود المرحّلة =====
    const vatInput = await getProjectVAT(projectId, range, 'VAT_INPUT')
    const inputVat = vatInput

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        status: project.status,
        clientName: project.client.nameAr || project.client.name,
        contractValue: pocContractValue,
      },
      costs: {
        materials,
        equipmentOperations,
        equipmentMaintenance,
        equipmentFuel,
        subcontractors,
        labor,
        salaries,
        projectExpenses,
        equipmentCosts: 0, // مُدمج في equipmentOperations
        equipmentUsages: 0, // مُدمج في equipmentOperations
      },
      totalCost,
      contractValue: pocContractValue,
      estimatedTotalCost,
      // الإيراد المُفوتر من الفواتير
      billedRevenue,
      // الإيراد المكتسب وفق IFRS 15 (POC)
      earnedRevenue,
      percentComplete: Math.round(percentComplete * 10000) / 100,
      revenueFromJournal,
      grossProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      inputVat,
      costCenterId: gl.costCenterId,
      source: 'ifrs15-poc',
    })
  } catch (error) {
    console.error('Error generating project cost report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير تكاليف المشروع' }, { status: 500 })
  }
}

/** احسب ضريبة المدخلات/المخرجات للمشروع من القيود المرحّلة */
async function getProjectVAT(
  projectId: string,
  range: { from?: Date; to?: Date } | undefined,
  role: 'VAT_INPUT' | 'VAT_OUTPUT'
): Promise<number> {
  const ccMap = await db.costCenter.findFirst({
    where: { code: { equals: (await db.project.findUnique({ where: { id: projectId }, select: { code: true } }))?.code } },
    select: { id: true },
  })
  if (!ccMap) return 0

  const accounts = await db.account.findMany({
    where: { accountRole: role, isActive: true },
    select: { id: true, type: true },
  })
  if (accounts.length === 0) return 0

  const agg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      deletedAt: null,
      accountId: { in: accounts.map(a => a.id) },
      costCenterId: ccMap.id,
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

  const d = toNumber(agg._sum.debit)
  const c = toNumber(agg._sum.credit)
  // VAT_INPUT is ASSET (debit normal), VAT_OUTPUT is LIABILITY (credit normal)
  return role === 'VAT_INPUT' ? (d - c) : (c - d)
}
