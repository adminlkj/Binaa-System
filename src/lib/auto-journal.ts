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

import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'
import { toNumber } from '@/lib/decimal'
import { AccountRole, getDefaultAccountByRole } from '@/lib/account-roles'
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
    include: { client: true },
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

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: invoice.date,
      description: `فاتورة مبيعات ${invoice.invoiceNo}`,
      sourceType: 'SALES_INVOICE',
      sourceId: invoice.id,
      lines: [
        { accountId: clientAccount.id, debit: toNumber(invoice.totalAmount), credit: 0, description: `فاتورة ${invoice.invoiceNo} - ${invoice.client.name}` },
        { accountId: revenueAccount.id, debit: 0, credit: toNumber(invoice.netAmount), description: `إيرادات فاتورة ${invoice.invoiceNo}` },
        { accountId: outputVatAccount.id, debit: 0, credit: toNumber(invoice.vatAmount), description: `ضريبة مخرجات فاتورة ${invoice.invoiceNo}` },
      ],
    },
    tx
  )

  await tx.salesInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } })
  return entry
}

// ---------------------------------------------------------------------------
// Purchase Invoice → Journal Entry
//   Dr: Cost (PROJECT_COST or MAINTENANCE_EXPENSE) — subtotal
//   Dr: Input VAT (VAT_INPUT) — vatAmount
//   Cr: Suppliers (SUPPLIER_AP) — totalAmount
// ---------------------------------------------------------------------------
export async function createPurchaseInvoiceJournalEntry(
  invoiceId: string,
  tx: PrismaTransaction
) {
  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true },
  })
  if (!invoice) {
    throw new Error(`فاتورة الشراء غير موجودة: ${invoiceId}`)
  }

  const costAccount = invoice.projectId
    ? await getDefaultAccountByRole(AccountRole.PROJECT_COST, tx)
    : await getDefaultAccountByRole(AccountRole.MAINTENANCE_EXPENSE, tx)
  const inputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_INPUT, tx)
  const supplierAccount = await getDefaultAccountByRole(AccountRole.SUPPLIER_AP, tx)

  if (!costAccount || !inputVatAccount || !supplierAccount) {
    throw new Error(
      `حساب مفقود لقيد فاتورة الشراء: costAccount=${!!costAccount}, ` +
      `inputVatAccount=${!!inputVatAccount}, supplierAccount=${!!supplierAccount}`
    )
  }

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: invoice.date,
      description: `فاتورة مورد ${invoice.invoiceNo}`,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: invoice.id,
      lines: [
        { accountId: costAccount.id, debit: toNumber(invoice.subtotal), credit: 0, description: `تكلفة فاتورة ${invoice.invoiceNo}` },
        { accountId: inputVatAccount.id, debit: toNumber(invoice.vatAmount), credit: 0, description: `ضريبة مدخلات فاتورة ${invoice.invoiceNo}` },
        { accountId: supplierAccount.id, debit: 0, credit: toNumber(invoice.totalAmount), description: `مورد ${invoice.supplier.name}` },
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
    include: { client: true },
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

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: payment.date,
      description: `تحصيل من ${payment.client.name}`,
      sourceType: 'CLIENT_PAYMENT',
      sourceId: payment.id,
      lines: [
        { accountId: receivingAccount.id, debit: toNumber(payment.amount), credit: 0, description: `تحصيل نقدي` },
        { accountId: clientAccount.id, debit: 0, credit: toNumber(payment.amount), description: `تحصيل من ${payment.client.name}` },
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

  const supplierAccount = await getDefaultAccountByRole(AccountRole.SUPPLIER_AP, tx)
  let payingAccount: { id: string } | null = null
  if (payment.payingAccountId) {
    payingAccount = await tx.account.findUnique({ where: { id: payment.payingAccountId } })
  }
  if (!payingAccount) {
    payingAccount = await getDefaultAccountByRole(AccountRole.CASH, tx)
  }

  if (!supplierAccount || !payingAccount) {
    throw new Error(
      `حساب مفقود لقيد سداد المورد: supplierAccount=${!!supplierAccount}, ` +
      `payingAccount=${!!payingAccount}`
    )
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
        { accountId: supplierAccount.id, debit: toNumber(payment.amount), credit: 0, description: `سداد مورد ${payment.supplier.name}` },
        { accountId: payingAccount.id, debit: 0, credit: toNumber(payment.amount), description: `صرف نقدي` },
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
