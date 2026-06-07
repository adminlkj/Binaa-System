import { db } from '@/lib/db'
import { getAccountBalance } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const now = new Date()

    // ===== 1. Active Projects count & Total Contract Value =====
    const activeProjects = await db.project.count({
      where: { status: { in: ['ACTIVE', 'PLANNING'] } },
    })
    const totalProjects = await db.project.count()
    const contractAgg = await db.contract.aggregate({
      _sum: { totalValue: true },
      where: { status: 'ACTIVE' },
    })
    const totalContractValue = contractAgg._sum.totalValue || 0

    // ===== 2. Active Employees count =====
    const activeEmployees = await db.employee.count({
      where: { status: 'ACTIVE' },
    })

    // ===== 3. Equipment count by status =====
    const equipmentByStatus = await db.equipment.groupBy({
      by: ['status'],
      _count: { status: true },
    })
    const equipmentStatusMap: Record<string, number> = {}
    let totalEquipment = 0
    for (const e of equipmentByStatus) {
      equipmentStatusMap[e.status] = e._count.status
      totalEquipment += e._count.status
    }

    // ===== 4. Monthly Revenue & Expenses (last 6 months) =====
    const months: { key: string; labelAr: string; labelEn: string; year: number; month: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
      const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      months.push({
        key: `${y}-${String(m).padStart(2, '0')}`,
        labelAr: `${monthNamesAr[m - 1]} ${y}`,
        labelEn: `${monthNamesEn[m - 1]} ${y}`,
        year: y,
        month: m,
      })
    }

    const monthlyData = await Promise.all(
      months.map(async (m) => {
        const startDate = new Date(m.year, m.month - 1, 1)
        const endDate = new Date(m.year, m.month, 1)

        // Revenue: sales invoices + progress claims
        const salesAgg = await db.salesInvoice.aggregate({
          _sum: { subtotal: true },
          where: {
            date: { gte: startDate, lt: endDate },
            status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
          },
        })
        const claimsAgg = await db.progressClaim.aggregate({
          _sum: { amount: true },
          where: {
            date: { gte: startDate, lt: endDate },
            status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] },
          },
        })
        const revenue = (salesAgg._sum.subtotal || 0) + (claimsAgg._sum.amount || 0)

        // Expenses: expenses + purchase invoices + salaries + labor + equipment costs
        const expenseAgg = await db.expense.aggregate({
          _sum: { amount: true },
          where: { date: { gte: startDate, lt: endDate } },
        })
        const purchaseAgg = await db.purchaseInvoice.aggregate({
          _sum: { subtotal: true },
          where: {
            date: { gte: startDate, lt: endDate },
            status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
          },
        })
        const salaryAgg = await db.salary.aggregate({
          _sum: { netSalary: true },
          where: {
            month: m.month,
            year: m.year,
            status: { in: ['APPROVED', 'PAID'] },
          },
        })
        const laborAgg = await db.laborCost.aggregate({
          _sum: { totalAmount: true },
          where: { date: { gte: startDate, lt: endDate } },
        })
        const equipCostAgg = await db.equipmentUsage.aggregate({
          _sum: { cost: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const expenses =
          (expenseAgg._sum.amount || 0) +
          (purchaseAgg._sum.subtotal || 0) +
          (salaryAgg._sum.netSalary || 0) +
          (laborAgg._sum.totalAmount || 0) +
          (equipCostAgg._sum.cost || 0)

        return {
          month: m.key,
          labelAr: m.labelAr,
          labelEn: m.labelEn,
          revenue,
          expenses,
          profit: revenue - expenses,
        }
      })
    )

    // ===== 5. Total Revenue & Expenses (all time) =====
    const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0)
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0)
    const netProfit = totalRevenue - totalExpenses

    // ===== 6. Project Profitability Summary =====
    const projects = await db.project.findMany({
      where: { status: { in: ['ACTIVE', 'PLANNING', 'COMPLETED'] } },
      include: {
        client: { select: { name: true } },
        contracts: { select: { totalValue: true } },
        expenses: { select: { amount: true } },
        laborCosts: { select: { totalAmount: true } },
        equipmentCosts: { select: { amount: true } },
        purchaseOrders: { select: { totalAmount: true } },
        progressClaims: { select: { totalAmount: true, status: true } },
        subcontractorInvoices: { select: { totalAmount: true } },
        salesInvoices: { select: { subtotal: true } },
      },
      orderBy: { contractValue: 'desc' },
      take: 10,
    })

    const projectProfitability = projects.map(p => {
      const contractValue = p.contractValue || p.contracts.reduce((s, c) => s + c.totalValue, 0)
      const totalCosts =
        p.expenses.reduce((s, e) => s + e.amount, 0) +
        p.laborCosts.reduce((s, l) => s + l.totalAmount, 0) +
        p.equipmentCosts.reduce((s, e) => s + e.amount, 0) +
        p.purchaseOrders.reduce((s, po) => s + po.totalAmount, 0) +
        p.subcontractorInvoices.reduce((s, si) => s + si.totalAmount, 0)
      const totalRevenue = p.progressClaims.reduce((s, c) => s + c.totalAmount, 0) +
        p.salesInvoices.reduce((s, si) => s + si.subtotal, 0)
      const profit = contractValue - totalCosts
      const margin = contractValue > 0 ? (profit / contractValue) * 100 : 0

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        clientName: p.client.name,
        contractValue,
        totalCosts,
        totalRevenue,
        profit,
        margin,
      }
    })

    // ===== 7. Overdue Receivables (unpaid client invoices past due) =====
    const overdueReceivablesInvoices = await db.salesInvoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: now },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const overdueReceivables = overdueReceivablesInvoices.reduce(
      (s, i) => s + (i.totalAmount - i.paidAmount), 0
    )

    // Total outstanding receivables
    const allReceivablesInvoices = await db.salesInvoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { totalAmount: true, paidAmount: true },
    })
    const outstandingReceivables = allReceivablesInvoices.reduce(
      (s, i) => s + (i.totalAmount - i.paidAmount), 0
    )

    // ===== 8. Overdue Payables (unpaid supplier invoices past due) =====
    const overduePayablesInvoices = await db.purchaseInvoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: now },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const overduePayables = overduePayablesInvoices.reduce(
      (s, i) => s + (i.totalAmount - i.paidAmount), 0
    )

    const allPayablesInvoices = await db.purchaseInvoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { totalAmount: true, paidAmount: true },
    })
    const outstandingPayables = allPayablesInvoices.reduce(
      (s, i) => s + (i.totalAmount - i.paidAmount), 0
    )

    // ===== 9. Recent Transactions (last 10 journal entries) =====
    const recentEntries = await db.journalEntry.findMany({
      where: { status: 'POSTED', isReversal: false },
      include: {
        lines: {
          include: {
            account: { select: { code: true, name: true, nameAr: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 10,
    })

    const recentTransactions = recentEntries.map(e => ({
      id: e.id,
      entryNo: e.entryNo,
      date: e.date.toISOString(),
      description: e.description,
      totalDebit: e.lines.reduce((s, l) => s + l.debit, 0),
      totalCredit: e.lines.reduce((s, l) => s + l.credit, 0),
      sourceType: e.sourceType,
    }))

    // ===== 10. Equipment Utilization Rate =====
    const inUseEquipment = equipmentStatusMap['IN_USE'] || 0
    const rentedEquipment = equipmentStatusMap['RENTED'] || 0
    const availableEquipment = equipmentStatusMap['AVAILABLE'] || 0
    const equipmentUtilizationRate = totalEquipment > 0
      ? ((inUseEquipment + rentedEquipment) / totalEquipment) * 100
      : 0

    // ===== 11. Upcoming Contract Expirations =====
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Employee residence expirations
    const expiringResidences = await db.employee.findMany({
      where: {
        status: 'ACTIVE',
        residenceExpiry: { lte: ninetyDaysFromNow, gte: now },
      },
      select: { id: true, code: true, name: true, residenceExpiry: true },
      take: 5,
    })

    // Equipment maintenance due
    const maintenanceDue = await db.equipmentMaintenance.findMany({
      where: { nextDate: { lte: thirtyDaysFromNow, gte: now } },
      include: { equipment: { select: { code: true, name: true } } },
      take: 5,
    })

    // Contract expirations
    const expiringContracts = await db.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: ninetyDaysFromNow, not: null },
      },
      include: { project: { select: { name: true } } },
      take: 5,
    })

    const alerts = [
      ...expiringResidences.map(e => ({
        type: 'RESIDENCE_EXPIRY' as const,
        title: e.name,
        detail: e.residenceExpiry ? `إقامة تنتهي: ${e.residenceExpiry.toISOString().split('T')[0]}` : '',
        date: e.residenceExpiry?.toISOString() || '',
        severity: 'warning' as const,
      })),
      ...maintenanceDue.map(m => ({
        type: 'MAINTENANCE_DUE' as const,
        title: m.equipment.name,
        detail: m.description,
        date: m.nextDate?.toISOString() || '',
        severity: 'info' as const,
      })),
      ...expiringContracts.map(c => ({
        type: 'CONTRACT_EXPIRY' as const,
        title: c.contractNo,
        detail: c.project?.name || '',
        date: c.endDate?.toISOString() || '',
        severity: 'warning' as const,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 10)

    // ===== 12. Cash Position (treasury + bank balances) =====
    const cashBalance = await getAccountBalance('1110')
    const bankBalance = await getAccountBalance('1120')
    const pettyCashBalance = await getAccountBalance('1130')
    const cashPosition = cashBalance + bankBalance + pettyCashBalance

    // ===== 13. VAT Payable =====
    const vatPayable = await getAccountBalance('3200')
    const vatReceivable = await getAccountBalance('1400')
    const netVAT = vatPayable - vatReceivable

    // ===== 14. Low Inventory Items =====
    const lowInventoryItems = await db.inventoryItem.count({
      where: { quantity: { lte: db.inventoryItem.fields.minQuantity } },
    })

    // ===== 15. Project Status Distribution =====
    const statusCounts = await db.project.groupBy({
      by: ['status'],
      _count: { status: true },
    })
    const projectStatusDistribution = statusCounts.map(s => ({
      status: s.status,
      count: s._count.status,
    }))

    return NextResponse.json({
      // KPIs
      activeProjects,
      totalProjects,
      totalContractValue,
      activeEmployees,
      totalEquipment,
      equipmentStatusMap,
      equipmentUtilizationRate,
      totalRevenue,
      totalExpenses,
      netProfit,
      cashPosition,
      outstandingReceivables,
      outstandingPayables,
      overdueReceivables,
      overduePayables,
      netVAT,
      vatPayable,
      vatReceivable,
      lowInventoryItems,

      // Charts & Tables
      monthlyData,
      projectProfitability,
      recentTransactions,
      projectStatusDistribution,
      alerts,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل بيانات لوحة التحكم' },
      { status: 500 }
    )
  }
}
