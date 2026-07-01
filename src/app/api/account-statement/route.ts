import { requireAuthApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextRequest, NextResponse } from 'next/server'
import { getAccountsByRoles, AccountRole } from '@/lib/account-roles'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { response } = await requireAuthApi()
  if (response) return response

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
//
// ⚠️  SSOT (P1-1-FIX / M8): الرصيد الافتتاحي/الختامي والبنود المعتمدة
//    مصدرها JournalLine على حسابات CUSTOMER_AR المرتبطة بمركز تكلفة العميل.
//    بنود الفواتير/المدفوعات التشغيلية تبقى كتفصيل للعرض فقط.
async function getCustomerStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const client = await db.client.findUnique({ where: { id: entityId } })
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // Get all invoices for this client (descriptive detail only)
  const invoices = await db.salesInvoice.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // Get all payments for this client (descriptive detail only)
  const payments = await db.clientPayment.findMany({
    where: { clientId: entityId },
    orderBy: { date: 'asc' },
  })

  // ===== GL-based balances (canonical) =====
  const arAccounts = await getAccountsByRoles([AccountRole.CUSTOMER_AR])

  // Find cost center for this client
  const clientCostCenter = await db.costCenter.findFirst({
    where: { code: client.code || client.id },
  })

  // Opening balance (GL) — قبل dateFrom
  let glOpeningBalance = 0
  if (arAccounts.length > 0 && clientCostCenter) {
    const openingAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: arAccounts.map(a => a.id) },
        costCenterId: clientCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...(dateFrom && { date: { lt: new Date(dateFrom) } }),
        },
      },
    })
    // AR is ASSET (debit normal): balance = debit - credit
    glOpeningBalance = toNumber(openingAgg._sum.debit) - toNumber(openingAgg._sum.credit)
  }

  // Closing balance (GL) — خلال الفترة + قبلها
  let glClosingBalance = glOpeningBalance
  if (arAccounts.length > 0 && clientCostCenter) {
    const closingAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: arAccounts.map(a => a.id) },
        costCenterId: clientCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...(dateTo && { date: { lte: new Date(dateTo) } }),
        },
      },
    })
    glClosingBalance = toNumber(closingAgg._sum.debit) - toNumber(closingAgg._sum.credit)
  }

  // Period movement (GL) — debits = invoicing, credits = payments
  let glPeriodDebit = 0
  let glPeriodCredit = 0
  if (arAccounts.length > 0 && clientCostCenter) {
    const periodAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: arAccounts.map(a => a.id) },
        costCenterId: clientCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...((dateFrom || dateTo) && {
            date: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }),
        },
      },
    })
    glPeriodDebit = toNumber(periodAgg._sum.debit)
    glPeriodCredit = toNumber(periodAgg._sum.credit)
  }

  // ===== Build statement lines from GL (canonical) =====
  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }
  const lines: StatementLine[] = []

  if (arAccounts.length > 0 && clientCostCenter) {
    const jeWhere: Prisma.JournalEntryWhereInput = { status: 'POSTED', deletedAt: null }
    if (dateFrom || dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      jeWhere.date = dateFilter
    }
    const arLines = await db.journalLine.findMany({
      where: {
        deletedAt: null,
        accountId: { in: arAccounts.map(a => a.id) },
        costCenterId: clientCostCenter.id,
        journalEntry: jeWhere,
      },
      include: {
        journalEntry: { select: { date: true, entryNo: true, description: true, sourceType: true } },
        account: { select: { code: true, name: true } },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    })
    let running = glOpeningBalance
    for (const l of arLines) {
      const d = toNumber(l.debit)
      const c = toNumber(l.credit)
      running += d - c
      lines.push({
        date: new Date(l.journalEntry.date).toISOString().split('T')[0],
        description: `${l.journalEntry.entryNo} - ${l.journalEntry.description || l.account.name}`,
        debit: d,
        credit: c,
        balance: running,
        category: l.journalEntry.sourceType || 'journal',
      })
    }
  }

  // ===== Operational totals (descriptive) =====
  const totalRevenues = invoices
    .filter(i => !dateFrom || !dateTo || (new Date(i.date) >= new Date(dateFrom) && new Date(i.date) <= new Date(dateTo)))
    .reduce((s, i) => s + Number(i.totalAmount || 0), 0)
  const totalCosts = payments
    .filter(p => !dateFrom || !dateTo || (new Date(p.date) >= new Date(dateFrom) && new Date(p.date) <= new Date(dateTo)))
    .reduce((s, p) => s + Number(p.amount || 0), 0)
  const profit = totalRevenues - totalCosts

  // ===== Book balance (GL) — canonical =====
  const bookBalance = glClosingBalance

  return NextResponse.json({
    entity: { id: client.id, name: client.name, type: 'customer' },
    openingBalance: glOpeningBalance,
    lines,
    closingBalance: glClosingBalance,
    // رصيد دفتري (book balance from GL) — canonical
    bookBalance,
    // رصيد مستخلص (statement balance from operations) — للتحقق
    statementBalance: glClosingBalance,
    // حركة الفترة من GL (للتحقق من الفواتير/المدفوعات التشغيلية)
    periodMovements: {
      glDebit: glPeriodDebit,
      glCredit: glPeriodCredit,
    },
    summary: {
      totalRevenues,
      totalCosts,
      profit,
      profitMargin: totalRevenues > 0 ? (profit / totalRevenues) * 100 : 0,
    },
    source: 'posted-journal-entries',
  })
}

// ============ VENDOR STATEMENT ============
//
// ⚠️  SSOT (P1-1-FIX / M9): الرصيد الافتتاحي/الختامي والبنود المعتمدة
//    مصدرها JournalLine على حسابات SUPPLIER_AP + SUBCONTRACTOR_AP المرتبطة
//    بمركز تكلفة المورد. بنود الفواتير/المدفوعات التشغيلية تبقى كتفصيل
//    للعرض فقط.
async function getVendorStatement(entityId: string, dateFrom: string | null, dateTo: string | null) {
  const supplier = await db.supplier.findUnique({ where: { id: entityId } })
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  // Operational detail (descriptive only)
  const invoices = await db.purchaseInvoice.findMany({
    where: { supplierId: entityId },
    orderBy: { date: 'asc' },
  })
  const payments = await db.supplierPayment.findMany({
    where: { supplierId: entityId },
    orderBy: { date: 'asc' },
  })

  // ===== GL-based balances (canonical) =====
  const apAccounts = await getAccountsByRoles([AccountRole.SUPPLIER_AP, AccountRole.SUBCONTRACTOR_AP])
  const supplierCostCenter = await db.costCenter.findFirst({
    where: { code: supplier.code || supplier.id },
  })

  // Opening balance (GL) — قبل dateFrom
  let glOpeningBalance = 0
  if (apAccounts.length > 0 && supplierCostCenter) {
    const openingAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: apAccounts.map(a => a.id) },
        costCenterId: supplierCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...(dateFrom && { date: { lt: new Date(dateFrom) } }),
        },
      },
    })
    // AP is LIABILITY (credit normal): balance = credit - debit
    glOpeningBalance = toNumber(openingAgg._sum.credit) - toNumber(openingAgg._sum.debit)
  }

  // Closing balance (GL)
  let glClosingBalance = glOpeningBalance
  if (apAccounts.length > 0 && supplierCostCenter) {
    const closingAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: apAccounts.map(a => a.id) },
        costCenterId: supplierCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...(dateTo && { date: { lte: new Date(dateTo) } }),
        },
      },
    })
    glClosingBalance = toNumber(closingAgg._sum.credit) - toNumber(closingAgg._sum.debit)
  }

  // Period movement (GL)
  let glPeriodDebit = 0
  let glPeriodCredit = 0
  if (apAccounts.length > 0 && supplierCostCenter) {
    const periodAgg = await db.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: apAccounts.map(a => a.id) },
        costCenterId: supplierCostCenter.id,
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          ...((dateFrom || dateTo) && {
            date: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }),
        },
      },
    })
    glPeriodDebit = toNumber(periodAgg._sum.debit)
    glPeriodCredit = toNumber(periodAgg._sum.credit)
  }

  // ===== Build statement lines from GL (canonical) =====
  interface StatementLine {
    date: string
    description: string
    debit: number
    credit: number
    balance: number
    category: string
  }
  const lines: StatementLine[] = []

  if (apAccounts.length > 0 && supplierCostCenter) {
    const jeWhere: Prisma.JournalEntryWhereInput = { status: 'POSTED', deletedAt: null }
    if (dateFrom || dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      jeWhere.date = dateFilter
    }
    const apLines = await db.journalLine.findMany({
      where: {
        deletedAt: null,
        accountId: { in: apAccounts.map(a => a.id) },
        costCenterId: supplierCostCenter.id,
        journalEntry: jeWhere,
      },
      include: {
        journalEntry: { select: { date: true, entryNo: true, description: true, sourceType: true } },
        account: { select: { code: true, name: true } },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    })
    let running = glOpeningBalance
    for (const l of apLines) {
      const d = toNumber(l.debit)
      const c = toNumber(l.credit)
      // AP: credit increases balance, debit decreases it
      running += c - d
      lines.push({
        date: new Date(l.journalEntry.date).toISOString().split('T')[0],
        description: `${l.journalEntry.entryNo} - ${l.journalEntry.description || l.account.name}`,
        debit: d,
        credit: c,
        balance: running,
        category: l.journalEntry.sourceType || 'journal',
      })
    }
  }

  // Operational totals (descriptive)
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
  const totalRevenues = filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const totalCosts = filteredInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)

  const bookBalance = glClosingBalance

  return NextResponse.json({
    entity: { id: supplier.id, name: supplier.name, type: 'vendor' },
    openingBalance: glOpeningBalance,
    lines,
    closingBalance: glClosingBalance,
    bookBalance,
    statementBalance: glClosingBalance,
    periodMovements: {
      glDebit: glPeriodDebit,
      glCredit: glPeriodCredit,
    },
    summary: {
      totalRevenues,
      totalCosts,
      profit: totalRevenues - totalCosts,
      profitMargin: totalCosts > 0 ? ((totalRevenues - totalCosts) / totalCosts) * 100 : 0,
    },
    source: 'posted-journal-entries',
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

  const journalWhere: Record<string, unknown> = { deletedAt: null }
  if (costCenter) journalWhere.costCenterId = costCenter.id

  if (dateFrom || dateTo) {
    journalWhere.journalEntry = {
      status: 'POSTED',
      deletedAt: null,
      date: dateFilter,
    }
  } else {
    journalWhere.journalEntry = { status: 'POSTED', deletedAt: null }
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
//
// ⚠️  ARCHITECTURAL GAP (P1-1-FIX / M10): تتطلب هذه القضية بُعد "مركز
//    تكلفة لكل معدّة" (per-equipment cost center dimension) على JournalLine
//    حتى يمكن اشتقاق الإيراد والتكاليف من القيود المحاسبية. هذا البُعد
//    غير متوفر حالياً. البنود التشغيلية (EquipmentRental, EquipmentExpense,
//    EquipmentFuelLog, EquipmentMaintenance) تبقى كمؤشرات تشغيلية — وليست
//    تقريراً مالياً معتمداً.
//
//    TODO (طويل الأمد): أضف عمود `equipmentId` إلى JournalLine أو أنشئ
//    مركز تكلفة لكل معدّة. عند توفّر البُعد، أعد كتابة كشف الحساب هذا
//    ليقرأ من JournalLine على مركز تكلفة المعدة.
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
    const amount = toNumber(rental.totalAmount) || toNumber(rental.monthlyRate)
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
    const amount = toNumber(exp.amount)
    runningBalance -= amount
    lines.push({
      date: new Date(exp.date).toISOString().split('T')[0],
      description: `${exp.category}: ${exp.description}`,
      debit: 0,
      credit: amount,
      balance: runningBalance,
      category: 'cost',
    })
  }

  // Fuel entries
  for (const fuel of fuelLogs) {
    const amount = toNumber(fuel.totalCost)
    runningBalance -= amount
    lines.push({
      date: new Date(fuel.date).toISOString().split('T')[0],
      description: `Fuel - ${fuel.liters} liters`,
      debit: 0,
      credit: amount,
      balance: runningBalance,
      category: 'cost',
    })
  }

  // Maintenance entries
  for (const maint of maintenance) {
    const amount = toNumber(maint.cost)
    runningBalance -= amount
    lines.push({
      date: new Date(maint.date).toISOString().split('T')[0],
      description: `Maintenance: ${maint.description}`,
      debit: 0,
      credit: amount,
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
  const operationalTotalRevenues = rentals.reduce((s, r) => s + (toNumber(r.totalAmount) || toNumber(r.monthlyRate)), 0)
  const operationalTotalCosts =
    expenses.reduce((s, e) => s + toNumber(e.amount), 0) +
    fuelLogs.reduce((s, f) => s + toNumber(f.totalCost), 0) +
    maintenance.reduce((s, m) => s + toNumber(m.cost), 0)

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
