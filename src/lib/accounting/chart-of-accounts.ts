// ============================================================================
// نظام بِنَاء ERP - قالب دليل الحسابات الموحّد
// Binaa ERP - Unified Chart of Accounts Template
// ============================================================================
//
// المصدر الوحيد لقالب دليل الحسابات (SOCPA standards for construction &
// equipment rental companies). يُستخدم فقط في:
//   - seed/initialize route (initial database seeding)
//   - accounts/initialize route (manual re-sync)
//
// لا يجوز استيراد هذا القالب في مسارات القراءة (queries) — القراءة تتم من
// جدول Account مباشرةً، وليس من القالب.
// ============================================================================

import type { AccountTemplate } from './constants'

export const CHART_OF_ACCOUNTS_TEMPLATE: AccountTemplate[] = [
  // ============================================================================
  // الأصول المتداولة - Current Assets (1xxx)
  // ============================================================================
  { code: '1000', name: 'Current Assets', nameAr: 'الأصول المتداولة', type: 'ASSET', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '1100', name: 'Cash & Cash Equivalents', nameAr: 'النقد وما في حكمه', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1110', name: 'Cash - Treasury', nameAr: 'الصندوق (الخزينة)', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'CASH' },
      { code: '1120', name: 'Bank Accounts', nameAr: 'البنوك', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'BANK' },
      { code: '1130', name: 'Petty Cash', nameAr: 'الصندوق النقدي', type: 'ASSET', parentId: '1100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'PETTY_CASH' },
    { code: '1200', name: 'Receivables', nameAr: 'الذمم المدينة', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1210', name: 'Clients Receivable', nameAr: 'عملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'CUSTOMER_AR' },
      { code: '1220', name: 'Retention Receivable', nameAr: 'مبالغ محتجزة لدى العملاء', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'RETENTION_RECEIVABLE' },
      { code: '1230', name: 'Advances to Employees', nameAr: 'سلف الموظفين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'EMPLOYEE_ADVANCE' },
      { code: '1240', name: 'Advances to Suppliers', nameAr: 'مقدمات للموردين', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'SUBCONTRACTOR_ADVANCE' },
      { code: '1250', name: 'Other Receivables', nameAr: 'ذمم مدينة أخرى', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '1260', name: 'Tax Refund Receivable', nameAr: 'ضرائب مستحقة الاسترداد', type: 'ASSET', parentId: '1200', allowPosting: true, level: 2, activityType: 'BOTH' },
    { code: '1300', name: 'Inventory', nameAr: 'المخزون', type: 'ASSET', parentId: '1000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '1310', name: 'Raw Materials', nameAr: 'مواد خام', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION' },
      { code: '1320', name: 'Work in Progress', nameAr: 'أعمال تحت التنفيذ', type: 'ASSET', parentId: '1300', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'PROJECT_WIP' },
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
      { code: '1610', name: 'Construction Contract Assets', nameAr: 'أصول عقود المشاريع', type: 'ASSET', parentId: '1600', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'CONTRACT_ASSET' },
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
      { code: '3140', name: 'VAT Settlement Account', nameAr: 'حساب تسوية ضريبة القيمة المضافة', type: 'LIABILITY', parentId: '3100', allowPosting: true, isSystem: true, level: 2, activityType: 'BOTH', accountRole: 'VAT_SETTLEMENT' },
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
    { code: '3500', name: 'Retention Payable', nameAr: 'مبالغ محتجزة لدى الشركة', type: 'LIABILITY', parentId: '3000', allowPosting: true, level: 1, activityType: 'CONSTRUCTION', accountRole: 'SUBCONTRACTOR_RETENTION_PAYABLE' },
    { code: '3600', name: 'Contract Liabilities', nameAr: 'التزامات العقود', type: 'LIABILITY', parentId: '3000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '3610', name: 'Construction Contract Liabilities', nameAr: 'التزامات عقود المشاريع', type: 'LIABILITY', parentId: '3600', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'CONTRACT_LIABILITY' },
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
    { code: '5200', name: 'Retained Earnings', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', parentId: '5000', allowPosting: true, isSystem: true, level: 1, activityType: 'BOTH', accountRole: 'RETAINED_EARNINGS' },
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
      { code: '6130', name: 'Claims Revenue', nameAr: 'إيرادات المطالبات', type: 'REVENUE', parentId: '6100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'UNBILLED_REVENUE' },
    { code: '6200', name: 'Rental Revenue', nameAr: 'إيرادات التأجير', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6210', name: 'Equipment Rental Revenue', nameAr: 'إيرادات تأجير المعدات', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
      { code: '6220', name: 'Delivery Fees Revenue', nameAr: 'إيرادات نقل وتوصيل', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
      { code: '6230', name: 'Equipment Operation Revenue', nameAr: 'إيرادات تشغيل المعدات للغير', type: 'REVENUE', parentId: '6200', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL', accountRole: 'RENTAL_REVENUE' },
    { code: '6300', name: 'Other Revenue', nameAr: 'إيرادات أخرى', type: 'REVENUE', parentId: '6000', allowPosting: false, level: 1, activityType: 'BOTH' },
      { code: '6310', name: 'Sale of Used Equipment', nameAr: 'إيرادات بيع معدات مستعملة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'EQUIPMENT_RENTAL' },
      { code: '6320', name: 'Penalties Revenue', nameAr: 'إيرادات غرامات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'DELAY_PENALTY_REVENUE' },
      { code: '6330', name: 'Discounts Received', nameAr: 'خصومات مكتسبة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6340', name: 'Service Revenue', nameAr: 'إيرادات خدمات', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'SERVICE_REVENUE' },
      { code: '6350', name: 'Other Miscellaneous Revenue', nameAr: 'إيرادات أخرى متنوعة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH' },
      { code: '6360', name: 'Foreign Exchange Gain', nameAr: 'أرباح فروقات عملة', type: 'REVENUE', parentId: '6300', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'FX_GAIN' },

  // ============================================================================
  // التكاليف المباشرة - Direct Costs (7xxx)
  // ============================================================================
  { code: '7000', name: 'Direct Costs', nameAr: 'التكاليف المباشرة', type: 'EXPENSE', allowPosting: false, isSystem: true, level: 0, activityType: 'BOTH' },
    { code: '7100', name: 'Cost of Contracts', nameAr: 'تكلفة العقود', type: 'EXPENSE', parentId: '7000', allowPosting: false, level: 1, activityType: 'CONSTRUCTION' },
      { code: '7110', name: 'Material Costs', nameAr: 'تكاليف المواد', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'PROJECT_COST' },
      { code: '7120', name: 'Labor Costs', nameAr: 'تكاليف العمالة', type: 'EXPENSE', parentId: '7100', allowPosting: true, level: 2, activityType: 'CONSTRUCTION', accountRole: 'LABOR_COST' },
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
      { code: '8160', name: 'Professional Fees', nameAr: 'أتعاب مهنية', type: 'EXPENSE', parentId: '8100', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'ADMIN_EXPENSE' },
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
      { code: '8640', name: 'Foreign Exchange Loss', nameAr: 'خسائر فروقات عملة', type: 'EXPENSE', parentId: '8600', allowPosting: true, level: 2, activityType: 'BOTH', accountRole: 'FX_LOSS' },
]

