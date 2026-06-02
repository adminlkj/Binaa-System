import { create } from 'zustand'

export type ModuleKey =
  | 'dashboard'
  | 'projects'
  | 'boq'
  | 'progress-claims'
  | 'contracts'
  | 'clients'
  | 'suppliers'
  | 'subcontractors'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'labor'
  | 'equipment'
  | 'petty-cash'
  | 'advances'
  | 'inventory'
  | 'accounting'
  | 'vat'
  | 'reports'
  | 'settings'

export type Lang = 'ar' | 'en'

interface AppState {
  activeModule: ModuleKey
  sidebarOpen: boolean
  lang: Lang
  setActiveModule: (module: ModuleKey) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setLang: (lang: Lang) => void
  toggleLang: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'dashboard',
  sidebarOpen: true,
  lang: 'ar',
  setActiveModule: (module) => set({ activeModule: module }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((state) => ({ lang: state.lang === 'ar' ? 'en' : 'ar' })),
}))

// Bilingual labels
export const labels: Record<ModuleKey, { ar: string; en: string }> = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  boq: { ar: 'جدول الكميات BOQ', en: 'Bill of Quantities' },
  'progress-claims': { ar: 'المستخلصات', en: 'Progress Claims' },
  contracts: { ar: 'العقود', en: 'Contracts' },
  clients: { ar: 'العملاء', en: 'Clients' },
  suppliers: { ar: 'الموردين', en: 'Suppliers' },
  subcontractors: { ar: 'مقاولو الباطن', en: 'Subcontractors' },
  sales: { ar: 'المبيعات', en: 'Sales' },
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  expenses: { ar: 'المصروفات', en: 'Expenses' },
  labor: { ar: 'تكاليف العمالة', en: 'Labor Costs' },
  equipment: { ar: 'المعدات', en: 'Equipment' },
  'petty-cash': { ar: 'الصندوق النقدي', en: 'Petty Cash' },
  advances: { ar: 'العهد والسلف', en: 'Advances' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  vat: { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  reports: { ar: 'التقارير', en: 'Reports' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
}

// Section labels
export const sectionLabels = {
  main: { ar: 'الرئيسية', en: 'Main' },
  salesPurchases: { ar: 'المبيعات والمشتريات', en: 'Sales & Purchases' },
  costs: { ar: 'التكاليف', en: 'Costs' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  reports: { ar: 'التقارير', en: 'Reports' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
}

// Format SAR with English digits
export function formatSAR(value: number, lang: Lang = 'ar'): string {
  const formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return lang === 'ar' ? `${formatted} ر.س` : `SAR ${formatted}`
}

// Format number with English digits
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

// Format date bilingual
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
  currency: { ar: 'ر.س', en: 'SAR' },
}
