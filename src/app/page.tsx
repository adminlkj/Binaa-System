'use client'

import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { Providers } from '@/components/layout/providers'
import { AppShell } from '@/components/layout/app-shell'
import { useAppStore, type NavItem } from '@/stores/app-store'

// Loading component for lazy-loaded modules
function ModuleLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="text-sm text-muted-foreground">جاري التحميل...</span>
      </div>
    </div>
  )
}

// Dynamically import all modules to avoid compiling everything at once
const DashboardModule = dynamic(() => import('@/components/modules/dashboard').then(m => ({ default: m.DashboardModule })), { loading: ModuleLoading, ssr: false })

// Construction Hub modules
const ProjectsModule = dynamic(() => import('@/components/modules/projects').then(m => ({ default: m.ProjectsModule })), { loading: ModuleLoading, ssr: false })
const ContractsModule = dynamic(() => import('@/components/modules/contracts').then(m => ({ default: m.ContractsModule })), { loading: ModuleLoading, ssr: false })
const BOQModule = dynamic(() => import('@/components/modules/boq').then(m => ({ default: m.BOQModule })), { loading: ModuleLoading, ssr: false })
const ExtractsModule = dynamic(() => import('@/components/modules/progress-claims').then(m => ({ default: m.ProgressClaimsModule })), { loading: ModuleLoading, ssr: false })
const SalesModule = dynamic(() => import('@/components/modules/sales').then(m => ({ default: m.SalesModule })), { loading: ModuleLoading, ssr: false })
const ClientPaymentsModule = dynamic(() => import('@/components/modules/client-payments').then(m => ({ default: m.ClientPaymentsModule })), { loading: ModuleLoading, ssr: false })

// Rental Hub modules
const EquipmentModule = dynamic(() => import('@/components/modules/equipment').then(m => ({ default: m.EquipmentModule })), { loading: ModuleLoading, ssr: false })
const RentalContractsModule = dynamic(() => import('@/components/modules/rental-contracts').then(m => ({ default: m.RentalContractsModule })), { loading: ModuleLoading, ssr: false })
const DeliveryOrdersModule = dynamic(() => import('@/components/modules/delivery-orders').then(m => ({ default: m.DeliveryOrdersModule })), { loading: ModuleLoading, ssr: false })
const TimesheetsModule = dynamic(() => import('@/components/modules/timesheets').then(m => ({ default: m.TimesheetsModule })), { loading: ModuleLoading, ssr: false })
const RentalInvoicesModule = dynamic(() => import('@/components/modules/rental-invoices').then(m => ({ default: m.RentalInvoicesModule })), { loading: ModuleLoading, ssr: false })
const RentalPaymentsModule = dynamic(() => import('@/components/modules/rental-payments').then(m => ({ default: m.RentalPaymentsModule })), { loading: ModuleLoading, ssr: false })

// HR modules
const EmployeesModule = dynamic(() => import('@/components/modules/employees').then(m => ({ default: m.EmployeesModule })), { loading: ModuleLoading, ssr: false })
const EmployeeContractsModule = dynamic(() => import('@/components/modules/employee-contracts').then(m => ({ default: m.EmployeeContractsModule })), { loading: ModuleLoading, ssr: false })
const AttendanceModule = dynamic(() => import('@/components/modules/attendance').then(m => ({ default: m.AttendanceModule })), { loading: ModuleLoading, ssr: false })
const PayrollRunsModule = dynamic(() => import('@/components/modules/payroll-runs').then(m => ({ default: m.PayrollRunsModule })), { loading: ModuleLoading, ssr: false })
const SalariesModule = dynamic(() => import('@/components/modules/salaries').then(m => ({ default: m.SalariesModule })), { loading: ModuleLoading, ssr: false })
const WorkTeamsModule = dynamic(() => import('@/components/modules/work-teams').then(m => ({ default: m.WorkTeamsModule })), { loading: ModuleLoading, ssr: false })
const ResourceDistributionModule = dynamic(() => import('@/components/modules/resource-distribution').then(m => ({ default: m.ResourceDistributionModule })), { loading: ModuleLoading, ssr: false })

// Supply Chain modules
const PurchaseRequestsModule = dynamic(() => import('@/components/modules/purchase-requests').then(m => ({ default: m.PurchaseRequestsModule })), { loading: ModuleLoading, ssr: false })
const PurchaseOrdersModule = dynamic(() => import('@/components/modules/purchase-orders').then(m => ({ default: m.PurchaseOrdersModule })), { loading: ModuleLoading, ssr: false })
const GoodsReceiptModule = dynamic(() => import('@/components/modules/goods-receipt').then(m => ({ default: m.GoodsReceiptModule })), { loading: ModuleLoading, ssr: false })
const SupplierInvoicesModule = dynamic(() => import('@/components/modules/supplier-invoices').then(m => ({ default: m.SupplierInvoicesModule })), { loading: ModuleLoading, ssr: false })
const SupplierPaymentsModule = dynamic(() => import('@/components/modules/supplier-payments').then(m => ({ default: m.SupplierPaymentsModule })), { loading: ModuleLoading, ssr: false })

// Operations modules
const EquipmentOperationsModule = dynamic(() => import('@/components/modules/equipment-operations').then(m => ({ default: m.EquipmentOperationsModule })), { loading: ModuleLoading, ssr: false })
const EquipmentMaintenanceModule = dynamic(() => import('@/components/modules/equipment-maintenance').then(m => ({ default: m.EquipmentMaintenanceModule })), { loading: ModuleLoading, ssr: false })
const FuelModule = dynamic(() => import('@/components/modules/fuel').then(m => ({ default: m.FuelModule })), { loading: ModuleLoading, ssr: false })
const SubcontractorsModule = dynamic(() => import('@/components/modules/subcontractors').then(m => ({ default: m.SubcontractorsModule })), { loading: ModuleLoading, ssr: false })
const ExpensesModule = dynamic(() => import('@/components/modules/expenses').then(m => ({ default: m.ExpensesModule })), { loading: ModuleLoading, ssr: false })

// Accounting & Reports
const AccountingModule = dynamic(() => import('@/components/modules/accounting').then(m => ({ default: m.AccountingModule })), { loading: ModuleLoading, ssr: false })
const VATModule = dynamic(() => import('@/components/modules/vat').then(m => ({ default: m.VATModule })), { loading: ModuleLoading, ssr: false })
const ReportsModule = dynamic(() => import('@/components/modules/reports').then(m => ({ default: m.ReportsModule })), { loading: ModuleLoading, ssr: false })

// Settings & Data
const ClientsModule = dynamic(() => import('@/components/modules/clients').then(m => ({ default: m.ClientsModule })), { loading: ModuleLoading, ssr: false })
const SuppliersModule = dynamic(() => import('@/components/modules/suppliers').then(m => ({ default: m.SuppliersModule })), { loading: ModuleLoading, ssr: false })
const InventoryModule = dynamic(() => import('@/components/modules/inventory').then(m => ({ default: m.InventoryModule })), { loading: ModuleLoading, ssr: false })
const SettingsModule = dynamic(() => import('@/components/modules/settings').then(m => ({ default: m.SettingsModule })), { loading: ModuleLoading, ssr: false })
const AccountingMappingModule = dynamic(() => import('@/components/modules/accounting-mapping').then(m => ({ default: m.AccountingMappingModule })), { loading: ModuleLoading, ssr: false })

// Fallback
const PlaceholderModule = dynamic(() => import('@/components/modules/placeholder').then(m => ({ default: m.PlaceholderModule })), { loading: ModuleLoading, ssr: false })

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
  'work-teams': WorkTeamsModule,
  'attendance': AttendanceModule,
  'payroll-runs': PayrollRunsModule,
  'salaries': SalariesModule,
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
  'accounting-mapping': AccountingMappingModule,
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
