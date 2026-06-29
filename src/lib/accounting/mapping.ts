// ============================================================================
// طبقة ربط العمليات المحاسبية - Accounting Mapping Layer
// نظام بِنَاء ERP - Binaa Construction ERP
//
// This layer maps every business operation type to its corresponding
// chart of accounts codes. It is the single source of truth for
// "which accounts are affected by which operation".
//
// القاعدة الذهبية: لا توجد عملية بدون أثر محاسبي
// Golden Rule: No operation without accounting impact
// ============================================================================


// ============ OPERATION TYPE DEFINITIONS ============

export enum OperationType {
  // --- Construction Hub ---
  PROJECT_INVOICE = 'PROJECT_INVOICE',           // فاتورة مشروع
  PROGRESS_CLAIM = 'PROGRESS_CLAIM',              // مستخلص
  RETENTION = 'RETENTION',                         // احتجاز
  CONTRACT_ADVANCE = 'CONTRACT_ADVANCE',           // دفعة مقدمة عقد

  // --- Rental Hub ---
  RENTAL_INVOICE = 'RENTAL_INVOICE',              // فاتورة تأجير
  DELIVERY_FEES = 'DELIVERY_FEES',                // إيرادات نقل

  // --- Sales ---
  SALES_INVOICE = 'SALES_INVOICE',                // فاتورة مبيعات

  // --- Purchases ---
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',          // فاتورة مشتريات
  SUBCONTRACTOR_INVOICE = 'SUBCONTRACTOR_INVOICE', // فاتورة مقاول باطن

  // --- Payments ---
  CLIENT_PAYMENT = 'CLIENT_PAYMENT',              // تحصيل عميل
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',          // سداد مورد

  // --- Expenses ---
  EXPENSE = 'EXPENSE',                            // مصروف
  PETTY_CASH = 'PETTY_CASH',                      // صندوق نقدي
  EQUIPMENT_COST = 'EQUIPMENT_COST',              // تكلفة معدة

  // --- HR ---
  SALARY_ACCRUAL = 'SALARY_ACCRUAL',              // استحقاق رواتب
  SALARY_PAYMENT = 'SALARY_PAYMENT',              // صرف رواتب
  GOSI = 'GOSI',                                  // تأمينات اجتماعية
  EMPLOYEE_ADVANCE = 'EMPLOYEE_ADVANCE',          // سلفة موظف
  ADVANCE_SETTLEMENT = 'ADVANCE_SETTLEMENT',       // تسوية سلفة
  END_OF_SERVICE = 'END_OF_SERVICE',              // مستحقات نهاية خدمة

  // --- Assets ---
  DEPRECIATION = 'DEPRECIATION',                  // إهلاك
  RENTAL_DEPRECIATION = 'RENTAL_DEPRECIATION',    // إهلاك معدات تأجير
  ASSET_DISPOSAL = 'ASSET_DISPOSAL',              // تصرف في أصل

  // --- Tax ---
  VAT_DECLARATION = 'VAT_DECLARATION',            // إقرار ضريبي
  VAT_PAYMENT = 'VAT_PAYMENT',                    // سداد ضريبة
  ZAKAT = 'ZAKAT',                                // زكاة
}

// ============ ACCOUNT MAPPING INTERFACE ============

export interface AccountMapping {
  /** Operation type */
  operationType: OperationType
  /** Arabic label for the operation */
  labelAr: string
  /** English label for the operation */
  labelEn: string
  /** Activity type this operation belongs to */
  activityType: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH' | 'ADMIN'
  /** Accounts affected by this operation */
  accounts: AccountMappingEntry[]
  /** Human-readable description of the journal entry pattern (Arabic) */
  entryPatternAr: string
  /** Human-readable description of the journal entry pattern (English) */
  entryPatternEn: string
}

export interface AccountMappingEntry {
  /** Account code in the chart of accounts */
  accountCode: string
  /** Arabic name of the account */
  accountNameAr: string
  /** English name of the account */
  accountNameEn: string
  /** Whether this account is typically debited */
  side: 'DEBIT' | 'CREDIT'
  /** What this account represents in this operation */
  role: string // e.g., 'receivable', 'revenue', 'vat', 'cash', 'payable', 'cost'
  /** Whether this is a variable account (depends on sub-type or user selection) */
  isVariable?: boolean
  /** Description of when this account varies */
  variableNote?: string
}

// ============ COMPLETE ACCOUNT MAPPINGS ============

export const ACCOUNT_MAPPINGS: Record<OperationType, AccountMapping> = {
  // ========== CONSTRUCTION HUB ==========

  [OperationType.PROGRESS_CLAIM]: {
    operationType: OperationType.PROGRESS_CLAIM,
    labelAr: 'مستخلص مشروع',
    labelEn: 'Progress Claim',
    activityType: 'CONSTRUCTION',
    accounts: [
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'DEBIT', role: 'receivable' },
      { accountCode: '6110', accountNameAr: 'إيرادات المشاريع', accountNameEn: 'Construction Revenue', side: 'CREDIT', role: 'revenue' },
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'CREDIT', role: 'vat' },
    ],
    entryPatternAr: 'مدين: عملاء | دائن: إيرادات المشاريع + ضريبة المخرجات',
    entryPatternEn: 'Dr: Clients Receivable | Cr: Construction Revenue + Output VAT',
  },

  [OperationType.RETENTION]: {
    operationType: OperationType.RETENTION,
    labelAr: 'احتجاز',
    labelEn: 'Retention',
    activityType: 'CONSTRUCTION',
    accounts: [
      { accountCode: '1220', accountNameAr: 'مبالغ محتجزة', accountNameEn: 'Retention Receivable', side: 'DEBIT', role: 'retention' },
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'CREDIT', role: 'receivable' },
    ],
    entryPatternAr: 'مدين: مبالغ محتجزة | دائن: عملاء',
    entryPatternEn: 'Dr: Retention Receivable | Cr: Clients Receivable',
  },

  [OperationType.CONTRACT_ADVANCE]: {
    operationType: OperationType.CONTRACT_ADVANCE,
    labelAr: 'دفعة مقدمة عقد',
    labelEn: 'Contract Advance',
    activityType: 'CONSTRUCTION',
    accounts: [
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'DEBIT', role: 'cash', isVariable: true, variableNote: 'يمكن أن يكون بنك (1120)' },
      { accountCode: '3410', accountNameAr: 'دفعات مقدمة من العملاء', accountNameEn: 'Customer Advances', side: 'CREDIT', role: 'advance' },
    ],
    entryPatternAr: 'مدين: الصندوق/البنك | دائن: دفعات مقدمة من العملاء',
    entryPatternEn: 'Dr: Cash/Bank | Cr: Customer Advances',
  },

  [OperationType.PROJECT_INVOICE]: {
    operationType: OperationType.PROJECT_INVOICE,
    labelAr: 'فاتورة مشروع',
    labelEn: 'Project Invoice',
    activityType: 'CONSTRUCTION',
    accounts: [
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'DEBIT', role: 'receivable' },
      { accountCode: '6110', accountNameAr: 'إيرادات المشاريع', accountNameEn: 'Construction Revenue', side: 'CREDIT', role: 'revenue' },
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'CREDIT', role: 'vat' },
    ],
    entryPatternAr: 'مدين: عملاء | دائن: إيرادات المشاريع + ضريبة المخرجات',
    entryPatternEn: 'Dr: Clients Receivable | Cr: Construction Revenue + Output VAT',
  },

  // ========== RENTAL HUB ==========

  [OperationType.RENTAL_INVOICE]: {
    operationType: OperationType.RENTAL_INVOICE,
    labelAr: 'فاتورة تأجير معدات',
    labelEn: 'Rental Invoice',
    activityType: 'EQUIPMENT_RENTAL',
    accounts: [
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'DEBIT', role: 'receivable' },
      { accountCode: '6210', accountNameAr: 'إيرادات التأجير', accountNameEn: 'Rental Revenue', side: 'CREDIT', role: 'revenue' },
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'CREDIT', role: 'vat' },
    ],
    entryPatternAr: 'مدين: عملاء | دائن: إيرادات التأجير + ضريبة المخرجات',
    entryPatternEn: 'Dr: Clients Receivable | Cr: Rental Revenue + Output VAT',
  },

  [OperationType.DELIVERY_FEES]: {
    operationType: OperationType.DELIVERY_FEES,
    labelAr: 'إيرادات نقل وتوصيل',
    labelEn: 'Delivery Fees Revenue',
    activityType: 'EQUIPMENT_RENTAL',
    accounts: [
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'DEBIT', role: 'receivable' },
      { accountCode: '6220', accountNameAr: 'إيرادات النقل', accountNameEn: 'Delivery Fees Revenue', side: 'CREDIT', role: 'revenue' },
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'CREDIT', role: 'vat' },
    ],
    entryPatternAr: 'مدين: عملاء | دائن: إيرادات النقل + ضريبة المخرجات',
    entryPatternEn: 'Dr: Clients Receivable | Cr: Delivery Fees Revenue + Output VAT',
  },

  // ========== SALES ==========

  [OperationType.SALES_INVOICE]: {
    operationType: OperationType.SALES_INVOICE,
    labelAr: 'فاتورة مبيعات',
    labelEn: 'Sales Invoice',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'DEBIT', role: 'receivable' },
      { accountCode: '6110', accountNameAr: 'إيرادات المشاريع', accountNameEn: 'Construction Revenue', side: 'CREDIT', role: 'revenue', isVariable: true, variableNote: 'تأجير=6210، خدمات=6340' },
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'CREDIT', role: 'vat' },
    ],
    entryPatternAr: 'مدين: عملاء | دائن: حساب الإيراد + ضريبة المخرجات',
    entryPatternEn: 'Dr: Clients Receivable | Cr: Revenue Account + Output VAT',
  },

  // ========== PURCHASES ==========

  [OperationType.PURCHASE_INVOICE]: {
    operationType: OperationType.PURCHASE_INVOICE,
    labelAr: 'فاتورة مشتريات',
    labelEn: 'Purchase Invoice',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '7110', accountNameAr: 'تكاليف المشاريع', accountNameEn: 'Project Costs', side: 'DEBIT', role: 'cost', isVariable: true, variableNote: 'يعتمد على فئة المشتريات: 7110/7210/7220/7230/8120/8140...' },
      { accountCode: '3120', accountNameAr: 'ضريبة المدخلات', accountNameEn: 'Input VAT', side: 'DEBIT', role: 'vat' },
      { accountCode: '3210', accountNameAr: 'الموردون', accountNameEn: 'Suppliers Payable', side: 'CREDIT', role: 'payable' },
    ],
    entryPatternAr: 'مدين: حساب التكلفة + ضريبة المدخلات | دائن: الموردون',
    entryPatternEn: 'Dr: Cost Account + Input VAT | Cr: Suppliers Payable',
  },

  [OperationType.SUBCONTRACTOR_INVOICE]: {
    operationType: OperationType.SUBCONTRACTOR_INVOICE,
    labelAr: 'فاتورة مقاول باطن',
    labelEn: 'Subcontractor Invoice',
    activityType: 'CONSTRUCTION',
    accounts: [
      { accountCode: '7130', accountNameAr: 'تكاليف مقاولي الباطن', accountNameEn: 'Subcontractor Costs', side: 'DEBIT', role: 'cost' },
      { accountCode: '3120', accountNameAr: 'ضريبة المدخلات', accountNameEn: 'Input VAT', side: 'DEBIT', role: 'vat' },
      { accountCode: '3220', accountNameAr: 'مقاولو الباطن', accountNameEn: 'Subcontractors Payable', side: 'CREDIT', role: 'payable' },
    ],
    entryPatternAr: 'مدين: تكاليف مقاولي الباطن + ضريبة المدخلات | دائن: مقاولو الباطن',
    entryPatternEn: 'Dr: Subcontractor Costs + Input VAT | Cr: Subcontractors Payable',
  },

  // ========== PAYMENTS ==========

  [OperationType.CLIENT_PAYMENT]: {
    operationType: OperationType.CLIENT_PAYMENT,
    labelAr: 'تحصيل عميل',
    labelEn: 'Client Payment',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'DEBIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120' },
      { accountCode: '1210', accountNameAr: 'عملاء', accountNameEn: 'Clients Receivable', side: 'CREDIT', role: 'receivable' },
    ],
    entryPatternAr: 'مدين: الصندوق/البنك | دائن: عملاء',
    entryPatternEn: 'Dr: Cash/Bank | Cr: Clients Receivable',
  },

  [OperationType.SUPPLIER_PAYMENT]: {
    operationType: OperationType.SUPPLIER_PAYMENT,
    labelAr: 'سداد مورد',
    labelEn: 'Supplier Payment',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '3210', accountNameAr: 'الموردون', accountNameEn: 'Suppliers Payable', side: 'DEBIT', role: 'payable' },
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'CREDIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120' },
    ],
    entryPatternAr: 'مدين: الموردون | دائن: الصندوق/البنك',
    entryPatternEn: 'Dr: Suppliers Payable | Cr: Cash/Bank',
  },

  // ========== EXPENSES ==========

  [OperationType.EXPENSE]: {
    operationType: OperationType.EXPENSE,
    labelAr: 'مصروف',
    labelEn: 'Expense',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '8630', accountNameAr: 'مصروفات أخرى', accountNameEn: 'Other Expenses', side: 'DEBIT', role: 'cost', isVariable: true, variableNote: 'يعتمد على نوع المصروف: 7210 وقود/7220 صيانة/8160 أتعاب مهنية/8170 أتعاب قانونية/8630 أخرى' },
      { accountCode: '3120', accountNameAr: 'ضريبة المدخلات', accountNameEn: 'Input VAT', side: 'DEBIT', role: 'vat' },
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'CREDIT', role: 'cash', isVariable: true, variableNote: 'سداد آجل=3210، بنك=1120، صندوق نقدي=1130' },
    ],
    entryPatternAr: 'مدين: حساب المصروف + ضريبة المدخلات | دائن: الصندوق/البنك/الموردون',
    entryPatternEn: 'Dr: Expense Account + Input VAT | Cr: Cash/Bank/Suppliers',
  },

  [OperationType.PETTY_CASH]: {
    operationType: OperationType.PETTY_CASH,
    labelAr: 'صندوق نقدي',
    labelEn: 'Petty Cash',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '8630', accountNameAr: 'مصروفات أخرى', accountNameEn: 'Other Expenses', side: 'DEBIT', role: 'cost', isVariable: true, variableNote: 'يعتمد على فئة المصروف' },
      { accountCode: '1130', accountNameAr: 'الصندوق النقدي', accountNameEn: 'Petty Cash', side: 'CREDIT', role: 'cash' },
    ],
    entryPatternAr: 'مدين: حساب المصروف | دائن: الصندوق النقدي',
    entryPatternEn: 'Dr: Expense Account | Cr: Petty Cash',
  },

  [OperationType.EQUIPMENT_COST]: {
    operationType: OperationType.EQUIPMENT_COST,
    labelAr: 'تكلفة معدة',
    labelEn: 'Equipment Cost',
    activityType: 'EQUIPMENT_RENTAL',
    accounts: [
      { accountCode: '7210', accountNameAr: 'تكاليف التأجير', accountNameEn: 'Rental Costs', side: 'DEBIT', role: 'cost', isVariable: true, variableNote: 'صيانة=7220، وقود=7230، نقل=7240، إهلاك=7250' },
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'CREDIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120، موردون=3210' },
    ],
    entryPatternAr: 'مدين: حساب التكلفة | دائن: الصندوق/البنك/الموردون',
    entryPatternEn: 'Dr: Cost Account | Cr: Cash/Bank/Suppliers',
  },

  // ========== HR ==========

  [OperationType.SALARY_ACCRUAL]: {
    operationType: OperationType.SALARY_ACCRUAL,
    labelAr: 'استحقاق رواتب',
    labelEn: 'Salary Accrual',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '8110', accountNameAr: 'الرواتب', accountNameEn: 'Salaries Expense', side: 'DEBIT', role: 'cost', isVariable: true, variableNote: 'مشروع=8110، تأجير=8110' },
      { accountCode: '8210', accountNameAr: 'تأمينات اجتماعية', accountNameEn: 'GOSI Expense', side: 'DEBIT', role: 'gosi' },
      { accountCode: '3310', accountNameAr: 'رواتب مستحقة', accountNameEn: 'Salaries Payable', side: 'CREDIT', role: 'payable' },
      { accountCode: '3830', accountNameAr: 'تأمينات مستحقة', accountNameEn: 'GOSI Payable', side: 'CREDIT', role: 'gosi_payable' },
    ],
    entryPatternAr: 'مدين: الرواتب + تأمينات | دائن: رواتب مستحقة + تأمينات مستحقة',
    entryPatternEn: 'Dr: Salaries + GOSI | Cr: Salaries Payable + GOSI Payable',
  },

  [OperationType.SALARY_PAYMENT]: {
    operationType: OperationType.SALARY_PAYMENT,
    labelAr: 'صرف رواتب',
    labelEn: 'Salary Payment',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '3310', accountNameAr: 'رواتب مستحقة', accountNameEn: 'Salaries Payable', side: 'DEBIT', role: 'payable' },
      { accountCode: '3830', accountNameAr: 'تأمينات مستحقة', accountNameEn: 'GOSI Payable', side: 'DEBIT', role: 'gosi_payable' },
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'CREDIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120' },
    ],
    entryPatternAr: 'مدين: رواتب مستحقة + تأمينات مستحقة | دائن: الصندوق/البنك',
    entryPatternEn: 'Dr: Salaries Payable + GOSI Payable | Cr: Cash/Bank',
  },

  [OperationType.GOSI]: {
    operationType: OperationType.GOSI,
    labelAr: 'تأمينات اجتماعية',
    labelEn: 'GOSI',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '8210', accountNameAr: 'تأمينات اجتماعية', accountNameEn: 'GOSI Expense', side: 'DEBIT', role: 'gosi' },
      { accountCode: '3830', accountNameAr: 'تأمينات مستحقة', accountNameEn: 'GOSI Payable', side: 'CREDIT', role: 'gosi_payable' },
    ],
    entryPatternAr: 'مدين: تأمينات اجتماعية | دائن: تأمينات مستحقة',
    entryPatternEn: 'Dr: GOSI Expense | Cr: GOSI Payable',
  },

  [OperationType.EMPLOYEE_ADVANCE]: {
    operationType: OperationType.EMPLOYEE_ADVANCE,
    labelAr: 'سلفة موظف',
    labelEn: 'Employee Advance',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '1230', accountNameAr: 'سلف الموظفين', accountNameEn: 'Advances to Employees', side: 'DEBIT', role: 'advance' },
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'CREDIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120' },
    ],
    entryPatternAr: 'مدين: سلف الموظفين | دائن: الصندوق/البنك',
    entryPatternEn: 'Dr: Advances to Employees | Cr: Cash/Bank',
  },

  [OperationType.ADVANCE_SETTLEMENT]: {
    operationType: OperationType.ADVANCE_SETTLEMENT,
    labelAr: 'تسوية سلفة',
    labelEn: 'Advance Settlement',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '8110', accountNameAr: 'الرواتب', accountNameEn: 'Salaries Expense', side: 'DEBIT', role: 'cost' },
      { accountCode: '1230', accountNameAr: 'سلف الموظفين', accountNameEn: 'Advances to Employees', side: 'CREDIT', role: 'advance' },
    ],
    entryPatternAr: 'مدين: الرواتب | دائن: سلف الموظفين',
    entryPatternEn: 'Dr: Salaries Expense | Cr: Advances to Employees',
  },

  [OperationType.END_OF_SERVICE]: {
    operationType: OperationType.END_OF_SERVICE,
    labelAr: 'مستحقات نهاية خدمة',
    labelEn: 'End of Service Provision',
    activityType: 'ADMIN',
    accounts: [
      { accountCode: '8110', accountNameAr: 'الرواتب', accountNameEn: 'Salaries Expense', side: 'DEBIT', role: 'cost' },
      { accountCode: '3710', accountNameAr: 'مخصص نهاية خدمة', accountNameEn: 'End of Service Provision', side: 'CREDIT', role: 'provision' },
    ],
    entryPatternAr: 'مدين: الرواتب | دائن: مخصص نهاية خدمة',
    entryPatternEn: 'Dr: Salaries Expense | Cr: End of Service Provision',
  },

  // ========== ASSETS ==========

  [OperationType.DEPRECIATION]: {
    operationType: OperationType.DEPRECIATION,
    labelAr: 'إهلاك أصول ثابتة',
    labelEn: 'Fixed Asset Depreciation',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '8310', accountNameAr: 'إهلاك معدات إنشاء', accountNameEn: 'Depreciation - Construction', side: 'DEBIT', role: 'depreciation', isVariable: true, variableNote: 'مركبات=8320، أثاث=8330، معدات تأجير=8340' },
      { accountCode: '2210', accountNameAr: 'مجمع إهلاك معدات إنشاء', accountNameEn: 'Accum. Depreciation - Construction', side: 'CREDIT', role: 'accum_depreciation', isVariable: true, variableNote: 'مركبات=2230، أثاث=2240، تأجير=2220' },
    ],
    entryPatternAr: 'مدين: مصروف الإهلاك | دائن: مجمع الإهلاك',
    entryPatternEn: 'Dr: Depreciation Expense | Cr: Accumulated Depreciation',
  },

  [OperationType.RENTAL_DEPRECIATION]: {
    operationType: OperationType.RENTAL_DEPRECIATION,
    labelAr: 'إهلاك معدات تأجير',
    labelEn: 'Rental Equipment Depreciation',
    activityType: 'EQUIPMENT_RENTAL',
    accounts: [
      { accountCode: '7250', accountNameAr: 'إهلاك معدات التأجير', accountNameEn: 'Rental Depreciation', side: 'DEBIT', role: 'depreciation' },
      { accountCode: '2220', accountNameAr: 'مجمع إهلاك معدات تأجير', accountNameEn: 'Accum. Depreciation - Rental', side: 'CREDIT', role: 'accum_depreciation' },
    ],
    entryPatternAr: 'مدين: إهلاك معدات التأجير | دائن: مجمع إهلاك معدات تأجير',
    entryPatternEn: 'Dr: Rental Depreciation | Cr: Accum. Depreciation - Rental',
  },

  [OperationType.ASSET_DISPOSAL]: {
    operationType: OperationType.ASSET_DISPOSAL,
    labelAr: 'تصرف في أصل',
    labelEn: 'Asset Disposal',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '1110', accountNameAr: 'الصندوق', accountNameEn: 'Cash - Treasury', side: 'DEBIT', role: 'cash', isVariable: true, variableNote: 'بنك=1120' },
      { accountCode: '2210', accountNameAr: 'مجمع الإهلاك', accountNameEn: 'Accumulated Depreciation', side: 'DEBIT', role: 'accum_depreciation', isVariable: true, variableNote: 'يعتمد على نوع الأصل' },
      { accountCode: '2110', accountNameAr: 'معدات الإنشاء', accountNameEn: 'Construction Equipment', side: 'CREDIT', role: 'asset', isVariable: true, variableNote: 'تأجير=2120، مركبات=2130' },
      { accountCode: '6310', accountNameAr: 'أرباح بيع أصول', accountNameEn: 'Gain on Sale', side: 'CREDIT', role: 'gain', isVariable: true, variableNote: 'خسارة=8610 دائن→مدين' },
    ],
    entryPatternAr: 'مدين: الصندوق + مجمع الإهلاك | دائن: الأصل + أرباح/خسائر التصرف',
    entryPatternEn: 'Dr: Cash + Accum. Depreciation | Cr: Asset + Gain/Loss on Disposal',
  },

  // ========== TAX ==========

  [OperationType.VAT_DECLARATION]: {
    operationType: OperationType.VAT_DECLARATION,
    labelAr: 'إقرار ضريبي',
    labelEn: 'VAT Declaration',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '3110', accountNameAr: 'ضريبة المخرجات', accountNameEn: 'Output VAT', side: 'DEBIT', role: 'output_vat' },
      { accountCode: '3120', accountNameAr: 'ضريبة المدخلات', accountNameEn: 'Input VAT', side: 'CREDIT', role: 'input_vat' },
      { accountCode: '3130', accountNameAr: 'ضريبة مستحقة الدفع', accountNameEn: 'VAT Due', side: 'CREDIT', role: 'vat_due', isVariable: true, variableNote: 'إذا كانت المدخلات أكثر=1410 مدين' },
    ],
    entryPatternAr: 'مدين: ضريبة المخرجات | دائن: ضريبة المدخلات + ضريبة مستحقة الدفع',
    entryPatternEn: 'Dr: Output VAT | Cr: Input VAT + VAT Due',
  },

  [OperationType.VAT_PAYMENT]: {
    operationType: OperationType.VAT_PAYMENT,
    labelAr: 'سداد ضريبة',
    labelEn: 'VAT Payment',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '3130', accountNameAr: 'ضريبة مستحقة الدفع', accountNameEn: 'VAT Due', side: 'DEBIT', role: 'vat_due' },
      { accountCode: '1120', accountNameAr: 'البنوك', accountNameEn: 'Bank Accounts', side: 'CREDIT', role: 'cash' },
    ],
    entryPatternAr: 'مدين: ضريبة مستحقة الدفع | دائن: البنوك',
    entryPatternEn: 'Dr: VAT Due | Cr: Bank Accounts',
  },

  [OperationType.ZAKAT]: {
    operationType: OperationType.ZAKAT,
    labelAr: 'زكاة',
    labelEn: 'Zakat',
    activityType: 'BOTH',
    accounts: [
      { accountCode: '8510', accountNameAr: 'مصروف الزكاة', accountNameEn: 'Zakat Expense', side: 'DEBIT', role: 'cost' },
      { accountCode: '3810', accountNameAr: 'زكاة مستحقة', accountNameEn: 'Zakat Payable', side: 'CREDIT', role: 'payable' },
    ],
    entryPatternAr: 'مدين: مصروف الزكاة | دائن: زكاة مستحقة',
    entryPatternEn: 'Dr: Zakat Expense | Cr: Zakat Payable',
  },
}

// ============ EXPENSE CATEGORY TO ACCOUNT MAPPING ============

export const EXPENSE_CATEGORY_ACCOUNT_MAP: Record<string, { code: string; nameAr: string; nameEn: string }> = {
  'CONSUMABLES': { code: '7110', nameAr: 'تكاليف المشاريع', nameEn: 'Project Costs' },
  'SERVICES': { code: '7130', nameAr: 'تكاليف مقاولي الباطن', nameEn: 'Subcontractor Costs' },
  'MAINTENANCE': { code: '7220', nameAr: 'صيانة المعدات', nameEn: 'Equipment Maintenance' },
  'FUEL': { code: '7230', nameAr: 'وقود', nameEn: 'Fuel' },
  'DRIVERS': { code: '7230', nameAr: 'سائقين', nameEn: 'Drivers' },
  'TRANSPORT': { code: '7240', nameAr: 'نقل', nameEn: 'Transport' },
  'DELIVERY': { code: '7240', nameAr: 'توصيل', nameEn: 'Delivery' },
  'RENT': { code: '8120', nameAr: 'إيجار', nameEn: 'Rent' },
  'OFFICE': { code: '8140', nameAr: 'مصروفات مكتبية', nameEn: 'Office Expenses' },
  'INTERNET': { code: '8130', nameAr: 'خدمات', nameEn: 'Utilities' },
  'ELECTRICITY': { code: '8130', nameAr: 'كهرباء', nameEn: 'Utilities' },
  'WATER': { code: '8130', nameAr: 'مياه', nameEn: 'Utilities' },
  'SALARIES': { code: '8110', nameAr: 'رواتب', nameEn: 'Salaries' },
  'INSURANCE': { code: '7400', nameAr: 'تأمين', nameEn: 'Insurance' },
  'PERMITS': { code: '7160', nameAr: 'تراخيص', nameEn: 'Permits' },
  'HOSPITALITY': { code: '8630', nameAr: 'ضيافة', nameEn: 'Hospitality' },
  'MANAGEMENT_CARS': { code: '8630', nameAr: 'سيارات إدارية', nameEn: 'Management Cars' },
  'PROFESSIONAL_FEES': { code: '8160', nameAr: 'أتعاب مهنية', nameEn: 'Professional Fees' },
  'LEGAL_FEES': { code: '8170', nameAr: 'أتعاب قانونية', nameEn: 'Legal Fees' },
  'OTHER': { code: '8630', nameAr: 'مصروفات أخرى', nameEn: 'Other Expenses' },
}

// ============ EQUIPMENT ACCOUNT MAPPING ============

export const EQUIPMENT_ACCOUNT_MAP = {
  ASSET: { code: '2120', nameAr: 'معدات التأجير', nameEn: 'Rental Equipment' },
  ACCUM_DEPRECIATION: { code: '2220', nameAr: 'مجمع إهلاك معدات تأجير', nameEn: 'Accum. Depreciation - Rental' },
  DEPRECIATION_EXPENSE: { code: '7250', nameAr: 'إهلاك معدات التأجير', nameEn: 'Rental Depreciation' },
  MAINTENANCE: { code: '7220', nameAr: 'صيانة المعدات', nameEn: 'Equipment Maintenance' },
  FUEL: { code: '7230', nameAr: 'وقود', nameEn: 'Fuel' },
  REVENUE: { code: '6210', nameAr: 'إيرادات التأجير', nameEn: 'Rental Revenue' },
  DELIVERY_REVENUE: { code: '6220', nameAr: 'إيرادات النقل', nameEn: 'Delivery Fees Revenue' },
} as const

// ============ CLIENT/SUPPLIER ACCOUNT MAPPING ============

export const CLIENT_ACCOUNT = { code: '1210', nameAr: 'عملاء', nameEn: 'Clients Receivable' }
export const SUPPLIER_ACCOUNT = { code: '3210', nameAr: 'الموردون', nameEn: 'Suppliers Payable' }
export const SUBCONTRACTOR_ACCOUNT = { code: '3220', nameAr: 'مقاولو الباطن', nameEn: 'Subcontractors Payable' }

// ============ PAYMENT METHOD TO ACCOUNT MAPPING ============

export const PAYMENT_METHOD_ACCOUNT_MAP: Record<string, { code: string; nameAr: string; nameEn: string }> = {
  'TREASURY': { code: '1110', nameAr: 'الصندوق (الخزينة)', nameEn: 'Cash - Treasury' },
  'BANK': { code: '1120', nameAr: 'البنوك', nameEn: 'Bank Accounts' },
  'PETTY_CASH': { code: '1130', nameAr: 'الصندوق النقدي', nameEn: 'Petty Cash' },
}

// ============ SALARY ACCOUNT MAPPING ============

export const SALARY_ACCOUNT_MAP = {
  SALARY_EXPENSE: { code: '8110', nameAr: 'الرواتب', nameEn: 'Salaries Expense' },
  GOSI_EXPENSE: { code: '8210', nameAr: 'تأمينات اجتماعية', nameEn: 'GOSI Expense' },
  SALARY_PAYABLE: { code: '3310', nameAr: 'رواتب مستحقة', nameEn: 'Salaries Payable' },
  GOSI_PAYABLE: { code: '3830', nameAr: 'تأمينات مستحقة', nameEn: 'GOSI Payable' },
  ADVANCES: { code: '1230', nameAr: 'سلف الموظفين', nameEn: 'Advances to Employees' },
  EOS_PROVISION: { code: '3710', nameAr: 'مخصص نهاية خدمة', nameEn: 'End of Service Provision' },
} as const

// ============ HELPER FUNCTIONS ============

/**
 * Get the account mapping for a given operation type
 */
export function getAccountMapping(operationType: OperationType): AccountMapping {
  return ACCOUNT_MAPPINGS[operationType]
}

/**
 * Get the account code for an expense category
 */
export function getExpenseAccountCode(category: string): string {
  return EXPENSE_CATEGORY_ACCOUNT_MAP[category]?.code || '8630'
}

/**
 * Get the account code for a payment method
 */
export function getPaymentAccountCode(method: string): string {
  return PAYMENT_METHOD_ACCOUNT_MAP[method]?.code || '1110'
}

/**
 * Get all accounts for a specific activity type
 */
export function getAccountsByActivity(activityType: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL' | 'BOTH' | 'ADMIN'): AccountMapping[] {
  return Object.values(ACCOUNT_MAPPINGS).filter(
    m => m.activityType === activityType || m.activityType === 'BOTH'
  )
}

/**
 * Get all expense accounts (for expense screen account selector)
 */
export function getExpenseAccounts(): Array<{ code: string; nameAr: string; nameEn: string }> {
  return Object.entries(EXPENSE_CATEGORY_ACCOUNT_MAP).map(([_key, val]) => val)
}

/**
 * Generate expected journal entry preview for an operation
 */
export function generateEntryPreview(
  operationType: OperationType,
  amounts: Record<string, number>,
  _options?: {
    activityType?: 'CONSTRUCTION' | 'EQUIPMENT_RENTAL'
    paymentMethod?: string
  }
): Array<{ accountCode: string; accountNameAr: string; side: 'DEBIT' | 'CREDIT'; amount: number; role: string }> {
  const mapping = ACCOUNT_MAPPINGS[operationType]
  if (!mapping) return []

  return mapping.accounts.map(account => {
    let amount = 0
    switch (account.role) {
      case 'receivable': amount = amounts.totalAmount || amounts.subtotal || 0; break
      case 'revenue': amount = amounts.subtotal || amounts.amount || 0; break
      case 'vat': amount = amounts.vatAmount || 0; break
      case 'cost': amount = amounts.amount || amounts.subtotal || 0; break
      case 'cash': amount = amounts.totalAmount || amounts.amount || 0; break
      case 'payable': amount = amounts.totalAmount || 0; break
      case 'advance': amount = amounts.amount || 0; break
      case 'gosi': amount = amounts.gosiAmount || 0; break
      case 'gosi_payable': amount = amounts.gosiAmount || 0; break
      case 'depreciation': amount = amounts.depreciation || 0; break
      case 'accum_depreciation': amount = amounts.depreciation || 0; break
      case 'retention': amount = amounts.retention || 0; break
      case 'provision': amount = amounts.amount || 0; break
      case 'output_vat': amount = amounts.outputVat || 0; break
      case 'input_vat': amount = amounts.inputVat || 0; break
      case 'vat_due': amount = amounts.vatDue || 0; break
      case 'gain': amount = amounts.gain || 0; break
      default: amount = amounts[account.role] || 0
    }
    return {
      accountCode: account.accountCode,
      accountNameAr: account.accountNameAr,
      side: account.side,
      amount,
      role: account.role,
    }
  }).filter(line => line.amount > 0)
}
