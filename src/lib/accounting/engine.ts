// ============================================================================
// المحرك المحاسبي - Accounting Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Core accounting engine with automatic journal entries for all business transactions.
// Follows double-entry bookkeeping principles and Saudi SOCPA standards.
// Supports both Construction Projects and Equipment Rental activities.
// ============================================================================

import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'
import { toNumber } from '@/lib/decimal'
import {
  getAccountCodeByRole,
  requireAccountByRole,
  resolvePaymentAccountCode,
  AccountRole,
} from '@/lib/account-roles'
import {
  postJournalEntry as guardedPost,
  reverseJournalEntry as guardedReverse,
  getNextEntryNo as guardedNextNo,
} from '@/lib/accounting/guard'

// Transaction client type - used for $transaction callbacks
export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

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
  accountRole?: string  // الدور الوظيفي - يحدد أين يُستخدم الحساب في الشاشات
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
      { code: '1110', name: 'Cash - Treasury', nameAr: 'الصندوق (الخزينة)', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'CASH' },
      { code: '1120', name: 'Bank Accounts', nameAr: 'البنوك', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'BANK' },
      { code: '1130', name: 'Petty Cash', nameAr: 'الصندوق النقدي', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'CASH' },
    { code: '1200', name: 'Receivables', nameAr: 'الذمم المدينة', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1210', name: 'Clients Receivable', nameAr: 'عملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'CUSTOMER_AR' },
      { code: '1220', name: 'Retention Receivable', nameAr: 'مبالغ محتجزة لدى العملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'RETENTION_RECEIVABLE' },
      { code: '1230', name: 'Advances to Employees', nameAr: 'سلف الموظفين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'EMPLOYEE_ADVANCE' },
      { code: '1240', name: 'Advances to Suppliers', nameAr: 'مقدمات للموردين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1250', name: 'Other Receivables', nameAr: 'ذمم مدينة أخرى', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1260', name: 'Tax Refund Receivable', nameAr: 'ضرائب مستحقة الاسترداد', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '1300', name: 'Inventory', nameAr: 'المخزون', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1310', name: 'Raw Materials', nameAr: 'مواد خام', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1320', name: 'Work in Progress', nameAr: 'أعمال تحت التنفيذ', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1330', name: 'Spare Parts', nameAr: 'قطع غيار', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '1340', name: 'Consumable Supplies', nameAr: 'لوازم مستهلكة', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'INVENTORY' },
      { code: '1350', name: 'Equipment Available for Rent', nameAr: 'معدات جاهزة للتأجير', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '1400', name: 'Input VAT (Asset)', nameAr: 'ضريبة مدخلات (أصل)', type: 'ASSET', parentId: '1000', allowPosting: false, isSystem: true, level: 1, activityType: 'BOTH' },
      { code: '1410', name: 'VAT Refund Receivable', nameAr: 'ضريبة مستحقة الاسترداد', type: 'ASSET', parentId: '1400', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'VAT_REFUND_RECEIVABLE' },
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
      { code: '2110', name: 'Construction Equipment', nameAr: 'معدات الإنشاء', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'FIXED_ASSET' },
      { code: '2120', name: 'Rental Equipment', nameAr: 'معدات التأجير', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'FIXED_ASSET' },
      { code: '2130', name: 'Vehicles', nameAr: 'المركبات', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'FIXED_ASSET' },
      { code: '2140', name: 'Office Equipment', nameAr: 'أثاث ومعدات مكتبية', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'FIXED_ASSET' },
      { code: '2150', name: 'Construction in Progress (Assets)', nameAr: 'أصول تحت الإنشاء', type: 'ASSET', parentId: '2100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '2200', name: 'Accumulated Depreciation', nameAr: 'مجمع الإهلاك', type: 'ASSET', parentId: '2000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '2210', name: 'Accum. Depreciation - Construction Equip', nameAr: 'إهلاك متراكم - معدات إنشاء', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'ACCUM_DEPRECIATION' },
      { code: '2220', name: 'Accum. Depreciation - Rental Equip', nameAr: 'إهلاك متراكم - معدات تأجير', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'ACCUM_DEPRECIATION' },
      { code: '2230', name: 'Accum. Depreciation - Vehicles', nameAr: 'إهلاك متراكم - مركبات', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'ACCUM_DEPRECIATION' },
      { code: '2240', name: 'Accum. Depreciation - Office', nameAr: 'إهلاك متراكم - أثاث', type: 'ASSET', parentId: '2200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'ACCUM_DEPRECIATION' },
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
    { code: '3100', name: 'Taxes', nameAr: 'الضرائب', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3110', name: 'Output VAT', nameAr: 'ضريبة مخرجات', type: 'LIABILITY', parentId: '3100', allowPosting: true, isSystem: true, level: 2, activityType: 'BOTH', accountRole: 'VAT_OUTPUT' },
      { code: '3120', name: 'Input VAT', nameAr: 'ضريبة مدخلات', type: 'LIABILITY', parentId: '3100', allowPosting: true, isSystem: true, level: 2, activityType: 'BOTH', accountRole: 'VAT_INPUT' },
      { code: '3130', name: 'VAT Due', nameAr: 'ضريبة مستحقة', type: 'LIABILITY', parentId: '3100', allowPosting: true, isSystem: true, level: 2, activityType: 'BOTH', accountRole: 'VAT_DUE' },
    { code: '3200', name: 'Accounts Payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3210', name: 'Suppliers Payable', nameAr: 'موردون', type: 'LIABILITY', parentId: '3200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'SUPPLIER_AP' },
      { code: '3220', name: 'Subcontractors Payable', nameAr: 'مقاولو الباطن', type: 'LIABILITY', parentId: '3200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'SUBCONTRACTOR_AP' },
    { code: '3300', name: 'Accrued Expenses', nameAr: 'مصروفات مستحقة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3310', name: 'Salaries Payable', nameAr: 'رواتب مستحقة', type: 'LIABILITY', parentId: '3300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'SALARIES_PAYABLE' },
      { code: '3320', name: 'Other Accrued Expenses', nameAr: 'مصروفات مستحقة أخرى', type: 'LIABILITY', parentId: '3300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3330', name: 'Goods Received Not Invoiced', nameAr: 'بضاعة مستلمة غير مفوترة', type: 'LIABILITY', parentId: '3300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'GRNI' },
    { code: '3400', name: 'Customer Advances', nameAr: 'مقدمات العملاء', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3410', name: 'Construction Customer Advances', nameAr: 'مقدمات عملاء المشاريع', type: 'LIABILITY', parentId: '3400', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'CUSTOMER_ADVANCE' },
      { code: '3420', name: 'Rental Customer Advances', nameAr: 'مقدمات عملاء التأجير', type: 'LIABILITY', parentId: '3400', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'CUSTOMER_ADVANCE' },
    { code: '3500', name: 'Retention Payable', nameAr: 'مبالغ محتجزة لدى الشركة', type: 'LIABILITY', parentId: '3000', allowPosting: true, level: 1, activityType: 'CONSTRUCTION' },
    { code: '3600', name: 'Contract Liabilities', nameAr: 'التزامات العقود', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3610', name: 'Construction Contract Liabilities', nameAr: 'التزامات عقود المشاريع', type: 'LIABILITY', parentId: '3600', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '3620', name: 'Rental Contract Liabilities', nameAr: 'التزامات عقود التأجير', type: 'LIABILITY', parentId: '3600', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '3700', name: 'Provisions', nameAr: 'مخصصات', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3710', name: 'End of Service Benefits Provision', nameAr: 'مخصص مكافأة نهاية الخدمة', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'EOS_PROVISION' },
      { code: '3720', name: 'Warranty Provision', nameAr: 'مخصص الضمان', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '3730', name: 'Equipment Maintenance Provision', nameAr: 'مخصص صيانة معدات', type: 'LIABILITY', parentId: '3700', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
    { code: '3800', name: 'Taxes & Zakat Payable', nameAr: 'ضرائب وزكاة مستحقة', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3810', name: 'Zakat Payable', nameAr: 'زكاة مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'ZAKAT_PAYABLE' },
      { code: '3820', name: 'Income Tax Payable', nameAr: 'ضريبة دخل مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '3830', name: 'GOSI Payable', nameAr: 'تأمينات اجتماعية مستحقة', type: 'LIABILITY', parentId: '3800', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'GOSI_PAYABLE' },
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
      { code: '6110', name: 'Progress Claims Revenue', nameAr: 'إيرادات المستخلصات', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'PROJECT_REVENUE' },
      { code: '6120', name: 'Contract Modifications Revenue', nameAr: 'إيرادات تعديلات العقود', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '6130', name: 'Claims Revenue', nameAr: 'إيرادات المطالبات', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '6200', name: 'Rental Revenue', nameAr: 'إيرادات التأجير', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6210', name: 'Equipment Rental Revenue', nameAr: 'إيرادات تأجير المعدات', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
      { code: '6220', name: 'Delivery Fees Revenue', nameAr: 'إيرادات نقل وتوصيل', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
      { code: '6230', name: 'Equipment Operation Revenue', nameAr: 'إيرادات تشغيل المعدات للغير', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
    { code: '6300', name: 'Other Revenue', nameAr: 'إيرادات أخرى', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '6310', name: 'Sale of Used Equipment', nameAr: 'إيرادات بيع معدات مستعملة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6320', name: 'Penalties Revenue', nameAr: 'إيرادات غرامات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6330', name: 'Discounts Received', nameAr: 'خصومات مكتسبة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6340', name: 'Service Revenue', nameAr: 'إيرادات خدمات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'SERVICE_REVENUE' },
      { code: '6350', name: 'Other Miscellaneous Revenue', nameAr: 'إيرادات أخرى متنوعة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },

  // ============================================================================
  // التكاليف المباشرة - Direct Costs (7xxx)
  // ============================================================================
  { code: '7000', name: 'Direct Costs', nameAr: 'التكاليف المباشرة', type: 'EXPENSE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '7100', name: 'Cost of Contracts', nameAr: 'تكلفة العقود', type: 'EXPENSE', parentId: '7000', allowPosting: false, level: 1, activityType: 'CONSTRUCTION' },
      { code: '7110', name: 'Material Costs', nameAr: 'تكاليف المواد', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'PROJECT_COST' },
      { code: '7120', name: 'Labor Costs', nameAr: 'تكاليف العمالة', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7130', name: 'Subcontractor Costs', nameAr: 'تكاليف مقاولي الباطن', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'SUBCONTRACTOR_COST' },
      { code: '7140', name: 'Site Establishment Costs', nameAr: 'تكاليف تأسيس الموقع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7150', name: 'Temporary Works', nameAr: 'أعمال مؤقتة', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7160', name: 'Project Permits & Licenses', nameAr: 'تصاريح وتراخيص مشاريع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7170', name: 'Testing & Commissioning', nameAr: 'اختبارات وتشغيل تجريبي', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '7180', name: 'Project Overhead', nameAr: 'مصروفات عامة مشاريع', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
    { code: '7200', name: 'Equipment Costs', nameAr: 'تكاليف المعدات', type: 'EXPENSE', parentId: '7000', allowPosting: false, level: 1, activityType: 'EQUIPMENT_RENTAL' },
      { code: '7210', name: 'Equipment Fuel', nameAr: 'وقود المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'FUEL_EXPENSE' },
      { code: '7220', name: 'Equipment Maintenance', nameAr: 'صيانة المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'MAINTENANCE_EXPENSE' },
      { code: '7230', name: 'Driver Costs', nameAr: 'تكاليف السائقين', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'DRIVER_EXPENSE' },
      { code: '7240', name: 'Equipment Transport Costs', nameAr: 'تكاليف نقل المعدات', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'TRANSPORT_EXPENSE' },
      { code: '7250', name: 'Rental Equipment Depreciation', nameAr: 'إهلاك معدات التأجير', type: 'EXPENSE', parentId: '7200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_DEPRECIATION' },
    { code: '7300', name: 'Rental Project Costs', nameAr: 'تكاليف مشاريع التأجير', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'EQUIPMENT_RENTAL' },
    { code: '7400', name: 'Project Insurance', nameAr: 'تأمين مشاريع', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'CONSTRUCTION' },
    { code: '7500', name: 'Project Expenses', nameAr: 'مصروفات المشاريع', type: 'EXPENSE', parentId: '7000', allowPosting: true, level: 1, activityType: 'BOTH' },

  // ============================================================================
  // التكاليف غير المباشرة - Indirect Costs (8xxx)
  // ============================================================================
  { code: '8000', name: 'Indirect Costs', nameAr: 'التكاليف غير المباشرة', type: 'EXPENSE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '8100', name: 'Administrative Expenses', nameAr: 'مصروفات إدارية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8110', name: 'Salaries & Wages', nameAr: 'رواتب وأجور', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'PAYROLL_EXPENSE' },
      { code: '8120', name: 'Office Rent', nameAr: 'إيجار مكتب', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8130', name: 'Utilities (Electricity/Water/Internet)', nameAr: 'خدمات', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8140', name: 'Office Supplies', nameAr: 'لوازم مكتبية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8150', name: 'Communication Expenses', nameAr: 'اتصالات', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8160', name: 'Professional Fees', nameAr: 'أتعاب مهنية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8170', name: 'Legal Fees', nameAr: 'أتعاب قانونية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8200', name: 'HR Expenses', nameAr: 'مصروفات الموارد البشرية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8210', name: 'GOSI Expense', nameAr: 'تأمينات اجتماعية', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'GOSI_EXPENSE' },
      { code: '8220', name: 'Staff Housing', nameAr: 'سكن عمال', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8230', name: 'Worker Permits', nameAr: 'تصاريح عمالة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8240', name: 'Travel & Accommodation', nameAr: 'سفر وإقامة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8250', name: 'Safety Equipment', nameAr: 'معدات سلامة', type: 'EXPENSE', parentId: '8200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8300', name: 'Depreciation Expense', nameAr: 'مصروف الإهلاك', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8310', name: 'Depreciation - Construction Equipment', nameAr: 'إهلاك معدات إنشاء', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'DEPRECIATION_EXPENSE' },
      { code: '8320', name: 'Depreciation - Vehicles', nameAr: 'إهلاك مركبات', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8330', name: 'Depreciation - Office', nameAr: 'إهلاك أثاث', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8340', name: 'Depreciation - Software', nameAr: 'إهلاك برمجيات', type: 'EXPENSE', parentId: '8300', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8400', name: 'Financial Expenses', nameAr: 'مصروفات مالية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8410', name: 'Bank Charges', nameAr: 'مصاريف بنكية', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8420', name: 'Loan Interest', nameAr: 'فوائد قروض', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '8430', name: 'Bad Debts', nameAr: 'ديون معدومة', type: 'EXPENSE', parentId: '8400', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '8500', name: 'Tax Expenses', nameAr: 'مصروفات ضريبية', type: 'EXPENSE', parentId: '8000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '8510', name: 'Zakat Expense', nameAr: 'زكاة', type: 'EXPENSE', parentId: '8500', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'ZAKAT_EXPENSE' },
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

export async function getAccountByCode(code: string, tx?: PrismaTransaction) {
  return (tx || db).account.findUnique({ where: { code } })
}

export async function ensureAccountExists(template: AccountTemplate, tx?: PrismaTransaction) {
  const client = tx || db
  const existing = await client.account.findUnique({ where: { code: template.code } })
  if (existing) {
    // Update existing account with new fields if they are missing
    if (
      existing.activityType !== (template.activityType || null) ||
      existing.isSystem !== (template.isSystem || false) ||
      existing.allowPosting !== (template.allowPosting || false) ||
      existing.level !== (template.level || 0) ||
      (template.accountRole && existing.accountRole !== template.accountRole) ||
      (template.parentId && existing.parentCode !== template.parentId)
    ) {
      await client.account.update({
        where: { code: template.code },
        data: {
          name: template.name,
          nameAr: template.nameAr,
          type: template.type,
          activityType: template.activityType || null,
          isSystem: template.isSystem || false,
          allowPosting: template.allowPosting || false,
          level: template.level || 0,
          accountRole: template.accountRole || existing.accountRole,
          parentCode: template.parentId || existing.parentCode,
        },
      })
    }
    return client.account.findUnique({ where: { code: template.code } })
  }

  let parentId: string | undefined
  if (template.parentId) {
    const parent = await client.account.findUnique({ where: { code: template.parentId } })
    if (parent) parentId = parent.id
  }

  return client.account.create({
    data: {
      code: template.code,
      name: template.name,
      nameAr: template.nameAr,
      type: template.type,
      parentId,
      parentCode: template.parentId || null,
      isActive: true,
      activityType: template.activityType || null,
      accountRole: template.accountRole || null,
      isSystem: template.isSystem || false,
      allowPosting: template.allowPosting || false,
      level: template.level || 0,
    },
  })
}

// ============ INITIALIZE CHART OF ACCOUNTS ============

/**
 * Initialize / sync the chart of accounts from the CHART_OF_ACCOUNTS_TEMPLATE.
 *
 * IMPORTANT (CRITICAL #12 fix): This function is EXPENSIVE — it iterates ~110 accounts
 * and performs an upsert on each. It must ONLY be called during database seeding or
 * an explicit "sync chart of accounts" admin action. It must NOT be called on every
 * POST of an expense/advance/invoice (the prior pattern caused a major performance
 * regression and made every transaction non-atomic because the writes used `db`
 * instead of the caller's `tx`).
 *
 * @param tx - Optional Prisma transaction client. When provided, all writes are
 *             performed on `tx` so they are atomic with the caller's transaction.
 *             When omitted, falls back to the global `db` (for seed scripts).
 */
export async function initializeChartOfAccounts(tx?: PrismaTransaction) {
  const client = tx || db
  let created = 0
  let updated = 0

  // Create parent accounts first, then children (sorted by code length then code)
  const sorted = [...CHART_OF_ACCOUNTS_TEMPLATE].sort((a, b) => {
    if (a.code.length !== b.code.length) return a.code.length - b.code.length
    return a.code.localeCompare(b.code)
  })

  for (const tmpl of sorted) {
    const existing = await client.account.findUnique({ where: { code: tmpl.code } })
    if (existing) {
      // Update existing account with new fields
      await client.account.update({
        where: { code: tmpl.code },
        data: {
          name: tmpl.name,
          nameAr: tmpl.nameAr,
          type: tmpl.type,
          activityType: tmpl.activityType || null,
          accountRole: tmpl.accountRole || null,
          parentCode: tmpl.parentId || null,
          isSystem: tmpl.isSystem || false,
          allowPosting: tmpl.allowPosting || false,
          level: tmpl.level || 0,
          isActive: true,
        },
      })
      // Update parent reference if needed
      if (tmpl.parentId) {
        const parent = await client.account.findUnique({ where: { code: tmpl.parentId } })
        if (parent && existing.parentId !== parent.id) {
          await client.account.update({
            where: { code: tmpl.code },
            data: { parentId: parent.id },
          })
        }
      }
      updated++
    } else {
      // Create new account. Note: ensureAccountExists uses the global db; for atomicity
      // inside a tx we inline a minimal create here.
      await client.account.create({
        data: {
          code: tmpl.code,
          name: tmpl.name,
          nameAr: tmpl.nameAr,
          type: tmpl.type,
          parentCode: tmpl.parentId || null,
          accountRole: tmpl.accountRole || null,
          isSystem: tmpl.isSystem || false,
          allowPosting: tmpl.allowPosting || false,
          level: tmpl.level || 0,
          activityType: tmpl.activityType || null,
        },
      })
      created++
    }
  }

  const total = await client.account.count()
  return { created, updated, total }
}

// ============ JOURNAL ENTRY REVERSAL ============

/**
 * عكس قيد محاسبي - Reverse a posted journal entry
 *
 * Creates a reversal entry with flipped debit/credit on all lines,
 * marks the original entry as CANCELLED, and links them together.
 *
 * IMPORTANT: This function MUST be called inside a $transaction callback.
 * The `tx` parameter is required — no standalone calls allowed.
 *
 * @param journalEntryId - ID of the journal entry to reverse
 * @param tx - Prisma transaction client (required)
 * @returns The reversal journal entry with its lines
 * @throws Error if entry not found, not POSTED, or already reversed
 */
export async function reverseEntry(journalEntryId: string, tx: PrismaTransaction) {
  // Delegate to the unbreakable guard — all R1-R12 rules enforced centrally.
  return guardedReverse(journalEntryId, tx)
}


// ============ JOURNAL ENTRY CREATION ============
//
// هذه الدالة الآن مجرد proxy لـ postJournalEntry في guard.ts.
// كل التحققات الصارمة (R1-R12) تُفرض في طبقة الحارس ولا يمكن تجاوزها.
// لا يجوز لأي كود في النظام أن يستدعي db.journalEntry.create مباشرةً.

export async function createJournalEntry(template: JournalEntryTemplate, tx?: PrismaTransaction) {
  return guardedPost(
    {
      entryNo: template.entryNo,
      date: template.date,
      description: template.description,
      descriptionAr: template.descriptionAr,
      sourceType: template.sourceType,
      sourceId: template.sourceId,
      lines: template.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        costCenterId: l.costCenterId,
        description: l.description,
      })),
    },
    tx
  )
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
}, tx?: PrismaTransaction) {
  // Resolve accounts by ROLE — no hardcoded codes!
  const arAccount = await requireAccountByRole(AccountRole.CUSTOMER_AR, 'فاتورة مبيعات', tx)
  const arCode = arAccount.code

  // Determine revenue role based on invoice type
  let revenueRole: string
  switch (data.invoiceType) {
    case 'RENTAL':
      revenueRole = AccountRole.RENTAL_REVENUE
      break
    case 'PROGRESS_CLAIM':
      revenueRole = AccountRole.PROJECT_REVENUE
      break
    default:
      revenueRole = AccountRole.SERVICE_REVENUE
  }
  const revenueAccount = await requireAccountByRole(revenueRole, 'فاتورة مبيعات', tx)
  const revenueCode = revenueAccount.code

  const lines = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.subtotal, costCenterId: data.costCenterId },
  ]

  // Add VAT line only if VAT > 0 — resolved by role
  if (data.vatAmount > 0) {
    const vatCode = await getAccountCodeByRole(AccountRole.VAT_OUTPUT, tx)
    if (vatCode) {
      lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
    }
  }

  return createJournalEntry({
    entryNo: `JE-SI-${Date.now()}`,
    date: data.date,
    description: `Sales Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة مبيعات ${data.invoiceNo}`,
    lines,
    sourceType: 'SALES_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
}

/**
 * فاتورة مشتريات - Purchase Invoice
 * Dr: Expense/Asset account - subtotal
 * Dr: VAT Receivable (1400) - vatAmount
 * Cr: Suppliers Payable (3110) - totalAmount
 */
/**
 * فاتورة مشتريات - Purchase Invoice (DEPRECATED — use createPurchaseInvoiceJournalEntry instead)
 *
 * P5-CRIT-006/015 FIX: This function is DEPRECATED. The unified generator is
 * `createPurchaseInvoiceJournalEntry` in `src/lib/auto-journal.ts`, which:
 *   - Is expenseCategory-aware (uses the same category→role map)
 *   - Uses requireAccountByRole (throws on missing role mapping, no hardcoded fallbacks)
 *   - Uses getNextEntryNo (standard JE-NNNNNN format, not JE-PI-...)
 *   - Propagates costCenterId from the linked project's cost center
 *
 * This function is kept for backwards compatibility but now THROWS to force
 * callers to migrate. The only previous callers were supplier-invoices/[id]
 * (PUT approve + PUT edit), which have been migrated to createPurchaseInvoiceJournalEntry.
 *
 * DEPRECATED — purchase invoices use createPurchaseInvoiceJournalEntry (auto-journal.ts).
 *
 * Cr: Suppliers Payable (3110) - totalAmount
 */
export async function autoEntryPurchaseInvoice(_data: {
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
}, _tx?: PrismaTransaction) {
  throw new Error(
    'autoEntryPurchaseInvoice is DEPRECATED. Use createPurchaseInvoiceJournalEntry(invoiceId, tx) ' +
    'from src/lib/auto-journal.ts instead — it is expenseCategory-aware, uses requireAccountByRole ' +
    '(no hardcoded fallback codes), uses getNextEntryNo (standard JE-NNNNNN format), and propagates costCenterId.'
  )
}

/**
 * مستخلص - Progress Claim
 *
 * DEPRECATED — Progress claims do NOT create journal entries.
 *
 * A progress claim is a request for payment, not an invoice. Creating a JE
 * here would double-count revenue once the approved claim is converted into
 * a sales invoice (which itself creates the proper JE via
 * `createSalesInvoiceJournalEntry`).
 *
 * To preserve API compatibility this function now throws a descriptive
 * error so callers are forced to migrate to the correct workflow:
 *   1. Create claim (DRAFT) — no JE.
 *   2. Approve claim — no JE.
 *   3. Generate invoice from approved claim — JE created by the sales
 *      invoice API.
 */
export async function autoEntryProgressClaim(_data: {
  claimNo: string
  projectId: string
  contractId: string
  amount: number
  vatRate: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, _tx?: PrismaTransaction) {
  throw new Error(
    'Progress claims do not create journal entries. ' +
    'Generate an invoice from the approved claim instead.'
  )
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const categoryRoleMap: Record<string, string> = {
    'CONSUMABLES': AccountRole.PROJECT_COST,
    'SERVICES': AccountRole.SUBCONTRACTOR_COST,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'FUEL': AccountRole.FUEL_EXPENSE,
    'DRIVERS': AccountRole.DRIVER_EXPENSE,
    'TRANSPORT': AccountRole.TRANSPORT_EXPENSE,
    'DELIVERY': AccountRole.TRANSPORT_EXPENSE,
    'RENT': AccountRole.ADMIN_EXPENSE,
    'OFFICE': AccountRole.ADMIN_EXPENSE,
    'INTERNET': AccountRole.ADMIN_EXPENSE,
    'ELECTRICITY': AccountRole.ADMIN_EXPENSE,
    'WATER': AccountRole.ADMIN_EXPENSE,
    'SALARIES': AccountRole.PAYROLL_EXPENSE,
    'INSURANCE': AccountRole.PROJECT_COST,
    'PERMITS': AccountRole.PROJECT_COST,
    'HOSPITALITY': AccountRole.ADMIN_EXPENSE,
    'MANAGEMENT_CARS': AccountRole.ADMIN_EXPENSE,
    'OTHER': AccountRole.ADMIN_EXPENSE,
  }
  const expenseRole = categoryRoleMap[data.category] || AccountRole.ADMIN_EXPENSE
  const expenseAccountCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
  const cashAccountCode = await resolvePaymentAccountCode(data.payFrom, tx)
  const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'

  const totalCashOut = data.amount + (data.vatAmount || 0)

  const lines = [
    { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount && data.vatAmount > 0) {
    lines.push({ accountCode: vatInputCode, debit: data.vatAmount, credit: 0 })
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
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR, tx) || '1210'

  return createJournalEntry({
    entryNo: `JE-CP-${Date.now()}`,
    date: data.date,
    description: `Payment received from ${data.clientName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `تحصيل من ${data.clientName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: cashAccountCode, debit: data.amount, credit: 0 },
      { accountCode: arCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'CLIENT_PAYMENT',
    sourceId: data.reference || `CP-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const apCode = await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210'
  const cashAccountCode = await resolvePaymentAccountCode(data.paidFrom === 'BANK' ? 'BANK' : 'TREASURY', tx)

  return createJournalEntry({
    entryNo: `JE-SP-${Date.now()}`,
    date: data.date,
    description: `Payment to ${data.supplierName}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `دفع إلى ${data.supplierName}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: apCode, debit: data.amount, credit: 0 },
      { accountCode: cashAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUPPLIER_PAYMENT',
    sourceId: data.reference || `SP-${Date.now()}`,
  }, tx)
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
  /**
   * مصدر السداد — يحترم اختيار المستخدم (المستخدم سيد النظام):
   *   'BANK'               : دائن البنك
   *   'CASH'               : دائن النقدية (الصندوق)
   *   'EMPLOYEE_DEDUCTION' : دائن حساب أرباح/خسائر أضرار (سرقة/تلف/إهمال)
   * إن لم يُحدد، يستخدم النقدية افتراضياً (للتوافق مع السلوك السابق).
   */
  paymentSource?: 'BANK' | 'CASH' | 'EMPLOYEE_DEDUCTION'
  /** كود الحساب الدائن الفعلي (اختياري — يحترم اختيار المستخدم بدقة) */
  paymentAccountCode?: string
  description?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const advanceCode = await getAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, tx) || '1230'

  // احترم اختيار المستخدم لمصدر السداد
  let creditCode: string
  let creditLabel: string
  if (data.paymentAccountCode) {
    creditCode = data.paymentAccountCode
    creditLabel = 'حسب اختيار المستخدم'
  } else if (data.paymentSource === 'BANK') {
    creditCode = await resolvePaymentAccountCode('BANK', tx)
    creditLabel = 'بنك'
  } else if (data.paymentSource === 'EMPLOYEE_DEDUCTION') {
    // خصم على الموظف بسبب سرقة/تلف/إهمال — دائن من حساب مخصصات/خسائر أضرار
    // نستخدم حساب EMPLOYEE_ADVANCE نفسه في الحالة الاستثنائية: الشركة تعتبر المبلغ
    // سلفة على الموظف دون خروج نقدي فعلي. الحساب الدائن البديل: LOSS_ON_DAMAGE أو مشابه.
    // للأمان: نستخدم TREASURY كقيمة افتراضية، لكن المستخدم يمكنه تحديد كود مخصص.
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
    creditLabel = 'خصم على الموظف (سرقة/تلف/إهمال)'
  } else {
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
    creditLabel = 'نقدية'
  }

  const descAr = data.description || `سلفة لموظف ${data.employeeName} - ${creditLabel}`

  return createJournalEntry({
    entryNo: `JE-EA-${Date.now()}`,
    date: data.date,
    description: `Advance to ${data.employeeName}`,
    descriptionAr: descAr,
    lines: [
      { accountCode: advanceCode, debit: data.amount, credit: 0 },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EMPLOYEE_ADVANCE',
    sourceId: `EA-${Date.now()}`,
  }, tx)
}

/**
 * تسوية سلفة - Advance Settlement
 * P4-CRIT-010 FIX: Dr SALARIES_PAYABLE (3310) — relieves the salary liability when the
 * advance is recovered from a future salary. (Was: Dr PAYROLL_EXPENSE which inflated
 * salary expense and produced negative Salaries Payable before accrual.)
 * Cr: Advances to Employees (1230) — relieves the advance asset.
 */
export async function autoEntryAdvanceSettlement(data: {
  employeeName: string
  settledAmount: number
  date: Date
  /**
   * طريقة التحصيل — يحترم اختيار المستخدم (المستخدم سيد النظام):
   *   'SALARY_DEDUCTION' : مدين رواتب مستحقة (الخصم من الراتب) — السلوك الافتراضي
   *   'BANK'             : مدين البنك (استرداد نقدي عبر البنك)
   *   'CASH'             : مدين النقدية (استرداد نقدي من الصندوق)
   */
  settlementMethod?: 'BANK' | 'CASH' | 'SALARY_DEDUCTION'
  /** كود الحساب المدين الفعلي (اختياري — يحترم اختيار المستخدم بدقة) */
  settlementAccountCode?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const advanceCode = await getAccountCodeByRole(AccountRole.EMPLOYEE_ADVANCE, tx) || '1230'

  // احترم اختيار المستخدم لطريقة التحصيل
  let debitCode: string
  let debitLabel: string
  if (data.settlementAccountCode) {
    debitCode = data.settlementAccountCode
    debitLabel = 'حسب اختيار المستخدم'
  } else if (data.settlementMethod === 'BANK') {
    debitCode = await resolvePaymentAccountCode('BANK', tx)
    debitLabel = 'بنك'
  } else if (data.settlementMethod === 'CASH') {
    debitCode = await resolvePaymentAccountCode('TREASURY', tx)
    debitLabel = 'نقدية'
  } else {
    // SALARY_DEDUCTION (default) — Dr SALARIES_PAYABLE
    debitCode = await getAccountCodeByRole(AccountRole.SALARIES_PAYABLE, tx) || '3310'
    debitLabel = 'خصم من الراتب'
  }

  return createJournalEntry({
    entryNo: `JE-AS-${Date.now()}`,
    date: data.date,
    description: `Advance settlement - ${data.employeeName}`,
    descriptionAr: `تسوية سلفة - ${data.employeeName} - ${debitLabel}`,
    lines: [
      { accountCode: debitCode, debit: data.settledAmount, credit: 0 },
      { accountCode: advanceCode, debit: 0, credit: data.settledAmount },
    ],
    sourceType: 'ADVANCE_SETTLEMENT',
    sourceId: `AS-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const costCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_COST, tx) || '7130'
  const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'
  const apCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, tx) || '3220'

  const lines = [
    { accountCode: costCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: vatInputCode, debit: data.vatAmount, credit: 0 })
  }

  lines.push({ accountCode: apCode, debit: 0, credit: data.totalAmount })

  return createJournalEntry({
    entryNo: `JE-SCI-${Date.now()}`,
    date: data.date,
    description: `Subcontractor Invoice ${data.invoiceNo} - ${data.subcontractorName}`,
    descriptionAr: `فاتورة مقاول باطن ${data.invoiceNo} - ${data.subcontractorName}`,
    lines,
    sourceType: 'SUBCONTRACTOR_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const accountRoleMap: Record<string, string> = {
    'OPERATION': AccountRole.FUEL_EXPENSE,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'FUEL': AccountRole.FUEL_EXPENSE,
    'OTHER': AccountRole.PROJECT_COST,
  }
  const debitRole = accountRoleMap[data.costType] || AccountRole.PROJECT_COST
  const debitAccountCode = await getAccountCodeByRole(debitRole, tx) || '7210'
  const creditAccountCode = data.payFrom === 'AP'
    ? (await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210')
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    entryNo: `JE-EQC-${Date.now()}`,
    date: data.date,
    description: `Equipment ${data.costType} cost - ${data.equipmentName}`,
    descriptionAr: `تكلفة ${data.costType === 'OPERATION' ? 'تشغيل' : data.costType === 'MAINTENANCE' ? 'صيانة' : data.costType === 'FUEL' ? 'وقود' : 'أخرى'} معدات - ${data.equipmentName}`,
    lines: [
      { accountCode: debitAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EQUIPMENT_COST',
    sourceId: `EQC-${Date.now()}`,
  }, tx)
}

/**
 * شراء معدات - Equipment Purchase
 * Dr: Fixed Asset — Equipment (2120) [FIXED_ASSET role]
 * Cr: Cash (if payFrom=CASH) or Supplier AP (if payFrom=AP)
 *
 * Capitalizes the equipment as a fixed asset on the balance sheet.
 */
export async function autoEntryEquipmentPurchase(data: {
  equipmentCode: string
  equipmentName: string
  amount: number
  date: Date
  payFrom: 'CASH' | 'AP'
}, tx?: PrismaTransaction) {
  const assetCode = await getAccountCodeByRole(AccountRole.FIXED_ASSET, tx) || '2120'
  const creditAccountCode = data.payFrom === 'AP'
    ? (await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210')
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    entryNo: `JE-EQP-${Date.now()}`,
    date: data.date,
    description: `Equipment Purchase - ${data.equipmentCode} ${data.equipmentName}`,
    descriptionAr: `شراء معدات - ${data.equipmentCode} ${data.equipmentName}`,
    lines: [
      { accountCode: assetCode, debit: data.amount, credit: 0 },
      { accountCode: creditAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'EQUIPMENT_PURCHASE',
    sourceId: data.equipmentCode,
  }, tx)
}

/**
 * إيراد تأجير - Rental Invoice (from Timesheet)
 * Dr: Clients Receivable (1210)
 * Cr: Equipment Rental Revenue (6210)
 * Cr: Output VAT (3110)
 */
export async function autoEntryRentalInvoice(data: {
  invoiceNo: string
  subtotal: number
  vatAmount: number
  totalAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR, tx) || '1210'
  const revenueCode = await getAccountCodeByRole(AccountRole.RENTAL_REVENUE, tx) || '6210'

  const lines = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.subtotal, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    const vatCode = await getAccountCodeByRole(AccountRole.VAT_OUTPUT, tx) || '3110'
    lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
  }

  return createJournalEntry({
    entryNo: `JE-RI-${Date.now()}`,
    date: data.date,
    description: `Rental Invoice ${data.invoiceNo}`,
    descriptionAr: `فاتورة تأجير ${data.invoiceNo}`,
    lines,
    sourceType: 'RENTAL_INVOICE',
    sourceId: data.invoiceNo,
  }, tx)
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
  // P4-CRIT-011: distinguish fund replenishment from disbursement.
  //   FUND     → Dr PETTY_CASH (1130) / Cr BANK (1120)   — moves cash from bank to petty cash box
  //   DISBURSE → Dr EXPENSE  / Cr PETTY_CASH (1130)       — pays for a small expense out of petty cash
  transactionType?: 'FUND' | 'DISBURSE'
  bankAccountCode?: string  // optional — for FUND, the bank to credit
}, tx?: PrismaTransaction) {
  const txnType = data.transactionType || 'DISBURSE'

  if (txnType === 'FUND') {
    // Fund replenishment: Dr PETTY_CASH (1130) / Cr BANK (1120)
    const pettyCashCode = await getAccountCodeByRole(AccountRole.PETTY_CASH, tx) || '1130'
    const bankCode = data.bankAccountCode
      || (await getAccountCodeByRole(AccountRole.BANK, tx))
      || '1120'

    return createJournalEntry({
      entryNo: `JE-PTC-${Date.now()}`,
      date: data.date,
      description: `Petty Cash Fund: ${data.description}`,
      descriptionAr: `تغذية صندوق نثرية: ${data.description}`,
      lines: [
        { accountCode: pettyCashCode, debit: data.amount, credit: 0 },
        { accountCode: bankCode, debit: 0, credit: data.amount },
      ],
      sourceType: 'PETTY_CASH',
      sourceId: `PTC-${Date.now()}`,
    }, tx)
  }

  // Default: DISBURSE — Dr EXPENSE / Cr PETTY_CASH (1130)
  const categoryRoleMap: Record<string, string> = {
    'OFFICE': AccountRole.ADMIN_EXPENSE,
    'TRANSPORT': AccountRole.TRANSPORT_EXPENSE,
    'HOSPITALITY': AccountRole.ADMIN_EXPENSE,
    'MAINTENANCE': AccountRole.MAINTENANCE_EXPENSE,
    'OTHER': AccountRole.ADMIN_EXPENSE,
  }
  const expenseRole = categoryRoleMap[data.category] || AccountRole.ADMIN_EXPENSE
  const expenseAccountCode = await getAccountCodeByRole(expenseRole, tx) || '8630'
  // P4-CRIT-011 FIX: use PETTY_CASH (1130), not the first CASH (1110 = Treasury).
  // The CASH role has defaultCodes ['1110', '1130'] and getAccountCodeByRole returns
  // the first by code:asc, which is 1110 (Treasury) — so all petty cash disbursements
  // hit Treasury instead of the Petty Cash sub-account 1130. Use PETTY_CASH role instead.
  const pettyCashCode = await getAccountCodeByRole(AccountRole.PETTY_CASH, tx) || '1130'

  return createJournalEntry({
    entryNo: `JE-PTC-${Date.now()}`,
    date: data.date,
    description: `Petty Cash: ${data.description}`,
    descriptionAr: `صندوق نقدي: ${data.description}`,
    lines: [
      { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: pettyCashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'PETTY_CASH',
    sourceId: `PTC-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const payrollCode = await getAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, tx) || '8110'
  const gosiExpenseCode = await getAccountCodeByRole(AccountRole.GOSI_EXPENSE, tx) || '8210'
  const cashAccountCode = await resolvePaymentAccountCode(data.payFrom === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const gosiPayableCode = await getAccountCodeByRole(AccountRole.GOSI_PAYABLE, tx) || '3830'
  const netCashPaid = data.grossSalary - data.gosiEmployeeDeduction

  const lines = [
    { accountCode: payrollCode, debit: data.grossSalary, credit: 0, costCenterId: data.costCenterId },
    { accountCode: gosiExpenseCode, debit: data.gosiEmployerContribution, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.gosiEmployeeDeduction > 0) {
    lines.push({ accountCode: payrollCode, debit: 0, credit: data.gosiEmployeeDeduction, costCenterId: data.costCenterId })
  }

  lines.push({ accountCode: cashAccountCode, debit: 0, credit: netCashPaid })
  lines.push({ accountCode: gosiPayableCode, debit: 0, credit: data.gosiEmployeeDeduction + data.gosiEmployerContribution })

  return createJournalEntry({
    entryNo: `JE-SAL-${Date.now()}`,
    date: data.date,
    description: `Salary payment - ${data.employeeName}`,
    descriptionAr: `صرف راتب - ${data.employeeName}`,
    lines,
    sourceType: 'SALARY',
    sourceId: `SAL-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const gosiExpenseCode = await getAccountCodeByRole(AccountRole.GOSI_EXPENSE, tx) || '8210'
  const gosiPayableCode = await getAccountCodeByRole(AccountRole.GOSI_PAYABLE, tx) || '3830'
  const totalGOSI = data.employeeContribution + data.employerContribution

  return createJournalEntry({
    entryNo: `JE-GOSI-${Date.now()}`,
    date: data.date,
    description: `GOSI contribution - Employer: ${data.employerContribution}, Employee: ${data.employeeContribution}`,
    descriptionAr: `اشتراك تأمينات اجتماعية - صاحب العمل: ${data.employerContribution}, الموظف: ${data.employeeContribution}`,
    lines: [
      { accountCode: gosiExpenseCode, debit: data.employerContribution, credit: 0, costCenterId: data.costCenterId },
      { accountCode: gosiPayableCode, debit: 0, credit: totalGOSI },
    ],
    sourceType: 'GOSI',
    sourceId: `GOSI-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const depreciationRoleMap: Record<string, { expense: string; accumulated: string }> = {
    'CONSTRUCTION_EQUIPMENT': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'VEHICLES': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'OFFICE': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
    'SOFTWARE': { expense: AccountRole.DEPRECIATION_EXPENSE, accumulated: AccountRole.ACCUM_DEPRECIATION },
  }

  const mapping = depreciationRoleMap[data.assetType]
  const expenseCode = await getAccountCodeByRole(mapping.expense, tx) || '8310'
  const accumulatedCode = await getAccountCodeByRole(mapping.accumulated, tx) || '2210'

  return createJournalEntry({
    entryNo: `JE-DEP-${Date.now()}`,
    date: data.date,
    description: `Depreciation - ${data.assetType}`,
    descriptionAr: `إهلاك - ${data.assetType === 'CONSTRUCTION_EQUIPMENT' ? 'معدات إنشاء' : data.assetType === 'VEHICLES' ? 'مركبات' : data.assetType === 'OFFICE' ? 'أثاث' : 'برمجيات'}`,
    lines: [
      { accountCode: expenseCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: accumulatedCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'DEPRECIATION',
    sourceId: `DEP-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const depExpenseCode = await getAccountCodeByRole(AccountRole.RENTAL_DEPRECIATION, tx) || '7250'
  const accumDepCode = await getAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION, tx) || '2220'

  return createJournalEntry({
    entryNo: `JE-RDEP-${Date.now()}`,
    date: data.date,
    description: 'Rental equipment depreciation',
    descriptionAr: 'إهلاك معدات التأجير',
    lines: [
      { accountCode: depExpenseCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: accumDepCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'RENTAL_DEPRECIATION',
    sourceId: `RDEP-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR, tx) || '1210'
  const revenueCode = await getAccountCodeByRole(AccountRole.RENTAL_REVENUE, tx) || '6220'

  const lines = [
    { accountCode: arCode, debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: revenueCode, debit: 0, credit: data.amount, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    const vatCode = await getAccountCodeByRole(AccountRole.VAT_OUTPUT, tx) || '3110'
    lines.push({ accountCode: vatCode, debit: 0, credit: data.vatAmount })
  }

  return createJournalEntry({
    entryNo: `JE-DF-${Date.now()}`,
    date: data.date,
    description: 'Delivery fees',
    descriptionAr: 'رسوم نقل وتوصيل',
    lines,
    sourceType: 'DELIVERY_FEES',
    sourceId: `DF-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
  const advanceAccountCode = await getAccountCodeByRole(AccountRole.CUSTOMER_ADVANCE, tx) || (data.activityType === 'CONSTRUCTION' ? '3410' : '3420')

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
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const retentionCode = await getAccountCodeByRole(AccountRole.RETENTION_RECEIVABLE, tx) || '1220'
  const arCode = await getAccountCodeByRole(AccountRole.CUSTOMER_AR, tx) || '1210'

  return createJournalEntry({
    entryNo: `JE-RET-${Date.now()}`,
    date: data.date,
    description: `Retention withheld by ${data.clientName}`,
    descriptionAr: `احتجاز لدى ${data.clientName}`,
    lines: [
      { accountCode: retentionCode, debit: data.retentionAmount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: arCode, debit: 0, credit: data.retentionAmount, costCenterId: data.costCenterId },
    ],
    sourceType: 'RETENTION',
    sourceId: `RET-${Date.now()}`,
  }, tx)
}

/**
 * زكاة - Zakat
 * Dr: Zakat Expense (8510)
 * Cr: Zakat Payable (3810)
 */
export async function autoEntryZakat(data: {
  amount: number
  date: Date
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const zakatExpenseCode = await getAccountCodeByRole(AccountRole.ZAKAT_EXPENSE, tx) || '8510'
  const zakatPayableCode = await getAccountCodeByRole(AccountRole.ZAKAT_PAYABLE, tx) || '3810'

  return createJournalEntry({
    entryNo: `JE-ZAK-${Date.now()}`,
    date: data.date,
    description: 'Zakat provision',
    descriptionAr: 'مخصص الزكاة',
    lines: [
      { accountCode: zakatExpenseCode, debit: data.amount, credit: 0 },
      { accountCode: zakatPayableCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'ZAKAT',
    sourceId: `ZAK-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const payrollCode = await getAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, tx) || '8110'
  const eosCode = await getAccountCodeByRole(AccountRole.EOS_PROVISION, tx) || '3710'

  return createJournalEntry({
    entryNo: `JE-EOS-${Date.now()}`,
    date: data.date,
    description: 'End of service benefits provision',
    descriptionAr: 'مخصص مكافأة نهاية الخدمة',
    lines: [
      { accountCode: payrollCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: eosCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'END_OF_SERVICE',
    sourceId: `EOS-${Date.now()}`,
  }, tx)
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
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const cashAccountCode = await resolvePaymentAccountCode(data.receivedIn === 'BANK' ? 'BANK' : 'TREASURY', tx)
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
  }, tx)
}

/**
 * إقرار ضريبي - VAT Declaration
 * Dr: Output VAT (3110) - total output VAT
 * Cr: Input VAT (3120) - total input VAT
 * Cr: VAT Due (3130) - net VAT payable (if output > input)
 * OR
 * Dr: Input VAT (3120) - if input > output (refund scenario)
 * Cr: Output VAT (3110)
 * Dr: VAT Refund Receivable (1410) - if refund due
 */
export async function autoEntryVATDeclaration(data: {
  period: string
  outputVat: number
  inputVat: number
  netVat: number // positive = payable, negative = refundable
  date: Date
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const vatOutputCode = await getAccountCodeByRole(AccountRole.VAT_OUTPUT, tx) || '3110'
  const vatInputCode = await getAccountCodeByRole(AccountRole.VAT_INPUT, tx) || '3120'
  const vatDueCode = await getAccountCodeByRole(AccountRole.VAT_DUE, tx) || '3130'
  // FIXED (CRITICAL #14): VAT refund is an ASSET (1410), not a liability.
  // The prior code used VAT_INPUT role (which maps to liability 3120) as the refund
  // debit account → zeroed out the liability instead of creating a receivable asset.
  // Now uses the dedicated VAT_REFUND_RECEIVABLE role.
  const vatRefundCode = await getAccountCodeByRole(AccountRole.VAT_REFUND_RECEIVABLE, tx) || '1410'

  const lines: { accountCode: string; debit: number; credit: number }[] = []

  // Close Output VAT - debit to zero it out
  lines.push({ accountCode: vatOutputCode, debit: data.outputVat, credit: 0 })

  // Close Input VAT - credit to zero it out
  lines.push({ accountCode: vatInputCode, debit: 0, credit: data.inputVat })

  // Net VAT position
  if (data.netVat > 0) {
    // More output than input → owe VAT
    lines.push({ accountCode: vatDueCode, debit: 0, credit: data.netVat })
  } else if (data.netVat < 0) {
    // More input than output → refund due
    lines.push({ accountCode: vatRefundCode, debit: Math.abs(data.netVat), credit: 0 })
  }

  return createJournalEntry({
    entryNo: `JE-VAT-${Date.now()}`,
    date: data.date,
    description: `VAT Declaration - ${data.period}`,
    descriptionAr: `إقرار ضريبي - ${data.period}`,
    lines,
    sourceType: 'VAT_DECLARATION',
    sourceId: `VAT-${data.period}`,
  }, tx)
}

/**
 * سداد الضريبة - VAT Payment
 * Dr: VAT Due (3130)
 * Cr: Bank (1120)
 */
export async function autoEntryVATPayment(data: {
  period: string
  amount: number
  date: Date
  reference?: string
}, tx?: PrismaTransaction) {
  // Resolved by role — no hardcoded code!
  const vatDueCode = await getAccountCodeByRole(AccountRole.VAT_DUE, tx) || '3130'
  const bankCode = await resolvePaymentAccountCode('BANK', tx)

  return createJournalEntry({
    entryNo: `JE-VTP-${Date.now()}`,
    date: data.date,
    description: `VAT Payment - ${data.period}${data.reference ? ` - Ref: ${data.reference}` : ''}`,
    descriptionAr: `سداد ضريبي - ${data.period}${data.reference ? ` - مرجع: ${data.reference}` : ''}`,
    lines: [
      { accountCode: vatDueCode, debit: data.amount, credit: 0 },
      { accountCode: bankCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'VAT_PAYMENT',
    sourceId: `VTP-${data.period}`,
  }, tx)
}

// ============ TRIAL BALANCE ============

export async function getTrialBalance(dateFrom?: Date, dateTo?: Date) {
  const dateFilter: { date?: { gte?: Date; lte?: Date } } = {}
  if (dateFrom || dateTo) {
    dateFilter.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    }
  }
  const entries = await db.journalEntry.findMany({
    where: {
      status: 'POSTED',
      deletedAt: null,
      ...dateFilter,
    },
    include: {
      lines: {
        where: { deletedAt: null },
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
      bal.totalDebit += toNumber(line.debit)
      bal.totalCredit += toNumber(line.credit)
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

// ============ SALARY ACCOUNT HELPER ============

/**
 * Get the salary expense account code based on activity type
 * PROJECT: Salaries & Wages (8110)
 * RENTAL: Equipment Operation Costs (7210)
 * ADMIN: Salaries & Wages (8110)
 */
export async function getSalaryAccountCode(activity: 'PROJECT' | 'RENTAL' | 'ADMIN', tx?: PrismaTransaction): Promise<string> {
  switch (activity) {
    case 'RENTAL':
      return await getAccountCodeByRole(AccountRole.DRIVER_EXPENSE, tx) || '7210'
    case 'PROJECT':
      return await getAccountCodeByRole(AccountRole.PROJECT_COST, tx) || '7120'
    case 'ADMIN':
    default:
      return await getAccountCodeByRole(AccountRole.PAYROLL_EXPENSE, tx) || '8110'
  }
}

// ============ ACCOUNT BALANCE HELPERS ============

export async function getAccountBalance(accountCode: string): Promise<number> {
  const account = await getAccountByCode(accountCode)
  if (!account) return 0

  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      deletedAt: null,
      journalEntry: { status: 'POSTED', deletedAt: null },
    },
  })

  const totalDebit = lines.reduce((sum, l) => sum + toNumber(l.debit), 0)
  const totalCredit = lines.reduce((sum, l) => sum + toNumber(l.credit), 0)

  const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'

  return normalBalance === 'DEBIT'
    ? totalDebit - totalCredit
    : totalCredit - totalDebit
}

// ============ SUBCONTRACTOR CASH-FLOW AUTO ENTRIES ============
// Added in Phase 2 Cycle 1 to fix P2-CRIT-002: subcontractor advances, payments,
// and retentions were creating DB records without journal entries — the GL was
// blind to all subcontractor cash flows. Now every subcontractor financial
// operation creates a proper double-entry posting through the guard.

/**
 * سلفة مقاول باطن - Subcontractor Advance
 * Dr: SUBCONTRACTOR_ADVANCE (1230)  — asset (advance is recoverable)
 * Cr: CASH (1110) or BANK
 *
 * The advance is recovered later via autoEntrySubcontractorPayment (offset)
 * or via a dedicated recovery endpoint.
 */
export async function autoEntrySubcontractorAdvance(data: {
  advanceNo: string
  subcontractorName: string
  amount: number
  date: Date
  paymentMethod?: 'CASH' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const advanceCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_ADVANCE, tx) || '1230'
  const cashCode = data.paymentMethod === 'BANK'
    ? (await getAccountCodeByRole(AccountRole.BANK, tx) || '1120')
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    entryNo: `JE-SCA-${Date.now()}`,
    date: data.date,
    description: `Subcontractor Advance ${data.advanceNo} - ${data.subcontractorName}`,
    descriptionAr: `سلفة مقاول باطن ${data.advanceNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: advanceCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: cashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUBCONTRACTOR_ADVANCE',
    sourceId: data.advanceNo,
  }, tx)
}

/**
 * سداد لمقاول باطن - Subcontractor Payment
 * Dr: SUBCONTRACTOR_AP (3220)  — settles the payable accrued at invoice
 * Cr: CASH (1110) or BANK
 *
 * If the payment includes a retention withholding portion, the caller should
 * also invoke autoEntrySubcontractorRetention to accrue the retained amount
 * as a liability (Cr SUBCONTRACTOR_RETENTION_PAYABLE / Dr SUBCONTRACTOR_AP).
 */
export async function autoEntrySubcontractorPayment(data: {
  paymentNo: string
  subcontractorName: string
  amount: number
  date: Date
  paymentMethod?: 'CASH' | 'BANK'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const apCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, tx) || '3220'
  const cashCode = data.paymentMethod === 'BANK'
    ? (await getAccountCodeByRole(AccountRole.BANK, tx) || '1120')
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    entryNo: `JE-SCP-${Date.now()}`,
    date: data.date,
    description: `Subcontractor Payment ${data.paymentNo} - ${data.subcontractorName}`,
    descriptionAr: `سداد لمقاول باطن ${data.paymentNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: apCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: cashCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUBCONTRACTOR_PAYMENT',
    sourceId: data.paymentNo,
  }, tx)
}

/**
 * احتجاز ضمان مقاول باطن - Subcontractor Retention
 * Dr: SUBCONTRACTOR_AP (3220)        — reduces the AP (cash not paid)
 * Cr: SUBCONTRACTOR_RETENTION_PAYABLE (3500)  — liability until released
 *
 * Called either at invoice time (accrue retention) or at payment time
 * (withhold retention from cash payment).
 */
export async function autoEntrySubcontractorRetention(data: {
  retentionNo: string
  subcontractorName: string
  withheldAmount: number
  date: Date
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const apCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_AP, tx) || '3220'
  const retentionCode = await getAccountCodeByRole(AccountRole.SUBCONTRACTOR_RETENTION_PAYABLE, tx) || '3500'

  return createJournalEntry({
    entryNo: `JE-SRT-${Date.now()}`,
    date: data.date,
    description: `Subcontractor Retention ${data.retentionNo} - ${data.subcontractorName}`,
    descriptionAr: `احتجاز ضمان مقاول باطن ${data.retentionNo} - ${data.subcontractorName}`,
    lines: [
      { accountCode: apCode, debit: data.withheldAmount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: retentionCode, debit: 0, credit: data.withheldAmount },
    ],
    sourceType: 'SUBCONTRACTOR_RETENTION',
    sourceId: data.retentionNo,
  }, tx)
}

/**
 * تكلفة يدوية على مشروع - Manual Cost Entry
 * Dr: PROJECT_COST (7110)  — or costType-specific role
 * Cr: CASH (1110) / AP (3210) based on payFrom
 *
 * Used for manual project cost entries that aren't from a source document
 * (e.g., overhead allocation, journal correction to project cost).
 */
export async function autoEntryManualCost(data: {
  description: string
  amount: number
  date: Date
  costType?: string
  payFrom?: 'CASH' | 'AP'
  costCenterId?: string
}, tx?: PrismaTransaction) {
  const costCode = await getAccountCodeByRole(AccountRole.PROJECT_COST, tx) || '7110'
  const creditCode = data.payFrom === 'AP'
    ? (await getAccountCodeByRole(AccountRole.SUPPLIER_AP, tx) || '3210')
    : (await resolvePaymentAccountCode('TREASURY', tx))

  return createJournalEntry({
    entryNo: `JE-MCE-${Date.now()}`,
    date: data.date,
    description: `Manual Cost Entry - ${data.description}`,
    descriptionAr: `قيد تكلفة يدوية - ${data.description}`,
    lines: [
      { accountCode: costCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'MANUAL_COST',
    sourceId: `MCE-${Date.now()}`,
  }, tx)
}

/**
 * تكلفة العمالة المباشرة - Direct Labor Cost
 * P4-CRIT-005 FIX: previously LaborCost had NO journal entry — GL was blind to all
 * project labor costs. Now creates:
 *   Dr LABOR_COST (7110) — with costCenterId from Project.costCenter
 *   Cr CASH/BANK (1110/1120) — account chosen by the user (المستخدم سيد النظام)
 * If a specific employee is linked AND paid via salary accrual, this is a direct cash
 * payment (e.g. daily laborers) which is distinct from monthly salaries.
 *
 * User-empowering override: data.paymentAccountCode lets the user pick the credit account.
 * Falls back to role-based TREASURY (cash) if not provided.
 */
export async function autoEntryLaborCost(data: {
  description: string
  amount: number
  date: Date
  costCenterId?: string
  /** 'BANK' | 'CASH' — إذا لم تُحدد، تُستخدم النقدية */
  paymentSource?: 'BANK' | 'CASH'
  /** كود الحساب الدائن الفعلي (اختياري — يحترم اختيار المستخدم) */
  paymentAccountCode?: string
}, tx?: PrismaTransaction) {
  const laborCode = await getAccountCodeByRole(AccountRole.LABOR_COST, tx) || '7110'
  // احترم اختيار المستخدم: استخدم paymentAccountCode إن وُجد، وإلا احلل من paymentSource
  let creditCode: string
  if (data.paymentAccountCode) {
    creditCode = data.paymentAccountCode
  } else if (data.paymentSource === 'BANK') {
    creditCode = await resolvePaymentAccountCode('BANK', tx)
  } else {
    creditCode = await resolvePaymentAccountCode('TREASURY', tx)
  }

  return createJournalEntry({
    entryNo: `JE-LC-${Date.now()}`,
    date: data.date,
    description: `Labor Cost - ${data.description}`,
    descriptionAr: `تكلفة عمالة - ${data.description}`,
    lines: [
      { accountCode: laborCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: creditCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'LABOR_COST',
    sourceId: `LC-${Date.now()}`,
  }, tx)
}

// ============ GENERAL LEDGER ============

export async function getGeneralLedger(accountCode: string, dateFrom?: Date, dateTo?: Date) {
  const account = await getAccountByCode(accountCode)
  if (!account) return []

  const glDateFilter: { date?: { gte?: Date; lte?: Date } } = {}
  if (dateFrom || dateTo) {
    glDateFilter.date = {
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
    }
  }
  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        ...glDateFilter,
      },
    },
    include: { journalEntry: true },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  let runningBalance = 0
  const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'

  return lines.map(line => {
    const debit = toNumber(line.debit)
    const credit = toNumber(line.credit)
    if (normalBalance === 'DEBIT') {
      runningBalance += debit - credit
    } else {
      runningBalance += credit - debit
    }

    return {
      date: line.journalEntry.date,
      entryNo: line.journalEntry.entryNo,
      description: line.journalEntry.description,
      debit,
      credit,
      balance: runningBalance,
    }
  })
}
