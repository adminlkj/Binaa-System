// Auto Journal Entry Generation
// Simplified direct journal entry creation using role-based account resolution.
//
// This module is the legacy "auto-journal" layer still used by 13 API routes.
// Previously it relied on hardcoded SOCPA account codes (1101, 1102, 1104,
// 2101, 2102, 4101, 4102, 5101, 5102) that DID NOT EXIST in the database,
// causing every journal entry creation to fail silently.
//
// All hardcoded lookups have been replaced with `getDefaultAccountByRole()`
// from `@/lib/account-roles`. If a role is unmapped the function now THROWS
// so the surrounding `$transaction` rolls back instead of leaving the
// operational record without a journal entry.

import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'
import { toNumber } from '@/lib/decimal'
import { AccountRole, getDefaultAccountByRole } from '@/lib/account-roles'

export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// Generate next journal entry number.
// Looks at all existing entries matching the `JE-NNNNNN` pattern and produces
// the next sequential number. Entries that don't match the pattern (e.g.
// `JE-TEST-002`, `JE-REV-EXP-...`) are ignored so they cannot poison the
// counter with NaN.
async function getNextEntryNo(tx: PrismaTransaction): Promise<string> {
  // Find ALL JE- entries and compute the maximum numeric suffix.
  // This is more robust than string-sorting because it handles
  // non-standard entries like "JE-TEST-002" or "JE-000NaN" correctly.
  const all = await tx.journalEntry.findMany({
    where: { entryNo: { startsWith: 'JE-' } },
    select: { entryNo: true },
  })
  let max = 0
  for (const je of all) {
    // Only match entries that are exactly JE- followed by digits
    const match = je.entryNo.match(/^JE-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `JE-${(max + 1).toString().padStart(6, '0')}`
}

// Journal entry for Sales Invoice (project or rental)
export async function createSalesInvoiceJournalEntry(
  invoiceId: string,
  tx: PrismaTransaction
) {
  const invoice = await tx.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { client: true }
  })
  if (!invoice) {
    throw new Error(`فاتورة المبيعات غير موجودة: ${invoiceId}`)
  }

  const entryNo = await getNextEntryNo(tx)

  // Debit: العملاء (Clients Receivable) — resolved via role
  const clientAccount = await getDefaultAccountByRole(AccountRole.CUSTOMER_AR, tx)
  // Credit: إيرادات المشاريع أو إيرادات التأجير — resolved via role
  const revenueAccount = invoice.invoiceType === 'RENTAL'
    ? await getDefaultAccountByRole(AccountRole.RENTAL_REVENUE, tx)
    : await getDefaultAccountByRole(AccountRole.PROJECT_REVENUE, tx)
  // Credit: ضريبة المخرجات (Output VAT) — resolved via role
  const outputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_OUTPUT, tx)

  if (!clientAccount || !revenueAccount || !outputVatAccount) {
    throw new Error(
      `حساب مفقود لقيد فاتورة المبيعات: clientAccount=${!!clientAccount}, ` +
      `revenueAccount=${!!revenueAccount}, outputVatAccount=${!!outputVatAccount}`
    )
  }

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: invoice.date,
      description: `فاتورة مبيعات ${invoice.invoiceNo}`,
      sourceType: 'SALES_INVOICE',
      sourceId: invoice.id,
      isSystem: true,
      status: 'POSTED',
      lines: {
        create: [
          { accountId: clientAccount.id, debit: invoice.totalAmount, credit: 0, description: `فاتورة ${invoice.invoiceNo} - ${invoice.client.name}` },
          { accountId: revenueAccount.id, debit: 0, credit: invoice.netAmount, description: `إيرادات فاتورة ${invoice.invoiceNo}` },
          { accountId: outputVatAccount.id, debit: 0, credit: invoice.vatAmount, description: `ضريبة مخرجات فاتورة ${invoice.invoiceNo}` },
        ]
      }
    }
  })

  await tx.salesInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } })
  return entry
}

// Journal entry for Purchase Invoice
export async function createPurchaseInvoiceJournalEntry(
  invoiceId: string,
  tx: PrismaTransaction
) {
  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true }
  })
  if (!invoice) {
    throw new Error(`فاتورة الشراء غير موجودة: ${invoiceId}`)
  }

  const entryNo = await getNextEntryNo(tx)

  // Cost account is project cost when tied to a project, otherwise rental/equipment cost.
  // The MAINTENANCE_EXPENSE role covers rental/equipment operating expenses (7220).
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

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: invoice.date,
      description: `فاتورة مورد ${invoice.invoiceNo}`,
      sourceType: 'PURCHASE_INVOICE',
      sourceId: invoice.id,
      isSystem: true,
      status: 'POSTED',
      lines: {
        create: [
          { accountId: costAccount.id, debit: invoice.subtotal, credit: 0, description: `تكلفة فاتورة ${invoice.invoiceNo}` },
          { accountId: inputVatAccount.id, debit: invoice.vatAmount, credit: 0, description: `ضريبة مدخلات فاتورة ${invoice.invoiceNo}` },
          { accountId: supplierAccount.id, debit: 0, credit: invoice.totalAmount, description: `مورد ${invoice.supplier.name}` },
        ]
      }
    }
  })

  await tx.purchaseInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: entry.id } })
  return entry
}

// Journal entry for Client Payment (تحصيل)
export async function createClientPaymentJournalEntry(
  paymentId: string,
  tx: PrismaTransaction
) {
  const payment = await tx.clientPayment.findUnique({
    where: { id: paymentId },
    include: { client: true }
  })
  if (!payment) {
    throw new Error(`تحصيل العميل غير موجود: ${paymentId}`)
  }

  const entryNo = await getNextEntryNo(tx)

  // Use the receiving account from the payment if available, otherwise fall back to role-based lookup.
  let receivingAccount: { id: string } | null = null
  if (payment.receivingAccountId) {
    receivingAccount = await tx.account.findUnique({ where: { id: payment.receivingAccountId } })
  }
  if (!receivingAccount) {
    // Fall back to CASH role (treasury) — covers the old hardcoded '1102' lookup.
    receivingAccount = await getDefaultAccountByRole(AccountRole.CASH, tx)
  }

  const clientAccount = await getDefaultAccountByRole(AccountRole.CUSTOMER_AR, tx)

  if (!receivingAccount || !clientAccount) {
    throw new Error(
      `حساب مفقود لقيد تحصيل العميل: receivingAccount=${!!receivingAccount}, ` +
      `clientAccount=${!!clientAccount}`
    )
  }

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: payment.date,
      description: `تحصيل من ${payment.client.name}`,
      sourceType: 'CLIENT_PAYMENT',
      sourceId: payment.id,
      isSystem: true,
      status: 'POSTED',
      lines: {
        create: [
          { accountId: receivingAccount.id, debit: payment.amount, credit: 0, description: `تحصيل نقدي` },
          { accountId: clientAccount.id, debit: 0, credit: payment.amount, description: `تحصيل من ${payment.client.name}` },
        ]
      }
    }
  })

  await tx.clientPayment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } })
  return entry
}

// Journal entry for Supplier Payment
export async function createSupplierPaymentJournalEntry(
  paymentId: string,
  tx: PrismaTransaction
) {
  const payment = await tx.supplierPayment.findUnique({
    where: { id: paymentId },
    include: { supplier: true }
  })
  if (!payment) {
    throw new Error(`سداد المورد غير موجود: ${paymentId}`)
  }

  const entryNo = await getNextEntryNo(tx)

  const supplierAccount = await getDefaultAccountByRole(AccountRole.SUPPLIER_AP, tx)

  // Use the paying account from the payment if available, otherwise fall back to role-based lookup.
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

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: payment.date,
      description: `سداد إلى ${payment.supplier.name}`,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: payment.id,
      isSystem: true,
      status: 'POSTED',
      lines: {
        create: [
          { accountId: supplierAccount.id, debit: payment.amount, credit: 0, description: `سداد مورد ${payment.supplier.name}` },
          { accountId: payingAccount.id, debit: 0, credit: payment.amount, description: `صرف نقدي` },
        ]
      }
    }
  })

  await tx.supplierPayment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } })
  return entry
}

// Journal entry for Expense
export async function createExpenseJournalEntry(
  expenseId: string,
  tx: PrismaTransaction
) {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } })
  if (!expense) {
    throw new Error(`المصروف غير موجود: ${expenseId}`)
  }

  const entryNo = await getNextEntryNo(tx)

  // Cost account is project cost when tied to a project, otherwise admin/rental
  // expense. Project expenses → PROJECT_COST (7110..); admin expenses → ADMIN_EXPENSE.
  const costAccount = expense.projectId
    ? await getDefaultAccountByRole(AccountRole.PROJECT_COST, tx)
    : await getDefaultAccountByRole(AccountRole.ADMIN_EXPENSE, tx)

  // Input VAT — always resolved via role.
  const inputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_INPUT, tx)

  // Paying (cash/bank) account: BANK role when payFrom === 'BANK', otherwise CASH (treasury).
  const treasuryAccount = expense.payFrom === 'BANK'
    ? await getDefaultAccountByRole(AccountRole.BANK, tx)
    : await getDefaultAccountByRole(AccountRole.CASH, tx)

  if (!costAccount || !treasuryAccount) {
    throw new Error(
      `حساب مفقود لقيد المصروف: costAccount=${!!costAccount}, ` +
      `treasuryAccount=${!!treasuryAccount}`
    )
  }

  const lines = [
    { accountId: costAccount.id, debit: toNumber(expense.amount), credit: 0, description: `مصروف ${expense.description}` },
  ]

  if (toNumber(expense.vatAmount) > 0 && inputVatAccount) {
    lines.push({ accountId: inputVatAccount.id, debit: toNumber(expense.vatAmount), credit: 0, description: `ضريبة مدخلات مصروف` })
  }

  lines.push({ accountId: treasuryAccount.id, debit: 0, credit: toNumber(expense.totalAmount), description: `صرف نقدي` })

  const entry = await tx.journalEntry.create({
    data: {
      entryNo,
      date: expense.date,
      description: `مصروف ${expense.description}`,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      isSystem: true,
      status: 'POSTED',
      lines: { create: lines }
    }
  })

  await tx.expense.update({ where: { id: expenseId }, data: { journalEntryId: entry.id } })
  return entry
}
