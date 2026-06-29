import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// Helper: round to 4 decimal places
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

// GET /api/account-statement/project?projectId=...&dateFrom=...&dateTo=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')

    if (!projectId) {
      return NextResponse.json(
        { error: 'معرف المشروع مطلوب (projectId)' },
        { status: 400 }
      )
    }

    // Get project info
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        contractValue: true,
        status: true,
        client: {
          select: { id: true, name: true, nameAr: true, code: true },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'المشروع غير موجود' },
        { status: 404 }
      )
    }

    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    const dateFilter: Prisma.DateTimeFilter = {}
    if (dateFrom || dateTo) {
      if (dateFrom) dateFilter.gte = dateFrom
      if (dateTo) dateFilter.lte = dateTo
    }

    // ---- REVENUE ----

    // Sales Invoices for this project
    const invoiceWhere: Prisma.SalesInvoiceWhereInput = {
      projectId,
      status: { not: 'CANCELLED' },
    }
    if (Object.keys(dateFilter).length > 0) {
      invoiceWhere.date = dateFilter
    }

    const salesInvoices = await db.salesInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        totalAmount: true,
        netAmount: true,
        vatAmount: true,
        paidAmount: true,
        status: true,
        invoiceType: true,
      },
      orderBy: { date: 'asc' },
    })

    // Progress Claims for this project
    const claimWhere: Prisma.ProgressClaimWhereInput = {
      projectId,
    }
    if (Object.keys(dateFilter).length > 0) {
      claimWhere.date = dateFilter
    }

    const progressClaims = await db.progressClaim.findMany({
      where: claimWhere,
      select: {
        id: true,
        claimNo: true,
        date: true,
        totalAmount: true,
        amount: true,
        vatAmount: true,
        percentage: true,
        status: true,
      },
      orderBy: { date: 'asc' },
    })

    // Client payments linked to this project's invoices
    const invoiceIds = salesInvoices.map(i => i.id)
    const clientPayments = invoiceIds.length > 0
      ? await db.clientPayment.findMany({
          where: {
            invoiceId: { in: invoiceIds },
          },
          select: {
            id: true,
            amount: true,
            date: true,
            reference: true,
          },
          orderBy: { date: 'asc' },
        })
      : []

    const totalInvoiced = r4(salesInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0))
    const totalCollected = r4(clientPayments.reduce((s, p) => s + Number(p.amount || 0), 0))

    // ---- COSTS ----

    // Purchase Invoices for this project
    const piWhere: Prisma.PurchaseInvoiceWhereInput = {
      projectId,
      status: { not: 'CANCELLED' },
    }
    if (Object.keys(dateFilter).length > 0) {
      piWhere.date = dateFilter
    }

    const purchaseInvoices = await db.purchaseInvoice.findMany({
      where: piWhere,
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        totalAmount: true,
        expenseCategory: true,
        activityType: true,
      },
      orderBy: { date: 'asc' },
    })

    // Expenses for this project
    const expenseWhere: Prisma.ExpenseWhereInput = {
      projectId,
    }
    if (Object.keys(dateFilter).length > 0) {
      expenseWhere.date = dateFilter
    }

    const expenses = await db.expense.findMany({
      where: expenseWhere,
      select: {
        id: true,
        date: true,
        amount: true,
        totalAmount: true,
        category: true,
        description: true,
        activityType: true,
      },
      orderBy: { date: 'asc' },
    })

    // Subcontractor Invoices for this project
    const sciWhere: Prisma.SubcontractorInvoiceWhereInput = {
      projectId,
      status: { not: 'CANCELLED' },
    }
    if (Object.keys(dateFilter).length > 0) {
      sciWhere.date = dateFilter
    }

    const subcontractorInvoices = await db.subcontractorInvoice.findMany({
      where: sciWhere,
      select: {
        id: true,
        invoiceNo: true,
        date: true,
        totalAmount: true,
        amount: true,
      },
      orderBy: { date: 'asc' },
    })

    // Equipment Costs for this project
    const eqCostWhere: Prisma.EquipmentCostWhereInput = {
      projectId,
    }
    if (Object.keys(dateFilter).length > 0) {
      eqCostWhere.date = dateFilter
    }

    const equipmentCosts = await db.equipmentCost.findMany({
      where: eqCostWhere,
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
      },
      orderBy: { date: 'asc' },
    })

    // Labor Costs for this project
    const laborWhere: Prisma.LaborCostWhereInput = {
      projectId,
    }
    if (Object.keys(dateFilter).length > 0) {
      laborWhere.date = dateFilter
    }

    const laborCosts = await db.laborCost.findMany({
      where: laborWhere,
      select: {
        id: true,
        date: true,
        totalAmount: true,
        description: true,
      },
      orderBy: { date: 'asc' },
    })

    // Salaries for this project
    const salaryWhere: Prisma.SalaryWhereInput = {
      projectId,
      status: { not: 'DRAFT' },
    }

    const salaries = await db.salary.findMany({
      where: salaryWhere,
      select: {
        id: true,
        month: true,
        year: true,
        basicSalary: true,
        housingAllowance: true,
        transportAllowance: true,
        otherAllowances: true,
        overtimeAmount: true,
        netSalary: true,
      },
    })

    // Fuel logs for this project
    const fuelWhere: Prisma.EquipmentFuelLogWhereInput = {
      projectId,
    }
    if (Object.keys(dateFilter).length > 0) {
      fuelWhere.date = dateFilter
    }

    const fuelLogs = await db.equipmentFuelLog.findMany({
      where: fuelWhere,
      select: {
        id: true,
        date: true,
        totalCost: true,
      },
    })

    // Equipment Maintenance (linked via equipment used in project)
    const equipmentUsages = await db.equipmentUsage.findMany({
      where: { projectId },
      select: { equipmentId: true },
    })
    const equipmentIds = [...new Set(equipmentUsages.map(e => e.equipmentId))]

    // Categorize costs
    const materialsCost = r4(purchaseInvoices
      .filter(pi => !pi.expenseCategory || ['CONSUMABLES', 'SERVICES'].includes(pi.expenseCategory))
      .reduce((s, pi) => s + Number(pi.totalAmount || 0), 0))

    const equipmentCostTotal = r4(equipmentCosts.reduce((s, e) => s + Number(e.amount || 0), 0))

    const subcontractorsCost = r4(subcontractorInvoices.reduce((s, si) => s + Number(si.totalAmount || 0), 0))

    const laborCostTotal = r4(laborCosts.reduce((s, l) => s + Number(l.totalAmount || 0), 0))

    const salariesCost = r4(salaries.reduce((s, sal) => s + toNumber(sal.netSalary), 0))

    const fuelCost = r4(fuelLogs.reduce((s, f) => s + toNumber(f.totalCost), 0))

    const maintenanceCost = r4(expenses
      .filter(e => e.category === 'MAINTENANCE')
      .reduce((s, e) => s + Number(e.totalAmount || 0), 0))

    const otherCost = r4(expenses
      .filter(e => e.category !== 'MAINTENANCE')
      .reduce((s, e) => s + Number(e.totalAmount || 0), 0))

    const totalCosts = r4(
      materialsCost + equipmentCostTotal + subcontractorsCost +
      laborCostTotal + salariesCost + fuelCost + maintenanceCost + otherCost
    )

    // ---- PROFITABILITY ----
    const grossProfit = r4(totalInvoiced - totalCosts)
    const profitMargin = totalInvoiced > 0 ? r4((grossProfit / totalInvoiced) * 100) : 0

    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        nameAr: project.nameAr,
        client: project.client,
        contractValue: project.contractValue,
        status: project.status,
      },
      revenue: {
        invoices: salesInvoices.map(i => ({
          id: i.id,
          invoiceNo: i.invoiceNo,
          date: new Date(i.date).toISOString(),
          totalAmount: r4(toNumber(i.totalAmount)),
          netAmount: r4(toNumber(i.netAmount)),
          vatAmount: r4(toNumber(i.vatAmount)),
          paidAmount: r4(toNumber(i.paidAmount)),
          status: i.status,
          type: i.invoiceType,
        })),
        progressClaims: progressClaims.map(c => ({
          id: c.id,
          claimNo: c.claimNo,
          date: new Date(c.date).toISOString(),
          totalAmount: r4(toNumber(c.totalAmount)),
          amount: r4(toNumber(c.amount)),
          vatAmount: r4(toNumber(c.vatAmount)),
          percentage: c.percentage,
          status: c.status,
        })),
        totalInvoiced,
        totalCollected,
        totalClaims: r4(progressClaims.reduce((s, c) => s + Number(c.totalAmount || 0), 0)),
      },
      costs: {
        materials: {
          amount: materialsCost,
          invoices: purchaseInvoices
            .filter(pi => !pi.expenseCategory || ['CONSUMABLES', 'SERVICES'].includes(pi.expenseCategory))
            .map(pi => ({
              id: pi.id,
              invoiceNo: pi.invoiceNo,
              date: new Date(pi.date).toISOString(),
              totalAmount: r4(toNumber(pi.totalAmount)),
              category: pi.expenseCategory,
            })),
          label: 'مواد ومستلزمات',
          labelEn: 'Materials & Supplies',
        },
        equipment: {
          amount: equipmentCostTotal,
          items: equipmentCosts.map(e => ({
            id: e.id,
            date: new Date(e.date).toISOString(),
            amount: r4(toNumber(e.amount)),
            description: e.description,
          })),
          label: 'تكاليف المعدات',
          labelEn: 'Equipment Costs',
        },
        subcontractors: {
          amount: subcontractorsCost,
          invoices: subcontractorInvoices.map(si => ({
            id: si.id,
            invoiceNo: si.invoiceNo,
            date: new Date(si.date).toISOString(),
            totalAmount: r4(toNumber(si.totalAmount)),
          })),
          label: 'المقاولون من الباطن',
          labelEn: 'Subcontractors',
        },
        labor: {
          amount: laborCostTotal,
          items: laborCosts.map(l => ({
            id: l.id,
            date: new Date(l.date).toISOString(),
            amount: r4(toNumber(l.totalAmount)),
            description: l.description,
          })),
          label: 'تكاليف العمالة',
          labelEn: 'Labor Costs',
        },
        salaries: {
          amount: salariesCost,
          items: salaries.map(s => ({
            id: s.id,
            month: s.month,
            year: s.year,
            netSalary: r4(toNumber(s.netSalary)),
            totalEarnings: r4(
              toNumber(s.basicSalary) +
              toNumber(s.housingAllowance) +
              toNumber(s.transportAllowance) +
              toNumber(s.otherAllowances) +
              toNumber(s.overtimeAmount)
            ),
          })),
          label: 'الرواتب',
          labelEn: 'Salaries',
        },
        fuel: {
          amount: fuelCost,
          label: 'وقود',
          labelEn: 'Fuel',
        },
        maintenance: {
          amount: maintenanceCost,
          label: 'صيانة',
          labelEn: 'Maintenance',
        },
        other: {
          amount: otherCost,
          items: expenses
            .filter(e => e.category !== 'MAINTENANCE')
            .map(e => ({
              id: e.id,
              date: new Date(e.date).toISOString(),
              amount: r4(toNumber(e.totalAmount)),
              category: e.category,
              description: e.description,
            })),
          label: 'مصروفات أخرى',
          labelEn: 'Other Expenses',
        },
        total: totalCosts,
        label: 'إجمالي التكاليف',
        labelEn: 'Total Costs',
      },
      profitability: {
        grossProfit,
        profitMargin,
        label: 'الربحية',
        labelEn: 'Profitability',
        grossProfitLabel: 'مجبح الربح',
        grossProfitLabelEn: 'Gross Profit',
        profitMarginLabel: 'هامش الربح %',
        profitMarginLabelEn: 'Profit Margin %',
      },
      dateRange: {
        from: dateFrom?.toISOString() || null,
        to: dateTo?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error generating project financial statement:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء القائمة المالية للمشروع' },
      { status: 500 }
    )
  }
}
