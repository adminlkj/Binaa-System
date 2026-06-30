import { create } from 'zustand'

// ============ NAVIGATION TYPES ============
// Hub-centric navigation: two main activities + supporting modules

export type NavItem =
  // الرئيسية
  | 'dashboard' | 'business-flows'
  // محور المشاريع التنفيذية (Construction Hub)
  | 'projects' | 'contracts' | 'boq' | 'extracts' | 'sales' | 'service-invoices' | 'client-payments'
  // محور تأجير المعدات (Rental Hub)
  | 'equipment' | 'rental-contracts' | 'delivery-orders' | 'timesheets' | 'rental-invoices' | 'rental-payments'
  // الموارد البشرية (feed both hubs)
  | 'employees' | 'employee-contracts' | 'work-teams' | 'attendance' | 'payroll-runs' | 'salaries' | 'salary-payments' | 'advances' | 'resource-distribution'
  // سلسلة التوريد (feed both hubs)
  | 'purchase-requests' | 'purchase-orders' | 'goods-receipt' | 'supplier-invoices' | 'supplier-payments'
  // التشغيل والصيانة (equipment-related)
  | 'equipment-operations' | 'equipment-maintenance' | 'fuel' | 'subcontractors' | 'labor' | 'petty-cash'
  // المحاسبة والتقارير
  | 'accounting' | 'vat' | 'reports' | 'depreciation' | 'financial-years'
  // الإعدادات والبيانات الأساسية
  | 'clients' | 'suppliers' | 'inventory' | 'settings' | 'expenses' | 'accounting-mapping' | 'users'

export type NavGroup = 'home' | 'construction-hub' | 'rental-hub' | 'hr' | 'supply-chain' | 'operations' | 'accounting-reports' | 'settings-data'

export type Lang = 'ar' | 'en'

export type ActivityType = 'construction' | 'rental' | 'both'

interface NavGroupConfig {
  key: NavGroup
  label: { ar: string; en: string }
  icon: string // lucide icon name
  color: string // tailwind color class
  items: NavItem[]
}

export const navGroups: NavGroupConfig[] = [
  {
    key: 'home',
    label: { ar: 'الرئيسية', en: 'Home' },
    icon: 'LayoutDashboard',
    color: 'text-gray-600',
    items: ['dashboard', 'business-flows'],
  },
  {
    key: 'construction-hub',
    label: { ar: 'المشاريع التنفيذية', en: 'Construction Projects' },
    icon: 'Building2',
    color: 'text-emerald-600',
    items: ['projects', 'contracts', 'boq', 'extracts', 'sales', 'service-invoices', 'client-payments'],
  },
  {
    key: 'rental-hub',
    label: { ar: 'تأجير المعدات', en: 'Equipment Rental' },
    icon: 'Truck',
    color: 'text-cyan-600',
    items: ['equipment', 'rental-contracts', 'delivery-orders', 'timesheets', 'rental-invoices', 'rental-payments'],
  },
  {
    key: 'hr',
    label: { ar: 'الموارد البشرية', en: 'Human Resources' },
    icon: 'Users',
    color: 'text-violet-600',
    items: ['employees', 'employee-contracts', 'work-teams', 'attendance', 'payroll-runs', 'salaries', 'salary-payments', 'advances', 'resource-distribution'],
  },
  {
    key: 'supply-chain',
    label: { ar: 'سلسلة التوريد', en: 'Supply Chain' },
    icon: 'Package',
    color: 'text-amber-600',
    items: ['purchase-requests', 'purchase-orders', 'goods-receipt', 'supplier-invoices', 'supplier-payments'],
  },
  {
    key: 'operations',
    label: { ar: 'التشغيل والصيانة', en: 'Operations & Maintenance' },
    icon: 'Wrench',
    color: 'text-orange-600',
    items: ['equipment-operations', 'equipment-maintenance', 'fuel', 'subcontractors', 'expenses', 'labor', 'petty-cash'],
  },
  {
    key: 'accounting-reports',
    label: { ar: 'المحاسبة والتقارير', en: 'Accounting & Reports' },
    icon: 'Calculator',
    color: 'text-teal-600',
    items: ['accounting', 'depreciation', 'financial-years', 'vat', 'reports'],
  },
  {
    key: 'settings-data',
    label: { ar: 'الإعدادات والبيانات', en: 'Settings & Data' },
    icon: 'Settings',
    color: 'text-gray-500',
    items: ['clients', 'suppliers', 'inventory', 'users', 'settings', 'accounting-mapping'],
  },
]

export const navItemLabels: Record<NavItem, { ar: string; en: string }> = {
  // الرئيسية
  'dashboard': { ar: 'لوحة التحكم', en: 'Dashboard' },
  'business-flows': { ar: 'تدفقات الأعمال', en: 'Business Flows' },
  // محور المشاريع التنفيذية
  'projects': { ar: 'المشاريع', en: 'Projects' },
  'contracts': { ar: 'العقود', en: 'Contracts' },
  'boq': { ar: 'جدول الكميات BOQ', en: 'Bill of Quantities' },
  'extracts': { ar: 'المستخلصات', en: 'Extracts' },
  'sales': { ar: 'فواتير العملاء', en: 'Client Invoices' },
  'service-invoices': { ar: 'فواتير الخدمات', en: 'Service Invoices' },
  'client-payments': { ar: 'التحصيلات', en: 'Collections' },
  // محور تأجير المعدات
  'equipment': { ar: 'المعدات', en: 'Equipment' },
  'rental-contracts': { ar: 'عقود التأجير', en: 'Rental Contracts' },
  'delivery-orders': { ar: 'أوامر التوصيل', en: 'Delivery Orders' },
  'timesheets': { ar: 'ساعات التشغيل', en: 'Timesheets' },
  'rental-invoices': { ar: 'فواتير التأجير', en: 'Rental Invoices' },
  'rental-payments': { ar: 'تحصيلات التأجير', en: 'Rental Collections' },
  // الموارد البشرية
  'employees': { ar: 'الموظفون', en: 'Employees' },
  'employee-contracts': { ar: 'العقود', en: 'Contracts' },
  'work-teams': { ar: 'فريق العمل', en: 'Work Teams' },
  'attendance': { ar: 'الحضور والانصراف', en: 'Attendance' },
  'payroll-runs': { ar: 'مسيرات الرواتب', en: 'Payroll Runs' },
  'salaries': { ar: 'الرواتب', en: 'Salaries' },
  'salary-payments': { ar: 'سداد الرواتب', en: 'Salary Payments' },
  'advances': { ar: 'السلف', en: 'Advances' },
  'resource-distribution': { ar: 'توزيع الموارد', en: 'Resource Distribution' },
  // سلسلة التوريد
  'purchase-requests': { ar: 'طلبات الشراء', en: 'Purchase Requests' },
  'purchase-orders': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
  'goods-receipt': { ar: 'الاستلام', en: 'Goods Receipt' },
  'supplier-invoices': { ar: 'فواتير الموردين', en: 'Supplier Invoices' },
  'supplier-payments': { ar: 'سداد الموردين', en: 'Supplier Payments' },
  // التشغيل والصيانة
  'equipment-operations': { ar: 'التشغيل', en: 'Operations' },
  'equipment-maintenance': { ar: 'الصيانة', en: 'Maintenance' },
  'fuel': { ar: 'الوقود', en: 'Fuel' },
  'subcontractors': { ar: 'مقاولو الباطن', en: 'Subcontractors' },
  'expenses': { ar: 'المصروفات العامة', en: 'General Expenses' },
  'labor': { ar: 'تكاليف العمالة', en: 'Labor Costs' },
  'petty-cash': { ar: 'الصندوق النقدي', en: 'Petty Cash' },
  // المحاسبة والتقارير
  'accounting': { ar: 'المحاسبة', en: 'Accounting' },
  'depreciation': { ar: 'الإهلاك', en: 'Depreciation' },
  'financial-years': { ar: 'السنوات المالية', en: 'Financial Years' },
  'vat': { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  'reports': { ar: 'التقارير', en: 'Reports' },
  // الإعدادات
  'clients': { ar: 'العملاء', en: 'Clients' },
  'suppliers': { ar: 'الموردون', en: 'Suppliers' },
  'inventory': { ar: 'المخزون', en: 'Inventory' },
  'settings': { ar: 'الإعدادات', en: 'Settings' },
  'accounting-mapping': { ar: 'الربط المحاسبي', en: 'Accounting Mapping' },
  'users': { ar: 'المستخدمون', en: 'Users' },
}

// Activity type mapping
export const navItemActivity: Record<NavItem, ActivityType> = {
  'dashboard': 'both',
  'business-flows': 'both',
  // Construction hub
  'projects': 'construction',
  'contracts': 'construction',
  'boq': 'construction',
  'extracts': 'construction',
  'sales': 'construction',
  'service-invoices': 'construction',
  'client-payments': 'construction',
  // Rental hub
  'equipment': 'rental',
  'rental-contracts': 'rental',
  'delivery-orders': 'rental',
  'timesheets': 'rental',
  'rental-invoices': 'rental',
  'rental-payments': 'rental',
  // HR - feeds both
  'employees': 'both',
  'employee-contracts': 'both',
  'attendance': 'both',
  'payroll-runs': 'both',
  'salaries': 'both',
  'salary-payments': 'both',
  'advances': 'both',
  'work-teams': 'both',
  'resource-distribution': 'both',
  // Supply chain - feeds both
  'purchase-requests': 'both',
  'purchase-orders': 'both',
  'goods-receipt': 'both',
  'supplier-invoices': 'both',
  'supplier-payments': 'both',
  // Operations
  'equipment-operations': 'rental',
  'equipment-maintenance': 'rental',
  'fuel': 'rental',
  'subcontractors': 'construction',
  'expenses': 'both',
  'labor': 'construction',
  'petty-cash': 'both',
  // Accounting
  'accounting': 'both',
  'depreciation': 'both',
  'financial-years': 'both',
  'vat': 'both',
  'reports': 'both',
  // Settings
  'clients': 'both',
  'suppliers': 'both',
  'inventory': 'both',
  'settings': 'both',
  'accounting-mapping': 'both',
  'users': 'both',
}

// Workflow chain definitions
export const CONSTRUCTION_WORKFLOW = [
  { step: 'clients', label: { ar: 'العميل', en: 'Client' }, navItem: 'clients' as NavItem },
  { step: 'projects', label: { ar: 'المشروع', en: 'Project' }, navItem: 'projects' as NavItem },
  { step: 'contracts', label: { ar: 'العقد', en: 'Contract' }, navItem: 'contracts' as NavItem },
  { step: 'boq', label: { ar: 'BOQ', en: 'BOQ' }, navItem: 'boq' as NavItem },
  { step: 'work-hours', label: { ar: 'ساعات العمل', en: 'Work Hours' }, navItem: 'attendance' as NavItem },
  { step: 'expenses', label: { ar: 'المصروفات', en: 'Expenses' }, navItem: 'expenses' as NavItem },
  { step: 'subcontractors', label: { ar: 'مقاولو الباطن', en: 'Subcontractors' }, navItem: 'subcontractors' as NavItem },
  { step: 'purchases', label: { ar: 'المشتريات', en: 'Purchases' }, navItem: 'purchase-requests' as NavItem },
  { step: 'extracts', label: { ar: 'المستخلص', en: 'Extract' }, navItem: 'extracts' as NavItem },
  { step: 'invoice', label: { ar: 'فاتورة العميل', en: 'Client Invoice' }, navItem: 'sales' as NavItem },
  { step: 'collection', label: { ar: 'التحصيل', en: 'Collection' }, navItem: 'client-payments' as NavItem },
  { step: 'accounting', label: { ar: 'المحاسبة', en: 'Accounting' }, navItem: 'accounting' as NavItem },
  { step: 'reports', label: { ar: 'التقارير', en: 'Reports' }, navItem: 'reports' as NavItem },
]

export const RENTAL_WORKFLOW = [
  { step: 'clients', label: { ar: 'العميل', en: 'Client' }, navItem: 'clients' as NavItem },
  { step: 'rental-contract', label: { ar: 'عقد التأجير', en: 'Rental Contract' }, navItem: 'rental-contracts' as NavItem },
  { step: 'sales-order', label: { ar: 'أمر البيع', en: 'Sales Order' }, navItem: 'rental-contracts' as NavItem },
  { step: 'delivery', label: { ar: 'أمر التوصيل', en: 'Delivery Order' }, navItem: 'delivery-orders' as NavItem },
  { step: 'timesheet', label: { ar: 'Time Sheet', en: 'Time Sheet' }, navItem: 'timesheets' as NavItem },
  { step: 'invoice', label: { ar: 'فاتورة التأجير', en: 'Rental Invoice' }, navItem: 'rental-invoices' as NavItem },
  { step: 'collection', label: { ar: 'التحصيل', en: 'Collection' }, navItem: 'rental-payments' as NavItem },
  { step: 'accounting', label: { ar: 'المحاسبة', en: 'Accounting' }, navItem: 'accounting' as NavItem },
  { step: 'reports', label: { ar: 'التقارير', en: 'Reports' }, navItem: 'reports' as NavItem },
]

export const PURCHASE_WORKFLOW = [
  { step: 'request', label: { ar: 'طلب شراء', en: 'Purchase Request' }, navItem: 'purchase-requests' as NavItem },
  { step: 'order', label: { ar: 'أمر شراء', en: 'Purchase Order' }, navItem: 'purchase-orders' as NavItem },
  { step: 'receipt', label: { ar: 'استلام', en: 'Goods Receipt' }, navItem: 'goods-receipt' as NavItem },
  { step: 'invoice', label: { ar: 'فاتورة مورد', en: 'Supplier Invoice' }, navItem: 'supplier-invoices' as NavItem },
  { step: 'payment', label: { ar: 'سداد', en: 'Payment' }, navItem: 'supplier-payments' as NavItem },
  { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, navItem: 'accounting' as NavItem },
]

// BA-09: HR Workflow — Employee → Contract → Attendance → Payroll → Salary → Payment → Entry
export const HR_WORKFLOW = [
  { step: 'employee', label: { ar: 'الموظف', en: 'Employee' }, navItem: 'employees' as NavItem },
  { step: 'contract', label: { ar: 'عقد العمل', en: 'Employment Contract' }, navItem: 'employee-contracts' as NavItem },
  { step: 'attendance', label: { ar: 'الحضور', en: 'Attendance' }, navItem: 'attendance' as NavItem },
  { step: 'payroll', label: { ar: 'مسير الرواتب', en: 'Payroll Run' }, navItem: 'payroll-runs' as NavItem },
  { step: 'salary', label: { ar: 'الراتب', en: 'Salary' }, navItem: 'salaries' as NavItem },
  { step: 'payment', label: { ar: 'الصرف', en: 'Payment' }, navItem: 'salary-payments' as NavItem },
  { step: 'accounting', label: { ar: 'قيد محاسبي', en: 'Journal Entry' }, navItem: 'accounting' as NavItem },
]

// Accounting sub-tabs
export type AccountingTab = 'chart-of-accounts' | 'role-mapping' | 'journal-entries' | 'general-ledger' | 'trial-balance' | 'receivables' | 'payables'

// ============ APP STORE ============

interface AppState {
  // Navigation
  activeItem: NavItem
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  lang: Lang
  // Project drill-down ( persisted in URL via #projects?projectId=xxx )
  selectedProjectId: string | null
  selectedEquipmentId: string | null
  // Cross-module pre-fill ( e.g. progress-claims → sales invoice creation )
  prefillProgressClaimId: string | null
  // Detail-level breadcrumb ( shown in header when inside a detail view )
  detailBreadcrumb: { ar: string; en: string } | null
  // Currency
  currencySymbolImage: string | null
  // Number formatting settings
  useThousandSeparatorsSystem: boolean
  useThousandSeparatorsOfficial: boolean
  // Actions
  setActiveItem: (item: NavItem) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setLang: (lang: Lang) => void
  toggleLang: () => void
  selectProject: (projectId: string | null) => void
  selectEquipment: (equipmentId: string | null) => void
  setPrefillProgressClaimId: (id: string | null) => void
  setDetailBreadcrumb: (crumb: { ar: string; en: string } | null) => void
  setCurrencySymbolImage: (url: string | null) => void
  setThousandSeparatorSettings: (system: boolean, official: boolean) => void
}

export const useAppStore = create<AppState>((set, _get) => ({
  activeItem: 'dashboard',
  sidebarOpen: false,
  sidebarCollapsed: false,
  lang: 'ar',
  selectedProjectId: null,
  selectedEquipmentId: null,
  prefillProgressClaimId: null,
  detailBreadcrumb: null,
  currencySymbolImage: null,
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
  setActiveItem: (item) => {
    set({ activeItem: item })
    // SPA history management — push a new entry on every module switch
    // so browser back button returns to the previous module (L2-CRIT-001/002).
    if (typeof window !== 'undefined' && window.history.state?.activeItem !== item) {
      try {
        window.history.pushState({ activeItem: item }, '', `/#${item}`)
      } catch {
        // ignore — pushState can throw in rare sandboxed contexts
      }
    }
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
  selectProject: (projectId) => {
    set({ selectedProjectId: projectId, activeItem: 'projects' })
    if (typeof window !== 'undefined') {
      const hash = projectId ? `/#projects?projectId=${projectId}` : '/#projects'
      try { window.history.pushState({ activeItem: "projects", selectedProjectId: projectId }, "", hash) } catch { /* history API may fail */ }
    }
  },
  selectEquipment: (equipmentId) => {
    set({ selectedEquipmentId: equipmentId, activeItem: 'equipment' })
    if (typeof window !== 'undefined') {
      const hash = equipmentId ? `/#equipment?equipmentId=${equipmentId}` : '/#equipment'
      try { window.history.pushState({ activeItem: "equipment", selectedEquipmentId: equipmentId }, "", hash) } catch { /* history API may fail */ }
    }
  },
  setPrefillProgressClaimId: (id) => set({ prefillProgressClaimId: id }),
  setDetailBreadcrumb: (crumb) => set({ detailBreadcrumb: crumb }),
  setCurrencySymbolImage: (url) => set({ currencySymbolImage: url }),
  setThousandSeparatorSettings: (system, official) => set({
    useThousandSeparatorsSystem: system,
    useThousandSeparatorsOfficial: official,
  }),
}))

// ============ FORMAT HELPERS ============

export function formatAmount(value: number | string, mode: 'system' | 'official' = 'system'): string {
  const safeValue = typeof value === 'string' ? parseFloat(value) : value
  const num = isNaN(safeValue) ? 0 : safeValue
  if (mode === 'official') {
    return num.toFixed(2)
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatNumber(value: number | string | undefined | null): string {
  if (value == null) return '0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-US')
}

export function formatSAR(value: number | string | undefined | null, lang: Lang = 'ar'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const safeValue = num == null || isNaN(num as number) ? 0 : num as number
  const formatted = safeValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return lang === 'ar' ? `${formatted} ﷼` : `SAR ${formatted}`
}

export function formatDate(dateStr: string, lang: Lang = 'ar'): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  // Always use Gregorian (ميلادية) calendar
  // Arabic uses Arabic digit formatting but Gregorian calendar
  if (lang === 'ar') {
    return date.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// Common bilingual text
export const commonText = {
  add: { ar: 'إضافة', en: 'Add' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  search: { ar: 'بحث...', en: 'Search...' },
  filter: { ar: 'تصفية', en: 'Filter' },
  refresh: { ar: 'تحديث', en: 'Refresh' },
  loading: { ar: 'جاري التحميل...', en: 'Loading...' },
  noData: { ar: 'لا توجد بيانات', en: 'No data available' },
  error: { ar: 'حدث خطأ', en: 'An error occurred' },
  retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  total: { ar: 'الإجمالي', en: 'Total' },
  status: { ar: 'الحالة', en: 'Status' },
  date: { ar: 'التاريخ', en: 'Date' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  description: { ar: 'الوصف', en: 'Description' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  new: { ar: 'جديد', en: 'New' },
  home: { ar: 'الرئيسية', en: 'Home' },
  print: { ar: 'طباعة', en: 'Print' },
  export: { ar: 'تصدير', en: 'Export' },
  back: { ar: 'رجوع', en: 'Back' },
  view: { ar: 'عرض', en: 'View' },
  close: { ar: 'إغلاق', en: 'Close' },
  confirm: { ar: 'تأكيد', en: 'Confirm' },
  yes: { ar: 'نعم', en: 'Yes' },
  no: { ar: 'لا', en: 'No' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  reject: { ar: 'رفض', en: 'Reject' },
  submit: { ar: 'إرسال', en: 'Submit' },
  vat: { ar: 'الضريبة', en: 'VAT' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  debit: { ar: 'مدين', en: 'Debit' },
  credit: { ar: 'دائن', en: 'Credit' },
  balance: { ar: 'الرصيد', en: 'Balance' },
  revenue: { ar: 'الإيرادات', en: 'Revenue' },
  cost: { ar: 'التكاليف', en: 'Costs' },
  profit: { ar: 'الربحية', en: 'Profitability' },
  projectCard: { ar: 'كرت المشروع', en: 'Project Card' },
  equipmentCard: { ar: 'كرت المعدة', en: 'Equipment Card' },
}
