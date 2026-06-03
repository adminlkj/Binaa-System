'use client'

import { Providers } from '@/components/layout/providers'
import { AppShell } from '@/components/layout/app-shell'
import { useAppStore } from '@/stores/app-store'
import { ModulePlaceholder } from '@/components/modules/placeholder'
import { DashboardModule } from '@/components/modules/dashboard'
import { ProjectsModule } from '@/components/modules/projects'
import { ContractsModule } from '@/components/modules/contracts'
import { BOQModule } from '@/components/modules/boq'
import { TimesheetsModule } from '@/components/modules/timesheets'
import { ProgressClaimsModule } from '@/components/modules/progress-claims'
import { ClientsModule } from '@/components/modules/clients'
import { SuppliersModule } from '@/components/modules/suppliers'
import { SubcontractorsModule } from '@/components/modules/subcontractors'
import { SalesModule } from '@/components/modules/sales'
import { PurchasesModule } from '@/components/modules/purchases'
import { ExpensesModule } from '@/components/modules/expenses'
import { LaborModule } from '@/components/modules/labor'
import { EquipmentModule } from '@/components/modules/equipment'
import { PettyCashModule } from '@/components/modules/petty-cash'
import { AdvancesModule } from '@/components/modules/advances'
import { InventoryModule } from '@/components/modules/inventory'
import { AccountingModule } from '@/components/modules/accounting'
import { VATModule } from '@/components/modules/vat'
import { ReportsModule } from '@/components/modules/reports'
import { SettingsModule } from '@/components/modules/settings'

function ModuleRouter() {
  const { activeModule } = useAppStore()

  if (activeModule === 'dashboard') {
    return <DashboardModule />
  }

  if (activeModule === 'projects') {
    return <ProjectsModule />
  }

  if (activeModule === 'contracts') {
    return <ContractsModule />
  }

  if (activeModule === 'boq') {
    return <BOQModule />
  }

  if (activeModule === 'timesheets') {
    return <TimesheetsModule />
  }

  if (activeModule === 'progress-claims') {
    return <ProgressClaimsModule />
  }

  if (activeModule === 'clients') {
    return <ClientsModule />
  }

  if (activeModule === 'suppliers') {
    return <SuppliersModule />
  }

  if (activeModule === 'subcontractors') {
    return <SubcontractorsModule />
  }

  if (activeModule === 'sales') {
    return <SalesModule />
  }

  if (activeModule === 'purchases') {
    return <PurchasesModule />
  }

  if (activeModule === 'expenses') {
    return <ExpensesModule />
  }

  if (activeModule === 'labor') {
    return <LaborModule />
  }

  if (activeModule === 'equipment') {
    return <EquipmentModule />
  }

  if (activeModule === 'petty-cash') {
    return <PettyCashModule />
  }

  if (activeModule === 'advances') {
    return <AdvancesModule />
  }

  if (activeModule === 'inventory') {
    return <InventoryModule />
  }

  if (activeModule === 'accounting') {
    return <AccountingModule />
  }

  if (activeModule === 'vat') {
    return <VATModule />
  }

  if (activeModule === 'reports') {
    return <ReportsModule />
  }

  if (activeModule === 'settings') {
    return <SettingsModule />
  }

  return <ModulePlaceholder moduleKey={activeModule} />
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
