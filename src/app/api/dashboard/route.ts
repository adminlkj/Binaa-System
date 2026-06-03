import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // 1. Active Projects count
    const activeProjects = await db.project.count({
      where: { status: { in: ['ACTIVE', 'PLANNING'] } },
    })

    // 2. Total Contract Value
    const contractAgg = await db.contract.aggregate({
      _sum: { value: true },
      where: { status: 'ACTIVE' },
    })
    const totalContractValue = contractAgg._sum.value || 0

    // 3. Uncollected Claims (claims that are APPROVED or SUBMITTED or PARTIALLY_PAID)
    const uncollectedClaimsAgg = await db.progressClaim.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID'] } },
    })
    // Also subtract what was already paid on partially paid claims
    const partiallyPaidPaid = await db.progressClaim.aggregate({
      _sum: { totalAmount: true },
      where: { status: 'PARTIALLY_PAID' },
    })
    // For uncollected, we consider the full amount of unpaid claims
    const uncollectedClaims = uncollectedClaimsAgg._sum.totalAmount || 0

    // 4. Unpaid Suppliers (purchase invoices not fully paid)
    const unpaidSuppliersAgg = await db.purchaseInvoice.aggregate({
      _sum: { totalAmount: true, paidAmount: true },
      where: { status: { in: ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
    })
    const unpaidSuppliers = (unpaidSuppliersAgg._sum.totalAmount || 0) - (unpaidSuppliersAgg._sum.paidAmount || 0)

    // 5. Total VAT (output VAT - input VAT from posted invoices)
    const salesVATAgg = await db.salesInvoice.aggregate({
      _sum: { vatAmount: true },
      where: { status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT', 'OVERDUE'] } },
    })
    const purchaseVATAgg = await db.purchaseInvoice.aggregate({
      _sum: { vatAmount: true },
      where: { status: { in: ['PAID', 'PARTIALLY_PAID', 'OVERDUE'] } },
    })
    const totalVAT = (salesVATAgg._sum.vatAmount || 0) - (purchaseVATAgg._sum.vatAmount || 0)

    // 6. Low Inventory Items
    const lowInventoryItems = await db.inventoryItem.count({
      where: { quantity: { lte: db.inventoryItem.fields.minQuantity } },
    })

    // 7. Monthly Profit (last 6 months of 2024)
    const months = [
      { key: '2024-07', label: 'يوليو 2024' },
      { key: '2024-08', label: 'أغسطس 2024' },
      { key: '2024-09', label: 'سبتمبر 2024' },
      { key: '2024-10', label: 'أكتوبر 2024' },
      { key: '2024-11', label: 'نوفمبر 2024' },
      { key: '2024-12', label: 'ديسمبر 2024' },
    ]

    const monthlyProfit = await Promise.all(
      months.map(async (m) => {
        const [year, month] = m.key.split('-').map(Number)
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 1)

        // Revenue: sales invoices in this month
        const revenueAgg = await db.salesInvoice.aggregate({
          _sum: { subtotal: true },
          where: {
            date: { gte: startDate, lt: endDate },
            status: { in: ['PAID', 'PARTIALLY_PAID', 'SENT'] },
          },
        })

        // Costs: expenses + labor + equipment costs + subcontractor invoices
        const expenseAgg = await db.expense.aggregate({
          _sum: { amount: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const laborAgg = await db.laborCost.aggregate({
          _sum: { totalAmount: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const equipCostAgg = await db.equipmentUsage.aggregate({
          _sum: { cost: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const subInvAgg = await db.subcontractorInvoice.aggregate({
          _sum: { amount: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const purchaseAgg = await db.purchaseInvoice.aggregate({
          _sum: { subtotal: true },
          where: { date: { gte: startDate, lt: endDate } },
        })

        const revenue = revenueAgg._sum.subtotal || 0
        const costs =
          (expenseAgg._sum.amount || 0) +
          (laborAgg._sum.totalAmount || 0) +
          (equipCostAgg._sum.cost || 0) +
          (subInvAgg._sum.amount || 0) +
          (purchaseAgg._sum.subtotal || 0)

        return {
          month: m.label,
          revenue,
          costs,
          profit: revenue - costs,
        }
      })
    )

    // 8. Expiring Contracts (ending within next 90 days)
    const now = new Date()
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const expiringContractsRaw = await db.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: ninetyDaysFromNow, not: null },
      },
      include: { project: true },
      take: 5,
    })

    const expiringContracts = expiringContractsRaw.map((c) => ({
      id: c.id,
      contractNo: c.contractNo,
      endDate: c.endDate ? c.endDate.toISOString().split('T')[0] : '',
      project: c.project.name,
    }))

    // 9. Recent Projects
    const recentProjectsRaw = await db.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    const recentProjects = await Promise.all(
      recentProjectsRaw.map(async (p) => {
        const contract = await db.contract.findFirst({
          where: { projectId: p.id },
        })
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          contractValue: contract?.value || 0,
        }
      })
    )

    // 10. Project Status Distribution
    const statusCounts = await db.project.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    const statusLabels: Record<string, string> = {
      PLANNING: 'تخطيط',
      ACTIVE: 'نشط',
      ON_HOLD: 'معلق',
      COMPLETED: 'مكتمل',
      CANCELLED: 'ملغي',
    }

    const projectStatusDistribution = statusCounts.map((s) => ({
      status: statusLabels[s.status] || s.status,
      count: s._count.status,
    }))

    return NextResponse.json({
      activeProjects,
      totalContractValue,
      uncollectedClaims,
      unpaidSuppliers,
      totalVAT,
      lowInventoryItems,
      monthlyProfit,
      expiringContracts,
      recentProjects,
      projectStatusDistribution,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحميل بيانات لوحة التحكم' },
      { status: 500 }
    )
  }
}
