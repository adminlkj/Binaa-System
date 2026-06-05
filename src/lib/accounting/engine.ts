// ============================================================================
// المحرك المحاسبي - Accounting Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// Core accounting engine with automatic journal entries for all business transactions.
// Follows double-entry bookkeeping principles and Saudi accounting standards.
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
// Based on Saudi SOCPA standards for construction companies

export interface AccountTemplate {
  code: string
  name: string
  nameAr: string
  type: AccountTypeValue
  parentId?: string
}

export const CHART_OF_ACCOUNTS_TEMPLATE: AccountTemplate[] = [
  // ===== الأصول - Assets =====
  // الأصول المتداولة - Current Assets
  { code: '1000', name: 'Current Assets', nameAr: 'الأصول المتداولة', type: 'ASSET' },
  { code: '1100', name: 'Cash & Cash Equivalents', nameAr: 'النقد وما في حكمه', type: 'ASSET', parentId: '1000' },
  { code: '1110', name: 'Cash - Treasury', nameAr: 'الصندوق (الخزينة)', type: 'ASSET', parentId: '1100' },
  { code: '1120', name: 'Bank Accounts', nameAr: 'البنوك', type: 'ASSET', parentId: '1100' },
  { code: '1130', name: 'Petty Cash', nameAr: 'الصندوق النقدي', type: 'ASSET', parentId: '1100' },
  { code: '1200', name: 'Accounts Receivable', nameAr: 'الذمم المدينة', type: 'ASSET', parentId: '1000' },
  { code: '1210', name: 'Clients Receivable', nameAr: 'عملاء', type: 'ASSET', parentId: '1200' },
  { code: '1220', name: 'Retention Receivable', nameAr: 'مبالغ محتجزة لدى العملاء', type: 'ASSET', parentId: '1200' },
  { code: '1230', name: 'Advances to Employees', nameAr: 'سلف الموظفين', type: 'ASSET', parentId: '1200' },
  { code: '1240', name: 'Advances to Suppliers', nameAr: 'مقدمات للموردين', type: 'ASSET', parentId: '1200' },
  { code: '1300', name: 'Inventory', nameAr: 'المخزون', type: 'ASSET', parentId: '1000' },
  { code: '1310', name: 'Raw Materials', nameAr: 'مواد خام', type: 'ASSET', parentId: '1300' },
  { code: '1320', name: 'Work in Progress', nameAr: 'أعمال تحت التنفيذ', type: 'ASSET', parentId: '1300' },
  { code: '1400', name: 'VAT Receivable', nameAr: 'ضريبة القيمة المضافة مستحقة الاسترداد', type: 'ASSET', parentId: '1000' },
  { code: '1500', name: 'Prepaid Expenses', nameAr: 'مصروفات مقدمه', type: 'ASSET', parentId: '1000' },
  // الأصول غير المتداولة - Non-Current Assets
  { code: '2000', name: 'Non-Current Assets', nameAr: 'الأصول غير المتداولة', type: 'ASSET' },
  { code: '2100', name: 'Property & Equipment', nameAr: 'الممتلكات والمعدات', type: 'ASSET', parentId: '2000' },
  { code: '2110', name: 'Construction Equipment', nameAr: 'معدات الإنشاء', type: 'ASSET', parentId: '2100' },
  { code: '2120', name: 'Vehicles', nameAr: 'المركبات', type: 'ASSET', parentId: '2100' },
  { code: '2130', name: 'Office Equipment', nameAr: 'أثاث ومعدات مكتبية', type: 'ASSET', parentId: '2100' },
  { code: '2200', name: 'Accumulated Depreciation', nameAr: 'مجمع الإهلاك', type: 'ASSET', parentId: '2000' },
  { code: '2210', name: 'Accum. Depreciation - Equipment', nameAr: 'إهلاك متراكم - معدات', type: 'ASSET', parentId: '2200' },
  { code: '2220', name: 'Accum. Depreciation - Vehicles', nameAr: 'إهلاك متراكم - مركبات', type: 'ASSET', parentId: '2200' },
  { code: '2230', name: 'Accum. Depreciation - Office', nameAr: 'إهلاك متراكم - أثاث', type: 'ASSET', parentId: '2200' },

  // ===== الخصوم - Liabilities =====
  { code: '3000', name: 'Current Liabilities', nameAr: 'الخصوم المتداولة', type: 'LIABILITY' },
  { code: '3100', name: 'Accounts Payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY', parentId: '3000' },
  { code: '3110', name: 'Suppliers Payable', nameAr: 'موردون', type: 'LIABILITY', parentId: '3100' },
  { code: '3120', name: 'Subcontractors Payable', nameAr: 'مقاولو الباطن', type: 'LIABILITY', parentId: '3100' },
  { code: '3200', name: 'VAT Payable', nameAr: 'ضريبة القيمة المضافة مستحقة الدفع', type: 'LIABILITY', parentId: '3000' },
  { code: '3300', name: 'Accrued Expenses', nameAr: 'مصروفات مستحقة', type: 'LIABILITY', parentId: '3000' },
  { code: '3400', name: 'Customer Advances', nameAr: 'مقدمات العملاء', type: 'LIABILITY', parentId: '3000' },
  { code: '3500', name: 'Retention Payable', nameAr: 'مبالغ محتجزة لدى الشركة', type: 'LIABILITY', parentId: '3000' },
  // الخصوم غير المتداولة
  { code: '4000', name: 'Non-Current Liabilities', nameAr: 'الخصوم غير المتداولة', type: 'LIABILITY' },
  { code: '4100', name: 'Long-term Loans', nameAr: 'قروض طويلة الأجل', type: 'LIABILITY', parentId: '4000' },

  // ===== حقوق الملكية - Equity =====
  { code: '5000', name: 'Equity', nameAr: 'حقوق الملكية', type: 'EQUITY' },
  { code: '5100', name: 'Capital', nameAr: 'رأس المال', type: 'EQUITY', parentId: '5000' },
  { code: '5200', name: 'Retained Earnings', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', parentId: '5000' },
  { code: '5300', name: 'Current Year Earnings', nameAr: 'أرباح (خسائر) السنة الحالية', type: 'EQUITY', parentId: '5000' },

  // ===== الإيرادات - Revenue =====
  { code: '6000', name: 'Revenue', nameAr: 'الإيرادات', type: 'REVENUE' },
  { code: '6100', name: 'Project Revenue', nameAr: 'إيرادات المشاريع', type: 'REVENUE', parentId: '6000' },
  { code: '6110', name: 'Progress Claims Revenue', nameAr: 'إيرادات المستخلصات', type: 'REVENUE', parentId: '6100' },
  { code: '6200', name: 'Rental Revenue', nameAr: 'إيرادات التأجير', type: 'REVENUE', parentId: '6000' },
  { code: '6210', name: 'Equipment Rental Revenue', nameAr: 'إيرادات تأجير المعدات', type: 'REVENUE', parentId: '6200' },
  { code: '6300', name: 'Service Revenue', nameAr: 'إيرادات الخدمات', type: 'REVENUE', parentId: '6000' },
  { code: '6400', name: 'Other Revenue', nameAr: 'إيرادات أخرى', type: 'REVENUE', parentId: '6000' },

  // ===== المصروفات - Expenses =====
  { code: '7000', name: 'Direct Costs', nameAr: 'التكاليف المباشرة', type: 'EXPENSE' },
  { code: '7100', name: 'Material Costs', nameAr: 'تكاليف المواد', type: 'EXPENSE', parentId: '7000' },
  { code: '7200', name: 'Labor Costs', nameAr: 'تكاليف العمالة', type: 'EXPENSE', parentId: '7000' },
  { code: '7300', name: 'Subcontractor Costs', nameAr: 'تكاليف مقاولي الباطن', type: 'EXPENSE', parentId: '7000' },
  { code: '7400', name: 'Equipment Costs', nameAr: 'تكاليف المعدات', type: 'EXPENSE', parentId: '7000' },
  { code: '7410', name: 'Equipment Operation Costs', nameAr: 'تكاليف تشغيل المعدات', type: 'EXPENSE', parentId: '7400' },
  { code: '7420', name: 'Equipment Maintenance', nameAr: 'صيانة المعدات', type: 'EXPENSE', parentId: '7400' },
  { code: '7430', name: 'Equipment Fuel', nameAr: 'وقود المعدات', type: 'EXPENSE', parentId: '7400' },
  { code: '7500', name: 'Project Expenses', nameAr: 'مصروفات المشاريع', type: 'EXPENSE', parentId: '7000' },
  // Indirect Costs
  { code: '8000', name: 'Indirect Costs', nameAr: 'التكاليف غير المباشرة', type: 'EXPENSE' },
  { code: '8100', name: 'Administrative Expenses', nameAr: 'مصروفات إدارية', type: 'EXPENSE', parentId: '8000' },
  { code: '8110', name: 'Salaries & Wages', nameAr: 'رواتب وأجور', type: 'EXPENSE', parentId: '8100' },
  { code: '8120', name: 'Office Rent', nameAr: 'إيجار مكتب', type: 'EXPENSE', parentId: '8100' },
  { code: '8130', name: 'Utilities', nameAr: 'خدمات (كهرباء/ماء/إنترنت)', type: 'EXPENSE', parentId: '8100' },
  { code: '8140', name: 'Office Supplies', nameAr: 'لوازم مكتبية', type: 'EXPENSE', parentId: '8100' },
  { code: '8200', name: 'Depreciation Expense', nameAr: 'مصروف الإهلاك', type: 'EXPENSE', parentId: '8000' },
  { code: '8210', name: 'Depreciation - Equipment', nameAr: 'إهلاك معدات', type: 'EXPENSE', parentId: '8200' },
  { code: '8220', name: 'Depreciation - Vehicles', nameAr: 'إهلاك مركبات', type: 'EXPENSE', parentId: '8200' },
  { code: '8230', name: 'Depreciation - Office', nameAr: 'إهلاك أثاث', type: 'EXPENSE', parentId: '8200' },
  { code: '8300', name: 'VAT Expense', nameAr: 'مصروف ضريبي', type: 'EXPENSE', parentId: '8000' },
  { code: '8900', name: 'Other Expenses', nameAr: 'مصروفات أخرى', type: 'EXPENSE', parentId: '8000' },
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
  if (existing) return existing

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
    },
  })
}

// ============ INITIALIZE CHART OF ACCOUNTS ============

export async function initializeChartOfAccounts() {
  // Check if accounts already exist
  const count = await db.account.count()
  if (count > 0) return { created: 0, total: count }

  let created = 0
  // Create parent accounts first, then children
  const sorted = [...CHART_OF_ACCOUNTS_TEMPLATE].sort((a, b) => {
    // Shorter codes first (parents)
    if (a.code.length !== b.code.length) return a.code.length - b.code.length
    return a.code.localeCompare(b.code)
  })

  for (const tmpl of sorted) {
    await ensureAccountExists(tmpl)
    created++
  }

  return { created, total: created }
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
 * فاتورة مبيعات - Sales Invoice
 * Dr: Accounts Receivable (1210) - totalAmount
 * Cr: Revenue (6100/6200/6300) - subtotal
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
      revenueAccountCode = '6300' // Service Revenue
  }

  const lines = [
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId }, // AR
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
 * Cr: Accounts Payable (3110) - totalAmount
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
}) {
  // Determine expense account based on context
  let expenseAccountCode = '7100' // Default: Material Costs
  if (data.expenseCategory) {
    const categoryMap: Record<string, string> = {
      'RENT': '7500',
      'MAINTENANCE': '7420',
      'TRANSPORT': '7500',
      'DELIVERY': '7500',
      'CONSUMABLES': '7100',
      'SERVICES': '7300',
      'INSURANCE': '8900',
      'FUEL': '7430',
      'PERMITS': '8900',
      'OFFICE': '8140',
      'HOSPITALITY': '8900',
      'OTHER': '8900',
      'SALARIES': '8110',
      'INTERNET': '8130',
      'ELECTRICITY': '8130',
      'WATER': '8130',
    }
    expenseAccountCode = categoryMap[data.expenseCategory] || '8900'
  }

  const lines = [
    { accountCode: expenseAccountCode, debit: data.subtotal, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '1400', debit: data.vatAmount, credit: 0 }) // VAT Receivable
  }

  lines.push({ accountCode: '3110', debit: 0, credit: data.totalAmount }) // AP

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
 * Dr: Accounts Receivable (1210) - totalAmount
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
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: '6110', debit: 0, credit: data.amount, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount })
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
 * Cr: Cash (1110/1130) - total
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
    'RENT': '7500', 'MAINTENANCE': '7420', 'TRANSPORT': '7500',
    'DELIVERY': '7500', 'CONSUMABLES': '7100', 'SERVICES': '7300',
    'INSURANCE': '8900', 'FUEL': '7430', 'PERMITS': '8900',
    'OFFICE': '8140', 'HOSPITALITY': '8900', 'OTHER': '8900',
    'SALARIES': '8110', 'INTERNET': '8130', 'ELECTRICITY': '8130',
    'WATER': '8130', 'MANAGEMENT_CARS': '8900',
  }
  const expenseAccountCode = categoryMap[data.category] || '8900'
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
 * Cr: Accounts Receivable (1210)
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
      { accountCode: '1210', debit: 0, credit: data.amount },
    ],
    sourceType: 'CLIENT_PAYMENT',
    sourceId: data.reference || `CP-${Date.now()}`,
  })
}

/**
 * دفع لمورد - Supplier Payment
 * Dr: Accounts Payable (3110)
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
      { accountCode: '3110', debit: data.amount, credit: 0 },
      { accountCode: cashAccountCode, debit: 0, credit: data.amount },
    ],
    sourceType: 'SUPPLIER_PAYMENT',
    sourceId: data.reference || `SP-${Date.now()}`,
  })
}

/**
 * سلفة موظف - Employee Advance
 * Dr: Advances to Employees (1230)
 * Cr: Cash (1110/1130)
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
      { accountCode: '1230', debit: data.amount, credit: 0 },
      { accountCode: '1110', debit: 0, credit: data.amount },
    ],
    sourceType: 'EMPLOYEE_ADVANCE',
    sourceId: `EA-${Date.now()}`,
  })
}

/**
 * تسوية سلفة - Advance Settlement
 * Dr: Expense/Salary account
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
      { accountCode: '8110', debit: data.settledAmount, credit: 0 }, // Salaries
      { accountCode: '1230', debit: 0, credit: data.settledAmount }, // Clear advance
    ],
    sourceType: 'ADVANCE_SETTLEMENT',
    sourceId: `AS-${Date.now()}`,
  })
}

/**
 * فاتورة مقاول باطن - Subcontractor Invoice
 * Dr: Subcontractor Costs (7300)
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
    { accountCode: '7300', debit: data.amount, credit: 0, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '1400', debit: data.vatAmount, credit: 0 })
  }

  lines.push({ accountCode: '3120', debit: 0, credit: data.totalAmount })

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
 * Dr: Equipment Costs (7400/7410/7420/7430)
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
  const accountMap = {
    'OPERATION': '7410',
    'MAINTENANCE': '7420',
    'FUEL': '7430',
    'OTHER': '7400',
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
 * إيراد تأجير - Rental Revenue
 * Dr: Accounts Receivable (1210)
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
    { accountCode: '1210', debit: data.totalAmount, credit: 0, costCenterId: data.costCenterId },
    { accountCode: '6210', debit: 0, credit: data.subtotal, costCenterId: data.costCenterId },
  ]

  if (data.vatAmount > 0) {
    lines.push({ accountCode: '3200', debit: 0, credit: data.vatAmount })
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
 * Dr: Expense account
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
    'OFFICE': '8140', 'TRANSPORT': '7500', 'HOSPITALITY': '8900',
    'MAINTENANCE': '7420', 'OTHER': '8900',
  }
  const expenseAccountCode = categoryMap[data.category] || '8900'

  return createJournalEntry({
    entryNo: `JE-PC-${Date.now()}`,
    date: data.date,
    description: `Petty Cash: ${data.description}`,
    descriptionAr: `صندوق نقدي: ${data.description}`,
    lines: [
      { accountCode: expenseAccountCode, debit: data.amount, credit: 0, costCenterId: data.costCenterId },
      { accountCode: '1130', debit: 0, credit: data.amount },
    ],
    sourceType: 'PETTY_CASH',
    sourceId: `PTC-${Date.now()}`,
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
