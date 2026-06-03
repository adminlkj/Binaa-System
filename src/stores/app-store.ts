import { create } from 'zustand'

// ============ NAVIGATION TYPES ============

// 10 main sidebar sections
export type SectionKey =
  | 'dashboard'
  | 'projects'
  | 'resources'
  | 'supply-chain'
  | 'warehouses'
  | 'rental'
  | 'finance'
  | 'crm'
  | 'reports'
  | 'admin'

// Sub-module keys within each section
export type SubModuleKey =
  // Dashboard
  | 'dashboard-main'
  // Projects (when no project selected - shows list)
  | 'project-list'
  // Projects (when project selected - tabs)
  | 'project-overview' | 'project-contracting' | 'project-planning' | 'project-execution'
  | 'project-boq' | 'project-quality' | 'project-safety' | 'project-correspondence'
  | 'project-extracts' | 'project-costs' | 'project-documents'
  // Resources
  | 'employees' | 'employee-contracts' | 'employee-attendance' | 'employee-salaries'
  | 'equipment-list' | 'equipment-operations' | 'equipment-maintenance' | 'equipment-fuel'
  | 'teams' | 'team-assignments' | 'resource-distribution'
  // Supply Chain
  | 'suppliers' | 'subcontractors' | 'purchase-requests' | 'purchase-orders'
  | 'goods-receipt' | 'supplier-invoices'
  // Warehouses
  | 'warehouse-list' | 'warehouse-items' | 'warehouse-movements' | 'warehouse-inventory' | 'warehouse-transfers'
  // Rental
  | 'rental-contracts' | 'rental-equipment' | 'rental-delivery-orders' | 'rental-hours' | 'rental-invoices'
  // Finance
  | 'treasury' | 'banks' | 'checks'
  | 'journal-entries' | 'chart-of-accounts' | 'general-ledger'
  | 'receivables' | 'payables'
  | 'fixed-assets' | 'depreciation'
  | 'vat' | 'budgets' | 'cash-flow'
  // CRM
  | 'clients' | 'opportunities' | 'quotations' | 'follow-ups'
  // Reports
  | 'report-projects' | 'report-finance' | 'report-equipment' | 'report-purchases' | 'report-inventory' | 'report-hr'
  // Admin
  | 'users' | 'permissions' | 'workflow' | 'settings'

export type Lang = 'ar' | 'en'

interface AppState {
  // Navigation
  activeSection: SectionKey
  activeSubModule: SubModuleKey
  sidebarOpen: boolean
  lang: Lang
  // Project drill-down
  selectedProjectId: string | null
  // Currency symbols - configurable from company settings
  currencySymbol: string
  currencySymbolEn: string
  currencySymbolAr: string
  currencySymbolImage: string | null
  // Number formatting settings
  numberFormatMode: 'system' | 'official'
  useThousandSeparatorsSystem: boolean
  useThousandSeparatorsOfficial: boolean
  // Actions
  setActiveSection: (section: SectionKey) => void
  setActiveSubModule: (sub: SubModuleKey) => void
  navigateTo: (section: SectionKey, sub: SubModuleKey) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setLang: (lang: Lang) => void
  toggleLang: () => void
  selectProject: (projectId: string | null) => void
  setCurrencySymbol: (ar: string, en: string, arAbbr?: string) => void
  setCurrencySymbolImage: (url: string | null) => void
  setNumberFormatMode: (mode: 'system' | 'official') => void
  setThousandSeparatorSettings: (system: boolean, official: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeSection: 'dashboard',
  activeSubModule: 'dashboard-main',
  sidebarOpen: true,
  lang: 'ar',
  selectedProjectId: null,
  currencySymbol: '\uFDFC',
  currencySymbolEn: 'SAR',
  currencySymbolAr: '\uFDFC',
  currencySymbolImage: null,
  numberFormatMode: 'system',
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
  setActiveSection: (section) => set({ activeSection: section }),
  setActiveSubModule: (sub) => set({ activeSubModule: sub }),
  navigateTo: (section, sub) => set({ activeSection: section, activeSubModule: sub }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((s) => ({ lang: s.lang === 'ar' ? 'en' : 'ar' })),
  selectProject: (projectId) => set({ selectedProjectId: projectId }),
  setCurrencySymbol: (ar, en, arAbbr) => set({
    currencySymbol: ar,
    currencySymbolEn: en,
    currencySymbolAr: arAbbr || ar,
  }),
  setCurrencySymbolImage: (url) => set({ currencySymbolImage: url }),
  setNumberFormatMode: (mode) => set({ numberFormatMode: mode }),
  setThousandSeparatorSettings: (system, official) => set({
    useThousandSeparatorsSystem: system,
    useThousandSeparatorsOfficial: official,
  }),
}))

// ============ BILINGUAL LABELS ============

export const sectionLabels: Record<SectionKey, { ar: string; en: string }> = {
  'dashboard': { ar: 'لوحة التحكم', en: 'Dashboard' },
  'projects': { ar: 'المشاريع', en: 'Projects' },
  'resources': { ar: 'الموارد', en: 'Resources' },
  'supply-chain': { ar: 'سلسلة التوريد', en: 'Supply Chain' },
  'warehouses': { ar: 'المخازن', en: 'Warehouses' },
  'rental': { ar: 'التأجير', en: 'Rental' },
  'finance': { ar: 'المالية', en: 'Finance' },
  'crm': { ar: 'إدارة العلاقات', en: 'CRM' },
  'reports': { ar: 'التقارير', en: 'Reports' },
  'admin': { ar: 'الإدارة', en: 'Administration' },
}

export const subModuleLabels: Record<SubModuleKey, { ar: string; en: string }> = {
  // Dashboard
  'dashboard-main': { ar: 'نظرة عامة', en: 'Overview' },
  // Projects
  'project-list': { ar: 'قائمة المشاريع', en: 'Project List' },
  'project-overview': { ar: 'نظرة عامة', en: 'Overview' },
  'project-contracting': { ar: 'التعاقد', en: 'Contracting' },
  'project-planning': { ar: 'التخطيط', en: 'Planning' },
  'project-execution': { ar: 'التنفيذ', en: 'Execution' },
  'project-boq': { ar: 'الأعمال والكميات', en: 'BOQ' },
  'project-quality': { ar: 'الجودة', en: 'Quality' },
  'project-safety': { ar: 'السلامة', en: 'Safety' },
  'project-correspondence': { ar: 'المراسلات', en: 'Correspondence' },
  'project-extracts': { ar: 'المستخلصات', en: 'Extracts' },
  'project-costs': { ar: 'التكاليف', en: 'Costs' },
  'project-documents': { ar: 'الوثائق', en: 'Documents' },
  // Resources - Employees
  'employees': { ar: 'الموظفون', en: 'Employees' },
  'employee-contracts': { ar: 'العقود', en: 'Contracts' },
  'employee-attendance': { ar: 'الحضور', en: 'Attendance' },
  'employee-salaries': { ar: 'الرواتب', en: 'Salaries' },
  // Resources - Equipment
  'equipment-list': { ar: 'المعدات', en: 'Equipment' },
  'equipment-operations': { ar: 'التشغيل', en: 'Operations' },
  'equipment-maintenance': { ar: 'الصيانة', en: 'Maintenance' },
  'equipment-fuel': { ar: 'الوقود', en: 'Fuel' },
  // Resources - Teams
  'teams': { ar: 'فرق العمل', en: 'Teams' },
  'team-assignments': { ar: 'توزيع الموارد', en: 'Resource Allocation' },
  'resource-distribution': { ar: 'توزيع الموارد', en: 'Distribution' },
  // Supply Chain
  'suppliers': { ar: 'الموردون', en: 'Suppliers' },
  'subcontractors': { ar: 'المقاولون الفرعيون', en: 'Subcontractors' },
  'purchase-requests': { ar: 'طلبات الشراء', en: 'Purchase Requests' },
  'purchase-orders': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
  'goods-receipt': { ar: 'الاستلام', en: 'Goods Receipt' },
  'supplier-invoices': { ar: 'فواتير الموردين', en: 'Supplier Invoices' },
  // Warehouses
  'warehouse-list': { ar: 'المخازن', en: 'Warehouses' },
  'warehouse-items': { ar: 'الأصناف', en: 'Items' },
  'warehouse-movements': { ar: 'الحركات', en: 'Movements' },
  'warehouse-inventory': { ar: 'الجرد', en: 'Inventory' },
  'warehouse-transfers': { ar: 'التحويلات', en: 'Transfers' },
  // Rental
  'rental-contracts': { ar: 'العقود', en: 'Contracts' },
  'rental-equipment': { ar: 'المعدات المؤجرة', en: 'Rented Equipment' },
  'rental-delivery-orders': { ar: 'أوامر التوصيل', en: 'Delivery Orders' },
  'rental-hours': { ar: 'ساعات التشغيل', en: 'Operating Hours' },
  'rental-invoices': { ar: 'الفواتير', en: 'Invoices' },
  // Finance
  'treasury': { ar: 'الخزينة', en: 'Treasury' },
  'banks': { ar: 'البنوك', en: 'Banks' },
  'checks': { ar: 'الشيكات', en: 'Checks' },
  'journal-entries': { ar: 'القيود', en: 'Journal Entries' },
  'chart-of-accounts': { ar: 'دليل الحسابات', en: 'Chart of Accounts' },
  'general-ledger': { ar: 'اليومية العامة', en: 'General Ledger' },
  'receivables': { ar: 'الذمم المدينة', en: 'Receivables' },
  'payables': { ar: 'الذمم الدائنة', en: 'Payables' },
  'fixed-assets': { ar: 'الأصول الثابتة', en: 'Fixed Assets' },
  'depreciation': { ar: 'الإهلاك', en: 'Depreciation' },
  'vat': { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  'budgets': { ar: 'الموازنات', en: 'Budgets' },
  'cash-flow': { ar: 'التدفق النقدي', en: 'Cash Flow' },
  // CRM
  'clients': { ar: 'العملاء', en: 'Clients' },
  'opportunities': { ar: 'الفرص', en: 'Opportunities' },
  'quotations': { ar: 'العروض', en: 'Quotations' },
  'follow-ups': { ar: 'المتابعة', en: 'Follow-ups' },
  // Reports
  'report-projects': { ar: 'مشاريع', en: 'Projects' },
  'report-finance': { ar: 'مالية', en: 'Finance' },
  'report-equipment': { ar: 'معدات', en: 'Equipment' },
  'report-purchases': { ar: 'مشتريات', en: 'Purchases' },
  'report-inventory': { ar: 'مخزون', en: 'Inventory' },
  'report-hr': { ar: 'موارد بشرية', en: 'HR' },
  // Admin
  'users': { ar: 'المستخدمون', en: 'Users' },
  'permissions': { ar: 'الصلاحيات', en: 'Permissions' },
  'workflow': { ar: 'سير العمل', en: 'Workflow' },
  'settings': { ar: 'الإعدادات العامة', en: 'Settings' },
}

// ============ FORMAT HELPERS ============

export function formatSAR(value: number, lang: Lang = 'ar', symbol?: string, mode: 'system' | 'official' = 'system'): string {
  const formatted = mode === 'official'
    ? value.toFixed(2)
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (lang === 'ar') {
    const arSymbol = symbol || '\uFDFC'
    return `${formatted} ${arSymbol}`
  }
  const enSymbol = symbol || 'SAR'
  return `${enSymbol} ${formatted}`
}

export function formatAmount(value: number, mode: 'system' | 'official' = 'system'): string {
  if (mode === 'official') {
    return value.toFixed(2)
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
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
  currency: { ar: '\uFDFC', en: 'SAR' },
  print: { ar: 'طباعة', en: 'Print' },
  export: { ar: 'تصدير', en: 'Export' },
  back: { ar: 'رجوع', en: 'Back' },
  view: { ar: 'عرض', en: 'View' },
  close: { ar: 'إغلاق', en: 'Close' },
  confirm: { ar: 'تأكيد', en: 'Confirm' },
  yes: { ar: 'نعم', en: 'Yes' },
  no: { ar: 'لا', en: 'No' },
}
