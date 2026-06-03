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
// New module placeholders
import { RentalInvoicesModule } from '@/components/modules/rental-invoices'
import { DeliveryOrdersModule } from '@/components/modules/delivery-orders'
import { ServiceInvoicesModule } from '@/components/modules/service-invoices'
import { PurchaseOrdersModule } from '@/components/modules/purchase-orders'
import { SupplierInvoicesModule } from '@/components/modules/supplier-invoices'

function ModuleRouter() {
  const { activeModule } = useAppStore()

  // Main
  if (activeModule === 'dashboard') {
    return <DashboardModule />
  }

  // Equipment Rental
  if (activeModule === 'contracts') {
    return <ContractsModule />
  }

  if (activeModule === 'delivery-orders') {
    return <DeliveryOrdersModule />
  }

  if (activeModule === 'timesheets') {
    return <TimesheetsModule />
  }

  if (activeModule === 'rental-invoices') {
    return <RentalInvoicesModule />
  }

  if (activeModule === 'equipment') {
    return <EquipmentModule />
  }

  // Projects
  if (activeModule === 'projects') {
    return <ProjectsModule />
  }

  if (activeModule === 'progress-claims') {
    return <ProgressClaimsModule />
  }

  if (activeModule === 'boq') {
    return <BOQModule />
  }

  // Services
  if (activeModule === 'service-invoices') {
    return <ServiceInvoicesModule />
  }

  if (activeModule === 'clients') {
    return <ClientsModule />
  }

  // Purchases
  if (activeModule === 'purchase-orders') {
    return <PurchaseOrdersModule />
  }

  if (activeModule === 'supplier-invoices') {
    return <SupplierInvoicesModule />
  }

  if (activeModule === 'suppliers') {
    return <SuppliersModule />
  }

  if (activeModule === 'subcontractors') {
    return <SubcontractorsModule />
  }

  // Costs
  if (activeModule === 'expenses') {
    return <ExpensesModule />
  }

  if (activeModule === 'labor') {
    return <LaborModule />
  }

  if (activeModule === 'advances') {
    return <AdvancesModule />
  }

  if (activeModule === 'petty-cash') {
    return <PettyCashModule />
  }

  // Accounting
  if (activeModule === 'accounting') {
    return <AccountingModule />
  }

  if (activeModule === 'vat') {
    return <VATModule />
  }

  // Inventory
  if (activeModule === 'inventory') {
    return <InventoryModule />
  }

  // Reports & Settings
  if (activeModule === 'reports') {
    return <ReportsModule />
  }

  if (activeModule === 'settings') {
    return <SettingsModule />
  }

  // Legacy keys - redirect to new modules
  if (activeModule === 'sales') {
    return <SalesModule />
  }

  if (activeModule === 'purchases') {
    return <PurchasesModule />
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
