// ============================================================================
// محرك احتساب ضريبة القيمة المضافة - VAT Calculation Engine
// نظام بِنَاء ERP - Binaa Construction ERP
//
// يحسب ضريبة القيمة المضافة من العمليات الخاضعة للضريبة فقط، مع تصنيفها
// وفق معايير هيئة الزكاة والضريبة (القياسية 15% / الصفرية / المعفاة / الواردات)
// ويتحقق من المطابقة مع دفتر اليومية (حسابات ضريبة المخرجات والممدخلات).
// ============================================================================

import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { getAccountCodeByRole, AccountRole, type AccountRoleKey } from '@/lib/account-roles'
import type { PrismaTransaction } from '@/lib/accounting/engine'

// ============ الأنواع ============

export interface VatCategoryBreakdown {
  // مبيعات / مخرجات
  standardRatedSales: number      // إجمالي المبيعات الخاضعة بنسبة 15%
  zeroRatedSales: number          // إجمالي المبيعات صفريه الضريبة (صادرات)
  exemptSales: number             // إجمالي المبيعات المعفاة
  standardRatedSalesVat: number   // ضريبة المبيعات الخاضعة 15%

  // مشتريات / مدخلات
  standardRatedPurchases: number     // إجمالي المشتريات الخاضعة بنسبة 15%
  zeroRatedPurchases: number         // إجمالي المشتريات صفريه الضريبة
  exemptPurchases: number            // إجمالي المشتريات المعفاة
  importsSubjectToVAT: number        // الواردات الخاضعة (احتساب عكسي)
  standardRatedPurchasesVat: number  // ضريبة المشتريات الخاضعة 15%
}

export interface VatSourceLine {
  id: string
  ref: string          // رقم الفاتورة/المستخلص/المصروف
  date: Date
  description: string
  // المبالغ
  subtotal: number     // المبلغ قبل الضريبة
  vatRate: number      // نسبة الضريبة (0.15, 0, ...)
  vatAmount: number    // قيمة الضريبة
  total: number        // الإجمالي شامل الضريبة
  // التصنيف
  category: 'STANDARD' | 'ZERO' | 'EXEMPT'
  sourceType: 'SALES_INVOICE' | 'PROGRESS_CLAIM' | 'PURCHASE_INVOICE' | 'SUBCONTRACTOR_INVOICE' | 'EXPENSE'
  // معلومات إضافية
  status: string
  counterpartyName?: string
}

export interface VatCalculationResult {
  // الإجماليات
  totalSales: number
  totalPurchases: number
  outputVat: number
  inputVat: number
  netVat: number

  // التصنيف
  categories: VatCategoryBreakdown

  // البنود التفصيلية
  sourceLines: VatSourceLine[]
  salesInvoices: VatSourceLine[]
  progressClaims: VatSourceLine[]
  purchaseInvoices: VatSourceLine[]
  subcontractorInvoices: VatSourceLine[]
  expenses: VatSourceLine[]

  // قوائم المعرفات
  salesInvoiceIds: string[]
  purchaseInvoiceIds: string[]
  subcontractorInvoiceIds: string[]
  expenseIds: string[]
  progressClaimIds: string[]

  // التحقق من دفتر اليومية
  glOutputVat: number   // رصيد حساب ضريبة المخرجات من القيود
  glInputVat: number    // رصيد حساب ضريبة المدخلات من القيود
  glMatch: boolean      // هل الأرقام متطابقة؟
  glDiffOutput: number  // الفرق في المخرجات
  glDiffInput: number   // الفرق في المدخلات
}

// ============ المساعدات ============

/**
 * تصنيف عملية بناءً على نسبة الضريبة:
 * - 15% (0.15) → STANDARD (خاضعة للقياسية)
 * - 0% (0) → ZERO (صفريه - صادرات عادةً)
 * - أي قيمة سالبة أو null → EXEMPT (معفاة)
 */
export function classifyVatCategory(vatRate: number): 'STANDARD' | 'ZERO' | 'EXEMPT' {
  if (vatRate === null || vatRate === undefined || isNaN(vatRate)) return 'EXEMPT'
  if (Math.abs(vatRate - 0.15) < 0.001) return 'STANDARD'
  if (vatRate === 0) return 'ZERO'
  // أي نسبة أخرى (مثل 5% أو 8%) - نعتبرها قياسية
  if (vatRate > 0) return 'STANDARD'
  return 'EXEMPT'
}

/**
 * يحسب رصيد حساب ضريبة القيمة المضافة من دفتر اليومية
 * (القيود المنشورة فقط) خلال فترة محددة.
 *
 * ❗ مهم: تستثني هذه الدالة قيود الإقرار الضريبي نفسها (VAT_DECLARATION و VAT_PAYMENT)
 *    لأنها قيود إقفال تنقل الرصيد من حساب الضريبة إلى حساب الضريبة المستحقة.
 *    الهدف هو مقارنة الضريبة المحتسبة من الفواتير مع الضريبة المرحّلة من الفواتير
 *    (وليس مع قيد الإقرار الذي يُغلق الحساب).
 *
 * ضريبة المخرجات (VAT_OUTPUT): حساب liability برصيد دائن طبيعي.
 *   الرصيد = إجمالي الائتمان - إجمالي المدين خلال الفترة.
 *
 * ضريبة المدخلات (VAT_INPUT): حساب asset برصيد مدين طبيعي.
 *   الرصيد = إجمالي المدين - إجمالي الائتمان خلال الفترة.
 */
export async function getVatGlBalance(
  role: AccountRoleKey,
  startDate: Date,
  endDate: Date,
  tx?: PrismaTransaction
): Promise<number> {
  const client = tx || db
  const code = await getAccountCodeByRole(role, tx)
  if (!code) return 0

  const account = await client.account.findFirst({ where: { code } })
  if (!account) return 0

  const lines = await client.journalLine.findMany({
    where: {
      accountId: account.id,
      deletedAt: null,
      journalEntry: {
        status: 'POSTED',
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        // ❗ استثنِ قيود الإقرار الضريبي والسداد (قيود الإقفال)
        //    حتى لا تتأثر أرصدة التحقق بقيد الإقرار نفسه.
        NOT: {
          OR: [
            { sourceType: 'VAT_DECLARATION' },
            { sourceType: 'VAT_PAYMENT' },
            { entryNo: { startsWith: 'JE-VAT-' } },
            { entryNo: { startsWith: 'JE-VTP-' } },
            // استثنِ أيضاً قيود العكس المرتبطة بإقرارات الضريبة
            { isReversal: true, description: { contains: 'VAT' } },
          ],
        },
      },
    },
    select: { debit: true, credit: true },
  })

  const totalDebit = lines.reduce((s, l) => s + toNumber(l.debit), 0)
  const totalCredit = lines.reduce((s, l) => s + toNumber(l.credit), 0)

  // Output VAT is a LIABILITY → normal credit balance (credit - debit)
  if (role === AccountRole.VAT_OUTPUT) {
    return totalCredit - totalDebit
  }
  // Input VAT is an ASSET → normal debit balance (debit - credit)
  if (role === AccountRole.VAT_INPUT) {
    return totalDebit - totalCredit
  }
  return 0
}

// ============ الدالة الرئيسية ============

/**
 * يحسب ضريبة القيمة المضافة لربع محدد.
 *
 * ⚠️  SSOT (P1-1-FIX / M5): الإجماليات المالية (outputVat, inputVat,
 *    totalSales, totalPurchases, netVat) مصدرها JournalLine على:
 *      - VAT_OUTPUT credits → outputVat (الضريبة المحصّلة)
 *      - VAT_INPUT debits → inputVat (الضريبة المدفوعة)
 *      - REVENUE credits - debits → totalSales
 *      - EXPENSE debits - credits → totalPurchases (excl. VAT)
 *    البنود التفصيلية (salesInvoices, purchaseInvoices, subcontractorInvoices,
 *    expenses, progressClaims) تبقى كتفصيل ZATCA للعرض فقط — وليست مصدراً
 *    للإجماليات المالية. التسامح 0.01 ريال (1 هللة) بدلاً من 0.5.
 */
export async function calculateVatForQuarter(
  year: number,
  quarter: number,
  tx?: PrismaTransaction
): Promise<VatCalculationResult> {
  const client = tx || db
  const startDate = new Date(year, (quarter - 1) * 3, 1)
  const endDate = new Date(year, quarter * 3, 0, 23, 59, 59, 999)

  // ========== المخرجات: فواتير المبيعات + المستخلصات (تفصيل ZATCA فقط) ==========
  const salesInvoicesRaw = await client.salesInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
      deletedAt: null,
    },
    select: {
      id: true, invoiceNo: true, date: true,
      subtotal: true, vatRate: true, vatAmount: true, totalAmount: true,
      status: true,
      client: { select: { name: true, nameAr: true } },
    },
    orderBy: { date: 'desc' },
  })

  const salesInvoices: VatSourceLine[] = salesInvoicesRaw.map(inv => ({
    id: inv.id,
    ref: inv.invoiceNo,
    date: inv.date,
    description: inv.client ? (inv.client.nameAr || inv.client.name) : 'فاتورة مبيعات',
    subtotal: toNumber(inv.subtotal),
    vatRate: toNumber(inv.vatRate),
    vatAmount: toNumber(inv.vatAmount),
    total: toNumber(inv.totalAmount),
    category: classifyVatCategory(toNumber(inv.vatRate)),
    sourceType: 'SALES_INVOICE' as const,
    status: inv.status,
    counterpartyName: inv.client ? (inv.client.nameAr || inv.client.name) : undefined,
  }))

  const progressClaimsRaw = await client.progressClaim.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] },
      deletedAt: null,
    },
    select: {
      id: true, claimNo: true, date: true,
      amount: true, vatRate: true, vatAmount: true, totalAmount: true,
      status: true,
      project: { select: { name: true, nameAr: true } },
    },
    orderBy: { date: 'desc' },
  })

  const progressClaims: VatSourceLine[] = progressClaimsRaw.map(c => ({
    id: c.id,
    ref: c.claimNo,
    date: c.date,
    description: c.project ? (c.project.nameAr || c.project.name) : 'مستخلص',
    subtotal: toNumber(c.amount),
    vatRate: toNumber(c.vatRate),
    vatAmount: toNumber(c.vatAmount),
    total: toNumber(c.totalAmount),
    category: classifyVatCategory(toNumber(c.vatRate)),
    sourceType: 'PROGRESS_CLAIM' as const,
    status: c.status,
    counterpartyName: c.project ? (c.project.nameAr || c.project.name) : undefined,
  }))

  // ========== المدخلات: تفصيل ZATCA فقط ==========
  const purchaseInvoicesRaw = await client.purchaseInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
      deletedAt: null,
    },
    select: {
      id: true, invoiceNo: true, date: true,
      subtotal: true, vatRate: true, vatAmount: true, totalAmount: true,
      status: true,
      supplier: { select: { name: true, nameAr: true } },
    },
    orderBy: { date: 'desc' },
  })

  const purchaseInvoices: VatSourceLine[] = purchaseInvoicesRaw.map(inv => ({
    id: inv.id,
    ref: inv.invoiceNo,
    date: inv.date,
    description: inv.supplier ? (inv.supplier.nameAr || inv.supplier.name) : 'فاتورة مشتريات',
    subtotal: toNumber(inv.subtotal),
    vatRate: toNumber(inv.vatRate),
    vatAmount: toNumber(inv.vatAmount),
    total: toNumber(inv.totalAmount),
    category: classifyVatCategory(toNumber(inv.vatRate)),
    sourceType: 'PURCHASE_INVOICE' as const,
    status: inv.status,
    counterpartyName: inv.supplier ? (inv.supplier.nameAr || inv.supplier.name) : undefined,
  }))

  const subcontractorInvoicesRaw = await client.subcontractorInvoice.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
      deletedAt: null,
    },
    select: {
      id: true, invoiceNo: true, date: true,
      amount: true, vatRate: true, vatAmount: true, totalAmount: true,
      status: true,
      subcontractor: { select: { name: true, nameAr: true } },
    },
    orderBy: { date: 'desc' },
  })

  const subcontractorInvoices: VatSourceLine[] = subcontractorInvoicesRaw.map(inv => ({
    id: inv.id,
    ref: inv.invoiceNo,
    date: inv.date,
    description: inv.subcontractor ? (inv.subcontractor.nameAr || inv.subcontractor.name) : 'فاتورة مقاول باطن',
    subtotal: toNumber(inv.amount),
    vatRate: toNumber(inv.vatRate),
    vatAmount: toNumber(inv.vatAmount),
    total: toNumber(inv.totalAmount),
    category: classifyVatCategory(toNumber(inv.vatRate)),
    sourceType: 'SUBCONTRACTOR_INVOICE' as const,
    status: inv.status,
    counterpartyName: inv.subcontractor ? (inv.subcontractor.nameAr || inv.subcontractor.name) : undefined,
  }))

  const expensesRaw = await client.expense.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      vatAmount: { gt: 0 },
      deletedAt: null,
    },
    select: {
      id: true, description: true, date: true,
      amount: true, vatRate: true, vatAmount: true, totalAmount: true,
      category: true,
    },
    orderBy: { date: 'desc' },
  })

  const expenses: VatSourceLine[] = expensesRaw.map(exp => ({
    id: exp.id,
    ref: exp.category || 'EXP',
    date: exp.date,
    description: exp.description,
    subtotal: toNumber(exp.amount),
    vatRate: toNumber(exp.vatRate),
    vatAmount: toNumber(exp.vatAmount),
    total: toNumber(exp.totalAmount),
    category: classifyVatCategory(toNumber(exp.vatRate)),
    sourceType: 'EXPENSE' as const,
    status: 'PAID',
    counterpartyName: undefined,
  }))

  // ========== التجميع التفصيلي (للعرض فقط - ليس مالياً) ==========
  const outputLines = [...salesInvoices, ...progressClaims]
  const inputLines = [...purchaseInvoices, ...subcontractorInvoices, ...expenses]

  const categories: VatCategoryBreakdown = {
    standardRatedSales: outputLines
      .filter(l => l.category === 'STANDARD')
      .reduce((s, l) => s + l.subtotal, 0),
    zeroRatedSales: outputLines
      .filter(l => l.category === 'ZERO')
      .reduce((s, l) => s + l.subtotal, 0),
    exemptSales: outputLines
      .filter(l => l.category === 'EXEMPT')
      .reduce((s, l) => s + l.subtotal, 0),
    standardRatedSalesVat: outputLines
      .filter(l => l.category === 'STANDARD')
      .reduce((s, l) => s + l.vatAmount, 0),

    standardRatedPurchases: inputLines
      .filter(l => l.category === 'STANDARD')
      .reduce((s, l) => s + l.subtotal, 0),
    zeroRatedPurchases: inputLines
      .filter(l => l.category === 'ZERO')
      .reduce((s, l) => s + l.subtotal, 0),
    exemptPurchases: inputLines
      .filter(l => l.category === 'EXEMPT')
      .reduce((s, l) => s + l.subtotal, 0),
    importsSubjectToVAT: 0,
    standardRatedPurchasesVat: inputLines
      .filter(l => l.category === 'STANDARD')
      .reduce((s, l) => s + l.vatAmount, 0),
  }

  // ========== الإجماليات المعتمدة من JournalLine (SSOT) ==========
  // outputVat = VAT_OUTPUT credit - debit خلال الفترة (LIABILITY credit normal)
  // inputVat  = VAT_INPUT debit - credit خلال الفترة (ASSET debit normal)
  // totalSales = REVENUE credit - debit خلال الفترة
  // totalPurchases = EXPENSE debit - credit خلال الفترة (excl. VAT)
  const glOutputVat = await getVatGlBalance(AccountRole.VAT_OUTPUT, startDate, endDate, tx)
  const glInputVat = await getVatGlBalance(AccountRole.VAT_INPUT, startDate, endDate, tx)
  // إيراد الفترة من REVENUE (credit - debit)
  const revenueAccounts = await client.account.findMany({
    where: { type: 'REVENUE', isActive: true },
    select: { id: true },
  })
  let totalSales = 0
  if (revenueAccounts.length > 0) {
    const revAgg = await client.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: revenueAccounts.map(a => a.id) },
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
        },
      },
    })
    totalSales = toNumber(revAgg._sum.credit) - toNumber(revAgg._sum.debit)
  }
  // مشتريات الفترة من EXPENSE (debit - credit)
  const expenseAccounts = await client.account.findMany({
    where: { type: 'EXPENSE', isActive: true },
    select: { id: true },
  })
  let totalPurchases = 0
  if (expenseAccounts.length > 0) {
    const expAgg = await client.journalLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        deletedAt: null,
        accountId: { in: expenseAccounts.map(a => a.id) },
        journalEntry: {
          status: 'POSTED',
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
        },
      },
    })
    totalPurchases = toNumber(expAgg._sum.debit) - toNumber(expAgg._sum.credit)
  }

  const outputVat = glOutputVat
  const inputVat = glInputVat
  const netVat = outputVat - inputVat

  // التحقق من تطابق تفصيل الفواتير مع GL (tolerance 1 halala)
  const EPSILON = 0.01
  const operationalOutputVat = outputLines.reduce((s, l) => s + l.vatAmount, 0)
  const operationalInputVat = inputLines.reduce((s, l) => s + l.vatAmount, 0)
  const glDiffOutput = operationalOutputVat - glOutputVat
  const glDiffInput = operationalInputVat - glInputVat
  const glMatch = Math.abs(glDiffOutput) < EPSILON && Math.abs(glDiffInput) < EPSILON

  return {
    totalSales,
    totalPurchases,
    outputVat,
    inputVat,
    netVat,
    categories,
    sourceLines: [...outputLines, ...inputLines],
    salesInvoices,
    progressClaims,
    purchaseInvoices,
    subcontractorInvoices,
    expenses,
    salesInvoiceIds: salesInvoices.map(l => l.id),
    purchaseInvoiceIds: purchaseInvoices.map(l => l.id),
    subcontractorInvoiceIds: subcontractorInvoices.map(l => l.id),
    expenseIds: expenses.map(l => l.id),
    progressClaimIds: progressClaims.map(l => l.id),
    glOutputVat,
    glInputVat,
    glMatch,
    glDiffOutput,
    glDiffInput,
  }
}
