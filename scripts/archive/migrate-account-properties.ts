// ============================================================================
// Migration Script: Set Account Properties based on existing accountRole
// ----------------------------------------------------------------------------
// This script reads each account's `accountRole` and sets the new property
// fields (usableIn*, allows*, requires*) to sensible defaults.
//
// Run: bun run scripts/migrate-account-properties.ts
// ============================================================================

import { db } from '../src/lib/db'

// Maps accountRole → default property values
const ROLE_DEFAULTS: Record<string, {
  usableIn?: Partial<Record<'expenses'|'projects'|'rental'|'payroll'|'advances'|'maintenance'|'fuel'|'purchases'|'revenue', boolean>>
  showIn?: Partial<Record<'cash'|'bank', boolean>>
  allows?: Partial<Record<'project'|'costCenter'|'employee'|'equipment'|'supplier'|'client', boolean>>
  requires?: Partial<Record<'employee'|'project'|'equipment'|'contract', boolean>>
  allowsVat?: boolean
}> = {
  // Payment accounts
  CASH:         { showIn: { cash: true } },
  PETTY_CASH:   { showIn: { cash: true } },
  BANK:         { showIn: { bank: true, cash: true } },

  // Expense accounts by specialized screen
  FUEL_EXPENSE: {
    usableIn: { fuel: true, projects: true, rental: true },
    allows: { equipment: true, project: true, costCenter: true },
    requires: { equipment: true },
    allowsVat: true,
  },
  MAINTENANCE_EXPENSE: {
    usableIn: { maintenance: true, projects: true, rental: true },
    allows: { equipment: true, project: true, costCenter: true, supplier: true },
    requires: { equipment: true },
    allowsVat: true,
  },
  DRIVER_EXPENSE: {
    usableIn: { payroll: true, projects: true },
    allows: { employee: true, project: true, costCenter: true },
    requires: { employee: true },
    allowsVat: false,
  },
  TRANSPORT_EXPENSE: {
    usableIn: { expenses: true, projects: true },
    allows: { project: true, costCenter: true, supplier: true },
    allowsVat: true,
  },

  // Project/operations costs
  PROJECT_COST: {
    usableIn: { projects: true },
    allows: { project: true, costCenter: true },
    requires: { project: true },
    allowsVat: true,
  },
  LABOR_COST: {
    usableIn: { payroll: true, projects: true },
    allows: { employee: true, project: true, costCenter: true },
    requires: { project: true },
    allowsVat: false,
  },
  SUBCONTRACTOR_COST: {
    usableIn: { projects: true, purchases: true },
    allows: { project: true, costCenter: true, supplier: true },
    requires: { project: true },
    allowsVat: true,
  },

  // Administrative expenses — usable in General Expenses screen
  ADMIN_EXPENSE: {
    usableIn: { expenses: true },
    allows: { costCenter: true, project: true },
    allowsVat: true,
  },
  ZAKAT_EXPENSE: {
    usableIn: { expenses: true },
    allowsVat: false,
  },
  GOSI_EXPENSE: {
    usableIn: { payroll: true, expenses: true },
    allows: { employee: true },
    allowsVat: false,
  },
  DEPRECIATION_EXPENSE: {
    usableIn: { expenses: true },
    allowsVat: false,
  },
  RENTAL_DEPRECIATION: {
    usableIn: { rental: true },
    allowsVat: false,
  },
  PAYROLL_EXPENSE: {
    usableIn: { payroll: true },
    allows: { employee: true, costCenter: true, project: true },
    requires: { employee: true },
    allowsVat: false,
  },

  // Revenue accounts
  RENTAL_REVENUE: {
    usableIn: { revenue: true, rental: true },
    allows: { client: true, costCenter: true },
    allowsVat: true,
  },
  PROJECT_REVENUE: {
    usableIn: { revenue: true, projects: true },
    allows: { client: true, project: true, costCenter: true },
    allowsVat: true,
  },
  SERVICE_REVENUE: {
    usableIn: { revenue: true },
    allows: { client: true, costCenter: true },
    allowsVat: true,
  },
  DELAY_PENALTY_REVENUE: {
    usableIn: { revenue: true, projects: true },
    allows: { client: true, project: true },
    allowsVat: true,
  },

  // Payables / Receivables
  CUSTOMER_AR: {
    allows: { client: true, costCenter: true },
    requires: { contract: true },
  },
  SUPPLIER_AP: {
    allows: { supplier: true, costCenter: true },
  },
  SUBCONTRACTOR_AP: {
    usableIn: { projects: true },
    allows: { supplier: true, project: true, costCenter: true },
    requires: { project: true },
  },
  EMPLOYEE_ADVANCE: {
    usableIn: { advances: true },
    allows: { employee: true },
    requires: { employee: true },
    allowsVat: false,
  },
  SALARIES_PAYABLE: {
    usableIn: { payroll: true },
    allows: { employee: true },
    allowsVat: false,
  },
  GOSI_PAYABLE: {
    usableIn: { payroll: true },
    allowsVat: false,
  },
  EOS_PROVISION: {
    usableIn: { payroll: true, expenses: true },
    allows: { employee: true },
    requires: { employee: true },
    allowsVat: false,
  },
}

async function main() {
  console.log('='.repeat(60))
  console.log('MIGRATION: Setting Account Properties from accountRole')
  console.log('='.repeat(60))

  const accounts = await db.account.findMany({
    where: { accountRole: { not: null } },
    select: { id: true, code: true, name: true, accountRole: true, allowPosting: true },
  })

  console.log(`Found ${accounts.length} accounts with accountRole set.\n`)

  let updated = 0
  let skipped = 0

  for (const acc of accounts) {
    const role = acc.accountRole!
    const defaults = ROLE_DEFAULTS[role]

    if (!defaults) {
      console.log(`  ⏭  ${acc.code} — ${acc.nameAr || acc.name} (role: ${role}) — no defaults defined, skipping`)
      skipped++
      continue
    }

    const updateData: Record<string, unknown> = {}

    // usableIn*
    if (defaults.usableIn) {
      if (defaults.usableIn.expenses    !== undefined) updateData.usableInExpenses    = defaults.usableIn.expenses
      if (defaults.usableIn.projects    !== undefined) updateData.usableInProjects    = defaults.usableIn.projects
      if (defaults.usableIn.rental      !== undefined) updateData.usableInRental      = defaults.usableIn.rental
      if (defaults.usableIn.payroll     !== undefined) updateData.usableInPayroll     = defaults.usableIn.payroll
      if (defaults.usableIn.advances    !== undefined) updateData.usableInAdvances    = defaults.usableIn.advances
      if (defaults.usableIn.maintenance !== undefined) updateData.usableInMaintenance = defaults.usableIn.maintenance
      if (defaults.usableIn.fuel        !== undefined) updateData.usableInFuel        = defaults.usableIn.fuel
      if (defaults.usableIn.purchases   !== undefined) updateData.usableInPurchases   = defaults.usableIn.purchases
      if (defaults.usableIn.revenue     !== undefined) updateData.usableInRevenue     = defaults.usableIn.revenue
    }

    // showIn*
    if (defaults.showIn) {
      if (defaults.showIn.cash !== undefined) updateData.showInCash = defaults.showIn.cash
      if (defaults.showIn.bank !== undefined) updateData.showInBank = defaults.showIn.bank
    }

    // allows*
    if (defaults.allows) {
      if (defaults.allows.project    !== undefined) updateData.allowsProject    = defaults.allows.project
      if (defaults.allows.costCenter !== undefined) updateData.allowsCostCenter = defaults.allows.costCenter
      if (defaults.allows.employee   !== undefined) updateData.allowsEmployee   = defaults.allows.employee
      if (defaults.allows.equipment  !== undefined) updateData.allowsEquipment  = defaults.allows.equipment
      if (defaults.allows.supplier   !== undefined) updateData.allowsSupplier   = defaults.allows.supplier
      if (defaults.allows.client     !== undefined) updateData.allowsClient     = defaults.allows.client
    }

    // requires*
    if (defaults.requires) {
      if (defaults.requires.employee  !== undefined) updateData.requiresEmployee  = defaults.requires.employee
      if (defaults.requires.project   !== undefined) updateData.requiresProject   = defaults.requires.project
      if (defaults.requires.equipment !== undefined) updateData.requiresEquipment = defaults.requires.equipment
      if (defaults.requires.contract  !== undefined) updateData.requiresContract  = defaults.requires.contract
    }

    // allowsVat
    if (defaults.allowsVat !== undefined) updateData.allowsVat = defaults.allowsVat

    if (Object.keys(updateData).length === 0) {
      skipped++
      continue
    }

    await db.account.update({ where: { id: acc.id }, data: updateData })
    console.log(`  ✅ ${acc.code} — ${acc.nameAr || acc.name} (role: ${role}) — set ${Object.keys(updateData).length} properties`)
    updated++
  }

  console.log('\n' + '='.repeat(60))
  console.log(`DONE: ${updated} accounts updated, ${skipped} skipped`)
  console.log('='.repeat(60))
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
