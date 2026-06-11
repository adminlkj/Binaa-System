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
import { EquipmentModule } from '@/components/modules/equipment'
import { InventoryModule } from '@/components/modules/inventory'
import { AccountingModule } from '@/components/modules/accounting'
import { VATModule } from '@/components/modules/vat'
import { ReportsModule } from '@/components/modules/reports'
import { SettingsModule } from '@/components/modules/settings'
// Resources modules
import { EmployeesModule } from '@/components/modules/employees'
import { EmployeeContractsModule } from '@/components/modules/employee-contracts'
import { AttendanceModule } from '@/components/modules/attendance'
import { SalariesModule } from '@/components/modules/salaries'
import { WorkTeamsModule } from '@/components/modules/work-teams'
import { EquipmentOperationsModule } from '@/components/modules/equipment-operations'
import { EquipmentMaintenanceModule } from '@/components/modules/equipment-maintenance'
import { FuelModule } from '@/components/modules/fuel'
import { ResourceDistributionModule } from '@/components/modules/resource-distribution'
// Supply Chain modules
import { PurchaseRequestsModule } from '@/components/modules/purchase-requests'
import { PurchaseOrdersModule } from '@/components/modules/purchase-orders'
import { GoodsReceiptModule } from '@/components/modules/goods-receipt'
import { SupplierInvoicesModule } from '@/components/modules/supplier-invoices'
import { SupplierPaymentsModule } from '@/components/modules/supplier-payments'
import { PlaceholderModule } from '@/components/modules/placeholder'
import { ClientPaymentsModule } from '@/components/modules/client-payments'

const moduleMap: Record<NavItem, React.ComponentType> = {
  'dashboard': DashboardModule,
  // المبيعات
  'sales': SalesModule,
  'extracts': ExtractsModule,
  'clients': ClientsModule,
  'client-payments': ClientPaymentsModule,
  // المشتريات
  'purchases': PurchasesModule,
  'suppliers': SuppliersModule,
  'subcontractors': SubcontractorsModule,
  'supplier-payments': SupplierPaymentsModule,
  // المشاريع
  'projects': ProjectsModule,
  'contracts': ContractsModule,
  'boq': BOQModule,
  'timesheets': TimesheetsModule,
  // الموارد
  'equipment': EquipmentModule,
  'equipment-operations': EquipmentOperationsModule,
  'resource-distribution': ResourceDistributionModule,
  'employees': EmployeesModule,
  'salaries': SalariesModule,
  'attendance': AttendanceModule,
  'equipment-maintenance': EquipmentMaintenanceModule,
  'fuel': FuelModule,
  'work-teams': WorkTeamsModule,
  'employee-contracts': EmployeeContractsModule,
  // سلسلة التوريد
  'purchase-requests': PurchaseRequestsModule,
  'purchase-orders': PurchaseOrdersModule,
  'goods-receipt': GoodsReceiptModule,
  'supplier-invoices': SupplierInvoicesModule,
  'supplier-payments': SupplierPaymentsModule,
  // المخزون والمحاسبة
  'inventory': InventoryModule,
  'accounting': AccountingModule,
  'vat': VATModule,
  // التقارير والإعدادات
  'reports': ReportsModule,
  'settings': SettingsModule,
}

function ModuleRouter() {
  const { activeItem } = useAppStore()
  const Module = moduleMap[activeItem] || PlaceholderModule
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
