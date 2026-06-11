import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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
            expenses: { select: { amount: true } },
            laborCosts: { select: { totalAmount: true } },
            equipmentCosts: { select: { amount: true } },
            purchaseOrders: { select: { totalAmount: true } },
            progressClaims: { select: { totalAmount: true, status: true } },
            subcontractorInvoices: { select: { totalAmount: true } },
          },
          orderBy: { code: 'asc' },
        })
        const data = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0)
          const totalCosts = p.expenses.reduce((s, e) => s + e.amount, 0) +
            p.laborCosts.reduce((s, l) => s + l.totalAmount, 0) +
            p.equipmentCosts.reduce((s, e) => s + e.amount, 0) +
            p.purchaseOrders.reduce((s, po) => s + po.totalAmount, 0) +
            p.subcontractorInvoices.reduce((s, si) => s + si.totalAmount, 0)
          const totalRevenue = p.progressClaims.reduce((s, c) => s + c.totalAmount, 0)
          return {
            id: p.id, code: p.code, name: p.name, status: p.status,
            client: p.client.name, contractValue, totalCosts, totalRevenue,
            profit: totalRevenue - totalCosts,
            margin: totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue) * 100 : 0,
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
        const expenses = await db.expense.findMany({
          include: {
            project: { select: { code: true, name: true } },
          },
          orderBy: { date: 'desc' },
        })
        const byCategory: Record<string, number> = {}
        expenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount })
        const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
        return NextResponse.json({ expenses, byCategory, totalExpenses })
      }

      case 'sales': {
        const invoices = await db.salesInvoice.findMany({
          include: {
            client: { select: { name: true } },
            project: { select: { name: true } },
            items: true,
          },
          orderBy: { date: 'desc' },
        })
        const totalSales = invoices.reduce((s, i) => s + i.totalAmount, 0)
        const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0)
        return NextResponse.json({ invoices, totalSales, totalPaid, totalOutstanding: totalSales - totalPaid })
      }

      case 'purchases': {
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
        const totalPOs = pos.reduce((s, p) => s + p.totalAmount, 0)
        const totalPIs = pis.reduce((s, p) => s + p.totalAmount, 0)
        const totalPaid = pis.reduce((s, p) => s + p.paidAmount, 0)
        return NextResponse.json({ purchaseOrders: pos, purchaseInvoices: pis, totalPOs, totalPIs, totalPaid, totalOutstanding: totalPIs - totalPaid })
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
            journalLines: true,
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
            journalLines: true,
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
            expenses: { select: { amount: true, category: true } },
            laborCosts: { select: { totalAmount: true } },
            equipmentCosts: { select: { amount: true } },
            purchaseOrders: { select: { totalAmount: true } },
            progressClaims: { select: { totalAmount: true, status: true } },
            subcontractorInvoices: { select: { totalAmount: true } },
          },
          orderBy: { code: 'asc' },
        })
        const projectCards = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0)
          const issuedExtracts = p.progressClaims.reduce((s, c) => s + c.totalAmount, 0)
          const purchases = p.purchaseOrders.reduce((s, po) => s + po.totalAmount, 0) +
            p.subcontractorInvoices.reduce((s, si) => s + si.totalAmount, 0)
          const projectExpenses = p.expenses.reduce((s, e) => s + e.amount, 0) +
            p.laborCosts.reduce((s, l) => s + l.totalAmount, 0) +
            p.equipmentCosts.reduce((s, e) => s + e.amount, 0)
          const totalCost = purchases + projectExpenses
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
            purchases,
            projectExpenses,
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
        // ===== CONSTRUCTION PROJECTS =====
        const constructionProjects = await db.project.findMany({
          where: { projectType: 'CONSTRUCTION' },
          select: {
            id: true,
            status: true,
            contractValue: true,
            contracts: { select: { totalValue: true } },
            progressClaims: { select: { totalAmount: true, status: true } },
            purchaseOrders: { select: { totalAmount: true } },
            subcontractorInvoices: { select: { totalAmount: true } },
            expenses: { select: { amount: true, category: true } },
            laborCosts: { select: { totalAmount: true } },
            equipmentCosts: { select: { amount: true } },
            equipmentUsages: { select: { cost: true } },
          },
        })

        const constructionProjectCount = constructionProjects.length
        const constructionActiveProjectCount = constructionProjects.filter(p => p.status === 'ACTIVE').length
        const constructionTotalContractValue = constructionProjects.reduce((s, p) => {
          const cv = p.contracts.reduce((s2, c) => s2 + c.totalValue, 0)
          return s + (cv > 0 ? cv : p.contractValue)
        }, 0)

        // Construction revenue: progress claims + construction sales invoices
        const constructionProgressClaimRevenue = constructionProjects.reduce(
          (s, p) => s + p.progressClaims.reduce((s2, c) => s2 + c.totalAmount, 0), 0
        )
        const constructionSalesInvoices = await db.salesInvoice.findMany({
          where: {
            project: { projectType: 'CONSTRUCTION' },
            sourceType: 'EXTRACT',
          },
          select: { totalAmount: true },
        })
        const constructionSalesInvoiceRevenue = constructionSalesInvoices.reduce((s, i) => s + i.totalAmount, 0)
        const constructionTotalRevenue = constructionProgressClaimRevenue + constructionSalesInvoiceRevenue

        // Construction cost breakdown
        const constructionMaterialCosts = constructionProjects.reduce(
          (s, p) => s + p.purchaseOrders.reduce((s2, po) => s2 + po.totalAmount, 0), 0
        )
        const constructionLaborCosts = constructionProjects.reduce(
          (s, p) => s + p.laborCosts.reduce((s2, l) => s2 + l.totalAmount, 0), 0
        )
        const constructionSubcontractorCosts = constructionProjects.reduce(
          (s, p) => s + p.subcontractorInvoices.reduce((s2, si) => s2 + si.totalAmount, 0), 0
        )
        const constructionEquipmentCosts = constructionProjects.reduce(
          (s, p) => s + p.equipmentCosts.reduce((s2, e) => s2 + e.amount, 0) +
            p.equipmentUsages.reduce((s2, u) => s2 + u.cost, 0), 0
        )
        const constructionProjectExpenses = constructionProjects.reduce(
          (s, p) => s + p.expenses.reduce((s2, e) => s2 + e.amount, 0), 0
        )
        const constructionTotalCosts = constructionMaterialCosts + constructionLaborCosts +
          constructionSubcontractorCosts + constructionEquipmentCosts + constructionProjectExpenses
        const constructionProfit = constructionTotalRevenue - constructionTotalCosts
        const constructionProfitMargin = constructionTotalRevenue > 0
          ? (constructionProfit / constructionTotalRevenue) * 100 : 0

        // ===== RENTAL PROJECTS =====
        const rentalProjects = await db.project.findMany({
          where: { projectType: 'EQUIPMENT_RENTAL' },
          select: {
            id: true,
            status: true,
            expenses: { select: { amount: true, category: true } },
            equipmentCosts: { select: { amount: true } },
            equipmentUsages: { select: { cost: true } },
            timesheets: { select: { id: true, operatingHours: true } },
          },
        })

        const rentalProjectCount = rentalProjects.length
        const rentalActiveProjectCount = rentalProjects.filter(p => p.status === 'ACTIVE').length

        // Rental revenue: timesheet-based sales invoices
        const rentalSalesInvoices = await db.salesInvoice.findMany({
          where: {
            project: { projectType: 'EQUIPMENT_RENTAL' },
            sourceType: 'TIMESHEET',
          },
          select: { totalAmount: true },
        })
        const rentalTotalRevenue = rentalSalesInvoices.reduce((s, i) => s + i.totalAmount, 0)

        // Rental costs: maintenance + fuel + equipment expenses for rental projects
        const rentalProjectIds = rentalProjects.map(p => p.id)

        // Equipment used in rental projects
        const rentalEquipments = await db.equipmentRental.findMany({
          where: { projectId: { in: rentalProjectIds } },
          select: { equipmentId: true },
        })
        const rentalEquipmentIds = [...new Set(rentalEquipments.map(r => r.equipmentId))]
        const rentedEquipmentCount = rentalEquipmentIds.length

        // Maintenance costs for equipment used in rental projects
        const rentalMaintenanceCosts = rentalEquipmentIds.length > 0
          ? (await db.equipmentMaintenance.findMany({
              where: { equipmentId: { in: rentalEquipmentIds } },
              select: { cost: true },
            })).reduce((s, m) => s + m.cost, 0)
          : 0

        // Fuel costs for rental projects
        const rentalFuelCosts = rentalProjectIds.length > 0
          ? (await db.equipmentFuelLog.findMany({
              where: { projectId: { in: rentalProjectIds } },
              select: { totalCost: true },
            })).reduce((s, f) => s + f.totalCost, 0)
          : 0

        // Operation costs (equipment usages for rental projects)
        const rentalOperationCosts = rentalProjects.reduce(
          (s, p) => s + p.equipmentUsages.reduce((s2, u) => s2 + u.cost, 0), 0
        )

        // Rental expenses
        const rentalExpenses = rentalProjects.reduce(
          (s, p) => s + p.expenses.reduce((s2, e) => s2 + e.amount, 0) +
            p.equipmentCosts.reduce((s2, e) => s2 + e.amount, 0), 0
        )

        const rentalTotalCosts = rentalMaintenanceCosts + rentalFuelCosts + rentalOperationCosts + rentalExpenses
        const rentalProfit = rentalTotalRevenue - rentalTotalCosts
        const rentalProfitMargin = rentalTotalRevenue > 0
          ? (rentalProfit / rentalTotalRevenue) * 100 : 0

        return NextResponse.json({
          construction: {
            projectCount: constructionProjectCount,
            activeProjectCount: constructionActiveProjectCount,
            totalContractValue: constructionTotalContractValue,
            totalRevenue: constructionTotalRevenue,
            totalCosts: constructionTotalCosts,
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
            totalRentalRevenue: rentalTotalRevenue,
            totalRentalCosts: rentalTotalCosts,
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
            progressClaims: { select: { totalAmount: true, status: true, invoiced: true } },
            salesInvoices: { select: { totalAmount: true, paidAmount: true, status: true } },
            purchaseOrders: { select: { totalAmount: true } },
            subcontractorInvoices: { select: { totalAmount: true, status: true } },
            expenses: { select: { amount: true, category: true } },
            laborCosts: { select: { totalAmount: true } },
            equipmentCosts: { select: { amount: true } },
            equipmentUsages: { select: { cost: true } },
          },
          orderBy: { code: 'asc' },
        })
        const projectProfitability = projects.map(p => {
          const contractValue = p.contracts.reduce((s, c) => s + c.totalValue, 0) || p.contractValue
          const invoiced = p.progressClaims.reduce((s, c) => s + c.totalAmount, 0) +
            p.salesInvoices.reduce((s, i) => s + i.totalAmount, 0)
          const collected = p.salesInvoices.reduce((s, i) => s + i.paidAmount, 0)
          const materialCosts = p.purchaseOrders.reduce((s, po) => s + po.totalAmount, 0)
          const subcontractorCosts = p.subcontractorInvoices.reduce((s, si) => s + si.totalAmount, 0)
          const laborCosts = p.laborCosts.reduce((s, l) => s + l.totalAmount, 0)
          const equipmentCosts = p.equipmentCosts.reduce((s, e) => s + e.amount, 0) +
            p.equipmentUsages.reduce((s, u) => s + u.cost, 0)
          const projectExpenses = p.expenses.reduce((s, e) => s + e.amount, 0)
          const totalCosts = materialCosts + subcontractorCosts + laborCosts + equipmentCosts + projectExpenses
          const grossProfit = contractValue - totalCosts
          const profitMargin = contractValue > 0 ? (grossProfit / contractValue) * 100 : 0
          return {
            id: p.id, code: p.code, name: p.name, nameAr: p.nameAr,
            status: p.status, projectType: p.projectType,
            client: p.client.name, contractValue, invoiced, collected,
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
        const equipment = await db.equipment.findMany({
          where: { isActive: true },
          include: {
            operatorLogs: { select: { hours: true, date: true } },
            maintenance: { select: { cost: true } },
            fuelLogs: { select: { totalCost: true } },
            usages: { select: { cost: true } },
            rentals: { select: { rate: true, rateType: true, deliveryFees: true } },
          },
          orderBy: { code: 'asc' },
        })
        const equipmentUtilization = equipment.map(eq => {
          const totalHoursRented = eq.operatorLogs.reduce((s, o) => s + o.hours, 0)
          const revenueGenerated = eq.rentals.reduce((s, r) => {
            const rate = r.rate || eq.hourlyRate
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
        const rentalInvoices = await db.salesInvoice.findMany({
          where: { sourceType: 'TIMESHEET', status: { not: 'CANCELLED' } },
          include: {
            client: { select: { id: true, code: true, name: true, nameAr: true } },
          },
          orderBy: { date: 'desc' },
        })
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
        const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0)
        return NextResponse.json({ clients, totalRevenue })
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
        const totalPurchases = supplierInvoices.reduce((s, i) => s + i.totalAmount, 0)
        return NextResponse.json({ bySupplier: Object.values(bySupplier), byProject: Object.values(byProject), totalPurchases, invoiceCount: supplierInvoices.length })
      }

      case 'revenue-summary': {
        // Construction revenue from sales invoices (EXTRACT source)
        const constructionInvoices = await db.salesInvoice.findMany({
          where: { sourceType: 'EXTRACT', status: { not: 'CANCELLED' } },
          select: { totalAmount: true, date: true },
        })
        // Rental revenue from sales invoices (TIMESHEET source)
        const rentalInvoices = await db.salesInvoice.findMany({
          where: { sourceType: 'TIMESHEET', status: { not: 'CANCELLED' } },
          select: { totalAmount: true, date: true },
        })
        const totalConstructionRevenue = constructionInvoices.reduce((s, i) => s + i.totalAmount, 0)
        const totalRentalRevenue = rentalInvoices.reduce((s, i) => s + i.totalAmount, 0)
        // Monthly breakdown
        const monthlyData: Record<string, { month: string; construction: number; rental: number }> = {}
        for (const inv of constructionInvoices) {
          const month = new Date(inv.date).toISOString().slice(0, 7)
          if (!monthlyData[month]) monthlyData[month] = { month, construction: 0, rental: 0 }
          monthlyData[month].construction += inv.totalAmount
        }
        for (const inv of rentalInvoices) {
          const month = new Date(inv.date).toISOString().slice(0, 7)
          if (!monthlyData[month]) monthlyData[month] = { month, construction: 0, rental: 0 }
          monthlyData[month].rental += inv.totalAmount
        }
        const monthly = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))
        return NextResponse.json({
          totalConstructionRevenue, totalRentalRevenue, totalRevenue: totalConstructionRevenue + totalRentalRevenue,
          monthly,
        })
      }

      case 'expense-summary': {
        // Direct costs: expenses with projectId
        const directExpenses = await db.expense.findMany({
          where: { projectId: { not: null } },
          select: { amount: true, category: true, vatAmount: true },
        })
        // Indirect costs: expenses without projectId
        const indirectExpenses = await db.expense.findMany({
          where: { projectId: null },
          select: { amount: true, category: true, vatAmount: true },
        })
        const directByCategory: Record<string, number> = {}
        for (const e of directExpenses) { directByCategory[e.category] = (directByCategory[e.category] || 0) + e.amount }
        const indirectByCategory: Record<string, number> = {}
        for (const e of indirectExpenses) { indirectByCategory[e.category] = (indirectByCategory[e.category] || 0) + e.amount }
        const totalDirect = directExpenses.reduce((s, e) => s + e.amount, 0)
        const totalIndirect = indirectExpenses.reduce((s, e) => s + e.amount, 0)
        return NextResponse.json({
          totalDirect, totalIndirect, totalExpenses: totalDirect + totalIndirect,
          directByCategory, indirectByCategory,
        })
      }

      case 'cash-flow-summary': {
        // Cash inflows: client payments
        const clientPayments = await db.clientPayment.findMany({
          select: { amount: true, date: true },
        })
        // Cash outflows: supplier payments
        const supplierPayments = await db.supplierPayment.findMany({
          select: { amount: true, date: true },
        })
        // Salary payments (use month/year for date since Salary model has no date field)
        const salaryPayments = await db.salary.findMany({
          where: { status: 'PAID' },
          select: { netSalary: true, month: true, year: true, createdAt: true },
        })
        const totalInflows = clientPayments.reduce((s, p) => s + p.amount, 0)
        const salaryTotal = salaryPayments.reduce((s, s2) => s + s2.netSalary, 0)
        const totalOutflows = supplierPayments.reduce((s, p) => s + p.amount, 0) + salaryTotal
        // Monthly breakdown
        const monthlyData: Record<string, { month: string; inflows: number; outflows: number }> = {}
        for (const p of clientPayments) {
          const month = new Date(p.date).toISOString().slice(0, 7)
          if (!monthlyData[month]) monthlyData[month] = { month, inflows: 0, outflows: 0 }
          monthlyData[month].inflows += p.amount
        }
        for (const p of supplierPayments) {
          const month = new Date(p.date).toISOString().slice(0, 7)
          if (!monthlyData[month]) monthlyData[month] = { month, inflows: 0, outflows: 0 }
          monthlyData[month].outflows += p.amount
        }
        for (const s of salaryPayments) {
          const month = `${s.year}-${String(s.month).padStart(2, '0')}`
          if (!monthlyData[month]) monthlyData[month] = { month, inflows: 0, outflows: 0 }
          monthlyData[month].outflows += s.netSalary
        }
        const monthly = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))
        return NextResponse.json({
          totalInflows, totalOutflows, netCashFlow: totalInflows - totalOutflows,
          clientPaymentsTotal: clientPayments.reduce((s, p) => s + p.amount, 0),
          supplierPaymentsTotal: supplierPayments.reduce((s, p) => s + p.amount, 0),
          salaryPaymentsTotal: salaryTotal,
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
