'use client'

import { Providers } from '@/components/layout/providers'
import { AppShell } from '@/components/layout/app-shell'
import { useAppStore, type NavItem } from '@/stores/app-store'
import { DashboardModule } from '@/components/modules/dashboard'
// Construction Hub modules
import { ProjectsModule } from '@/components/modules/projects'
import { ContractsModule } from '@/components/modules/contracts'
import { BOQModule } from '@/components/modules/boq'
import { ProgressClaimsModule as ExtractsModule } from '@/components/modules/progress-claims'
import { SalesModule } from '@/components/modules/sales'
import { ClientPaymentsModule } from '@/components/modules/client-payments'
// Rental Hub modules
import { EquipmentModule } from '@/components/modules/equipment'
import { RentalContractsModule } from '@/components/modules/rental-contracts'
import { DeliveryOrdersModule } from '@/components/modules/delivery-orders'
import { TimesheetsModule } from '@/components/modules/timesheets'
import { RentalInvoicesModule } from '@/components/modules/rental-invoices'
import { RentalPaymentsModule } from '@/components/modules/rental-payments'
// HR modules
import { EmployeesModule } from '@/components/modules/employees'
import { EmployeeContractsModule } from '@/components/modules/employee-contracts'
import { AttendanceModule } from '@/components/modules/attendance'
import { SalariesModule } from '@/components/modules/salaries'
import { WorkTeamsModule } from '@/components/modules/work-teams'
import { ResourceDistributionModule } from '@/components/modules/resource-distribution'
// Supply Chain modules
import { PurchaseRequestsModule } from '@/components/modules/purchase-requests'
import { PurchaseOrdersModule } from '@/components/modules/purchase-orders'
import { GoodsReceiptModule } from '@/components/modules/goods-receipt'
import { SupplierInvoicesModule } from '@/components/modules/supplier-invoices'
import { SupplierPaymentsModule } from '@/components/modules/supplier-payments'
// Operations modules
import { EquipmentOperationsModule } from '@/components/modules/equipment-operations'
import { EquipmentMaintenanceModule } from '@/components/modules/equipment-maintenance'
import { FuelModule } from '@/components/modules/fuel'
import { SubcontractorsModule } from '@/components/modules/subcontractors'
import { ExpensesModule } from '@/components/modules/expenses'
// Accounting & Reports
import { AccountingModule } from '@/components/modules/accounting'
import { VATModule } from '@/components/modules/vat'
import { ReportsModule } from '@/components/modules/reports'
// Settings & Data
import { ClientsModule } from '@/components/modules/clients'
import { SuppliersModule } from '@/components/modules/suppliers'
import { InventoryModule } from '@/components/modules/inventory'
import { SettingsModule } from '@/components/modules/settings'
// Fallback
import { PlaceholderModule } from '@/components/modules/placeholder'

const moduleMap: Record<NavItem, React.ComponentType> = {
  // الرئيسية
  'dashboard': DashboardModule,
  // محور المشاريع التنفيذية
  'projects': ProjectsModule,
  'contracts': ContractsModule,
  'boq': BOQModule,
  'extracts': ExtractsModule,
  'sales': SalesModule,
  'client-payments': ClientPaymentsModule,
  // محور تأجير المعدات
  'equipment': EquipmentModule,
  'rental-contracts': RentalContractsModule,
  'delivery-orders': DeliveryOrdersModule,
  'timesheets': TimesheetsModule,
  'rental-invoices': RentalInvoicesModule,
  'rental-payments': RentalPaymentsModule,
  // الموارد البشرية
  'employees': EmployeesModule,
  'employee-contracts': EmployeeContractsModule,
  'attendance': AttendanceModule,
  'salaries': SalariesModule,
  'work-teams': WorkTeamsModule,
  'resource-distribution': ResourceDistributionModule,
  // سلسلة التوريد
  'purchase-requests': PurchaseRequestsModule,
  'purchase-orders': PurchaseOrdersModule,
  'goods-receipt': GoodsReceiptModule,
  'supplier-invoices': SupplierInvoicesModule,
  'supplier-payments': SupplierPaymentsModule,
  // التشغيل والصيانة
  'equipment-operations': EquipmentOperationsModule,
  'equipment-maintenance': EquipmentMaintenanceModule,
  'fuel': FuelModule,
  'subcontractors': SubcontractorsModule,
  'expenses': ExpensesModule,
  // المحاسبة والتقارير
  'accounting': AccountingModule,
  'vat': VATModule,
  'reports': ReportsModule,
  // الإعدادات والبيانات
  'clients': ClientsModule,
  'suppliers': SuppliersModule,
  'inventory': InventoryModule,
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
