import { create } from 'zustand'

export type ModuleKey =
  | 'dashboard'
  // Equipment Rental
  | 'contracts'
  | 'delivery-orders'
  | 'timesheets'
  | 'rental-invoices'
  | 'equipment'
  // Projects
  | 'projects'
  | 'progress-claims'
  | 'boq'
  // Services
  | 'service-invoices'
  | 'clients'
  // Purchases
  | 'purchase-orders'
  | 'supplier-invoices'
  | 'suppliers'
  | 'subcontractors'
  // Costs
  | 'expenses'
  | 'labor'
  | 'advances'
  | 'petty-cash'
  // Accounting
  | 'accounting'
  | 'vat'
  // Inventory
  | 'inventory'
  // Reports & Settings
  | 'reports'
  | 'settings'
  // Legacy keys (kept for backward compatibility)
  | 'sales'
  | 'purchases'

export type Lang = 'ar' | 'en'

interface AppState {
  activeModule: ModuleKey
  sidebarOpen: boolean
  lang: Lang
  // Currency symbols - configurable from company settings
  currencySymbol: string    // Arabic symbol (default: ﷼)
  currencySymbolEn: string  // English symbol (default: SAR)
  currencySymbolAr: string  // Arabic abbreviation (default: ﷼)
  // Currency symbol image (takes priority over text symbols when set)
  currencySymbolImage: string | null
  // Number formatting settings
  numberFormatMode: 'system' | 'official'  // system = with thousand separators, official = without (ZATCA)
  useThousandSeparatorsSystem: boolean     // default: true (show separators in system screens)
  useThousandSeparatorsOfficial: boolean   // default: false (no separators in official docs - ZATCA)
  setActiveModule: (module: ModuleKey) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setLang: (lang: Lang) => void
  toggleLang: () => void
  setCurrencySymbol: (ar: string, en: string, arAbbr?: string) => void
  setCurrencySymbolImage: (url: string | null) => void
  setNumberFormatMode: (mode: 'system' | 'official') => void
  setThousandSeparatorSettings: (system: boolean, official: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'dashboard',
  sidebarOpen: true,
  lang: 'ar',
  // Default to Saudi Riyal Unicode symbol (U+FDFC) - loaded from font files
  currencySymbol: '\uFDFC',  // ﷼
  currencySymbolEn: 'SAR',
  currencySymbolAr: '\uFDFC', // ﷼
  // Currency symbol image (takes priority over text symbols when set)
  currencySymbolImage: null as string | null,
  // Number formatting - system uses separators, official (ZATCA) does not
  numberFormatMode: 'system',
  useThousandSeparatorsSystem: true,
  useThousandSeparatorsOfficial: false,
  setActiveModule: (module) => set({ activeModule: module }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setLang: (lang) => set({ lang }),
  toggleLang: () => set((state) => ({ lang: state.lang === 'ar' ? 'en' : 'ar' })),
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

// Bilingual labels
export const labels: Record<ModuleKey, { ar: string; en: string }> = {
  // Main
  dashboard: { ar: 'الرئيسية', en: 'Dashboard' },
  // Equipment Rental
  contracts: { ar: 'العقود', en: 'Contracts' },
  'delivery-orders': { ar: 'أوامر التوصيل', en: 'Delivery Orders' },
  timesheets: { ar: 'ساعات العمل', en: 'Timesheets' },
  'rental-invoices': { ar: 'فواتير الإيجار', en: 'Rental Invoices' },
  equipment: { ar: 'المعدات', en: 'Equipment' },
  // Projects
  projects: { ar: 'المشاريع', en: 'Projects' },
  'progress-claims': { ar: 'المستخلصات', en: 'Progress Claims' },
  boq: { ar: 'جدول الكميات', en: 'BOQ' },
  // Services
  'service-invoices': { ar: 'فواتير الخدمات', en: 'Service Invoices' },
  clients: { ar: 'العملاء', en: 'Clients' },
  // Purchases
  'purchase-orders': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
  'supplier-invoices': { ar: 'فواتير الموردين', en: 'Supplier Invoices' },
  suppliers: { ar: 'الموردين', en: 'Suppliers' },
  subcontractors: { ar: 'مقاولو الباطن', en: 'Subcontractors' },
  // Costs
  expenses: { ar: 'المصروفات', en: 'Expenses' },
  labor: { ar: 'تكاليف العمالة', en: 'Labor Costs' },
  advances: { ar: 'العهد والسلف', en: 'Advances' },
  'petty-cash': { ar: 'الصندوق النقدي', en: 'Petty Cash' },
  // Accounting
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  vat: { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  // Inventory
  inventory: { ar: 'المخزون', en: 'Inventory' },
  // Reports & Settings
  reports: { ar: 'التقارير', en: 'Reports' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  // Legacy (kept for backward compatibility)
  sales: { ar: 'فواتير الخدمات', en: 'Service Invoices' },
  purchases: { ar: 'أوامر الشراء', en: 'Purchase Orders' },
}

// Section labels
export const sectionLabels = {
  main: { ar: 'الرئيسية', en: 'Main' },
  equipmentRental: { ar: 'تأجير المعدات', en: 'Equipment Rental' },
  projectsSection: { ar: 'المشاريع', en: 'Projects' },
  services: { ar: 'الخدمات', en: 'Services' },
  purchases: { ar: 'المشتريات', en: 'Purchases' },
  costs: { ar: 'التكاليف', en: 'Costs' },
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  reportsSettings: { ar: 'التقارير والإعدادات', en: 'Reports & Settings' },
}

// Format SAR with English digits and proper currency symbol
// The symbol is configurable and comes from company settings
// mode: 'system' = with thousand separators, 'official' = no separators (ZATCA compliance)
export function formatSAR(value: number, lang: Lang = 'ar', symbol?: string, mode: 'system' | 'official' = 'system'): string {
  const formatted = mode === 'official'
    ? value.toFixed(2)  // No thousand separators for ZATCA
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (lang === 'ar') {
    // Arabic: number followed by symbol (RTL - symbol appears on right)
    // Use the provided symbol or default to ﷼ (Saudi Riyal Unicode U+FDFC)
    const arSymbol = symbol || '\uFDFC'
    return `${formatted} ${arSymbol}`
  }
  // English: symbol followed by number
  const enSymbol = symbol || 'SAR'
  return `${enSymbol} ${formatted}`
}

// Format just the number without symbol
// mode: 'system' = with thousand separators, 'official' = no separators (ZATCA compliance)
export function formatAmount(value: number, mode: 'system' | 'official' = 'system'): string {
  if (mode === 'official') {
    return value.toFixed(2)
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  currency: { ar: '\uFDFC', en: 'SAR' },
}
