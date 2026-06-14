import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

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

  // Get all invoices for this client
  const invoiceWhere: Record<string, unknown> = { clientId: entityId }
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo) dateFilter.lte = new Date(dateTo)
    invoiceWhere.date = dateFilter
  }

  const invoices = await db.salesInvoice.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // Get all payments for this client
  const payments = await db.clientPayment.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // Build opening balance (before dateFrom)
  let openingBalance = 0
  if (dateFrom) {
    const from = new Date(dateFrom)
    const invoicesBefore = invoices.filter((i) => new Date(i.date) < from)
    const paymentsBefore = payments.filter((p) => new Date(p.date) < from)
    openingBalance = invoicesBefore.reduce((s, i) => s + i.totalAmount, 0) - paymentsBefore.reduce((s, p) => s + p.amount, 0)
  }

  // Build statement lines
  interface StatementLine {
    date: Date
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = openingBalance

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
      ...entry,
      balance: runningBalance,
    })
  }

  const totalRevenues = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalCosts = filteredPayments.reduce((s, p) => s + p.amount, 0)
  const profit = totalRevenues - totalCosts

  return NextResponse.json({
    entity: { id: client.id, name: client.name, type: 'customer' },
    openingBalance,
    lines,
    closingBalance: runningBalance,
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

  // Build opening balance (before dateFrom)
  let openingBalance = 0
  if (dateFrom) {
    const from = new Date(dateFrom)
    const invoicesBefore = invoices.filter((i) => new Date(i.date) < from)
    const paymentsBefore = payments.filter((p) => new Date(p.date) < from)
    // For vendors: invoices are credits (we owe), payments are debits (we pay)
    openingBalance = invoicesBefore.reduce((s, i) => s + i.totalAmount, 0) - paymentsBefore.reduce((s, p) => s + p.amount, 0)
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
    date: Date
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }

  const lines: StatementLine[] = []
  let runningBalance = openingBalance

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
      ...entry,
      balance: runningBalance,
    })
  }

  const totalRevenues = filteredPayments.reduce((s, p) => s + p.amount, 0)
  const totalCosts = filteredInvoices.reduce((s, i) => s + i.totalAmount, 0)

  return NextResponse.json({
    entity: { id: supplier.id, name: supplier.name, type: 'vendor' },
    openingBalance,
    lines,
    closingBalance: runningBalance,
    summary: {
      totalRevenues,
      totalCosts,
      profit: totalRevenues - totalCosts,
      profitMargin: totalCosts > 0 ? ((totalRevenues - totalCosts) / totalCosts) * 100 : 0,
    },
  })
}

// ============ PROJECT STATEMENT ============

async function getProjectStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const project = await db.project.findUnique({ where: { id: entityId } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Find CostCenter linked to this project
  const costCenter = await db.costCenter.findFirst({
    where: { code: project.code },
  })

  // Query all JournalLines with that costCenterId
  const journalWhere: Record<string, unknown> = {}
  if (costCenter) journalWhere.costCenterId = costCenter.id

  const dateFilter: Record<string, Date> = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo) dateFilter.lte = new Date(dateTo)
  if (dateFrom || dateTo) {
    journalWhere.journalEntry = {
      status: 'POSTED',
      date: dateFilter,
    }
  } else {
    journalWhere.journalEntry = { status: 'POSTED' }
  }

  const journalLines = costCenter
    ? await db.journalLine.findMany({
        where: journalWhere,
        include: {
          account: { select: { code: true, name: true, type: true } },
          journalEntry: { select: { date: true, description: true, entryNo: true } },
        },
        orderBy: { journalEntry: { date: 'asc' } },
      })
    : []

  // Also query SalesInvoices and ProgressClaims for this project
  const salesInvoices = await db.salesInvoice.findMany({
    where: {
      projectId: entityId,
      ...(dateFrom || dateTo ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'asc' },
  })

  const progressClaims = await db.progressClaim.findMany({
    where: {
      projectId: entityId,
      ...(dateFrom || dateTo ? { date: dateFilter } : {}),
    },
    orderBy: { date: 'asc' },
  })

  // Build statement lines
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

  // Revenue entries from invoices
  for (const inv of salesInvoices) {
    runningBalance += inv.totalAmount
    lines.push({
      date: new Date(inv.date).toISOString().split('T')[0],
      description: `Invoice ${inv.invoiceNo}`,
      debit: inv.totalAmount,
      credit: 0,
      balance: runningBalance,
      category: 'revenue',
    })
  }

  // Revenue entries from progress claims
  for (const claim of progressClaims) {
    runningBalance += claim.totalAmount
    lines.push({
      date: new Date(claim.date).toISOString().split('T')[0],
      description: `Progress Claim ${claim.claimNo}`,
      debit: claim.totalAmount,
      credit: 0,
      balance: runningBalance,
      category: 'revenue',
    })
  }

  // Cost entries from journal lines
  let totalRevenue = 0
  let totalCosts = 0

  for (const jl of journalLines) {
    const isRevenue = jl.account.type === 'REVENUE'
    const isExpense = jl.account.type === 'EXPENSE'

    if (isRevenue) {
      const amount = jl.credit - jl.debit
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
      const amount = jl.debit - jl.credit
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

  // Also add invoice revenue amounts
  totalRevenue += salesInvoices.reduce((s, i) => s + i.totalAmount, 0)
  totalRevenue += progressClaims.reduce((s, c) => s + c.totalAmount, 0)

  // Sort lines by date
  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Recalculate running balance
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

  // Revenue from EquipmentRental
  const rentals = await db.equipmentRental.findMany({
    where: {
      equipmentId: entityId,
      ...(whereDate ? { startDate: whereDate } : {}),
    },
    include: {
      contract: { select: { contractNo: true } },
    },
  })

  // Costs from EquipmentExpense
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

  const totalRevenues = rentals.reduce((s, r) => s + (r.totalAmount || r.monthlyRate), 0)
  const totalCosts =
    expenses.reduce((s, e) => s + e.amount, 0) +
    fuelLogs.reduce((s, f) => s + f.totalCost, 0) +
    maintenance.reduce((s, m) => s + m.cost, 0)

  const profit = totalRevenues - totalCosts

  return NextResponse.json({
    entity: { id: equipment.id, name: equipment.name, type: 'equipment' },
    openingBalance: 0,
    lines,
    closingBalance: recalculatedBalance,
    summary: {
      totalRevenues,
      totalCosts,
      profit,
      profitMargin: totalRevenues > 0 ? (profit / totalRevenues) * 100 : 0,
    },
  })
}
