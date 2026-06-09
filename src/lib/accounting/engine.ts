// ============================================================================
// المحرك المحاسبي - Accounting Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Core accounting engine with automatic journal entries for all business transactions.
// Follows double-entry bookkeeping principles and Saudi SOCPA standards.
// Supports both Construction Projects and Equipment Rental activities.
// ============================================================================

import { db } from '@/lib/db'

// ============ ACCOUNT TYPE DEFINITIONS ============

export const AccountType = {
  ASSET: 'ASSET',           // أصول
  LIABILITY: 'LIABILITY',   // خصوم
  EQUITY: 'EQUITY',         // حقوق ملكية
  REVENUE: 'REVENUE',       // إيرادات
  EXPENSE: 'EXPENSE',       // مصروفات
} as const

export type AccountTypeValue = (typeof AccountType)[keyof typeof AccountType]

// Normal balance side for each account type
export const NORMAL_BALANCE: Record<AccountTypeValue, 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
  EXPENSE: 'DEBIT',
}

// ============ STANDARD CHART OF ACCOUNTS TEMPLATE ============
// Based on Saudi SOCPA standards for construction & equipment rental companies

export interface AccountTemplate {
  code: string
  name: string
  nameAr: string
  type: AccountTypeValue
  parentId?: string
  activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'
  isSystem?: boolean
  allowPosting?: boolean
  level?: number
}

export const CHART_OF_ACCOUNTS_TEMPLATE: AccountTemplate[] = [
  // ============================================================================
  // الأصول المتداولة - Current Assets (1xxx)
  // ============================================================================
  { code: '1000', name: 'Current Assets', nameAr: 'الأصول المتداولة', type: 'ASSET', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '1100', name: 'Cash & Cash Equivalents', nameAr: 'النقد وما في حكمه', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1110', name: 'Cash - Treasury', nameAr: 'الصندوق (الخزينة)', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1120', name: 'Bank Accounts', nameAr: 'البنوك', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1130', name: 'Petty Cash', nameAr: 'الصندوق النقدي', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '1200', name: 'Receivables', nameAr: 'الذمم المدينة', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1210', name: 'Clients Receivable', nameAr: 'عملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1220', name: 'Retention Receivable', nameAr: 'مبالغ محتجزة لدى العملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1230', name: 'Advances to Employees', nameAr: 'سلف الموظفين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1240', name: 'Advances to Suppliers', nameAr: 'مقدمات للموردين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1250', name: 'Other Receivables', nameAr: 'ذمم مدينة أخرى', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1260', name: 'Tax Refund Receivable', nameAr: 'ضرائب مستحقة الاسترداد', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '1300', name: 'Inventory', nameAr: 'المخزون', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1310', name: 'Raw Materials', nameAr: 'مواد خام', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1320', name: 'Work in Progress', nameAr: 'أعمال تحت التنفيذ', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1330', name: 'Spare Parts', nameAr: 'قطع غيار', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '1340', name: 'Consumable Supplies', nameAr: 'لوازم مستهلكة', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1350', name: 'Equipment Available for Rent', nameAr: 'معدات جاهزة للتأجير', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '1400', name: 'VAT Receivable', nameAr: 'ضريبة القيمة المضافة مستحقة الاسترداد', type: 'ASSET', parentId: '1000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH' },
    { code: '1500', name: 'Prepaid Expenses', nameAr: 'مصروفات مقدمة', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1510', name: 'Prepaid Rent', nameAr: 'إيجار مقدمة', type: 'ASSET', parentId: '1500', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1520', name: 'Prepaid Insurance', nameAr: 'تأمين مقدمة', type: 'ASSET', parentId: '1500', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1530', name: 'Other Prepaid Expenses', nameAr: 'مصروفات أخرى مقدمة', type: 'ASSET', parentId: '1500', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '1600', name: 'Contract Assets', nameAr: 'أصول العقود', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1610', name: 'Construction Contract Assets', nameAr: 'أصول عقود المشاريع', type: 'ASSET', parentId: '1600', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1620', name: 'Rental Contract Assets', nameAr: 'أصول عقود التأجير', type: 'ASSET', parentId: '1600', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '1700', name: 'Statutory Deposits', nameAr: 'وديعة نظامية', type: 'ASSET', parentId: '1000', allowPosting: true, level: 1, activityType: 'BOTH' },

  // ============================================================================
  // الأصول غير المتداولة - Non-Current Assets (2xxx)
  // ============================================================================
  { code: '2000', name: 'Non-Current Assets', nameAr: 'الأصول غير المتداولة', type: 'ASSET', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '2100', name: 'Property & Equipment', nameAr: 'الممتلكات والمعدات', type: 'ASSET', parentId: '2000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '2110', name: 'Construction Equipment', nameAr: 'معدات الإنشاء', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '2120', name: 'Rental Equipment', nameAr: 'معدات التأجير', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '2130', name: 'Vehicles', nameAr: 'المركبات', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '2140', name: 'Office Equipment', nameAr: 'أثاث ومعدات مكتبية', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '2150', name: 'Construction in Progress (Assets)', nameAr: 'أصول تحت الإنشاء', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '2200', name: 'Accumulated Depreciation', nameAr: 'مجمع الإهلاك', type: 'ASSET', parentId: '2000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '2210', name: 'Accum. Depreciation - Construction Equip', nameAr: 'إهلاك متراكم - معدات إنشاء', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '2220', name: 'Accum. Depreciation - Rental Equip', nameAr: 'إهلاك متراكم - معدات تأجير', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '2230', name: 'Accum. Depreciation - Vehicles', nameAr: 'إهلاك متراكم - مركبات', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '2240', name: 'Accum. Depreciation - Office', nameAr: 'إهلاك متراكم - أثاث', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '2300', name: 'Right-of-Use Assets (IFRS 16)', nameAr: 'أصول حق الاستخدام', type: 'ASSET', parentId: '2000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '2310', name: 'Leased Equipment ROU', nameAr: 'معدات مستأجرة حق الاستخدام', type: 'ASSET', parentId: '2300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '2320', name: 'Leased Vehicles ROU', nameAr: 'مركبات مستأجرة حق الاستخدام', type: 'ASSET', parentId: '2300', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '2400', name: 'Intangible Assets', nameAr: 'أصول غير ملموسة', type: 'ASSET', parentId: '2000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '2410', name: 'Software', nameAr: 'برمجيات', type: 'ASSET', parentId: '2400', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '2420', name: 'Licenses', nameAr: 'تراخيص', type: 'ASSET', parentId: '2400', allowPosting: true, level: 2, activityType: 'BOTH' },

  // ============================================================================
  // الخصوم المتداولة - Current Liabilities (3xxx)
  // ============================================================================
  { code: '3000', name: 'Current Liabilities', nameAr: 'الخصوم المتداولة', type: 'LIABILITY', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '3100', name: 'Accounts Payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3110', name: 'Suppliers Payable', nameAr: 'موردون', type: 'LIABILITY', parentId: '3100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3120', name: 'Subcontractors Payable', nameAr: 'مقاولو الباطن', type: 'LIABILITY', parentId: '3100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '3200', name: 'VAT Payable', nameAr: 'ضريبة القيمة المضافة مستحقة الدفع', type: 'LIABILITY', parentId: '3000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH' },
    { code: '3300', name: 'Accrued Expenses', nameAr: 'مصروفات مستحقة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3310', name: 'Salaries Payable', nameAr: 'رواتب مستحقة', type: 'LIABILITY', parentId: '3300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3320', name: 'Other Accrued Expenses', nameAr: 'مصروفات مستحقة أخرى', type: 'LIABILITY', parentId: '3300', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '3400', name: 'Customer Advances', nameAr: 'مقدمات العملاء', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3410', name: 'Construction Customer Advances', nameAr: 'مقدمات عملاء المشاريع', type: 'LIABILITY', parentId: '3400', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '3420', name: 'Rental Customer Advances', nameAr: 'مقدمات عملاء التأجير', type: 'LIABILITY', parentId: '3400', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '3500', name: 'Retention Payable', nameAr: 'مبالغ محتجزة لدى الشركة', type: 'LIABILITY', parentId: '3000', allowPosting: true, level: 1, activityType: 'CONSTRUCTION' },
    { code: '3600', name: 'Contract Liabilities', nameAr: 'التزامات العقود', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3610', name: 'Construction Contract Liabilities', nameAr: 'التزامات عقود المشاريع', type: 'LIABILITY', parentId: '3600', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '3620', name: 'Rental Contract Liabilities', nameAr: 'التزامات عقود التأجير', type: 'LIABILITY', parentId: '3600', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '3700', name: 'Provisions', nameAr: 'مخصصات', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3710', name: 'End of Service Benefits Provision', nameAr: 'مخصص مكافأة نهاية الخدمة', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3720', name: 'Warranty Provision', nameAr: 'مخصص الضمان', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '3730', name: 'Equipment Maintenance Provision', nameAr: 'مخصص صيانة معدات', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '3800', name: 'Taxes & Zakat Payable', nameAr: 'ضرائب وزكاة مستحقة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3810', name: 'Zakat Payable', nameAr: 'زكاة مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3820', name: 'Income Tax Payable', nameAr: 'ضريبة دخل مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3830', name: 'GOSI Payable', nameAr: 'تأمينات اجتماعية مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '3900', name: 'Short-term Loans', nameAr: 'قروض قصيرة الأجل', type: 'LIABILITY', parentId: '3000', allowPosting: true, level: 1, activityType: 'BOTH' },

  // ============================================================================
  // الخصوم غير المتداولة - Non-Current Liabilities (4xxx)
  // ============================================================================
  { code: '4000', name: 'Non-Current Liabilities', nameAr: 'الخصوم غير المتداولة', type: 'LIABILITY', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '4100', name: 'Long-term Loans', nameAr: 'قروض طويلة الأجل', type: 'LIABILITY', parentId: '4000', allowPosting: true, level: 1, activityType: 'BOTH' },
    { code: '4200', name: 'Finance Lease Obligations', nameAr: 'التزامات عقود الإيجار التمويلي', type: 'LIABILITY', parentId: '4000', allowPosting: true, level: 1, activityType: 'EQUIPMENT_RENTAL' },
    { code: '4300', name: 'Deferred Revenue', nameAr: 'إيرادات مؤجلة', type: 'LIABILITY', parentId: '4000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '4310', name: 'Deferred Construction Revenue', nameAr: 'إيرادات مشاريع مؤجلة', type: 'LIABILITY', parentId: '4300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '4320', name: 'Deferred Rental Revenue', nameAr: 'إيرادات تأجير مؤجلة', type: 'LIABILITY', parentId: '4300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },

  // ============================================================================
  // حقوق الملكية - Equity (5xxx)
  // ============================================================================
  { code: '5000', name: 'Equity', nameAr: 'حقوق الملكية', type: 'EQUITY', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '5100', name: 'Capital', nameAr: 'رأس المال', type: 'EQUITY', parentId: '5000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH' },
    { code: '5200', name: 'Retained Earnings', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', parentId: '5000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH' },
    { code: '5300', name: 'Current Year Earnings', nameAr: 'أرباح (خسائر) السنة الحالية', type: 'EQUITY', parentId: '5000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH' },
    { code: '5400', name: 'Statutory Reserve', nameAr: 'احتياطي نظامي', type: 'EQUITY', parentId: '5000', allowPosting: true, level: 1, activityType: 'BOTH' },
    { code: '5500', name: 'Voluntary Reserve', nameAr: 'احتياطي اختياري', type: 'EQUITY', parentId: '5000', allowPosting: true, level: 1, activityType: 'BOTH' },
    { code: '5600', name: "Owner's Current Account", nameAr: 'حساب المالك الجاري', type: 'EQUITY', parentId: '5000', allowPosting: true, level: 1, activityType: 'BOTH' },

  // ============================================================================
  // الإيرادات - Revenue (6xxx)
  // ============================================================================
  { code: '6000', name: 'Revenue', nameAr: 'الإيرادات', type: 'REVENUE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '6100', name: 'Project Revenue', nameAr: 'إيرادات المشاريع', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'CONSTRUCTION' },
      { code: '6110', name: 'Progress Claims Revenue', nameAr: 'إيرادات المستخلصات', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '6120', name: 'Contract Modifications Revenue', nameAr: 'إيرادات تعديلات العقود', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '6130', name: 'Claims Revenue', nameAr: 'إيرادات المطالبات', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '6200', name: 'Rental Revenue', nameAr: 'إيرادات التأجير', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6210', name: 'Equipment Rental Revenue', nameAr: 'إيرادات تأجير المعدات', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6220', name: 'Delivery Fees Revenue', nameAr: 'إيرادات نقل وتوصيل', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6230', name: 'Equipment Operation Revenue', nameAr: 'إيرادات تشغيل المعدات للغير', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '6300', name: 'Other Revenue', nameAr: 'إيرادات أخرى', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '6310', name: 'Sale of Used Equipment', nameAr: 'إيرادات بيع معدات مستعملة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6320', name: 'Penalties Revenue', nameAr: 'إيرادات غرامات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6330', name: 'Discounts Received', nameAr: 'خصومات مكتسبة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6340', name: 'Service Revenue', nameAr: 'إيرادات خدمات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6350', name: 'Other Miscellaneous Revenue', nameAr: 'إيرادات أخرى متنوعة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },

  // ============================================================================
  // التكاليف المباشرة - Direct Costs (7xxx)
  // ============================================================================
  { code: '7000', name: 'Direct Costs', nameAr: 'التكاليف المباشرة', type: 'EXPENSE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '7100', name: 'Cost of Contracts', nameAr: 'تكلفة العقود', type: 'EXPENSE', parentId: '7000', allowPosting: false, level: 1, activityType: 'CONSTRUCTION' },
      { code: '7110', name: 'Material Costs', nameAr: 'تكاليف المواد', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7120', name: 'Labor Costs', nameAr: 'تكاليف العمالة', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7130', name: 'Subcontractor Costs', nameAr: 'تكاليف مقاولي الباطن', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7140', name: 'Site Establishment Costs', nameAr: 'تكاليف تأسيس الموقع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7150', name: 'Temporary Works', nameAr: 'أعمال مؤقتة', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7160', name: 'Project Permits & Licenses', nameAr: 'تصاريح وتراخيص مشاريع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7170', name: 'Testing & Commissioning', nameAr: 'اختبارات وتشغيل تجريبي', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7180', name: 'Project Overhead', nameAr: 'مصروفات عامة مشاريع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '7200', name: 'Equipment Costs', nameAr: 'تكاليف المعدات', type: 'EXPENSE', parentId: '7000', allowPosting: false, level: 1, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7210', name: 'Equipment Operation Costs', nameAr: 'تكاليف تشغيل المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7220', name: 'Equipment Maintenance', nameAr: 'صيانة المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7230', name: 'Equipment Fuel', nameAr: 'وقود المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7240', name: 'Delivery & Transport Costs', nameAr: 'تكاليف نقل وتوصيل', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7250', name: 'Rental Equipment Depreciation', nameAr: 'إهلاك معدات التأجير', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '7300', name: 'Rental Project Costs', nameAr: 'تكاليف مشاريع التأجير', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'EQUIPMENT_RENTAL' },
    { code: '7400', name: 'Project Insurance', nameAr: 'تأمين مشاريع', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'CONSTRUCTION' },
    { code: '7500', name: 'Project Expenses', nameAr: 'مصروفات المشاريع', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'BOTH' },

  // ============================================================================
  // التكاليف غير المباشرة - Indirect Costs (8xxx)
  // ============================================================================
  { code: '8000', name: 'Indirect Costs', nameAr: 'التكاليف غير المباشرة', type: 'EXPENSE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '8100', name: 'Administrative Expenses', nameAr: 'مصروفات إدارية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8110', name: 'Salaries & Wages', nameAr: 'رواتب وأجور', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8120', name: 'Office Rent', nameAr: 'إيجار مكتب', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8130', name: 'Utilities (Electricity/Water/Internet)', nameAr: 'خدمات', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8140', name: 'Office Supplies', nameAr: 'لوازم مكتبية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8150', name: 'Communication Expenses', nameAr: 'اتصالات', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8160', name: 'Professional Fees', nameAr: 'أتعاب مهنية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8170', name: 'Legal Fees', nameAr: 'أتعاب قانونية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8200', name: 'HR Expenses', nameAr: 'مصروفات الموارد البشرية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8210', name: 'GOSI Expense', nameAr: 'تأمينات اجتماعية', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8220', name: 'Staff Housing', nameAr: 'سكن عمال', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8230', name: 'Worker Permits', nameAr: 'تصاريح عمالة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8240', name: 'Travel & Accommodation', nameAr: 'سفر وإقامة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8250', name: 'Safety Equipment', nameAr: 'معدات سلامة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8300', name: 'Depreciation Expense', nameAr: 'مصروف الإهلاك', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8310', name: 'Depreciation - Construction Equipment', nameAr: 'إهلاك معدات إنشاء', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '8320', name: 'Depreciation - Vehicles', nameAr: 'إهلاك مركبات', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8330', name: 'Depreciation - Office', nameAr: 'إهلاك أثاث', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8340', name: 'Depreciation - Software', nameAr: 'إهلاك برمجيات', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8400', name: 'Financial Expenses', nameAr: 'مصروفات مالية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8410', name: 'Bank Charges', nameAr: 'مصاريف بنكية', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8420', name: 'Loan Interest', nameAr: 'فوائد قروض', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8430', name: 'Bad Debts', nameAr: 'ديون معدومة', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8500', name: 'Tax Expenses', nameAr: 'مصروفات ضريبية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8510', name: 'Zakat Expense', nameAr: 'زكاة', type: 'EXPENSE', parentId: '8500', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8520', name: 'Income Tax Expense', nameAr: 'ضريبة دخل', type: 'EXPENSE', parentId: '8500', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8600', name: 'Other Losses', nameAr: 'خسائر متنوعة', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8610', name: 'Loss on Asset Disposal', nameAr: 'خسارة التخلص من أصول', type: 'EXPENSE', parentId: '8600', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8620', name: 'Penalties Expense', nameAr: 'غرامات', type: 'EXPENSE', parentId: '8600', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8630', name: 'Other Expenses', nameAr: 'مصروفات أخرى', type: 'EXPENSE', parentId: '8600', allowPosting: true, level: 2, activityType: 'BOTH' },
]

// ============ AUTO-ENTRY ACCOUNT RESOLVER ============
// Maps business transactions to their debit/credit accounts

export interface JournalEntryTemplate {
  entryNo: string
  date: Date
  description: string
  descriptionAr: string
  lines: {
    accountCode: string
    debit: number
    credit: number
    costCenterId?: string
    description?: string
  }[]
  sourceType: string   // What triggered this entry
  sourceId: string     // ID of the source document
}

// ============ ACCOUNT LOOKUP HELPERS ============

export async function getAccountByCode(code: string) {
  return db.account.findUnique({ where: { code } })
}

export async function ensureAccountExists(template: AccountTemplate) {
  const existing = await db.account.findUnique({ where: { code: template.code } })
  if (existing) {
    // Update existing account with new fields if they are missing
    if (
      existing.activityType !== (template.activityType || null) ||
      existing.isSystem !== (template.isSystem || false) ||
      existing.allowPosting !== (template.allowPosting || false) ||
      existing.level !== (template.level || 0)
    ) {
      await db.account.update({
        where: { code: template.code },
        data: {
          name: template.name,
          nameAr: template.nameAr,
          type: template.type,
          activityType: template.activityType || null,
          isSystem: template.isSystem || false,
          allowPosting: template.allowPosting || false,
          level: template.level || 0,
        },
      })
    }
    return db.account.findUnique({ where: { code: template.code } })
  }

  let parentId: string | undefined
  if (template.parentId) {
    const parent = await db.account.findUnique({ where: { code: template.parentId } })
    if (parent) parentId = parent.id
  }

  return db.account.create({
    data: {
      code: template.code,
      name: template.name,
      nameAr: template.nameAr,
      type: template.type,
      parentId,
      isActive: true,
      activityType: template.activityType || null,
      isSystem: template.isSystem || false,
      allowPosting: template.allowPosting || false,
      level: template.level || 0,
    },
  })
}

// ============ INITIALIZE CHART OF ACCOUNTS ============

export async function initializeChartOfAccounts() {
  let created = 0
  let updated = 0

  // Create parent accounts first, then children (sorted by code length then code)
  const sorted = [...CHART_OF_ACCOUNTS_TEMPLATE].sort((a, b) => {
    if (a.code.length !== b.code.length) return a.code.length - b.code.length
    return a.code.localeCompare(b.code)
  })

  for (const tmpl of sorted) {
    const existing = await db.account.findUnique({ where: { code: tmpl.code } })
    if (existing) {
      // Update existing account with new fields
      await db.account.update({
        where: { code: tmpl.code },
        data: {
          name: tmpl.name,
          nameAr: tmpl.nameAr,
          type: tmpl.type,
          activityType: tmpl.activityType || null,
          isSystem: tmpl.isSystem || false,
          allowPosting: tmpl.allowPosting || false,
          level: tmpl.level || 0,
          isActive: true,
        },
      })
      // Update parent reference if needed
      if (tmpl.parentId) {
        const parent = await db.account.findUnique({ where: { code: tmpl.parentId } })
        if (parent && existing.parentId !== parent.id) {
          await db.account.update({
            where: { code: tmpl.code },
            data: { parentId: parent.id },
          })
        }
      }
      updated++
    } else {
      await ensureAccountExists(tmpl)
      created++
    }
  }

  const total = await db.account.count()
  return { created, updated, total }
}

// ============ JOURNAL ENTRY CREATION ============

export async function createJournalEntry(template: JournalEntryTemplate) {
  // Validate: total debits must equal total credits
  const totalDebit = template.lines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredit = template.lines.reduce((sum, l) => sum + l.credit, 0)

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry not balanced: Debits=${totalDebit}, Credits=${totalCredit}, Diff=${Math.abs(totalDebit - totalCredit)}`
    )
  }

  // Ensure all referenced accounts exist
  for (const line of template.lines) {
    const account = await getAccountByCode(line.accountCode)
    if (!account) {
      throw new Error(`Account not found: ${line.accountCode}`)
    }
  }

  // Create the journal entry with lines
  const entry = await db.journalEntry.create({
    data: {
      entryNo: template.entryNo,
      date: template.date,
      description: template.description,
      status: 'POSTED', // Auto-entries are posted immediately
      lines: {
        create: await Promise.all(
          template.lines.map(async (line) => {
            const account = await getAccountByCode(line.accountCode)
            return {
              accountId: account!.id,
              costCenterId: line.costCenterId,
              debit: line.debit,
              credit: line.credit,
              description: line.description,
            }
          })
        ),
      },
    },
    include: { lines: true },
  })

  return entry
}

// ============ AUTO-ENTRY FUNCTIONS ============
// Each function creates the appropriate journal entries for a business transaction

/**
 * فاتورة مبيعات - Sales Invoice (from Extract)
 * Dr: Clients Receivable (1210) - totalAmount
 * Cr: Progress Claims Revenue (6110) - subtotal
 * Cr: VAT Payable (3200) - vatAmount
 */
export async function autoEntrySalesInvoice(data: {
  invoiceNo: string
  clientId: string
  subtotal: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  invoiceType: string // TAX_INVOICE, PROGRESS_CLAIM, RENTAL
  date: Date
  projectId?: string
  costCenterId?: string
}) {
  // Determine revenue account based on invoice type
  let revenueAccountCode: string
  switch (data.invoiceType) {
    case 'RENTAL':
      revenueAccountCode = '6210' // Equipment Rental Revenue
      break
    case 'PROGRESS_CLAIM':
      revenueAccountCode = '6110' // Progress Claims Revenue
      break
    default:
      revenueAccountCode = '6340' // Service Revenue
  }

  const lines = [
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId }, // Clients Receivable
    { accountCode: revenueAccountCode, debit: 0, credit: data.subtotal, costCenterId: data.costCenterId }, // Revenue
  ]

  // Add VAT line only if VAT > 0
  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount }) // VAT Payable
  }

  return createJournalEntry({
    entryNo: `JE-SI-${Date.now()}`,
    date: data.date,
    description: `Sales Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة مبيعات ${data.invoiceNo}`,
    lines,
    sourceType: 'SALES_INVOICE',
    sourceId: data.invoiceNo,
  })
}

/**
 * فاتورة مشتريات - Purchase Invoice
 * Dr: Expense/Asset account - subtotal
 * Dr: VAT Receivable (1400) - vatAmount
 * Cr: Suppliers Payable (3110) - totalAmount
 */
export async function autoEntryPurchaseInvoice(data: {
  invoiceNo: string
  supplierId: string
  subtotal: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  projectId?: string
  costCenterId?: string
  expenseCategory?: string
  activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH'
}) {
  // Determine expense account based on context
  let expenseAccountCode = '7110' // Default: Material Costs
  if (data.expenseCategory) {
    const categoryMap: Record<string, string> = {
      'CONSUMABLES': '7110',
      'SERVICES': data.activityType === 'EQUIPMENT_RENTAL' ? '7210' : '7130',
      'MAINTENANCE': '7220',
      'FUEL': '7230',
      'TRANSPORT': '7240',
      'DELIVERY': '7240',
      'RENT': '8120',
      'OFFICE': '8140',
      'INTERNET': '8130',
      'ELECTRICITY': '8130',
      'WATER': '8130',
      'SALARIES': '8110',
      'INSURANCE': '7400',
      'PERMITS': '7160',
      'HOSPITALITY': '8630',
      'MANAGEMENT_CARS': '8630',
      'OTHER': '8630',
    }
    expenseAccountCode = categoryMap[data.expenseCategory] || '8630'
  }

  const lines = [
    { accountCode: expenseAccountCode, debit: data.subtotal, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '1400', debit: data.vatAmount, credit: 0 }) // VAT Receivable
  }

  lines.push({ accountCode: '3110', debit: 0, credit: data.totalAmount }) // Suppliers Payable

  return createJournalEntry({
    entryNo: `JE-PI-${Date.now()}`,
    date: data.date,
    description: `Purchase Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة مشتريات ${data.invoiceNo}`,
    lines,
    sourceType: 'PURCHASE_INVOICE',
    sourceId: data.invoiceNo,
  })
}

/**
 * مستخلص - Progress Claim
 * Dr: Clients Receivable (1210) - totalAmount
 * Cr: Progress Claims Revenue (6110) - amount
 * Cr: VAT Payable (3200) - vatAmount
 */
export async function autoEntryProgressClaim(data: {
  claimNo: string
  projectId: string
  contractId: string
  amount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}) {
  const lines = [
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId }, // Clients Receivable
    { accountCode: '6110', debit: 0, credit: data.amount, costCenterId: data.costCenterId }, // Progress Claims Revenue
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount }) // VAT Payable
  }

  return createJournalEntry({
    entryNo: `JE-PC-${Date.now()}`,
    date: data.date,
    description: `Progress Claim ${data.claimNo}`,
    descriptionAr: `مستخلص رقم ${data.claimNo}`,
    lines,
    sourceType: 'PROGRESS_CLAIM',
    sourceId: data.claimNo,
  })
}

/**
 * مصروف - Expense
 * Dr: Expense account - amount
 * Dr: VAT Receivable (1400) - vatAmount (if applicable)
 * Cr: Cash (1110/1120/1130) - total
 */
export async function autoEntryExpense(data: {
  description: string
  amount: number
  vatAmount: number | null
  category: string
  date: Date
  payFrom: 'TREASURY' | 'PETTY_CASH' | 'BANK'
  costCenterId?: string
}) {
  const categoryMap: Record<string, string> = {
    'CONSUMABLES': '7110',
    'SERVICES': '7130',
    'MAINTENANCE': '7220',
    'FUEL': '7230',
    'TRANSPORT': '7240',
    'DELIVERY': '7240',
    'RENT': '8120',
    'OFFICE': '8140',
    'INTERNET': '8130',
    'ELECTRICITY': '8130',
    'WATER': '8130',
    'SALARIES': '8110',
    'INSURANCE': '7400',
    'PERMITS': '7160',
    'HOSPITALITY': '8630',
    'MANAGEMENT_CARS': '8630',
    'OTHER': '8630',
  }
  const expenseAccountCode = categoryMap[data.category] || '8630'
  const cashAccountCode = data.payFrom === 'PETTY_CASH' ? '1130' : data.payFrom === 'BANK' ? '1120' : '1110'

  const totalCashOut = data.amount + (data.vatAmount || 0)

  const lines = [
    { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount && data.vatAmount > 0) {
    lines.push({ accountCode: '1400', debit: data.vatAmount, credit: 0 })
  }

  lines.push({ accountCode: cashAccountCode, debit: 0, credit: totalCashOut })

  return createJournalEntry({
    entryNo: `JE-EXP-${Date.now()}`,
    date: data.date,
    description: `Expense: ${data.description}`,
    descriptionAr: `مصروف: ${data.description}`,
    lines,
    sourceType: 'EXPENSE',
    sourceId: `EXP-${Date.now()}`,
  })
}

/**
 * تحصيل من عميل - Client Payment Receipt
 * Dr: Cash/Bank (1110/1120)
 * Cr: Clients Receivable (1210)
 */
export async function autoEntryClientPayment(data: {
  clientName: string
  amount: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
  reference?: string
}) {
  const cashAccountCode = data.receivedIn === 'BANK' ? '1120' : '1110'

  return createJournalEntry({
    entryNo: `JE-CP-${Date.now()}`,
    date: data.date,
    description: `Payment received from ${data.clientName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `تحصيل من ${data.clientName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: cashAccountCode, debit: data.amount, credit: 0 },
      { accountCode: '1210', debit: 0, credit: data.amount }, // Clients Receivable
    ],
    sourceType: 'CLIENT_PAYMENT',
    sourceId: data.reference || `CP-${Date.now()}`,
  })
}

/**
 * دفع لمورد - Supplier Payment
 * Dr: Suppliers Payable (3110)
 * Cr: Cash/Bank (1110/1120)
 */
export async function autoEntrySupplierPayment(data: {
  supplierName: string
  amount: number
  date: Date
  paidFrom: 'TREASURY' | 'BANK'
  reference?: string
}) {
  const cashAccountCode = data.paidFrom === 'BANK' ? '1120' : '1110'

  return createJournalEntry({
    entryNo: `JE-SP-${Date.now()}`,
    date: data.date,
    description: `Payment to ${data.supplierName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `دفع إلى ${data.supplierName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: '3110', debit: data.amount, credit: 0 }, // Suppliers Payable
      { accountCode: cashAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUPPLIER_PAYMENT',
    sourceId: data.reference || `SP-${Date.now()}`,
  })
}

/**
 * سلفة موظف - Employee Advance
 * Dr: Advances to Employees (1230)
 * Cr: Cash (1110)
 */
export async function autoEntryEmployeeAdvance(data: {
  employeeName: string
  amount: number
  date: Date
}) {
  return createJournalEntry({
    entryNo: `JE-EA-${Date.now()}`,
    date: data.date,
    description: `Advance to ${data.employeeName}`,
    descriptionAr: `سلفة لموظف ${data.employeeName}`,
    lines: [
      { accountCode: '1230', debit: data.amount, credit: 0 }, // Advances to Employees
      { accountCode: '1110', debit: 0, credit: data.amount }, // Cash - Treasury
    ],
    sourceType: 'EMPLOYEE_ADVANCE',
    sourceId: `EA-${Date.now()}`,
  })
}

/**
 * تسوية سلفة - Advance Settlement
 * Dr: Salaries & Wages (8110)
 * Cr: Advances to Employees (1230)
 */
export async function autoEntryAdvanceSettlement(data: {
  employeeName: string
  settledAmount: number
  date: Date
}) {
  return createJournalEntry({
    entryNo: `JE-AS-${Date.now()}`,
    date: data.date,
    description: `Advance settlement - ${data.employeeName}`,
    descriptionAr: `تسوية سلفة - ${data.employeeName}`,
    lines: [
      { accountCode: '8110', debit: data.settledAmount, credit: 0 }, // Salaries & Wages
      { accountCode: '1230', debit: 0, credit: data.settledAmount }, // Clear advance
    ],
    sourceType: 'ADVANCE_SETTLEMENT',
    sourceId: `AS-${Date.now()}`,
  })
}

/**
 * فاتورة مقاول باطن - Subcontractor Invoice
 * Dr: Subcontractor Costs (7130)
 * Dr: VAT Receivable (1400)
 * Cr: Subcontractors Payable (3120)
 */
export async function autoEntrySubcontractorInvoice(data: {
  invoiceNo: string
  subcontractorName: string
  amount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}) {
  const lines = [
    { accountCode: '7130', debit: data.amount, credit: 0, costCenterId: data.costCenterId }, // Subcontractor Costs
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '1400', debit: data.vatAmount, credit: 0 }) // VAT Receivable
  }

  lines.push({ accountCode: '3120', debit: 0, credit: data.totalAmount }) // Subcontractors Payable

  return createJournalEntry({
    entryNo: `JE-SCI-${Date.now()}`,
    date: data.date,
    description: `Subcontractor Invoice ${data.invoiceNo} - ${data.subcontractorName}`,
    descriptionAr: `فاتورة مقاول باطن ${data.invoiceNo} - ${data.subcontractorName}`,
    lines,
    sourceType: 'SUBCONTRACTOR_INVOICE',
    sourceId: data.invoiceNo,
  })
}

/**
 * تكلفة معدات - Equipment Cost
 * Dr: Equipment Costs (7210/7220/7230/7240)
 * Cr: Cash/Accounts Payable
 */
export async function autoEntryEquipmentCost(data: {
  equipmentName: string
  costType: 'OPERATION' | 'MAINTENANCE' | 'FUEL' | 'OTHER'
  amount: number
  date: Date
  payFrom: 'CASH' | 'AP'
  costCenterId?: string
}) {
  const accountMap: Record<string, string> = {
    'OPERATION': '7210',  // Equipment Operation Costs
    'MAINTENANCE': '7220', // Equipment Maintenance
    'FUEL': '7230',       // Equipment Fuel
    'OTHER': '7300',      // Rental Project Costs
  }
  const creditAccountCode = data.payFrom === 'AP' ? '3110' : '1110'

  return createJournalEntry({
    entryNo: `JE-EQC-${Date.now()}`,
    date: data.date,
    description: `Equipment ${data.costType} cost - ${data.equipmentName}`,
    descriptionAr: `تكلفة ${data.costType === 'OPERATION' ? 'تشغيل' : data.costType === 'MAINTENANCE' ? 'صيانة' : data.costType === 'FUEL' ? 'وقود' : 'أخرى'} معدات - ${data.equipmentName}`,
    lines: [
      { accountCode: accountMap[data.costType], debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EQUIPMENT_COST',
    sourceId: `EQC-${Date.now()}`,
  })
}

/**
 * إيراد تأجير - Rental Invoice (from Timesheet)
 * Dr: Clients Receivable (1210)
 * Cr: Equipment Rental Revenue (6210)
 * Cr: VAT Payable (3200)
 */
export async function autoEntryRentalInvoice(data: {
  invoiceNo: string
  subtotal: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}) {
  const lines = [
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId }, // Clients Receivable
    { accountCode: '6210', debit: 0, credit: data.subtotal, costCenterId: data.costCenterId }, // Equipment Rental Revenue
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount }) // VAT Payable
  }

  return createJournalEntry({
    entryNo: `JE-RI-${Date.now()}`,
    date: data.date,
    description: `Rental Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة تأجير ${data.invoiceNo}`,
    lines,
    sourceType: 'RENTAL_INVOICE',
    sourceId: data.invoiceNo,
  })
}

/**
 * صندوق نقدي - Petty Cash
 * Dr: Expense account (8xxx)
 * Cr: Petty Cash (1130)
 */
export async function autoEntryPettyCash(data: {
  description: string
  amount: number
  category: string
  date: Date
  costCenterId?: string
}) {
  const categoryMap: Record<string, string> = {
    'OFFICE': '8140',
    'TRANSPORT': '7240',
    'HOSPITALITY': '8630',
    'MAINTENANCE': '7220',
    'OTHER': '8630',
  }
  const expenseAccountCode = categoryMap[data.category] || '8630'

  return createJournalEntry({
    entryNo: `JE-PTC-${Date.now()}`,
    date: data.date,
    description: `Petty Cash: ${data.description}`,
    descriptionAr: `صندوق نقدي: ${data.description}`,
    lines: [
      { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: '1130', debit: 0, credit: data.amount }, // Petty Cash
    ],
    sourceType: 'PETTY_CASH',
    sourceId: `PTC-${Date.now()}`,
  })
}

// ============================================================================
// NEW AUTO-ENTRY FUNCTIONS
// ============================================================================

/**
 * رواتب - Salary Payment
 * Dr: Salaries & Wages (8110)
 * Dr: GOSI Expense (8210)
 * Cr: Cash/Bank (1110/1120)
 * Cr: GOSI Payable (3830)
 */
export async function autoEntrySalary(data: {
  employeeName: string
  grossSalary: number
  gosiEmployeeDeduction: number
  gosiEmployerContribution: number
  date: Date
  payFrom: 'TREASURY' | 'BANK'
  costCenterId?: string
}) {
  const cashAccountCode = data.payFrom === 'BANK' ? '1120' : '1110'
  const netCashPaid = data.grossSalary - data.gosiEmployeeDeduction

  const lines = [
    { accountCode: '8110', debit: data.grossSalary, credit: 0, costCenterId: data.costCenterId }, // Salaries & Wages (gross)
    { accountCode: '8210', debit: data.gosiEmployerContribution, credit: 0, costCenterId: data.costCenterId }, // GOSI Expense (employer)
  ]

  if (data.gosiEmployeeDeduction > 0) {
    lines.push({ accountCode: '8110', debit: 0, credit: data.gosiEmployeeDeduction, costCenterId: data.costCenterId }) // Reduce salary by GOSI employee share
  }

  lines.push({ accountCode: cashAccountCode, debit: 0, credit: netCashPaid }) // Cash/Bank paid
  lines.push({ accountCode: '3830', debit: 0, credit: data.gosiEmployeeDeduction + data.gosiEmployerContribution }) // GOSI Payable (total)

  return createJournalEntry({
    entryNo: `JE-SAL-${Date.now()}`,
    date: data.date,
    description: `Salary payment - ${data.employeeName}`,
    descriptionAr: `صرف راتب - ${data.employeeName}`,
    lines,
    sourceType: 'SALARY',
    sourceId: `SAL-${Date.now()}`,
  })
}

/**
 * تأمينات اجتماعية - GOSI Contribution
 * Dr: GOSI Expense (8210)
 * Cr: GOSI Payable (3830)
 */
export async function autoEntryGOSI(data: {
  employeeContribution: number
  employerContribution: number
  date: Date
  costCenterId?: string
}) {
  const totalGOSI = data.employeeContribution + data.employerContribution

  return createJournalEntry({
    entryNo: `JE-GOSI-${Date.now()}`,
    date: data.date,
    description: `GOSI contribution - Employer: ${data.employerContribution}, Employee: ${data.employeeContribution}`,
    descriptionAr: `اشتراك تأمينات اجتماعية - صاحب العمل: ${data.employerContribution}, الموظف: ${data.employeeContribution}`,
    lines: [
      { accountCode: '8210', debit: data.employerContribution, credit: 0, costCenterId: data.costCenterId }, // GOSI Expense
      { accountCode: '3830', debit: 0, credit: totalGOSI }, // GOSI Payable
    ],
    sourceType: 'GOSI',
    sourceId: `GOSI-${Date.now()}`,
  })
}

/**
 * إهلاك - Depreciation (General)
 * Dr: Depreciation Expense (8310/8320/8330/8340)
 * Cr: Accumulated Depreciation (2210/2220/2230/2240)
 */
export async function autoEntryDepreciation(data: {
  assetType: 'CONSTRUCTION_EQUIPMENT' | 'VEHICLES' | 'OFFICE' | 'SOFTWARE'
  amount: number
  date: Date
  costCenterId?: string
}) {
  const depreciationMap: Record<string, { expense: string; accumulated: string }> = {
    'CONSTRUCTION_EQUIPMENT': { expense: '8310', accumulated: '2210' },
    'VEHICLES': { expense: '8320', accumulated: '2230' },
    'OFFICE': { expense: '8330', accumulated: '2240' },
    'SOFTWARE': { expense: '8340', accumulated: '2240' },
  }

  const mapping = depreciationMap[data.assetType]

  return createJournalEntry({
    entryNo: `JE-DEP-${Date.now()}`,
    date: data.date,
    description: `Depreciation - ${data.assetType}`,
    descriptionAr: `إهلاك - ${data.assetType === 'CONSTRUCTION_EQUIPMENT' ? 'معدات إنشاء' : data.assetType === 'VEHICLES' ? 'مركبات' : data.assetType === 'OFFICE' ? 'أثاث' : 'برمجيات'}`,
    lines: [
      { accountCode: mapping.expense, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: mapping.accumulated, debit: 0, credit: data.amount },
    ],
    sourceType: 'DEPRECIATION',
    sourceId: `DEP-${Date.now()}`,
  })
}

/**
 * إهلاك معدات التأجير - Rental Equipment Depreciation
 * Dr: Rental Equipment Depreciation (7250)
 * Cr: Accum. Depreciation - Rental Equip (2220)
 */
export async function autoEntryRentalDepreciation(data: {
  amount: number
  date: Date
  costCenterId?: string
}) {
  return createJournalEntry({
    entryNo: `JE-RDEP-${Date.now()}`,
    date: data.date,
    description: 'Rental equipment depreciation',
    descriptionAr: 'إهلاك معدات التأجير',
    lines: [
      { accountCode: '7250', debit: data.amount, credit: 0, costCenterId: data.costCenterId }, // Rental Equipment Depreciation
      { accountCode: '2220', debit: 0, credit: data.amount }, // Accum. Depreciation - Rental Equip
    ],
    sourceType: 'RENTAL_DEPRECIATION',
    sourceId: `RDEP-${Date.now()}`,
  })
}

/**
 * رسوم نقل وتوصيل - Delivery Fees on Rental
 * Dr: Clients Receivable (1210)
 * Cr: Delivery Fees Revenue (6220)
 * Cr: VAT Payable (3200)
 */
export async function autoEntryDeliveryFees(data: {
  clientId: string
  amount: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}) {
  const lines = [
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId }, // Clients Receivable
    { accountCode: '6220', debit: 0, credit: data.amount, costCenterId: data.costCenterId }, // Delivery Fees Revenue
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount }) // VAT Payable
  }

  return createJournalEntry({
    entryNo: `JE-DF-${Date.now()}`,
    date: data.date,
    description: 'Delivery fees',
    descriptionAr: 'رسوم نقل وتوصيل',
    lines,
    sourceType: 'DELIVERY_FEES',
    sourceId: `DF-${Date.now()}`,
  })
}

/**
 * مقدمات العملاء - Contract Advance
 * Dr: Cash/Bank (1110/1120)
 * Cr: Construction Customer Advances (3410) or Rental Customer Advances (3420)
 */
export async function autoEntryContractAdvance(data: {
  clientName: string
  amount: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
  activityType: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL'
  reference?: string
}) {
  const cashAccountCode = data.receivedIn === 'BANK' ? '1120' : '1110'
  const advanceAccountCode = data.activityType === 'CONSTRUCTION' ? '3410' : '3420'

  return createJournalEntry({
    entryNo: `JE-CA-${Date.now()}`,
    date: data.date,
    description: `Contract advance from ${data.clientName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `مقدمة عقد من ${data.clientName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: cashAccountCode, debit: data.amount, credit: 0 },
      { accountCode: advanceAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'CONTRACT_ADVANCE',
    sourceId: data.reference || `CA-${Date.now()}`,
  })
}

/**
 * احتجازات - Retention
 * Dr: Retention Receivable (1220)
 * Cr: Clients Receivable (1210)
 */
export async function autoEntryRetention(data: {
  clientName: string
  retentionAmount: number
  date: Date
  costCenterId?: string
}) {
  return createJournalEntry({
    entryNo: `JE-RET-${Date.now()}`,
    date: data.date,
    description: `Retention withheld by ${data.clientName}`,
    descriptionAr: `احتجاز لدى ${data.clientName}`,
    lines: [
      { accountCode: '1220', debit: data.retentionAmount, credit: 0, costCenterId: data.costCenterId }, // Retention Receivable
      { accountCode: '1210', debit: 0, credit: data.retentionAmount, costCenterId: data.costCenterId }, // Clients Receivable
    ],
    sourceType: 'RETENTION',
    sourceId: `RET-${Date.now()}`,
  })
}

/**
 * زكاة - Zakat
 * Dr: Zakat Expense (8510)
 * Cr: Zakat Payable (3810)
 */
export async function autoEntryZakat(data: {
  amount: number
  date: Date
}) {
  return createJournalEntry({
    entryNo: `JE-ZAK-${Date.now()}`,
    date: data.date,
    description: 'Zakat provision',
    descriptionAr: 'مخصص الزكاة',
    lines: [
      { accountCode: '8510', debit: data.amount, credit: 0 }, // Zakat Expense
      { accountCode: '3810', debit: 0, credit: data.amount }, // Zakat Payable
    ],
    sourceType: 'ZAKAT',
    sourceId: `ZAK-${Date.now()}`,
  })
}

/**
 * مكافأة نهاية الخدمة - End of Service Provision
 * Dr: Salaries & Wages (8110)
 * Cr: End of Service Benefits Provision (3710)
 */
export async function autoEntryEndOfService(data: {
  amount: number
  date: Date
  costCenterId?: string
}) {
  return createJournalEntry({
    entryNo: `JE-EOS-${Date.now()}`,
    date: data.date,
    description: 'End of service benefits provision',
    descriptionAr: 'مخصص مكافأة نهاية الخدمة',
    lines: [
      { accountCode: '8110', debit: data.amount, credit: 0, costCenterId: data.costCenterId }, // Salaries & Wages
      { accountCode: '3710', debit: 0, credit: data.amount }, // End of Service Benefits Provision
    ],
    sourceType: 'END_OF_SERVICE',
    sourceId: `EOS-${Date.now()}`,
  })
}

/**
 * التخلص من أصل - Asset Disposal
 * Dr: Cash/Bank (1110/1120) - sale price
 * Cr: Asset account (2110/2120/2130/2140) - original cost (or net book value)
 * Dr/Cr: Gain/Loss on disposal (6310 gain / 8610 loss)
 */
export async function autoEntryAssetDisposal(data: {
  assetAccountCode: string // e.g., '2110', '2120', '2130', '2140'
  accumulatedDepAccountCode: string // e.g., '2210', '2220', '2230', '2240'
  originalCost: number
  accumulatedDepreciation: number
  salePrice: number
  date: Date
  receivedIn: 'TREASURY' | 'BANK'
}) {
  const cashAccountCode = data.receivedIn === 'BANK' ? '1120' : '1110'
  const netBookValue = data.originalCost - data.accumulatedDepreciation
  const gainLoss = data.salePrice - netBookValue

  const lines = [
    { accountCode: cashAccountCode, debit: data.salePrice, credit: 0 }, // Cash received
    { accountCode: data.accumulatedDepAccountCode, debit: data.accumulatedDepreciation, credit: 0 }, // Remove accumulated depreciation
    { accountCode: data.assetAccountCode, debit: 0, credit: data.originalCost }, // Remove asset
  ]

  // If gain, credit gain account. If loss, debit loss account.
  if (gainLoss > 0) {
    lines.push({ accountCode: '6310', debit: 0, credit: gainLoss }) // Gain on Sale of Used Equipment
  } else if (gainLoss < 0) {
    lines.push({ accountCode: '8610', debit: Math.abs(gainLoss), credit: 0 }) // Loss on Asset Disposal
  }

  return createJournalEntry({
    entryNo: `JE-DSP-${Date.now()}`,
    date: data.date,
    description: `Asset disposal - ${data.assetAccountCode}`,
    descriptionAr: `التخلص من أصل - ${data.assetAccountCode}`,
    lines,
    sourceType: 'ASSET_DISPOSAL',
    sourceId: `DSP-${Date.now()}`,
  })
}

// ============ TRIAL BALANCE ============

export async function getTrialBalance(dateFrom?: Date, dateTo?: Date) {
  const entries = await db.journalEntry.findMany({
    where: {
      status: 'POSTED',
      ...(dateFrom && { date: { gte: dateFrom } }),
      ...(dateTo && { date: { lte: dateTo } }),
    },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
    },
  })

  // Aggregate by account
  const accountBalances = new Map<string, {
    account: { id: string; code: string; name: string; nameAr: string | null; type: string }
    totalDebit: number
    totalCredit: number
  }>()

  for (const entry of entries) {
    for (const line of entry.lines) {
      const key = line.accountId
      if (!accountBalances.has(key)) {
        accountBalances.set(key, {
          account: line.account,
          totalDebit: 0,
          totalCredit: 0,
        })
      }
      const bal = accountBalances.get(key)!
      bal.totalDebit += line.debit
      bal.totalCredit += line.credit
    }
  }

  // Calculate net balance for each account
  const results = Array.from(accountBalances.values()).map(bal => {
    const normalBalance = NORMAL_BALANCE[bal.account.type as AccountTypeValue] || 'DEBIT'
    let netDebit = 0
    let netCredit = 0

    if (normalBalance === 'DEBIT') {
      const net = bal.totalDebit - bal.totalCredit
      if (net >= 0) netDebit = net
      else netCredit = Math.abs(net)
    } else {
      const net = bal.totalCredit - bal.totalDebit
      if (net >= 0) netCredit = net
      else netDebit = Math.abs(net)
    }

    return {
      ...bal,
      netDebit,
      netCredit,
    }
  })

  // Sort by account code
  results.sort((a, b) => a.account.code.localeCompare(b.account.code))

  return results
}

// ============ ACCOUNT BALANCE HELPERS ============

export async function getAccountBalance(accountCode: string): Promise<number> {
  const account = await getAccountByCode(accountCode)
  if (!account) return 0

  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: { status: 'POSTED' },
    },
  })

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

  const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'

  return normalBalance === 'DEBIT'
    ? totalDebit - totalCredit
    : totalCredit - totalDebit
}

// ============ GENERAL LEDGER ============

export async function getGeneralLedger(accountCode: string, dateFrom?: Date, dateTo?: Date) {
  const account = await getAccountByCode(accountCode)
  if (!account) return []

  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      journalEntry: {
        status: 'POSTED',
        ...(dateFrom && { date: { gte: dateFrom } }),
        ...(dateTo && { date: { lte: dateTo } }),
      },
    },
    include: { journalEntry: true },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  let runningBalance = 0
  const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'

  return lines.map(line => {
    if (normalBalance === 'DEBIT') {
      runningBalance += line.debit - line.credit
    } else {
      runningBalance += line.credit - line.debit
    }

    return {
      date: line.journalEntry.date,
      entryNo: line.journalEntry.entryNo,
      description: line.journalEntry.description,
      debit: line.debit,
      credit: line.credit,
      balance: runningBalance,
    }
  })
}
