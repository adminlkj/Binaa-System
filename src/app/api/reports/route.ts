import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { toNumber } from '@/lib/decimal'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'

// Normal balance mapping by account type
const NORMAL_BALANCE: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', EXPENSE: 'DEBIT',
}

/**
 * Build a map of project code → cost center ID for GL-based project queries.
 */
async function buildProjectCostCenterMap(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, string>()
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, code: true },
  })
  const codes = projects.map(p => p.code)
  const costCenters = await db.costCenter.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  })
  // Map: project.id → costCenter.id
  const projectCodeToId = new Map(projects.map(p => [p.code, p.id]))
  const result = new Map<string, string>()
  for (const cc of costCenters) {
    const projectId = projectCodeToId.get(cc.code)
    if (projectId) result.set(projectId, cc.id)
  }
  return result
}

/**
 * Get GL-based revenue and costs for projects, returns Map<projectId, {revenue, costs}>
 */
async function getProjectGLBalances(projectIds: string[]) {
  const result = new Map<string, { revenue: number; costs: number }>()
  if (projectIds.length === 0) return result

  const ccMap = await buildProjectCostCenterMap(projectIds)
  const costCenterIds = [...ccMap.values()]

  if (costCenterIds.length === 0) {
    // Initialize with zeros for all projects
    for (const pid of projectIds) result.set(pid, { revenue: 0, costs: 0 })
    return result
  }

  // Single GL query for all project cost centers
  const lines = await db.journalLine.findMany({
    where: {
      costCenterId: { in: costCenterIds },
      journalEntry: { status: 'POSTED' },
      account: { type: { in: ['REVENUE', 'EXPENSE'] } },
    },
    include: { account: { select: { type: true } }, costCenter: { select: { code: true } } },
  })

  // Build project code → GL data map
  const glMap = new Map<string, { revenue: number; costs: number }>()
  for (const line of lines) {
    const ccCode = line.costCenter?.code
    if (!ccCode) continue
    if (!glMap.has(ccCode)) glMap.set(ccCode, { revenue: 0, costs: 0 })
    const entry = glMap.get(ccCode)!
    if (line.account.type === 'REVENUE') {
      entry.revenue += toNumber(line.credit) - toNumber(line.debit)
    } else if (line.account.type === 'EXPENSE') {
      entry.costs += toNumber(line.debit) - toNumber(line.credit)
    }
  }

  // Map back to project IDs
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, code: true },
  })
  for (const p of projects) {
    const glData = glMap.get(p.code) || { revenue: 0, costs: 0 }
    result.set(p.id, glData)
  }
  // Fill zeros for projects without cost centers
  for (const pid of projectIds) {
    if (!result.has(pid)) result.set(pid, { revenue: 0, costs: 0 })
  }
  return result
}

/**
 * Get GL aggregation by account type with optional activity type filter.
 */
async function getGLBalanceByType(
  accountType: string,
  options?: {
    activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL'
    dateFrom?: Date
    dateTo?: Date
  }
): Promise<number> {
  const accountWhere: Record<string, unknown> = { type: accountType, allowPosting: true }
  if (options?.activityType) {
    accountWhere.activityType = { in: [options.activityType, 'BOTH'] }
  }

  const jeWhere: Record<string, unknown> = { status: 'POSTED' }
  if (options?.dateFrom || options?.dateTo) {
    jeWhere.date = {}
    if (options.dateFrom) jeWhere.date.gte = options.dateFrom
    if (options.dateTo) jeWhere.date.lte = options.dateTo
  }

  const result = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: { account: accountWhere, journalEntry: jeWhere },
  })

  const totalDebit = toNumber(result._sum.debit)
  const totalCredit = toNumber(result._sum.credit)
  const isCreditNormal = accountType === 'REVENUE' || accountType === 'LIABILITY' || accountType === 'EQUITY'
  return isCreditNormal ? totalCredit - totalDebit : totalDebit - totalCredit
}

/**
 * Get GL balance for specific account codes.
 */
async function getGLBalanceForCodes(
  codes: string[],
  dateFrom?: Date,
  dateTo?: Date
): Promise<number> {
  if (codes.length === 0) return 0

  const accounts = await db.account.findMany({
    where: { code: { in: codes }, isActive: true },
    select: { id: true, type: true },
  })
  if (accounts.length === 0) return 0

  const jeWhere: Record<string, unknown> = { status: 'POSTED' }
  if (dateFrom || dateTo) {
    jeWhere.date = {}
    if (dateFrom) jeWhere.date.gte = dateFrom
    if (dateTo) jeWhere.date.lte = dateTo
  }

  const agg = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      accountId: { in: accounts.map(a => a.id) },
      journalEntry: jeWhere,
    },
  })

  // Use the first account's type to determine normal balance (all should be same type)
  const totalDebit = toNumber(agg._sum.debit)
  const totalCredit = toNumber(agg._sum.credit)
  const accountType = accounts[0]?.type || 'ASSET'
  const isCreditNormal = accountType === 'REVENUE' || accountType === 'LIABILITY' || accountType === 'EQUITY'
  return isCreditNormal ? totalCredit - totalDebit : totalDebit - totalCredit
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    switch (type) {
      case 'projects': {
        const projects = await db.project.findMany({
          include: {
            client: { select: { name: true } },
            contracts: { select: { totalValue: true } },
          },
          orderBy: { code: 'asc' },
        })

        // GL-based project revenue and costs
        const projectIds = projects.map(p => p.id)
        const glBalances = await getProjectGLBalances(projectIds)

        const data = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0)
          const gl = glBalances.get(p.id) || { revenue: 0, costs: 0 }
          return {
            id: p.id, code: p.code, name: p.name, status: p.status,
            client: p.client.name, contractValue,
            totalCosts: gl.costs,
            totalRevenue: gl.revenue,
            profit: gl.revenue - gl.costs,
            margin: gl.revenue > 0 ? ((gl.revenue - gl.costs) / gl.revenue) * 100 : 0,
          }
        })
        return NextResponse.json(data)
      }

      case 'claims': {
        const claims = await db.progressClaim.findMany({
          include: {
            project: { select: { code: true, name: true } },
            contract: { select: { contractNo: true, totalValue: true } },
          },
          orderBy: { date: 'desc' },
        })
        return NextResponse.json(claims)
      }

      case 'expenses': {
        // Keep operational listing for descriptive details
        const expenses = await db.expense.findMany({
          include: {
            project: { select: { code: true, name: true } },
          },
          orderBy: { date: 'desc' },
        })

        // GL-based total for verification
        const glExpenseTotal = await getGLBalanceByType('EXPENSE')

        const byCategory: Record<string, number> = {}
        expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount })
        const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
        return NextResponse.json({ expenses, byCategory, totalExpenses, glExpenseTotal })
      }

      case 'sales': {
        // Keep operational listing for descriptive details
        const invoices = await db.salesInvoice.findMany({
          include: {
            client: { select: { name: true } },
            project: { select: { name: true } },
            items: true,
          },
          orderBy: { date: 'desc' },
        })

        // GL-based revenue total for verification
        const glRevenueTotal = await getGLBalanceByType('REVENUE')

        const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0)
        const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0)
        return NextResponse.json({ invoices, totalSales, totalPaid, totalOutstanding: totalSales - totalPaid, glRevenueTotal })
      }

      case 'purchases': {
        // Keep operational listing for descriptive details
        const pos = await db.purchaseOrder.findMany({
          include: {
            supplier: { select: { name: true } },
            project: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
        })
        const pis = await db.purchaseInvoice.findMany({
          include: {
            supplier: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
        })

        // GL-based AP total for verification
        const apCodes = (await getAccountsByRoles([AccountRole.SUPPLIER_AP, AccountRole.SUBCONTRACTOR_AP])).map(a => a.code)
        const glPayableTotal = await getGLBalanceForCodes(apCodes.length > 0 ? apCodes : ['3210', '3220'])

        const totalPOs = pos.reduce((s, p) => s + p.totalAmount, 0)
        const totalPIs = pis.reduce((s, p) => s + p.totalAmount, 0)
        const totalPaid = pis.reduce((s, p) => s + p.paidAmount, 0)
        return NextResponse.json({ purchaseOrders: pos, purchaseInvoices: pis, totalPOs, totalPIs, totalPaid, totalOutstanding: totalPIs - totalPaid, glPayableTotal })
      }

      case 'inventory': {
        const items = await db.inventoryItem.findMany({
          where: { isActive: true },
          include: {
            warehouse: { select: { code: true, name: true } },
          },
          orderBy: { code: 'asc' },
        })
        const totalValue = items.reduce((s, i) => s + (i.quantity * i.purchasePrice), 0)
        const lowStock = items.filter(i => i.quantity <= i.minQuantity)
        return NextResponse.json({ items, totalValue, lowStockCount: lowStock.length, totalItems: items.length })
      }

      case 'balance-sheet': {
        const accounts = await db.account.findMany({
          where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true },
          include: {
            journalLines: {
              where: { journalEntry: { status: 'POSTED' } },
            },
          },
          orderBy: { code: 'asc' },
        })
        const data = accounts.map(a => {
          const debit = a.journalLines.reduce((s, l) => s + l.debit, 0)
          const credit = a.journalLines.reduce((s, l) => s + l.credit, 0)
          const balance = a.type === 'ASSET' ? debit - credit : credit - debit
          return { id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, balance }
        })
        const totalAssets = data.filter(a => a.type === 'ASSET').reduce((s, a) => s + a.balance, 0)
        const totalLiabilities = data.filter(a => a.type === 'LIABILITY').reduce((s, a) => s + a.balance, 0)
        const totalEquity = data.filter(a => a.type === 'EQUITY').reduce((s, a) => s + a.balance, 0)
        return NextResponse.json({ accounts: data, totalAssets, totalLiabilities, totalEquity })
      }

      case 'income-statement': {
        const accounts = await db.account.findMany({
          where: { type: { in: ['REVENUE', 'EXPENSE'] }, isActive: true },
          include: {
            journalLines: {
              where: { journalEntry: { status: 'POSTED' } },
            },
          },
          orderBy: { code: 'asc' },
        })
        const data = accounts.map(a => {
          const debit = a.journalLines.reduce((s, l) => s + l.debit, 0)
          const credit = a.journalLines.reduce((s, l) => s + l.credit, 0)
          const balance = a.type === 'REVENUE' ? credit - debit : debit - credit
          return { id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, balance }
        })
        const totalRevenue = data.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0)
        const totalExpenses = data.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0)
        const netIncome = totalRevenue - totalExpenses
        return NextResponse.json({ accounts: data, totalRevenue, totalExpenses, netIncome })
      }

      case 'project-card': {
        const projects = await db.project.findMany({
          include: {
            client: { select: { name: true } },
            contracts: { select: { totalValue: true } },
          },
          orderBy: { code: 'asc' },
        })

        // GL-based project revenue and costs
        const projectIds = projects.map(p => p.id)
        const glBalances = await getProjectGLBalances(projectIds)

        const projectCards = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0)
          const gl = glBalances.get(p.id) || { revenue: 0, costs: 0 }
          const issuedExtracts = gl.revenue  // GL-based
          const totalCost = gl.costs  // GL-based
          const profit = contractValue - totalCost
          const profitMargin = contractValue > 0 ? (profit / contractValue) * 100 : 0
          return {
            id: p.id,
            code: p.code,
            name: p.name,
            nameAr: p.nameAr,
            client: p.client.name,
            status: p.status,
            projectType: p.projectType,
            contractValue,
            issuedExtracts,
            purchases: 0,  // Individual breakdown not available from GL alone
            projectExpenses: totalCost,
            totalCost,
            profit,
            profitMargin,
          }
        })
        const totals = {
          contractValue: projectCards.reduce((s, p) => s + p.contractValue, 0),
          issuedExtracts: projectCards.reduce((s, p) => s + p.issuedExtracts, 0),
          purchases: projectCards.reduce((s, p) => s + p.purchases, 0),
          projectExpenses: projectCards.reduce((s, p) => s + p.projectExpenses, 0),
          totalCost: projectCards.reduce((s, p) => s + p.totalCost, 0),
          profit: projectCards.reduce((s, p) => s + p.profit, 0),
          profitMargin: 0,
        }
        totals.profitMargin = totals.contractValue > 0
          ? (totals.profit / totals.contractValue) * 100
          : 0
        return NextResponse.json({ projects: projectCards, totals })
      }

      case 'activity-summary': {
        // ===== CONSTRUCTION =====
        const constructionProjects = await db.project.findMany({
          where: { projectType: 'CONSTRUCTION' },
          select: { id: true, status: true, contractValue: true, contracts: { select: { totalValue: true } } },
        })

        const constructionProjectCount = constructionProjects.length
        const constructionActiveProjectCount = constructionProjects.filter(p => p.status === 'ACTIVE').length
        const constructionTotalContractValue = constructionProjects.reduce((s, p) => {
          const cv = p.contracts.reduce((s2, c) => s2 + c.totalValue, 0)
          return s + (cv > 0 ? cv : p.contractValue)
        }, 0)

        // GL-based construction revenue and costs
        const constructionRevenue = await getGLBalanceByType('REVENUE', { activityType: 'CONSTRUCTION' })
        const constructionCosts = await getGLBalanceByType('EXPENSE', { activityType: 'CONSTRUCTION' })
        const constructionProfit = constructionRevenue - constructionCosts
        const constructionProfitMargin = constructionRevenue > 0
          ? (constructionProfit / constructionRevenue) * 100 : 0

        // Detailed cost breakdown from GL by account role
        const [projectCostAccounts, subcontractorCostAccounts, fuelAccounts, maintenanceAccounts, driverAccounts, transportAccounts, rentalDepAccounts, payrollAccounts, gosiAccounts, adminAccounts, depAccounts] = await Promise.all([
          getAccountsByRoles([AccountRole.PROJECT_COST]),
          getAccountsByRoles([AccountRole.SUBCONTRACTOR_COST]),
          getAccountsByRoles([AccountRole.FUEL_EXPENSE]),
          getAccountsByRoles([AccountRole.MAINTENANCE_EXPENSE]),
          getAccountsByRoles([AccountRole.DRIVER_EXPENSE]),
          getAccountsByRoles([AccountRole.TRANSPORT_EXPENSE]),
          getAccountsByRoles([AccountRole.RENTAL_DEPRECIATION]),
          getAccountsByRoles([AccountRole.PAYROLL_EXPENSE]),
          getAccountsByRoles([AccountRole.GOSI_EXPENSE]),
          getAccountsByRoles([AccountRole.ADMIN_EXPENSE]),
          getAccountsByRoles([AccountRole.DEPRECIATION_EXPENSE]),
        ])

        // Get all expense account balances in a single query
        const allExpenseAccounts = await db.account.findMany({
          where: { type: 'EXPENSE', isActive: true, allowPosting: true },
          select: { id: true, code: true, type: true, accountRole: true, activityType: true },
        })

        const expenseAccountIds = allExpenseAccounts.map(a => a.id)
        const expenseAgg = expenseAccountIds.length > 0
          ? await db.journalLine.groupBy({
              by: ['accountId'],
              _sum: { debit: true, credit: true },
              where: {
                accountId: { in: expenseAccountIds },
                journalEntry: { status: 'POSTED' },
              },
            })
          : []

        const expenseBalanceMap = new Map<string, number>()
        for (const agg of expenseAgg) {
          const d = toNumber(agg._sum.debit)
          const c = toNumber(agg._sum.credit)
          expenseBalanceMap.set(agg.accountId, d - c)  // Expense: debit normal
        }

        const getRoleBasedTotal = (accounts: { id: string }[]) => {
          return accounts.reduce((s, a) => s + (expenseBalanceMap.get(a.id) || 0), 0)
        }

        // Construction cost breakdown (approximate mapping)
        const constructionMaterialCosts = getRoleBasedTotal(projectCostAccounts)
        const constructionSubcontractorCosts = getRoleBasedTotal(subcontractorCostAccounts)
        const constructionLaborCosts = getRoleBasedTotal(payrollAccounts)  // Labor = payroll
        const constructionEquipmentCosts = getRoleBasedTotal(fuelAccounts) + getRoleBasedTotal(maintenanceAccounts) +
          getRoleBasedTotal(driverAccounts) + getRoleBasedTotal(transportAccounts) + getRoleBasedTotal(rentalDepAccounts)
        const constructionProjectExpenses = getRoleBasedTotal(adminAccounts) + getRoleBasedTotal(gosiAccounts) + getRoleBasedTotal(depAccounts)

        // ===== RENTAL =====
        const rentalProjects = await db.project.findMany({
          where: { projectType: 'EQUIPMENT_RENTAL' },
          select: { id: true, status: true },
        })

        const rentalProjectCount = rentalProjects.length
        const rentalActiveProjectCount = rentalProjects.filter(p => p.status === 'ACTIVE').length

        // GL-based rental revenue and costs
        const rentalRevenue = await getGLBalanceByType('REVENUE', { activityType: 'EQUIPMENT_RENTAL' })
        const rentalCosts = await getGLBalanceByType('EXPENSE', { activityType: 'EQUIPMENT_RENTAL' })
        const rentalProfit = rentalRevenue - rentalCosts
        const rentalProfitMargin = rentalRevenue > 0
          ? (rentalProfit / rentalRevenue) * 100 : 0

        // Rental cost breakdown from GL by role
        const rentalFuelCosts = getRoleBasedTotal(fuelAccounts)  // All fuel (approximation)
        const rentalMaintenanceCosts = getRoleBasedTotal(maintenanceAccounts)
        const rentalOperationCosts = getRoleBasedTotal(rentalDepAccounts)
        const rentalExpenses = getRoleBasedTotal(adminAccounts) + getRoleBasedTotal(driverAccounts) + getRoleBasedTotal(transportAccounts)

        // Count rented equipment
        const rentalProjectIds = rentalProjects.map(p => p.id)
        const rentalEquipments = rentalProjectIds.length > 0
          ? await db.equipmentRental.findMany({
              where: { projectId: { in: rentalProjectIds } },
              select: { equipmentId: true },
            })
          : []
        const rentalEquipmentIds = [...new Set(rentalEquipments.map(r => r.equipmentId))]
        const rentedEquipmentCount = rentalEquipmentIds.length

        return NextResponse.json({
          construction: {
            projectCount: constructionProjectCount,
            activeProjectCount: constructionActiveProjectCount,
            totalContractValue: constructionTotalContractValue,
            totalRevenue: constructionRevenue,
            totalCosts: constructionCosts,
            profit: constructionProfit,
            profitMargin: constructionProfitMargin,
            materialCosts: constructionMaterialCosts,
            laborCosts: constructionLaborCosts,
            subcontractorCosts: constructionSubcontractorCosts,
            equipmentCosts: constructionEquipmentCosts,
            projectExpenses: constructionProjectExpenses,
          },
          rental: {
            projectCount: rentalProjectCount,
            activeProjectCount: rentalActiveProjectCount,
            totalRentalRevenue: rentalRevenue,
            totalRentalCosts: rentalCosts,
            profit: rentalProfit,
            profitMargin: rentalProfitMargin,
            maintenanceCosts: rentalMaintenanceCosts,
            fuelCosts: rentalFuelCosts,
            operationCosts: rentalOperationCosts,
            rentalExpenses: rentalExpenses,
            rentedEquipmentCount: rentedEquipmentCount,
          },
        })
      }

      case 'project-profitability': {
        const projects = await db.project.findMany({
          include: {
            client: { select: { name: true } },
            contracts: { select: { totalValue: true } },
          },
          orderBy: { code: 'asc' },
        })

        // GL-based project revenue and costs
        const projectIds = projects.map(p => p.id)
        const glBalances = await getProjectGLBalances(projectIds)

        // For detailed breakdown: get per-project GL lines grouped by account role
        const ccMap = await buildProjectCostCenterMap(projectIds)
        const costCenterIds = [...ccMap.values()]

        // Get expense journal lines grouped by cost center and account role for breakdown
        let projectExpenseBreakdown = new Map<string, Map<string, number>>()  // projectId → (role → amount)
        if (costCenterIds.length > 0) {
          const expenseLines = await db.journalLine.findMany({
            where: {
              costCenterId: { in: costCenterIds },
              journalEntry: { status: 'POSTED' },
              account: { type: 'EXPENSE' },
            },
            include: {
              account: { select: { code: true, accountRole: true } },
              costCenter: { select: { code: true } },
            },
          })

          const projectCodeToId = new Map(projects.map(p => [p.code, p.id]))
          for (const line of expenseLines) {
            const ccCode = line.costCenter?.code
            if (!ccCode) continue
            const pid = projectCodeToId.get(ccCode)
            if (!pid) continue
            if (!projectExpenseBreakdown.has(pid)) projectExpenseBreakdown.set(pid, new Map())
            const roleMap = projectExpenseBreakdown.get(pid)!
            const role = line.account.accountRole || 'OTHER'
            const amount = toNumber(line.debit) - toNumber(line.credit)
            roleMap.set(role, (roleMap.get(role) || 0) + amount)
          }
        }

        const projectProfitability = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0) || p.contractValue
          const gl = glBalances.get(p.id) || { revenue: 0, costs: 0 }
          const breakdown = projectExpenseBreakdown.get(p.id) || new Map<string, number>()

          // Categorize by role
          const materialCosts = breakdown.get('PROJECT_COST') || 0
          const subcontractorCosts = breakdown.get('SUBCONTRACTOR_COST') || 0
          const laborCosts = breakdown.get('PAYROLL_EXPENSE') || 0
          const equipmentCosts = (breakdown.get('FUEL_EXPENSE') || 0) +
            (breakdown.get('MAINTENANCE_EXPENSE') || 0) +
            (breakdown.get('DRIVER_EXPENSE') || 0) +
            (breakdown.get('TRANSPORT_EXPENSE') || 0) +
            (breakdown.get('RENTAL_DEPRECIATION') || 0)
          const projectExpenses = (breakdown.get('ADMIN_EXPENSE') || 0) +
            (breakdown.get('GOSI_EXPENSE') || 0) +
            (breakdown.get('DEPRECIATION_EXPENSE') || 0)

          const totalCosts = gl.costs
          const grossProfit = contractValue - totalCosts
          const profitMargin = contractValue > 0 ? (grossProfit / contractValue) * 100 : 0
          return {
            id: p.id, code: p.code, name: p.name, nameAr: p.nameAr,
            status: p.status, projectType: p.projectType,
            client: p.client.name, contractValue,
            invoiced: gl.revenue,  // GL-based revenue = invoiced
            collected: 0,  // Collection data is operational; not available from GL
            materialCosts, subcontractorCosts, laborCosts, equipmentCosts, projectExpenses,
            totalCosts, grossProfit, profitMargin,
          }
        })
        const totals = {
          contractValue: projectProfitability.reduce((s, p) => s + p.contractValue, 0),
          invoiced: projectProfitability.reduce((s, p) => s + p.invoiced, 0),
          collected: projectProfitability.reduce((s, p) => s + p.collected, 0),
          totalCosts: projectProfitability.reduce((s, p) => s + p.totalCosts, 0),
          grossProfit: projectProfitability.reduce((s, p) => s + p.grossProfit, 0),
          profitMargin: 0,
        }
        totals.profitMargin = totals.contractValue > 0 ? (totals.grossProfit / totals.contractValue) * 100 : 0
        return NextResponse.json({ projects: projectProfitability, totals })
      }

      case 'equipment-utilization': {
        // Equipment-specific: use operational data for descriptive details (hours, status)
        // but use GL for financial amounts where possible
        const equipment = await db.equipment.findMany({
          where: { isActive: true },
          include: {
            operatorLogs: { select: { hours: true, date: true } },
            maintenance: { select: { cost: true } },
            fuelLogs: { select: { totalCost: true } },
            usages: { select: { cost: true } },
            rentals: { select: { hourlyRate: true, pricingType: true, deliveryFees: true } },
          },
          orderBy: { code: 'asc' },
        })

        // GL-based: get expense account totals filtered by equipment-related cost centers
        // Since equipment doesn't directly have cost centers, we use the operational data
        // supplemented with GL-based cost verification
        const [fuelAccts, maintAccts, driverAccts, transportAccts, rentalDepAccts] = await Promise.all([
          getAccountsByRoles([AccountRole.FUEL_EXPENSE]),
          getAccountsByRoles([AccountRole.MAINTENANCE_EXPENSE]),
          getAccountsByRoles([AccountRole.DRIVER_EXPENSE]),
          getAccountsByRoles([AccountRole.TRANSPORT_EXPENSE]),
          getAccountsByRoles([AccountRole.RENTAL_DEPRECIATION]),
        ])

        const equipmentUtilization = equipment.map(eq => {
          const totalHoursRented = eq.operatorLogs.reduce((s, o) => s + o.hours, 0)
          const revenueGenerated = eq.rentals.reduce((s, r) => {
            const rate = r.hourlyRate || eq.hourlyRate
            return s + (rate * totalHoursRented) + (r.deliveryFees || 0)
          }, 0)
          const maintenanceCosts = eq.maintenance.reduce((s, m) => s + m.cost, 0)
          const fuelCosts = eq.fuelLogs.reduce((s, f) => s + f.totalCost, 0)
          const operationCosts = eq.usages.reduce((s, u) => s + u.cost, 0)
          const totalCosts = maintenanceCosts + fuelCosts + operationCosts
          const netProfit = revenueGenerated - totalCosts
          return {
            id: eq.id, code: eq.code, name: eq.name, nameAr: eq.nameAr,
            status: eq.status, type: eq.type,
            totalHoursRented, revenueGenerated,
            maintenanceCosts, fuelCosts, operationCosts, totalCosts, netProfit,
          }
        })
        const totals = {
          totalHoursRented: equipmentUtilization.reduce((s, e) => s + e.totalHoursRented, 0),
          revenueGenerated: equipmentUtilization.reduce((s, e) => s + e.revenueGenerated, 0),
          maintenanceCosts: equipmentUtilization.reduce((s, e) => s + e.maintenanceCosts, 0),
          fuelCosts: equipmentUtilization.reduce((s, e) => s + e.fuelCosts, 0),
          totalCosts: equipmentUtilization.reduce((s, e) => s + e.totalCosts, 0),
          netProfit: equipmentUtilization.reduce((s, e) => s + e.netProfit, 0),
        }
        return NextResponse.json({ equipment: equipmentUtilization, totals })
      }

      case 'rental-revenue-by-client': {
        // GL-based: get revenue from REVENUE accounts with EQUIPMENT_RENTAL activity type
        // and join with operational data for client details
        const rentalInvoices = await db.salesInvoice.findMany({
          where: { sourceType: 'TIMESHEET', status: { not: 'CANCELLED' } },
          include: {
            client: { select: { id: true, code: true, name: true, nameAr: true } },
          },
          orderBy: { date: 'desc' },
        })

        // Build client-level aggregation from operational data (descriptive)
        const byClient: Record<string, { id: string; code: string; name: string; nameAr: string | null; revenue: number; invoiceCount: number }> = {}
        for (const inv of rentalInvoices) {
          const cid = inv.client.id
          if (!byClient[cid]) {
            byClient[cid] = { id: cid, code: inv.client.code, name: inv.client.name, nameAr: inv.client.nameAr, revenue: 0, invoiceCount: 0 }
          }
          byClient[cid].revenue += inv.totalAmount
          byClient[cid].invoiceCount += 1
        }
        const clients = Object.values(byClient)

        // GL-based total for verification
        const glRentalRevenue = await getGLBalanceByType('REVENUE', { activityType: 'EQUIPMENT_RENTAL' })

        const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0)
        return NextResponse.json({ clients, totalRevenue, glRentalRevenue })
      }

      case 'equipment-status': {
        const equipment = await db.equipment.findMany({
          where: { isActive: true },
          select: { status: true, type: true },
        })
        const byStatus: Record<string, number> = {}
        const byType: Record<string, { count: number; byStatus: Record<string, number> }> = {}
        for (const eq of equipment) {
          byStatus[eq.status] = (byStatus[eq.status] || 0) + 1
          const eqType = eq.type || 'OTHER'
          if (!byType[eqType]) byType[eqType] = { count: 0, byStatus: {} }
          byType[eqType].count += 1
          byType[eqType].byStatus[eq.status] = (byType[eqType].byStatus[eq.status] || 0) + 1
        }
        return NextResponse.json({ byStatus, byCategory: byType, total: equipment.length })
      }

      case 'purchase-summary': {
        // Keep operational listing for descriptive details
        const supplierInvoices = await db.purchaseInvoice.findMany({
          where: { status: { not: 'CANCELLED' } },
          include: {
            supplier: { select: { id: true, code: true, name: true } },
            project: { select: { id: true, code: true, name: true, projectType: true } },
          },
          orderBy: { date: 'desc' },
        })

        const bySupplier: Record<string, { id: string; code: string; name: string; total: number; invoiceCount: number }> = {}
        const byProject: Record<string, { id: string; code: string; name: string; projectType: string; total: number; invoiceCount: number }> = {}
        for (const inv of supplierInvoices) {
          // By supplier
          const sid = inv.supplier?.id || 'unknown'
          if (!bySupplier[sid]) bySupplier[sid] = { id: sid, code: inv.supplier?.code || '', name: inv.supplier?.name || 'Unknown', total: 0, invoiceCount: 0 }
          bySupplier[sid].total += inv.totalAmount
          bySupplier[sid].invoiceCount += 1
          // By project
          if (inv.project) {
            const pid = inv.project.id
            if (!byProject[pid]) byProject[pid] = { id: pid, code: inv.project.code, name: inv.project.name, projectType: inv.project.projectType, total: 0, invoiceCount: 0 }
            byProject[pid].total += inv.totalAmount
            byProject[pid].invoiceCount += 1
          }
        }

        // GL-based AP total for verification
        const apCodes = (await getAccountsByRoles([AccountRole.SUPPLIER_AP, AccountRole.SUBCONTRACTOR_AP])).map(a => a.code)
        const glPayableTotal = await getGLBalanceForCodes(apCodes.length > 0 ? apCodes : ['3210', '3220'])

        const totalPurchases = supplierInvoices.reduce((s, i) => s + i.totalAmount, 0)
        return NextResponse.json({ bySupplier: Object.values(bySupplier), byProject: Object.values(byProject), totalPurchases, invoiceCount: supplierInvoices.length, glPayableTotal })
      }

      case 'revenue-summary': {
        // GL-based revenue summary
        const constructionRevenue = await getGLBalanceByType('REVENUE', { activityType: 'CONSTRUCTION' })
        const rentalRevenue = await getGLBalanceByType('REVENUE', { activityType: 'EQUIPMENT_RENTAL' })

        // Monthly breakdown from GL
        const revenueAccounts = await db.account.findMany({
          where: { type: 'REVENUE', isActive: true, allowPosting: true },
          select: { id: true },
        })
        const revenueAccountIds = revenueAccounts.map(a => a.id)

        // Get all posted revenue journal lines for monthly breakdown
        const monthlyData: Record<string, { month: string; construction: number; rental: number }> = {}

        if (revenueAccountIds.length > 0) {
          const revenueLines = await db.journalLine.findMany({
            where: {
              accountId: { in: revenueAccountIds },
              journalEntry: { status: 'POSTED' },
            },
            include: {
              account: { select: { activityType: true } },
              journalEntry: { select: { date: true } },
            },
          })

          for (const line of revenueLines) {
            const month = new Date(line.journalEntry.date).toISOString().slice(0, 7)
            if (!monthlyData[month]) monthlyData[month] = { month, construction: 0, rental: 0 }
            const amount = toNumber(line.credit) - toNumber(line.debit)
            const activityType = line.account.activityType
            if (activityType === 'CONSTRUCTION') {
              monthlyData[month].construction += amount
            } else if (activityType === 'EQUIPMENT_RENTAL') {
              monthlyData[month].rental += amount
            } else {
              // BOTH or null: split proportionally or add to both
              monthlyData[month].construction += amount / 2
              monthlyData[month].rental += amount / 2
            }
          }
        }

        const monthly = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))
        return NextResponse.json({
          totalConstructionRevenue: constructionRevenue,
          totalRentalRevenue: rentalRevenue,
          totalRevenue: constructionRevenue + rentalRevenue,
          monthly,
        })
      }

      case 'expense-summary': {
        // GL-based expense summary by account role
        const expenseAccounts = await db.account.findMany({
          where: { type: 'EXPENSE', isActive: true, allowPosting: true },
          select: { id: true, code: true, accountRole: true, activityType: true },
        })

        const expenseAccountIds = expenseAccounts.map(a => a.id)
        let directByCategory: Record<string, number> = {}
        let indirectByCategory: Record<string, number> = {}
        let totalDirect = 0
        let totalIndirect = 0

        if (expenseAccountIds.length > 0) {
          const agg = await db.journalLine.groupBy({
            by: ['accountId'],
            _sum: { debit: true, credit: true },
            where: {
              accountId: { in: expenseAccountIds },
              journalEntry: { status: 'POSTED' },
            },
          })

          for (const entry of agg) {
            const account = expenseAccounts.find(a => a.id === entry.accountId)
            if (!account) continue
            const amount = toNumber(entry._sum.debit) - toNumber(entry._sum.credit)
            if (amount === 0) continue

            const role = account.accountRole || account.code
            // Direct costs: project-related (7xxx accounts)
            const isDirect = account.code.startsWith('7')
            if (isDirect) {
              directByCategory[role] = (directByCategory[role] || 0) + amount
              totalDirect += amount
            } else {
              indirectByCategory[role] = (indirectByCategory[role] || 0) + amount
              totalIndirect += amount
            }
          }
        }

        return NextResponse.json({
          totalDirect, totalIndirect, totalExpenses: totalDirect + totalIndirect,
          directByCategory, indirectByCategory,
        })
      }

      case 'cash-flow-summary': {
        // GL-based cash flow summary
        const cashAndBankAccounts = await getAccountsByRoles([AccountRole.CASH, AccountRole.BANK])
        const cashBankCodes = cashAndBankAccounts.map(a => a.code)
        const cashBankIds = cashAndBankAccounts.map(a => a.id)

        // Cash inflows: credits to cash/bank accounts (money coming in)
        let totalInflows = 0
        let totalOutflows = 0

        if (cashBankIds.length > 0) {
          const cashAgg = await db.journalLine.aggregate({
            _sum: { debit: true, credit: true },
            where: {
              accountId: { in: cashBankIds },
              journalEntry: { status: 'POSTED' },
            },
          })
          // Cash accounts are ASSET (debit normal): debits = inflows, credits = outflows
          totalInflows = toNumber(cashAgg._sum.debit)
          totalOutflows = toNumber(cashAgg._sum.credit)
        }

        // Monthly breakdown from GL
        const monthlyData: Record<string, { month: string; inflows: number; outflows: number }> = {}

        if (cashBankIds.length > 0) {
          const cashLines = await db.journalLine.findMany({
            where: {
              accountId: { in: cashBankIds },
              journalEntry: { status: 'POSTED' },
            },
            include: {
              journalEntry: { select: { date: true } },
            },
          })

          for (const line of cashLines) {
            const month = new Date(line.journalEntry.date).toISOString().slice(0, 7)
            if (!monthlyData[month]) monthlyData[month] = { month, inflows: 0, outflows: 0 }
            const debit = toNumber(line.debit)
            const credit = toNumber(line.credit)
            monthlyData[month].inflows += debit
            monthlyData[month].outflows += credit
          }
        }

        const monthly = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))

        // Also compute supplier and salary payments from GL for breakdown
        const apAccounts = await getAccountsByRoles([AccountRole.SUPPLIER_AP, AccountRole.SUBCONTRACTOR_AP])
        const apIds = apAccounts.map(a => a.id)
        let supplierPaymentsTotal = 0
        if (apIds.length > 0) {
          // Payments to suppliers = debits to AP accounts (reducing the liability)
          const apAgg = await db.journalLine.aggregate({
            _sum: { debit: true },
            where: {
              accountId: { in: apIds },
              journalEntry: { status: 'POSTED' },
            },
          })
          supplierPaymentsTotal = toNumber(apAgg._sum.debit)
        }

        // Salary payments from GL
        const payrollAccounts = await getAccountsByRoles([AccountRole.PAYROLL_EXPENSE])
        const payrollIds = payrollAccounts.map(a => a.id)
        let salaryPaymentsTotal = 0
        if (payrollIds.length > 0) {
          const payrollAgg = await db.journalLine.aggregate({
            _sum: { debit: true },
            where: {
              accountId: { in: payrollIds },
              journalEntry: { status: 'POSTED' },
            },
          })
          salaryPaymentsTotal = toNumber(payrollAgg._sum.debit)
        }

        // Client payments from GL = credits to AR accounts (reducing the receivable)
        const arAccounts = await getAccountsByRoles([AccountRole.CUSTOMER_AR])
        const arIds = arAccounts.map(a => a.id)
        let clientPaymentsTotal = 0
        if (arIds.length > 0) {
          const arAgg = await db.journalLine.aggregate({
            _sum: { credit: true },
            where: {
              accountId: { in: arIds },
              journalEntry: { status: 'POSTED' },
            },
          })
          clientPaymentsTotal = toNumber(arAgg._sum.credit)
        }

        return NextResponse.json({
          totalInflows, totalOutflows, netCashFlow: totalInflows - totalOutflows,
          clientPaymentsTotal,
          supplierPaymentsTotal,
          salaryPaymentsTotal,
          monthly,
        })
      }

      default:
        return NextResponse.json({ error: 'نوع التقرير غير معروف' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error generating report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء التقرير' }, { status: 500 })
  }
}
