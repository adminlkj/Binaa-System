import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { toNumber } from '@/lib/decimal'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'

// Normal balance mapping by account type
const NORMAL_BALANCE: Record<string, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', EXPENSE: 'DEBIT',
}

/**
 * Resolve account codes for a set of roles, falling back to default codes if no role-mapped accounts exist.
 */
async function resolveAccountCodes(roles: string[], defaultCodes: string[]): Promise<string[]> {
  const accounts = await getAccountsByRoles(roles)
  if (accounts.length > 0) return accounts.map(a => a.code)
  return defaultCodes
}

/**
 * Compute balance for accounts matching a set of codes, using a pre-fetched balance map.
 */
function computeBalanceFromMap(
  codes: string[],
  accounts: { id: string; code: string; type: string }[],
  balanceMap: Map<string, { totalDebit: number; totalCredit: number }>
): number {
  let total = 0
  for (const code of codes) {
    const account = accounts.find(a => a.code === code)
    if (!account) continue
    const agg = balanceMap.get(account.id)
    if (!agg) continue
    const normalBalance = NORMAL_BALANCE[account.type] || 'DEBIT'
    total += normalBalance === 'DEBIT' ? agg.totalDebit - agg.totalCredit : agg.totalCredit - agg.totalDebit
  }
  return total
}

/**
 * Aggregate GL balances by account type with optional date range and activity type filters.
 * Returns the normal balance (positive for revenue/expense in their natural direction).
 */
async function getGLBalance(
  accountType: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'LIABILITY',
  options?: {
    activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL'
    startDate?: Date
    endDate?: Date
  }
): Promise<number> {
  const accountWhere: Record<string, unknown> = { type: accountType, allowPosting: true }
  if (options?.activityType) {
    accountWhere.activityType = { in: [options.activityType, 'BOTH'] }
  }

  const jeWhere: { status: 'POSTED'; deletedAt: null; date?: { gte?: Date; lt?: Date } } = { status: 'POSTED', deletedAt: null }
  if (options?.startDate || options?.endDate) {
    jeWhere.date = {}
    if (options.startDate) jeWhere.date.gte = options.startDate
    if (options.endDate) jeWhere.date.lt = options.endDate
  }

  const result = await db.journalLine.aggregate({
    _sum: { debit: true, credit: true },
    where: {
      account: accountWhere,
      deletedAt: null,
      journalEntry: jeWhere,
    },
  })

  const totalDebit = Number(result._sum.debit || 0)
  const totalCredit = Number(result._sum.credit || 0)

  // Revenue, Liability → normal balance is CREDIT; Asset, Expense → DEBIT
  const isCreditNormal = accountType === 'REVENUE' || accountType === 'LIABILITY'
  return isCreditNormal ? totalCredit - totalDebit : totalDebit - totalCredit
}

export async function GET() {
  try {
    const now = new Date()

    // ===== Resolve account codes by role (single query per role group) =====
    const [
      cashCodes, bankCodes, pettyCashCodes,
      arCodes, retentionCodes, employeeAdvanceCodes,
      supplierAdvCodes, otherRecvCodes,
      supplierApCodes, subcontractorApCodes,
      salariesPayableCodes, otherAccruedCodes,
      outputVatCodes, inputVatCodes, vatDueCodes,
    ] = await Promise.all([
      resolveAccountCodes([AccountRole.CASH], ['1110']),
      resolveAccountCodes([AccountRole.BANK], ['1120']),
      resolveAccountCodes([AccountRole.CASH], ['1130']),
      resolveAccountCodes([AccountRole.CUSTOMER_AR], ['1210']),
      resolveAccountCodes([AccountRole.RETENTION_RECEIVABLE], ['1220']),
      resolveAccountCodes([AccountRole.EMPLOYEE_ADVANCE], ['1230']),
      resolveAccountCodes([AccountRole.EMPLOYEE_ADVANCE], ['1240']),
      resolveAccountCodes([AccountRole.CUSTOMER_AR], ['1250']),
      resolveAccountCodes([AccountRole.SUPPLIER_AP], ['3210']),
      resolveAccountCodes([AccountRole.SUBCONTRACTOR_AP], ['3220']),
      resolveAccountCodes([AccountRole.SALARIES_PAYABLE], ['3310']),
      resolveAccountCodes([AccountRole.GOSI_PAYABLE], ['3320']),
      resolveAccountCodes([AccountRole.VAT_OUTPUT], ['3110']),
      resolveAccountCodes([AccountRole.VAT_INPUT], ['3120']),
      resolveAccountCodes([AccountRole.VAT_DUE], ['3130']),
    ])

    // All role-resolved codes combined (for the single balance query)
    const allCodes = [
      ...cashCodes, ...bankCodes, ...pettyCashCodes,
      ...arCodes, ...retentionCodes, ...employeeAdvanceCodes,
      ...supplierAdvCodes, ...otherRecvCodes,
      ...supplierApCodes, ...subcontractorApCodes,
      ...salariesPayableCodes, ...otherAccruedCodes,
      ...outputVatCodes, ...inputVatCodes, ...vatDueCodes,
    ]

    // ===== 1. Active Projects count & Total Contract Value =====
    const activeProjects = await db.project.count({
      where: { status: { in: ['ACTIVE', 'PLANNING'] }, deletedAt: null },
    })
    const totalProjects = await db.project.count({ where: { deletedAt: null } })
    const contractAgg = await db.contract.aggregate({
      _sum: { totalValue: true },
      where: { status: 'ACTIVE' },
    })
    const totalContractValue = contractAgg._sum.totalValue || 0

    // ===== 2. Active Employees count =====
    const activeEmployees = await db.employee.count({
      where: { status: 'ACTIVE', deletedAt: null },
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

    // Monthly Revenue & Expenses from General Ledger (last 6 months)
    const monthlyData = await Promise.all(
      months.map(async (m) => {
        const startDate = new Date(m.year, m.month - 1, 1)
        const endDate = new Date(m.year, m.month, 1)

        const revenue = await getGLBalance('REVENUE', { startDate, endDate })
        const expenses = await getGLBalance('EXPENSE', { startDate, endDate })

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

    // ===== 5. Total Revenue & Expenses (all time from GL) =====
    const totalRevenue = await getGLBalance('REVENUE')
    const totalExpenses = await getGLBalance('EXPENSE')
    const netProfit = totalRevenue - totalExpenses

    // ===== 5b. Activity-Based Metrics =====
    const constructionProjects = await db.project.count({ where: { projectType: 'CONSTRUCTION', deletedAt: null } })
    const rentalProjects = await db.project.count({ where: { projectType: 'EQUIPMENT_RENTAL', deletedAt: null } })
    const activeConstructionProjects = await db.project.count({ where: { projectType: 'CONSTRUCTION', status: { in: ['ACTIVE', 'PLANNING'] }, deletedAt: null } })
    const activeRentalProjects = await db.project.count({ where: { projectType: 'EQUIPMENT_RENTAL', status: { in: ['ACTIVE', 'PLANNING'] }, deletedAt: null } })

    // Get project IDs by type for filtering
    const constructionProjectIds = (await db.project.findMany({
      where: { projectType: 'CONSTRUCTION', deletedAt: null },
      select: { id: true },
    })).map(p => p.id)
    const rentalProjectIds = (await db.project.findMany({
      where: { projectType: 'EQUIPMENT_RENTAL' },
      select: { id: true },
    })).map(p => p.id)

    // Construction & Rental revenue/costs from General Ledger
    const constructionRevenue = await getGLBalance('REVENUE', { activityType: 'CONSTRUCTION' })
    const rentalRevenue = await getGLBalance('REVENUE', { activityType: 'EQUIPMENT_RENTAL' })
    const constructionCosts = await getGLBalance('EXPENSE', { activityType: 'CONSTRUCTION' })
    const rentalCosts = await getGLBalance('EXPENSE', { activityType: 'EQUIPMENT_RENTAL' })
    const constructionProfit = constructionRevenue - constructionCosts
    const rentalProfit = rentalRevenue - rentalCosts

    // Equipment rented out count
    const rentedEquipment = equipmentStatusMap['RENTED'] || 0
    const inUseEquipment = equipmentStatusMap['IN_USE'] || 0

    // ===== 6. Project Profitability Summary (GL-BASED) =====
    // Get all active projects with their cost centers (exclude soft-deleted)
    const projects = await db.project.findMany({
      where: { status: { in: ['ACTIVE', 'PLANNING', 'COMPLETED'] }, deletedAt: null },
      include: {
        client: { select: { name: true } },
        contracts: { select: { totalValue: true } },
      },
      orderBy: { contractValue: 'desc' },
      take: 10,
    })

    // Find cost centers for these projects
    const projectCodes = projects.map(p => p.code)
    const costCenters = await db.costCenter.findMany({
      where: { code: { in: projectCodes } },
      select: { id: true, code: true },
    })
    // Single GL query for all project-related journal lines
    const projectCostCenterIds = costCenters.map(cc => cc.id)

    // Get all journal lines for these cost centers with revenue/expense accounts
    const projectGLLines = projectCostCenterIds.length > 0
      ? await db.journalLine.findMany({
          where: {
            costCenterId: { in: projectCostCenterIds },
            deletedAt: null,
            journalEntry: { status: 'POSTED', deletedAt: null },
            account: { type: { in: ['REVENUE', 'EXPENSE'] } },
          },
          include: { account: { select: { type: true } }, costCenter: { select: { code: true } } },
        })
      : []

    // Build per-project GL aggregation
    const projectGLMap = new Map<string, { revenue: number; costs: number }>()
    for (const line of projectGLLines) {
      const ccCode = line.costCenter?.code
      if (!ccCode) continue
      if (!projectGLMap.has(ccCode)) {
        projectGLMap.set(ccCode, { revenue: 0, costs: 0 })
      }
      const entry = projectGLMap.get(ccCode)!
      if (line.account.type === 'REVENUE') {
        entry.revenue += toNumber(line.credit) - toNumber(line.debit)
      } else if (line.account.type === 'EXPENSE') {
        entry.costs += toNumber(line.debit) - toNumber(line.credit)
      }
    }

    const projectProfitability = projects.map(p => {
      const contractValue = Number(p.contractValue || p.contracts.reduce((s, c) => s + Number(c.totalValue || 0), 0))
      const glData = projectGLMap.get(p.code) || { revenue: 0, costs: 0 }
      const totalRevenue = glData.revenue
      const totalCosts = glData.costs
      const profit = contractValue - totalCosts
      const margin = contractValue > 0 ? (profit / contractValue) * 100 : 0

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        projectType: p.projectType,
        clientName: p.client.name,
        contractValue,
        totalCosts,
        totalRevenue,
        profit,
        margin,
      }
    })

    // ===== 7-8. Single batch query for all role-based account balances =====
    const allRoleAccounts = await db.account.findMany({
      where: {
        code: { in: allCodes },
        isActive: true,
      },
      select: { id: true, code: true, type: true },
      orderBy: { code: 'asc' },
    })

    const allRoleAccountIds = allRoleAccounts.map(a => a.id)
    const balanceAggregates = allRoleAccountIds.length > 0
      ? await db.journalLine.groupBy({
          by: ['accountId'],
          _sum: { debit: true, credit: true },
          where: {
            accountId: { in: allRoleAccountIds },
            deletedAt: null,
            journalEntry: { status: 'POSTED', deletedAt: null },
          },
        })
      : []

    const balanceMap = new Map<string, { totalDebit: number; totalCredit: number }>()
    for (const agg of balanceAggregates) {
      balanceMap.set(agg.accountId, {
        totalDebit: toNumber(agg._sum.debit),
        totalCredit: toNumber(agg._sum.credit),
      })
    }

    // Compute role-based balances
    const clientsReceivable = computeBalanceFromMap(arCodes, allRoleAccounts, balanceMap)
    const retentionReceivable = computeBalanceFromMap(retentionCodes, allRoleAccounts, balanceMap)
    const employeeAdvances = computeBalanceFromMap(employeeAdvanceCodes, allRoleAccounts, balanceMap)
    const supplierAdvances = computeBalanceFromMap(supplierAdvCodes, allRoleAccounts, balanceMap)
    const otherReceivablesBalance = computeBalanceFromMap(otherRecvCodes, allRoleAccounts, balanceMap)
    const outstandingReceivables = clientsReceivable + retentionReceivable + employeeAdvances + supplierAdvances + otherReceivablesBalance

    const suppliersPayable = computeBalanceFromMap(supplierApCodes, allRoleAccounts, balanceMap)
    const subcontractorsPayable = computeBalanceFromMap(subcontractorApCodes, allRoleAccounts, balanceMap)
    const salariesPayable = computeBalanceFromMap(salariesPayableCodes, allRoleAccounts, balanceMap)
    const otherAccrued = computeBalanceFromMap(otherAccruedCodes, allRoleAccounts, balanceMap)
    const outstandingPayables = suppliersPayable + subcontractorsPayable + salariesPayable + otherAccrued

    // Overdue Receivables (still from operational tables - GL has no due-date concept)
    const overdueReceivablesInvoices = await db.salesInvoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: now },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const overdueReceivables = overdueReceivablesInvoices.reduce(
      (s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0
    )

    // Overdue Payables (still from operational tables - GL has no due-date concept)
    const overduePayablesInvoices = await db.purchaseInvoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lt: now },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const overduePayables = overduePayablesInvoices.reduce(
      (s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0
    )

    // ===== 9. Recent Transactions (last 10 journal entries) =====
    const recentEntries = await db.journalEntry.findMany({
      where: { status: 'POSTED', deletedAt: null, isReversal: false },
      include: {
        lines: {
          where: { deletedAt: null },
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
      totalDebit: e.lines.reduce((s, l) => s + Number(l.debit || 0), 0),
      totalCredit: e.lines.reduce((s, l) => s + Number(l.credit || 0), 0),
      sourceType: e.sourceType,
    }))

    // ===== 10. Equipment Utilization Rate =====
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
        deletedAt: null,
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

    // ===== 12. Cash Position (treasury + bank balances from role-based GL) =====
    const cashBalance = computeBalanceFromMap(cashCodes, allRoleAccounts, balanceMap)
    const bankBalance = computeBalanceFromMap(bankCodes, allRoleAccounts, balanceMap)
    const pettyCashBalance = computeBalanceFromMap(pettyCashCodes, allRoleAccounts, balanceMap)
    const cashPosition = cashBalance + bankBalance + pettyCashBalance

    // ===== 13. VAT Position (from role-based GL) =====
    const outputVat = computeBalanceFromMap(outputVatCodes, allRoleAccounts, balanceMap)
    const inputVat = computeBalanceFromMap(inputVatCodes, allRoleAccounts, balanceMap)
    const vatDue = computeBalanceFromMap(vatDueCodes, allRoleAccounts, balanceMap)
    const netVAT = outputVat - inputVat

    // ===== 14. Low Inventory Items =====
    // Use $queryRaw to compare quantity against minQuantity (column-to-column comparison).
    // PostgreSQL-compatible (also runs on SQLite): quoted mixed-case identifiers +
    // TRUE literal (SQLite ≥ 3.23 treats TRUE as 1; PostgreSQL uses native boolean).
    const lowInventoryResult = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "InventoryItem" WHERE quantity <= "minQuantity" AND "isActive" = TRUE
    `
    const lowInventoryItems = Number(lowInventoryResult[0]?.count || 0)

    // ===== 15. Project Status Distribution =====
    const statusCounts = await db.project.groupBy({
      by: ['status'],
      _count: { status: true },
    })
    const projectStatusDistribution = statusCounts.map(s => ({
      status: s.status,
      count: s._count.status,
    }))

    // ===== 16. Hub-specific data =====
    // Recent construction projects (last 5)
    const recentConstructionProjects = await db.project.findMany({
      where: { projectType: 'CONSTRUCTION', deletedAt: null },
      select: {
        id: true, code: true, name: true, status: true, contractValue: true,
        client: { select: { name: true } },
        startDate: true, endDate: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // Recent rental contracts (last 5)
    const recentRentalContracts = await db.equipmentRental.findMany({
      select: {
        id: true, status: true, startDate: true, endDate: true,
        referenceRate: true, pricingType: true, hourlyRate: true, deliveryFees: true, totalAmount: true,
        contract: { select: { contractNo: true } },
        equipment: { select: { id: true, code: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // Total extracts (progress claims) count
    const totalExtracts = await db.progressClaim.count()

    // Total client invoices count
    const totalClientInvoices = await db.salesInvoice.count()

    // For outstanding collections, use operational data (GL doesn't track paid vs unpaid per invoice)
    const constructionReceivablesInvoices = await db.salesInvoice.findMany({
      where: {
        projectId: { in: constructionProjectIds },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const outstandingConstructionCollections = constructionReceivablesInvoices.reduce(
      (s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0
    )

    // Outstanding rental collections (unpaid rental invoices)
    const rentalReceivablesInvoices = await db.salesInvoice.findMany({
      where: {
        OR: [
          { sourceType: 'TIMESHEET' },
          { projectId: { in: rentalProjectIds } },
        ],
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { totalAmount: true, paidAmount: true },
    })
    const outstandingRentalCollections = rentalReceivablesInvoices.reduce(
      (s, i) => s + (Number(i.totalAmount) - Number(i.paidAmount)), 0
    )

    // Construction contract value (sum of all active construction project contracts)
    const constructionContractAgg = await db.contract.aggregate({
      _sum: { totalValue: true },
      where: { project: { projectType: 'CONSTRUCTION' }, status: 'ACTIVE' },
    })
    const constructionContractValue = constructionContractAgg._sum.totalValue || 0

    // Total extracts amount from GL (REVENUE accounts with construction cost centers)
    const extractsAgg = await db.progressClaim.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] } },
    })
    const totalExtractsAmount = extractsAgg._sum.totalAmount || 0

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
      vatPayable: outputVat,
      vatReceivable: inputVat,
      outputVat,
      inputVat,
      vatDue,
      lowInventoryItems,

      // Activity-Based Metrics
      constructionProjects,
      rentalProjects,
      activeConstructionProjects,
      activeRentalProjects,
      constructionRevenue,
      rentalRevenue,
      constructionCosts,
      rentalCosts,
      constructionProfit,
      rentalProfit,
      rentedEquipment,
      inUseEquipment,
      availableEquipment: equipmentStatusMap['AVAILABLE'] || 0,

      // Hub-specific Data
      recentConstructionProjects: recentConstructionProjects.map(p => ({
        ...p,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate?.toISOString() || null,
      })),
      recentRentalContracts: recentRentalContracts.map(c => ({
        id: c.id,
        contractNo: c.contract.contractNo,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() || null,
        rate: c.referenceRate,
        rateType: c.pricingType,
        deliveryFees: c.deliveryFees,
        totalAmount: c.totalAmount,
        equipment: c.equipment,
        client: c.client,
      })),
      totalExtracts,
      totalExtractsAmount,
      totalClientInvoices,
      outstandingConstructionCollections,
      outstandingRentalCollections,
      constructionContractValue,

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
