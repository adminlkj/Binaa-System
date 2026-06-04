'use client'

import { Providers } from '@/components/layout/providers'
import { AppShell } from '@/components/layout/app-shell'
import { useAppStore, type NavItem } from '@/stores/app-store'
import { DashboardModule } from '@/components/modules/dashboard'
import { SalesModule } from '@/components/modules/sales'
import { PurchasesModule } from '@/components/modules/purchases'
import { ProgressClaimsModule as ExtractsModule } from '@/components/modules/progress-claims'
import { ClientsModule } from '@/components/modules/clients'
import { SuppliersModule } from '@/components/modules/suppliers'
import { SubcontractorsModule } from '@/components/modules/subcontractors'
import { ProjectsModule } from '@/components/modules/projects'
import { ContractsModule } from '@/components/modules/contracts'
import { TimesheetsModule } from '@/components/modules/timesheets'
import { BOQModule } from '@/components/modules/boq'
import { ExpensesModule } from '@/components/modules/expenses'
import { LaborModule } from '@/components/modules/labor'
import { EquipmentModule } from '@/components/modules/equipment'
import { AdvancesModule } from '@/components/modules/advances'
import { PettyCashModule } from '@/components/modules/petty-cash'
import { InventoryModule } from '@/components/modules/inventory'
import { AccountingModule } from '@/components/modules/accounting'
import { VATModule } from '@/components/modules/vat'
import { ReportsModule } from '@/components/modules/reports'
import { SettingsModule } from '@/components/modules/settings'

const moduleMap: Record<NavItem, React.ComponentType> = {
  'dashboard': DashboardModule,
  'sales': SalesModule,
  'purchases': PurchasesModule,
  'extracts': ExtractsModule,
  'clients': ClientsModule,
  'suppliers': SuppliersModule,
  'subcontractors': SubcontractorsModule,
  'projects': ProjectsModule,
  'contracts': ContractsModule,
  'timesheets': TimesheetsModule,
  'boq': BOQModule,
  'expenses': ExpensesModule,
  'labor-costs': LaborModule,
  'equipment': EquipmentModule,
  'advances': AdvancesModule,
  'petty-cash': PettyCashModule,
  'inventory': InventoryModule,
  'accounting': AccountingModule,
  'vat': VATModule,
  'reports': ReportsModule,
  'settings': SettingsModule,
}

function ModuleRouter() {
  const { activeItem } = useAppStore()
  const Module = moduleMap[activeItem] || DashboardModule
  return <Module />
}

export default function Home() {
  return (
    <Providers>
      <AppShell>
        <ModuleRouter />
      </AppShell>
    </Providers>
  )
}
