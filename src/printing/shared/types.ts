// ============================================================================
// أنواع الطباعة المشتركة - Shared Print Types
// نظام بِنَاء ERP - Binaa Construction ERP
// ============================================================================

/** جميع أنواع المستندات المدعومة */
export type PrintDocumentType =
  // فواتير
  | 'service-invoice'
  | 'rental-invoice'
  | 'supplier-invoice'
  // مشاريع
  | 'progress-claim'
  // مشتريات
  | 'purchase-order'
  | 'delivery-order'
  // عمليات
  | 'timesheet'
  // محاسبة
  | 'trial-balance'
  | 'general-ledger'
  | 'income-statement'
  | 'balance-sheet'
  // ضريبي
  | 'vat-return'
  // مالي
  | 'client-payment'
  | 'supplier-payment'
  | 'rental-payment'
  | 'expense-report'
  | 'advance-voucher'
  | 'petty-cash-voucher'
  | 'salary-slip'
  | 'rental-contract'
  // تقارير
  | 'equipment-report'
  | 'fuel-report'
  | 'maintenance-report'
  | 'work-team-report'
  | 'resource-distribution'
  | 'attendance-report'
  | 'purchase-request'
  | 'goods-receipt'
  | 'journal-entry'
  | 'account-statement'
  | 'generic-table'

/** تصنيف المستندات */
export type DocumentCategory =
  | 'invoice'      // فواتير
  | 'project'      // مشاريع
  | 'procurement'  // مشتريات
  | 'operation'    // عمليات
  | 'accounting'   // محاسبة
  | 'tax'          // ضريبي
  | 'financial'    // مالي
  | 'report'       // تقارير

/** إعدادات الشركة للطباعة */
export interface PrintSettings {
  nameAr: string
  nameEn: string
  taxNumber: string | null
  commercialReg: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  headerImage: string | null
  footerImage: string | null
  stamp: string | null
  currencySymbolImage: string | null
  currencySymbol: string | null
  currencySymbolAr: string | null
  currencySymbolEn: string | null
  defaultVatRate: number
  bankName: string | null
  bankIban: string | null
  bankAccountName: string | null
  invoiceTerms: string | null
  // Invoice template customization (applied to all printed invoices)
  invoiceTemplate?: string
  invoicePrimaryColor?: string
  invoiceAccentColor?: string
  invoiceFontFamily?: string
  invoiceShowBankDetails?: boolean
  invoiceShowSignature?: boolean
  invoiceShowStamp?: boolean
  // Stamp placement & size — full control from settings
  stampPosition?: string
  stampWidth?: number
  stampHeight?: number
  stampOffsetX?: number
  stampOffsetY?: number
  stampOpacity?: number
  stampRotation?: number
}

/** خيارات الطباعة */
export interface PrintOptions {
  type: PrintDocumentType
  data: Record<string, unknown>
  settings: PrintSettings
  lang?: 'ar' | 'en'
}

/** واجهة القالب - كل قالب يجب أن ي implement هذه الواجهة */
export interface DocumentTemplate {
  /** تصنيف المستند */
  category: DocumentCategory
  /** توليد CSS خاص بالقالب */
  getCSS(lang: 'ar' | 'en'): string
  /** توليد HTML جسم المستند */
  getBody(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string
  /** هل القالب يحتاج QR كود؟ */
  requiresQR: boolean
  /** هل القالب يحتاج ختم وتوقيع؟ */
  requiresSignature: boolean
  /** هل القالب يحتاج معلومات بنكية؟ */
  requiresBankInfo: boolean
  /** هل القالب يحتاج المبلغ كتابة؟ */
  requiresAmountInWords: boolean
  /** هل القالب يستخدم header مخصص (لا يستخدم الهيدر المشترك)؟ */
  hasCustomHeader: boolean
  /** هل القالب يستخدم footer مخصص (لا يستخدم الفوتر المشترك)؟ */
  hasCustomFooter: boolean
  /** توليد header مخصص (إذا hasCustomHeader = true) */
  getCustomHeader?(settings: PrintSettings, lang: 'ar' | 'en'): string
  /** توليد footer مخصص (إذا hasCustomFooter = true) */
  getCustomFooter?(settings: PrintSettings, lang: 'ar' | 'en'): string
  /** سكريبتات إضافية (مثل html2canvas للفاتورة) */
  getExtraScripts?(data: Record<string, unknown>, settings: PrintSettings, lang: 'ar' | 'en'): string
}

/** عناوين المستندات */
export interface DocumentTitle {
  titleAr: string
  titleEn: string
  subtitleAr?: string
  subtitleEn?: string
}
