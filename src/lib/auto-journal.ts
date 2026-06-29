// ============================================================================
// Auto Journal Entry Generation
// ============================================================================
// هذا الملف الآن يمرّ عبر postJournalEntry من guard.ts — لا استدعاءات
// مباشرة لـ tx.journalEntry.create. كل قيد يخضع للقواعد R1-R12.
//
// كل دوال الإنشاء التلقائي تستخدم:
//   - getDefaultAccountByRole() لحل الحسابات (لا أكواد hardcoded)
//   - postJournalEntry() من guard.ts للإنشاء (مع كل التحققات)
//   - getNextEntryNo() من guard.ts لتوليد رقم فريد
// ============================================================================

import { toNumber } from '@/lib/decimal'
import { AccountRole, getDefaultAccountByRole, requireAccountByRole, type AccountRoleKey } from '@/lib/account-roles'
import { postJournalEntry, getNextEntryNo, type PrismaTransaction } from '@/lib/accounting/guard'

// Re-export for backwards compatibility
export type { PrismaTransaction }

// ---------------------------------------------------------------------------
// Sales Invoice → Journal Entry
//   Dr: Clients Receivable (CUSTOMER_AR)  — totalAmount (net + VAT)
//   Cr: Revenue (PROJECT_REVENUE or RENTAL_REVENUE) — netAmount
//   Cr: Output VAT (VAT_OUTPUT) — vatAmount
// ---------------------------------------------------------------------------
export async function createSalesInvoiceJournalEntry(
  invoiceId: string,
  tx: PrismaTransaction
) {
  const invoice = await tx.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { client: true, project: { select: { id: true, costCenter: { select: { id: true } } } } },
  })
  if (!invoice) {
    throw new Error(`فاتورة المبيعات غير موجودة: ${invoiceId}`)
  }

  const clientAccount = await getDefaultAccountByRole(AccountRole.CUSTOMER_AR, tx)
  const revenueAccount = invoice.invoiceType === 'RENTAL'
    ? await getDefaultAccountByRole(AccountRole.RENTAL_REVENUE, tx)
    : await getDefaultAccountByRole(AccountRole.PROJECT_REVENUE, tx)
  const outputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_OUTPUT, tx)

  if (!clientAccount || !revenueAccount || !outputVatAccount) {
    throw new Error(
      `حساب مفقود لقيد فاتورة المبيعات: clientAccount=${!!clientAccount}, ` +
      `revenueAccount=${!!revenueAccount}, outputVatAccount=${!!outputVatAccount}`
    )
  }

  // P6-HIGH-001 FIX: propagate costCenterId from the linked project's cost center
  // (mirror of the P5-CRIT-010 fix applied to createPurchaseInvoiceJournalEntry).
  // Previously sales-invoice JEs had costCenterId=null even when the invoice was
  // linked to a project with a cost center, breaking project-profitability reports.
  const costCenterId = invoice.project?.costCenter?.id || null

  // P3-BUG (discovered via practical E2E test): The previous JE only credited
  // `netAmount` (= subtotal) + `vatAmount` (VAT on subtotal only), but debited
  // `totalAmount` (which includes deliveryFees + deliveryVat). This produced an
  // UNBALANCED entry whenever an invoice had taxable delivery fees
  // (e.g. D=23575 ≠ C=23000, diff=575 = 500 delivery + 75 delivery VAT).
  //
  // Fix: when the invoice has `includeDelivery && deliveryAmount > 0`, add the
  // missing credit lines:
  //   - Cr revenue account: deliveryAmount (the delivery fee itself)
  //   - Cr VAT output: deliveryVat (deliveryFeesTaxable ? deliveryAmount * vatRate : 0)
  const deliveryAmount = toNumber(invoice.deliveryAmount || 0)
  const includeDelivery = Boolean(invoice.includeDelivery) && deliveryAmount > 0
  const vatRate = toNumber(invoice.vatRate || 0)
  const deliveryVat = (includeDelivery && invoice.deliveryFeesTaxable)
    ? Math.round(deliveryAmount * vatRate * 100) / 100
    : 0

  const lines: Array<{ accountId: string; debit: number; credit: number; description: string; costCenterId?: string }> = [
    { accountId: clientAccount.id, debit: toNumber(invoice.totalAmount), credit: 0, description: `فاتورة ${invoice.invoiceNo} - ${invoice.client.name}`, costCenterId: costCenterId || undefined },
    { accountId: revenueAccount.id, debit: 0, credit: toNumber(invoice.netAmount), description: `إيرادات فاتورة ${invoice.invoiceNo}`, costCenterId: costCenterId || undefined },
    { accountId: outputVatAccount.id, debit: 0, credit: toNumber(invoice.vatAmount), description: `ضريبة مخرجات فاتورة ${invoice.invoiceNo}`, costCenterId: costCenterId || undefined },
  ]

  if (includeDelivery) {
    lines.push({
      accountId: revenueAccount.id,
      debit: 0,
      credit: deliveryAmount,
      description: `إيرادات رسوم نقل فاتورة ${invoice.invoiceNo}`,
      costCenterId: costCenterId || undefined,
    })
    if (deliveryVat > 0) {
      lines.push({
        accountId: outputVatAccount.id,
        debit: 0,
        credit: deliveryVat,
        description: `ضريبة مخرجات رسوم نقل فاتورة ${invoice.invoiceNo}`,
        costCenterId: costCenterId || undefined,
      })
    }
  }

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: invoice.date,
      description: `فاتورة مبيعات ${invoice.invoiceNo}`,
      sourceType: 'SALES_INVOICE',
      sourceId: invoice.id,
      lines,
    },
    tx
  )

  await tx.salesInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Purchase Invoice → Journal Entry
//   Dr: Cost (expense-category-aware role mapping) — subtotal
//   Dr: Input VAT (VAT_INPUT) — vatAmount
//   Cr: Suppliers (SUPPLIER_AP) — totalAmount
//
// P5-CRIT-006/010/015 FIX: Unified generator — expenseCategory-aware + costCenterId propagation.
// This is the SINGLE source of truth for purchase-invoice JEs (used by both
// POST approve-flow and PUT edit-flow). No hardcoded fallback codes.
// ---------------------------------------------------------------------------
// Category → AccountRole map (mirrors the engine.ts categoryRoleMap, but
// resolved via requireAccountByRole which throws on missing role mapping).
const PURCHASE_CATEGORY_ROLE_MAP: Record<string, string> = {
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

export async function createPurchaseInvoiceJournalEntry(
  invoiceId: string,
  tx: PrismaTransaction
) {
  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true, project: { select: { id: true, costCenter: { select: { id: true } } } } },
  })
  if (!invoice) {
    throw new Error(`فاتورة الشراء غير موجودة: ${invoiceId}`)
  }

  // Resolve expense account by ROLE based on category (P5-CRIT-006).
  // Default: if projectId present → PROJECT_COST, else ADMIN_EXPENSE.
  // If expenseCategory is set, use the category map.
  let expenseRole: string
  if (invoice.expenseCategory && PURCHASE_CATEGORY_ROLE_MAP[invoice.expenseCategory]) {
    expenseRole = PURCHASE_CATEGORY_ROLE_MAP[invoice.expenseCategory]
  } else if (invoice.projectId) {
    expenseRole = AccountRole.PROJECT_COST
  } else {
    expenseRole = AccountRole.ADMIN_EXPENSE
  }

  const costAccount = await requireAccountByRole(expenseRole as AccountRoleKey, `فاتورة مشتريات ${invoice.invoiceNo}`, tx)
  const inputVatAccount = await requireAccountByRole(AccountRole.VAT_INPUT, `فاتورة مشتريات ${invoice.invoiceNo}`, tx)
  const supplierAccount = await requireAccountByRole(AccountRole.SUPPLIER_AP, `فاتورة مشتريات ${invoice.invoiceNo}`, tx)

  // P5-CRIT-010: propagate costCenterId from the linked project's cost center.
  const costCenterId = invoice.project?.costCenter?.id || null

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: invoice.date,
      description: `فاتورة مورد ${invoice.invoiceNo}`,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: invoice.id,
      lines: [
        { accountId: costAccount.id, debit: toNumber(invoice.subtotal), credit: 0, description: `تكلفة فاتورة ${invoice.invoiceNo}`, costCenterId: costCenterId || undefined },
        { accountId: inputVatAccount.id, debit: toNumber(invoice.vatAmount), credit: 0, description: `ضريبة مدخلات فاتورة ${invoice.invoiceNo}`, costCenterId: costCenterId || undefined },
        { accountId: supplierAccount.id, debit: 0, credit: toNumber(invoice.totalAmount), description: `مورد ${invoice.supplier.name}`, costCenterId: costCenterId || undefined },
      ],
    },
    tx
  )

  await tx.purchaseInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Client Payment (تحصيل) → Journal Entry
//   Dr: Cash/Bank (receivingAccount or CASH role) — amount
//   Cr: Clients Receivable (CUSTOMER_AR) — amount
// ---------------------------------------------------------------------------
export async function createClientPaymentJournalEntry(
  paymentId: string,
  tx: PrismaTransaction
) {
  const payment = await tx.clientPayment.findUnique({
    where: { id: paymentId },
    include: {
      client: true,
      invoice: { select: { id: true, project: { select: { id: true, costCenter: { select: { id: true } } } } } },
    },
  })
  if (!payment) {
    throw new Error(`تحصيل العميل غير موجود: ${paymentId}`)
  }

  let receivingAccount: { id: string } | null = null
  if (payment.receivingAccountId) {
    receivingAccount = await tx.account.findUnique({ where: { id: payment.receivingAccountId } })
  }
  if (!receivingAccount) {
    receivingAccount = await getDefaultAccountByRole(AccountRole.CASH, tx)
  }
  const clientAccount = await getDefaultAccountByRole(AccountRole.CUSTOMER_AR, tx)

  if (!receivingAccount || !clientAccount) {
    throw new Error(
      `حساب مفقود لقيد تحصيل العميل: receivingAccount=${!!receivingAccount}, ` +
      `clientAccount=${!!clientAccount}`
    )
  }

  // P6-HIGH-002 FIX: propagate costCenterId from the linked invoice's project cost center.
  const costCenterId = payment.invoice?.project?.costCenter?.id || null

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: payment.date,
      description: `تحصيل من ${payment.client.name}`,
      sourceType: 'CLIENT_PAYMENT',
      sourceId: payment.id,
      lines: [
        { accountId: receivingAccount.id, debit: toNumber(payment.amount), credit: 0, description: `تحصيل نقدي`, costCenterId: costCenterId || undefined },
        { accountId: clientAccount.id, debit: 0, credit: toNumber(payment.amount), description: `تحصيل من ${payment.client.name}`, costCenterId: costCenterId || undefined },
      ],
    },
    tx
  )

  await tx.clientPayment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Supplier Payment → Journal Entry
//   Dr: Suppliers (SUPPLIER_AP) — amount
//   Cr: Cash/Bank (payingAccount or CASH role) — amount
//
// P5-CRIT-010 FIX: propagate costCenterId from the linked invoice's project
// (if any) so that project profitability reports include AP payments.
// ---------------------------------------------------------------------------
export async function createSupplierPaymentJournalEntry(
  paymentId: string,
  tx: PrismaTransaction
) {
  const payment = await tx.supplierPayment.findUnique({
    where: { id: paymentId },
    include: { supplier: true },
  })
  if (!payment) {
    throw new Error(`سداد المورد غير موجود: ${paymentId}`)
  }

  const supplierAccount = await requireAccountByRole(AccountRole.SUPPLIER_AP, `سداد مورد ${payment.supplier.name}`, tx)
  let payingAccount: { id: string } | null = null
  if (payment.payingAccountId) {
    payingAccount = await tx.account.findUnique({ where: { id: payment.payingAccountId } })
  }
  if (!payingAccount) {
    payingAccount = await getDefaultAccountByRole(AccountRole.CASH, tx)
  }

  if (!payingAccount) {
    throw new Error(`حساب مفقود لقيد سداد المورد: payingAccount غير موجود`)
  }

  // P5-CRIT-010: resolve costCenterId from the linked invoice's project (if any).
  let costCenterId: string | null = null
  if (payment.invoiceId) {
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: payment.invoiceId },
      select: { project: { select: { costCenter: { select: { id: true } } } } },
    })
    costCenterId = inv?.project?.costCenter?.id || null
  }

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: payment.date,
      description: `سداد إلى ${payment.supplier.name}`,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: payment.id,
      lines: [
        { accountId: supplierAccount.id, debit: toNumber(payment.amount), credit: 0, description: `سداد مورد ${payment.supplier.name}`, costCenterId: costCenterId || undefined },
        { accountId: payingAccount.id, debit: 0, credit: toNumber(payment.amount), description: `صرف نقدي`, costCenterId: costCenterId || undefined },
      ],
    },
    tx
  )

  await tx.supplierPayment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Expense → Journal Entry
//   Dr: Cost (PROJECT_COST or ADMIN_EXPENSE) — amount
//   Dr: Input VAT (VAT_INPUT) — vatAmount (if any)
//   Cr: Cash/Bank (BANK or CASH role) — totalAmount
// ---------------------------------------------------------------------------
export async function createExpenseJournalEntry(
  expenseId: string,
  tx: PrismaTransaction
) {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } })
  if (!expense) {
    throw new Error(`المصروف غير موجود: ${expenseId}`)
  }

  const costAccount = expense.projectId
    ? await getDefaultAccountByRole(AccountRole.PROJECT_COST, tx)
    : await getDefaultAccountByRole(AccountRole.ADMIN_EXPENSE, tx)
  const inputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_INPUT, tx)
  const treasuryAccount = expense.payFrom === 'BANK'
    ? await getDefaultAccountByRole(AccountRole.BANK, tx)
    : await getDefaultAccountByRole(AccountRole.CASH, tx)

  if (!costAccount || !treasuryAccount) {
    throw new Error(
      `حساب مفقود لقيد المصروف: costAccount=${!!costAccount}, ` +
      `treasuryAccount=${!!treasuryAccount}`
    )
  }

  const lines: Array<{ accountId: string; debit: number; credit: number; costCenterId?: string | null; description: string }> = [
    { accountId: costAccount.id, debit: toNumber(expense.amount), credit: 0, costCenterId: expense.costCenterId || undefined, description: `مصروف ${expense.description}` },
  ]

  if (toNumber(expense.vatAmount) > 0 && inputVatAccount) {
    lines.push({ accountId: inputVatAccount.id, debit: toNumber(expense.vatAmount), credit: 0, costCenterId: expense.costCenterId || undefined, description: `ضريبة مدخلات مصروف` })
  }

  lines.push({ accountId: treasuryAccount.id, debit: 0, credit: toNumber(expense.totalAmount), costCenterId: expense.costCenterId || undefined, description: `صرف نقدي` })

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: expense.date,
      description: `مصروف ${expense.description}`,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      lines,
    },
    tx
  )

  await tx.expense.update({ where: { id: expenseId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Progress Claim (مستخلص) → Journal Entry
//   Dr: Clients Receivable (CUSTOMER_AR) — totalAmount
//   Cr: Project Revenue (PROJECT_REVENUE) — amount (ex VAT)
//   Cr: Output VAT (VAT_OUTPUT) — vatAmount (if any)
// ---------------------------------------------------------------------------
export async function createProgressClaimJournalEntry(
  claimId: string,
  tx: PrismaTransaction
) {
  const claim = await tx.progressClaim.findUnique({
    where: { id: claimId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      contract: { select: { id: true, contractNo: true } },
    },
  })
  if (!claim) {
    throw new Error(`المستخلص غير موجود: ${claimId}`)
  }

  const clientAccount = await getDefaultAccountByRole(AccountRole.CUSTOMER_AR, tx)
  const revenueAccount = await getDefaultAccountByRole(AccountRole.PROJECT_REVENUE, tx)
  const outputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_OUTPUT, tx)

  if (!clientAccount || !revenueAccount || !outputVatAccount) {
    throw new Error(
      `حساب مفقود لقيد المستخلص: clientAccount=${!!clientAccount}, ` +
      `revenueAccount=${!!revenueAccount}, outputVatAccount=${!!outputVatAccount}`
    )
  }

  const amount = toNumber(claim.amount)
  const vatAmount = toNumber(claim.vatAmount)
  const totalAmount = toNumber(claim.totalAmount)

  const lines: Array<{ accountId: string; debit: number; credit: number; description: string }> = [
    { accountId: clientAccount.id, debit: totalAmount, credit: 0, description: `مستخلص ${claim.claimNo} - ${claim.project?.name || ''}` },
    { accountId: revenueAccount.id, debit: 0, credit: amount, description: `إيراد مستخلص ${claim.claimNo} (${claim.percentage}%)` },
  ]
  if (vatAmount > 0) {
    lines.push({ accountId: outputVatAccount.id, debit: 0, credit: vatAmount, description: `ضريبة مخرجات مستخلص ${claim.claimNo}` })
  }

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: claim.date,
      description: `مستخلص ${claim.claimNo} - ${claim.project?.name || ''}`,
      sourceType: 'PROGRESS_CLAIM',
      sourceId: claim.id,
      lines,
    },
    tx
  )

  await tx.progressClaim.update({ where: { id: claimId }, data: { journalEntryId: entry.id } })
  return entry
}
