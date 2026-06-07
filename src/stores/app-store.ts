import { create } from 'zustand'

// ============ NAVIGATION TYPES ============
// 7 main sidebar groups with sub-items

export type NavItem =
  // الرئيسية
  | 'dashboard'
  // المبيعات
  | 'sales' | 'extracts' | 'clients' | 'client-payments'
  // المشتريات
  | 'purchases' | 'suppliers' | 'subcontractors' | 'supplier-payments'
  // المشاريع
  | 'projects' | 'contracts' | 'boq' | 'timesheets'
  // الموارد
  | 'equipment' | 'equipment-operations' | 'resource-distribution' | 'employees' | 'salaries' | 'attendance'
  | 'equipment-maintenance' | 'fuel' | 'work-teams' | 'employee-contracts'
  // سلسلة التوريد
  | 'purchase-requests' | 'purchase-orders' | 'goods-receipt' | 'supplier-invoices' | 'supplier-payments'
  // المخزون والمحاسبة
  | 'inventory' | 'accounting' | 'vat'
  // التقارير والإعدادات
  | 'reports' | 'settings'

export type NavGroup = 'home' | 'sales' | 'purchases' | 'projects' | 'resources' | 'supply-chain' | 'inventory-accounting' | 'reports-settings'

export type Lang = 'ar' | 'en'

interface NavGroupConfig {
  key: NavGroup
  label: { ar: string; en: string }
  items: NavItem[]
}

export const navGroups: NavGroupConfig[] = [
  {
    key: 'home',
    label: { ar: 'الرئيسية', en: 'Home' },
    items: ['dashboard'],
  },
  {
    key: 'sales',
    label: { ar: 'المبيعات', en: 'Sales' },
    items: ['sales', 'extracts', 'clients', 'client-payments'],
  },
  {
    key: 'purchases',
    label: { ar: 'المشتريات', en: 'Purchases' },
    items: ['purchases', 'suppliers', 'subcontractors', 'supplier-payments'],
  },
  {
    key: 'projects',
    label: { ar: 'المشاريع', en: 'Projects' },
    items: ['projects', 'contracts', 'boq', 'timesheets'],
  },
  {
    key: 'resources',
    label: { ar: 'الموارد', en: 'Resources' },
    items: ['equipment', 'equipment-operations', 'resource-distribution', 'employees', 'salaries', 'attendance', 'equipment-maintenance', 'fuel', 'work-teams', 'employee-contracts'],
  },
  {
    key: 'supply-chain',
    label: { ar: 'سلسلة التوريد', en: 'Supply Chain' },
    items: ['purchase-requests', 'purchase-orders', 'goods-receipt', 'supplier-invoices', 'supplier-payments'],
  },
  {
    key: 'inventory-accounting',
    label: { ar: 'المخزون والمحاسبة', en: 'Inventory & Accounting' },
    items: ['inventory', 'accounting', 'vat'],
  },
  {
    key: 'reports-settings',
    label: { ar: 'التقارير والإعدادات', en: 'Reports & Settings' },
    items: ['reports', 'settings'],
  },
]

export const navItemLabels: Record<NavItem, { ar: string; en: string }> = {
  // الرئيسية
  'dashboard': { ar: 'لوحة التحكم', en: 'Dashboard' },
  // المبيعات
  'sales': { ar: 'المبيعات', en: 'Sales Invoices' },
  'extracts': { ar: 'المستخلصات', en: 'Extracts' },
  'clients': { ar: 'العملاء', en: 'Clients' },
  'client-payments': { ar: 'تحصيلات العملاء', en: 'Client Payments' },
  // المشتريات
  'purchases': { ar: 'المشتريات', en: 'Purchase Invoices' },
  'suppliers': { ar: 'الموردون', en: 'Suppliers' },
  'subcontractors': { ar: 'مقاولو الباطن', en: 'Subcontractors' },
  'supplier-payments': { ar: 'سداد الموردين', en: 'Supplier Payments' },
  // المشاريع
  'projects': { ar: 'المشاريع', en: 'Projects' },
  'contracts': { ar: 'العقود', en: 'Contracts' },
  'boq': { ar: 'جدول الكميات BOQ', en: 'Bill of Quantities' },
  'timesheets': { ar: 'ساعات العمل', en: 'Timesheets' },
  // الموارد
  'equipment': { ar: 'المعدات', en: 'Equipment' },
  'equipment-operations': { ar: 'التشغيل', en: 'Operations' },
  'resource-distribution': { ar: 'توزيع الموارد', en: 'Resource Distribution' },
  'employees': { ar: 'الموظفون', en: 'Employees' },
  'salaries': { ar: 'الرواتب', en: 'Salaries' },
  'attendance': { ar: 'الحضور والانصراف', en: 'Attendance' },
  'equipment-maintenance': { ar: 'الصيانة', en: 'Maintenance' },
  'fuel': { ar: 'الوقود', en: 'Fuel' },
  'work-teams': { ar: 'فرق العمل', en: 'Work Teams' },
  'employee-contracts': { ar: 'عقود الموظفين', en: 'Employee Contracts' },
  // سلسلة التوريد
  'purchase-requests': { ar: 'طلبات الشراء', en: 'Purchase Requests' },
  'purchase-orders': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
  'goods-receipt': { ar: 'الاستلام', en: 'Goods Receipt' },
  'supplier-invoices': { ar: 'فواتير الموردين', en: 'Supplier Invoices' },
  'supplier-payments': { ar: 'سداد الموردين', en: 'Supplier Payments' },
  // المخزون والمحاسبة
  'inventory': { ar: 'المخزون', en: 'Inventory' },
  'accounting': { ar: 'المحاسبة', en: 'Accounting' },
  'vat': { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  // التقارير والإعدادات
  'reports': { ar: 'التقارير', en: 'Reports' },
  'settings': { ar: 'الإعدادات', en: 'Settings' },
}

// Accounting sub-tabs
export type AccountingTab = 'chart-of-accounts' | 'journal-entries' | 'general-ledger' | 'trial-balance' | 'receivables' | 'payables'

// ============ APP STORE ============

interface AppState {
  // Navigation
  activeItem: NavItem
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  lang: Lang
  // Project drill-down
  selectedProjectId: string | null
  // Currency - single source
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
  setCurrencySymbolImage: (url: string | null) => void
  setThousandSeparatorSettings: (system: boolean, official: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeItem: 'dashboard',
  sidebarOpen: false,
  sidebarCollapsed: false,
  lang: 'ar',
  selectedProjectId: null,
  currencySymbolImage: null,
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
  setActiveItem: (item) => set({ activeItem: item }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
  selectProject: (projectId) => set({ selectedProjectId: projectId }),
  setCurrencySymbolImage: (url) => set({ currencySymbolImage: url }),
  setThousandSeparatorSettings: (system, official) => set({
    useThousandSeparatorsSystem: system,
    useThousandSeparatorsOfficial: official,
  }),
}))

// ============ FORMAT HELPERS ============

export function formatAmount(value: number, mode: 'system' | 'official' = 'system'): string {
  if (mode === 'official') {
    return value.toFixed(2)
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatSAR(value: number, lang: Lang = 'ar'): string {
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return lang === 'ar' ? `${formatted} ﷼` : `SAR ${formatted}`
}

export function formatDate(dateStr: string, lang: Lang = 'ar'): string {
  const date = new Date(dateStr)
  if (lang === 'ar') {
    return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
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
}
