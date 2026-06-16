import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET /api/reports/project-profitability?projectId=...
// تقرير ربحية المشروع من مركز التكلفة - يجمع الإيرادات والتكاليف من القيود المحاسبية
export async function GET(request: Request) {
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

    const dateFilter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      dateFilter.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      }
    }

    // ========== الإيرادات من القيود المحاسبية ==========
    // إذا كان المشروع يملك مركز تكلفة، اجمع من القيود المرتبطة به
    let revenueFromJournal = 0
    let costFromJournal = 0

    if (project.costCenterId) {
      // إيرادات: بنود القيود الدائنة في حسابات الإيرادات (6xxx) المرتبطة بمركز التكلفة
      const revenueLines = await db.journalLine.findMany({
        where: {
          costCenterId: project.costCenterId,
          journalEntry: {
            status: 'POSTED',
            ...dateFilter,
          },
          account: {
            type: 'REVENUE',
          },
        },
        include: { account: true },
      })
      revenueFromJournal = revenueLines.reduce((sum, line) => sum + toNumber(line.credit) - toNumber(line.debit), 0)

      // تكاليف: بنود القيود المدينة في حسابات المصروفات (7xxx/8xxx) المرتبطة بمركز التكلفة
      const costLines = await db.journalLine.findMany({
        where: {
          costCenterId: project.costCenterId,
          journalEntry: {
            status: 'POSTED',
            ...dateFilter,
          },
          account: {
            type: 'EXPENSE',
          },
        },
        include: { account: true },
      })

      // تجميع التكاليف حسب نوع الحساب
      const costBreakdown: Record<string, { accountCode: string; accountName: string; amount: number }> = {}
      for (const line of costLines) {
        const code = line.account.code
        const key = code.substring(0, 4) // Group by first 4 digits
        if (!costBreakdown[key]) {
          costBreakdown[key] = { accountCode: code, accountName: line.account.nameAr || line.account.name, amount: 0 }
        }
        costBreakdown[key].amount += toNumber(line.debit) - toNumber(line.credit)
      }
      costFromJournal = Object.values(costBreakdown).reduce((sum, c) => sum + c.amount, 0)
    }

    // ========== الإيرادات من الفواتير (طريقة بديلة) ==========
    const salesInvoices = await db.salesInvoice.findMany({
      where: {
        projectId,
        status: { not: 'CANCELLED' },
        ...dateFilter,
      },
      select: { netAmount: true, vatAmount: true, totalAmount: true, paidAmount: true, invoiceNo: true, date: true },
    })
    const revenueFromInvoices = salesInvoices.reduce((s, i) => s + toNumber(i.netAmount), 0)
    const vatFromInvoices = salesInvoices.reduce((s, i) => s + toNumber(i.vatAmount), 0)
    const collectedFromInvoices = salesInvoices.reduce((s, i) => s + toNumber(i.paidAmount), 0)

    // ========== التكاليف التفصيلية (طريقة مباشرة) ==========
    // مواد
    const purchaseInvoices = await db.purchaseInvoice.findMany({
      where: { projectId, status: { not: 'CANCELLED' } },
      select: { subtotal: true },
    })
    const materials = purchaseInvoices.reduce((s, i) => s + toNumber(i.subtotal), 0)

    // مقاولو باطن
    const subInvoices = await db.subcontractorInvoice.findMany({
      where: { projectId, status: { not: 'CANCELLED' } },
      select: { amount: true },
    })
    const subcontractors = subInvoices.reduce((s, i) => s + toNumber(i.amount), 0)

    // رواتب
    const salaryRecords = await db.salary.findMany({
      where: { projectId, status: { in: ['APPROVED', 'PAID'] } },
      select: { netSalary: true },
    })
    const salaries = salaryRecords.reduce((s, sal) => s + toNumber(sal.netSalary), 0)

    // مصروفات
    const expenses = await db.expense.findMany({
      where: { projectId },
      select: { amount: true },
    })
    const projectExpenses = expenses.reduce((s, e) => s + toNumber(e.amount), 0)

    // تكاليف معدات
    const equipCosts = await db.equipmentCost.findMany({
      where: { projectId },
      select: { amount: true },
    })
    const equipmentCosts = equipCosts.reduce((s, e) => s + toNumber(e.amount), 0)

    // تكاليف عمالة
    const laborCosts = await db.laborCost.findMany({
      where: { projectId },
      select: { totalAmount: true },
    })
    const labor = laborCosts.reduce((s, l) => s + toNumber(l.totalAmount), 0)

    // وقود
    const fuelLogs = await db.equipmentFuelLog.findMany({
      where: { projectId },
      select: { totalCost: true },
    })
    const fuel = fuelLogs.reduce((s, f) => s + toNumber(f.totalCost), 0)

    // ========== قيمة العقد والمستخلصات ==========
    const contractValue = project.contracts
      .filter(c => c.status === 'ACTIVE' || c.status === 'DRAFT')
      .reduce((s, c) => s + toNumber(c.totalValue), 0)

    const progressClaims = await db.progressClaim.findMany({
      where: { projectId, status: { not: 'REJECTED' } },
      select: { amount: true, totalAmount: true, retentionAmount: true, advanceDeduction: true, netPayment: true },
    })
    const totalClaimed = progressClaims.reduce((s, c) => s + toNumber(c.amount), 0)
    const totalRetention = progressClaims.reduce((s, c) => s + toNumber(c.retentionAmount), 0)
    const totalAdvanceDeduction = progressClaims.reduce((s, c) => s + toNumber(c.advanceDeduction), 0)

    // ========== الحساب النهائي ==========
    const totalDirectCosts = materials + subcontractors + salaries + projectExpenses + equipmentCosts + labor + fuel
    const totalRevenue = revenueFromJournal > 0 ? revenueFromJournal : revenueFromInvoices
    const totalCost = costFromJournal > 0 ? costFromJournal : totalDirectCosts
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
        fromInvoices: revenueFromInvoices,
        vatCollected: vatFromInvoices,
        totalCollected: collectedFromInvoices,
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
        totalCost,
        grossProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        collectionRate: totalRevenue > 0 ? Math.round((collectedFromInvoices / (totalRevenue + vatFromInvoices)) * 10000) / 100 : 0,
        costToRevenueRatio: totalRevenue > 0 ? Math.round((totalCost / totalRevenue) * 10000) / 100 : 0,
      },
    })
  } catch (error) {
    console.error('[API] Project profitability report error:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير ربحية المشروع' }, { status: 500 })
  }
}
