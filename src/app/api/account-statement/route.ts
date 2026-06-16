import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 })
    }

    switch (entityType) {
      case 'customer':
        return await getCustomerStatement(entityId, dateFrom, dateTo)
      case 'vendor':
        return await getVendorStatement(entityId, dateFrom, dateTo)
      case 'project':
        return await getProjectStatement(entityId, dateFrom, dateTo)
      case 'equipment':
        return await getEquipmentStatement(entityId, dateFrom, dateTo)
      default:
        return NextResponse.json({ error: 'Invalid entityType' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error generating account statement:', error)
    return NextResponse.json({ error: 'Failed to generate account statement' }, { status: 500 })
  }
}

// ============ CUSTOMER STATEMENT ============

async function getCustomerStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const client = await db.client.findUnique({ where: { id: entityId } })
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Get all invoices for this client (descriptive detail)
  const invoices = await db.salesInvoice.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // Get all payments for this client (descriptive detail)
  const payments = await db.clientPayment.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // Build operational opening balance (before dateFrom)
  let operationalOpeningBalance = 0
  if (dateFrom) {
    const from = new Date(dateFrom)
    const invoicesBefore = invoices.filter((i) => new Date(i.date) < from)
    const paymentsBefore = payments.filter((p) => new Date(p.date) < from)
    operationalOpeningBalance = invoicesBefore.reduce((s, i) => s + i.totalAmount, 0) - paymentsBefore.reduce((s, p) => s + p.amount, 0)
  }

  // Build statement lines (operational - descriptive detail)
  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = operationalOpeningBalance

  // Filter to date range
  const filteredInvoices = dateFrom || dateTo
    ? invoices.filter((i) => {
        const d = new Date(i.date)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo)) return false
        return true
      })
    : invoices

  const filteredPayments = dateFrom || dateTo
    ? payments.filter((p) => {
        const d = new Date(p.date)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo)) return false
        return true
      })
    : payments

  // Combine and sort by date
  const allEntries: { date: Date; description: string; debit: number; credit: number; category: string }[] = [
    ...filteredInvoices.map((i) => ({
      date: new Date(i.date),
      description: `Invoice ${i.invoiceNo}`,
      debit: i.totalAmount,
      credit: 0,
      category: 'invoice',
    })),
    ...filteredPayments.map((p) => ({
      date: new Date(p.date),
      description: p.notes || `Payment${p.reference ? ` - ${p.reference}` : ''}`,
      debit: 0,
      credit: p.amount,
      category: 'payment',
    })),
  ]

  allEntries.sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const entry of allEntries) {
    runningBalance += entry.debit - entry.credit
    lines.push({
      date: entry.date.toISOString().split('T')[0],
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      balance: runningBalance,
      category: entry.category,
    })
  }

  const totalRevenues = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalCosts = filteredPayments.reduce((s, p) => s + p.amount, 0)
  const profit = totalRevenues - totalCosts

  // ===== GL-based book balance (رصيد دفتري) =====
  // Get AR account balance from GL filtered by this client's cost center
  const arAccounts = await getAccountsByRoles([AccountRole.CUSTOMER_AR])
  const arCodes = arAccounts.length > 0 ? arAccounts.map(a => a.code) : ['1210']

  // Find cost center for this client
  const clientCostCenter = await db.costCenter.findFirst({
    where: { code: client.code || client.id },
  })

  let bookBalance = 0
  if (arAccounts.length > 0) {
    const jeWhere: Record<string, unknown> = { status: 'POSTED' }
    if (dateFrom || dateTo) {
      jeWhere.date = {}
      if (dateFrom) jeWhere.date.gte = new Date(dateFrom)
      if (dateTo) jeWhere.date.lte = new Date(dateTo)
    }

    const arAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: { in: arAccounts.map(a => a.id) },
        ...(clientCostCenter ? { costCenterId: clientCostCenter.id } : {}),
        journalEntry: jeWhere,
      },
    })
    // AR is ASSET (debit normal)
    bookBalance = toNumber(arAgg._sum.debit) - toNumber(arAgg._sum.credit)
  }

  return NextResponse.json({
    entity: { id: client.id, name: client.name, type: 'customer' },
    openingBalance: operationalOpeningBalance,
    lines,
    closingBalance: runningBalance,
    // رصيد دفتري (book balance from GL)
    bookBalance,
    // رصيد مستخلص (statement balance from operations)
    statementBalance: runningBalance,
    summary: {
      totalRevenues,
      totalCosts,
      profit,
      profitMargin: totalRevenues > 0 ? (profit / totalRevenues) * 100 : 0,
    },
  })
}

// ============ VENDOR STATEMENT ============

async function getVendorStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const supplier = await db.supplier.findUnique({ where: { id: entityId } })
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  const invoices = await db.purchaseInvoice.findMany({
    where: { supplierId: entityId },
    orderBy: { date: 'asc' },
  })

  const payments = await db.supplierPayment.findMany({
    where: { supplierId: entityId },
    orderBy: { date: 'asc' },
  })

  // Build operational opening balance (before dateFrom)
  let operationalOpeningBalance = 0
  if (dateFrom) {
    const from = new Date(dateFrom)
    const invoicesBefore = invoices.filter((i) => new Date(i.date) < from)
    const paymentsBefore = payments.filter((p) => new Date(p.date) < from)
    // For vendors: invoices are credits (we owe), payments are debits (we pay)
    operationalOpeningBalance = invoicesBefore.reduce((s, i) => s + i.totalAmount, 0) - paymentsBefore.reduce((s, p) => s + p.amount, 0)
  }

  const filteredInvoices = dateFrom || dateTo
    ? invoices.filter((i) => {
        const d = new Date(i.date)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo)) return false
        return true
      })
    : invoices

  const filteredPayments = dateFrom || dateTo
    ? payments.filter((p) => {
        const d = new Date(p.date)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo)) return false
        return true
      })
    : payments

  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = operationalOpeningBalance

  const allEntries: { date: Date; description: string; debit: number; credit: number; category: string }[] = [
    ...filteredInvoices.map((i) => ({
      date: new Date(i.date),
      description: `Invoice ${i.invoiceNo}`,
      debit: 0,
      credit: i.totalAmount,
      category: 'invoice',
    })),
    ...filteredPayments.map((p) => ({
      date: new Date(p.date),
      description: p.notes || `Payment${p.reference ? ` - ${p.reference}` : ''}`,
      debit: p.amount,
      credit: 0,
      category: 'payment',
    })),
  ]

  allEntries.sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const entry of allEntries) {
    runningBalance += entry.credit - entry.debit
    lines.push({
      date: entry.date.toISOString().split('T')[0],
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      balance: runningBalance,
      category: entry.category,
    })
  }

  const totalRevenues = filteredPayments.reduce((s, p) => s + p.amount, 0)
  const totalCosts = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0)

  // ===== GL-based book balance (رصيد دفتري) =====
  const apAccounts = await getAccountsByRoles([AccountRole.SUPPLIER_AP, AccountRole.SUBCONTRACTOR_AP])
  const apCodes = apAccounts.length > 0 ? apAccounts.map(a => a.code) : ['3210']

  // Find cost center for this supplier
  const supplierCostCenter = await db.costCenter.findFirst({
    where: { code: supplier.code || supplier.id },
  })

  let bookBalance = 0
  if (apAccounts.length > 0) {
    const jeWhere: Record<string, unknown> = { status: 'POSTED' }
    if (dateFrom || dateTo) {
      jeWhere.date = {}
      if (dateFrom) jeWhere.date.gte = new Date(dateFrom)
      if (dateTo) jeWhere.date.lte = new Date(dateTo)
    }

    const apAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: { in: apAccounts.map(a => a.id) },
        ...(supplierCostCenter ? { costCenterId: supplierCostCenter.id } : {}),
        journalEntry: jeWhere,
      },
    })
    // AP is LIABILITY (credit normal)
    bookBalance = toNumber(apAgg._sum.credit) - toNumber(apAgg._sum.debit)
  }

  return NextResponse.json({
    entity: { id: supplier.id, name: supplier.name, type: 'vendor' },
    openingBalance: operationalOpeningBalance,
    lines,
    closingBalance: runningBalance,
    // رصيد دفتري (book balance from GL)
    bookBalance,
    // رصيد مستخلص (statement balance from operations)
    statementBalance: runningBalance,
    summary: {
      totalRevenues,
      totalCosts,
      profit: totalRevenues - totalCosts,
      profitMargin: totalCosts > 0 ? ((totalRevenues - totalCosts) / totalCosts) * 100 : 0,
    },
  })
}

// ============ PROJECT STATEMENT (GL-ONLY, NO DOUBLE COUNTING) ============

async function getProjectStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const project = await db.project.findUnique({ where: { id: entityId } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Find CostCenter linked to this project
  const costCenter = await db.costCenter.findFirst({
    where: { code: project.code },
  })

  // Build journal entry filter
  const dateFilter: Record<string, Date> = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo) dateFilter.lte = new Date(dateTo)

  const journalWhere: Record<string, unknown> = {}
  if (costCenter) journalWhere.costCenterId = costCenter.id

  if (dateFrom || dateTo) {
    journalWhere.journalEntry = {
      status: 'POSTED',
      date: dateFilter,
    }
  } else {
    journalWhere.journalEntry = { status: 'POSTED' }
  }

  // Query ALL JournalLines with that costCenterId (REVENUE + EXPENSE only)
  const journalLines = costCenter
    ? await db.journalLine.findMany({
        where: {
          ...journalWhere,
          account: { type: { in: ['REVENUE', 'EXPENSE'] } },
        },
        include: {
          account: { select: { code: true, name: true, type: true, accountRole: true } },
          journalEntry: { select: { date: true, description: true, entryNo: true } },
        },
        orderBy: { journalEntry: { date: 'asc' } },
      })
    : []

  // Build statement lines from GL ONLY (no operational tables for amounts)
  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = 0
  let totalRevenue = 0
  let totalCosts = 0

  for (const jl of journalLines) {
    const isRevenue = jl.account.type === 'REVENUE'
    const isExpense = jl.account.type === 'EXPENSE'

    if (isRevenue) {
      const amount = toNumber(jl.credit) - toNumber(jl.debit)
      if (amount !== 0) {
        totalRevenue += amount
        runningBalance += amount
        lines.push({
          date: new Date(jl.journalEntry.date).toISOString().split('T')[0],
          description: `${jl.journalEntry.entryNo} - ${jl.account.name}`,
          debit: amount,
          credit: 0,
          balance: runningBalance,
          category: 'revenue',
        })
      }
    } else if (isExpense) {
      const amount = toNumber(jl.debit) - toNumber(jl.credit)
      if (amount !== 0) {
        totalCosts += amount
        runningBalance -= amount
        lines.push({
          date: new Date(jl.journalEntry.date).toISOString().split('T')[0],
          description: `${jl.journalEntry.entryNo} - ${jl.account.name}`,
          debit: 0,
          credit: amount,
          balance: runningBalance,
          category: 'cost',
        })
      }
    }
  }

  // Sort lines by date
  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Recalculate running balance after sort
  let recalculatedBalance = 0
  for (const line of lines) {
    recalculatedBalance += line.debit - line.credit
    line.balance = recalculatedBalance
  }

  const profit = totalRevenue - totalCosts

  return NextResponse.json({
    entity: { id: project.id, name: project.name, type: 'project' },
    openingBalance: 0,
    lines,
    closingBalance: recalculatedBalance,
    // Book balance = same as GL (this IS the GL statement)
    bookBalance: recalculatedBalance,
    statementBalance: recalculatedBalance,
    summary: {
      totalRevenues: totalRevenue,
      totalCosts,
      profit,
      profitMargin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
    },
  })
}

// ============ EQUIPMENT STATEMENT ============

async function getEquipmentStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const equipment = await db.equipment.findUnique({ where: { id: entityId } })
  if (!equipment) {
    return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
  }

  const dateFilter: Record<string, Date> = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo) dateFilter.lte = new Date(dateTo)

  const whereDate = dateFrom || dateTo ? dateFilter : undefined

  // Revenue from EquipmentRental (descriptive detail)
  const rentals = await db.equipmentRental.findMany({
    where: {
      equipmentId: entityId,
      ...(whereDate ? { startDate: whereDate } : {}),
    },
    include: {
      contract: { select: { contractNo: true } },
    },
  })

  // Costs from EquipmentExpense (descriptive detail)
  const expenses = await db.equipmentExpense.findMany({
    where: {
      equipmentId: entityId,
      ...(whereDate ? { date: whereDate } : {}),
    },
  })

  // Fuel costs
  const fuelLogs = await db.equipmentFuelLog.findMany({
    where: {
      equipmentId: entityId,
      ...(whereDate ? { date: whereDate } : {}),
    },
  })

  // Maintenance costs
  const maintenance = await db.equipmentMaintenance.findMany({
    where: {
      equipmentId: entityId,
      ...(whereDate ? { date: whereDate } : {}),
    },
  })

  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = 0

  // Revenue entries
  for (const rental of rentals) {
    const amount = rental.totalAmount || rental.monthlyRate
    runningBalance += amount
    lines.push({
      date: new Date(rental.startDate).toISOString().split('T')[0],
      description: `Rental - Contract ${rental.contract.contractNo}`,
      debit: amount,
      credit: 0,
      balance: runningBalance,
      category: 'revenue',
    })
  }

  // Expense entries
  for (const exp of expenses) {
    runningBalance -= exp.amount
    lines.push({
      date: new Date(exp.date).toISOString().split('T')[0],
      description: `${exp.category}: ${exp.description}`,
      debit: 0,
      credit: exp.amount,
      balance: runningBalance,
      category: 'cost',
    })
  }

  // Fuel entries
  for (const fuel of fuelLogs) {
    runningBalance -= fuel.totalCost
    lines.push({
      date: new Date(fuel.date).toISOString().split('T')[0],
      description: `Fuel - ${fuel.liters} liters`,
      debit: 0,
      credit: fuel.totalCost,
      balance: runningBalance,
      category: 'cost',
    })
  }

  // Maintenance entries
  for (const maint of maintenance) {
    runningBalance -= maint.cost
    lines.push({
      date: new Date(maint.date).toISOString().split('T')[0],
      description: `Maintenance: ${maint.description}`,
      debit: 0,
      credit: maint.cost,
      balance: runningBalance,
      category: 'cost',
    })
  }

  // Sort by date
  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Recalculate balance
  let recalculatedBalance = 0
  for (const line of lines) {
    recalculatedBalance += line.debit - line.credit
    line.balance = recalculatedBalance
  }

  // Operational totals (descriptive)
  const operationalTotalRevenues = rentals.reduce((s, r) => s + (r.totalAmount || r.monthlyRate), 0)
  const operationalTotalCosts =
    expenses.reduce((s, e) => s + e.amount, 0) +
    fuelLogs.reduce((s, f) => s + f.totalCost, 0) +
    maintenance.reduce((s, m) => s + m.cost, 0)

  const profit = operationalTotalRevenues - operationalTotalCosts

  return NextResponse.json({
    entity: { id: equipment.id, name: equipment.name, type: 'equipment' },
    openingBalance: 0,
    lines,
    closingBalance: recalculatedBalance,
    // Equipment doesn't have direct GL cost centers, so book balance = operational
    bookBalance: recalculatedBalance,
    statementBalance: recalculatedBalance,
    summary: {
      totalRevenues: operationalTotalRevenues,
      totalCosts: operationalTotalCosts,
      profit,
      profitMargin: operationalTotalRevenues > 0 ? (profit / operationalTotalRevenues) * 100 : 0,
    },
  })
}
