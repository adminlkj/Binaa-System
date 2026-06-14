// Auto Journal Entry Generation
// Simplified direct journal entry creation using account codes
// This replaces the heavy accounting engine for automatic entries

import { db } from '@/lib/db'
import { PrismaClient } from '@prisma/client'
import { toNumber } from '@/lib/decimal'

export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// Generate next journal entry number
async function getNextEntryNo(tx: PrismaTransaction): Promise<string> {
  const last = await tx.journalEntry.findFirst({ orderBy: { entryNo: 'desc' } })
  const next = last ? parseInt(last.entryNo.replace('JE-', '')) + 1 : 1
  return `JE-${next.toString().padStart(6, '0')}`
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
  if (!invoice) return

  const entryNo = await getNextEntryNo(tx)

  // Debit: العملاء (Clients Receivable)
  // Credit: إيرادات المشاريع أو إيرادات التأجير
  // Credit: ضريبة المخرجات (Output VAT)

  // Find the correct accounts
  const clientAccount = await tx.account.findFirst({ where: { code: '1101' } }) // العملاء
  const revenueAccount = invoice.invoiceType === 'RENTAL'
    ? await tx.account.findFirst({ where: { code: '4102' } }) // إيرادات التأجير
    : await tx.account.findFirst({ where: { code: '4101' } }) // إيرادات المشاريع
  const outputVatAccount = await tx.account.findFirst({ where: { code: '2102' } }) // ضريبة المخرجات

  if (!clientAccount || !revenueAccount || !outputVatAccount) {
    console.error('[AutoJournal] Missing accounts for sales invoice journal:', {
      clientAccount: !!clientAccount,
      revenueAccount: !!revenueAccount,
      outputVatAccount: !!outputVatAccount
    })
    return
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
  if (!invoice) return

  const entryNo = await getNextEntryNo(tx)

  const costAccount = invoice.projectId
    ? await tx.account.findFirst({ where: { code: '5101' } }) // تكلفة المشاريع
    : await tx.account.findFirst({ where: { code: '5102' } }) // تكلفة التأجير
  const inputVatAccount = await tx.account.findFirst({ where: { code: '1104' } }) // ضريبة المدخلات
  const supplierAccount = await tx.account.findFirst({ where: { code: '2101' } }) // الموردون

  if (!costAccount || !inputVatAccount || !supplierAccount) {
    console.error('[AutoJournal] Missing accounts for purchase invoice journal:', {
      costAccount: !!costAccount,
      inputVatAccount: !!inputVatAccount,
      supplierAccount: !!supplierAccount
    })
    return
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
  if (!payment) return

  const entryNo = await getNextEntryNo(tx)

  const treasuryAccount = await tx.account.findFirst({ where: { code: '1102' } }) // الصندوق/الخزينة
  const clientAccount = await tx.account.findFirst({ where: { code: '1101' } }) // العملاء

  if (!treasuryAccount || !clientAccount) {
    console.error('[AutoJournal] Missing accounts for client payment journal:', {
      treasuryAccount: !!treasuryAccount,
      clientAccount: !!clientAccount
    })
    return
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
          { accountId: treasuryAccount.id, debit: payment.amount, credit: 0, description: `تحصيل نقدي` },
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
  if (!payment) return

  const entryNo = await getNextEntryNo(tx)

  const supplierAccount = await tx.account.findFirst({ where: { code: '2101' } }) // الموردون
  const treasuryAccount = await tx.account.findFirst({ where: { code: '1102' } }) // الصندوق

  if (!supplierAccount || !treasuryAccount) {
    console.error('[AutoJournal] Missing accounts for supplier payment journal:', {
      supplierAccount: !!supplierAccount,
      treasuryAccount: !!treasuryAccount
    })
    return
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
          { accountId: treasuryAccount.id, debit: 0, credit: payment.amount, description: `صرف نقدي` },
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
  if (!expense) return

  const entryNo = await getNextEntryNo(tx)

  const costAccount = expense.projectId
    ? await tx.account.findFirst({ where: { code: '5101' } })
    : await tx.account.findFirst({ where: { code: '5102' } })
  const inputVatAccount = await tx.account.findFirst({ where: { code: '1104' } })
  const treasuryAccount = await tx.account.findFirst({ where: { code: '1102' } })

  if (!costAccount || !treasuryAccount) {
    console.error('[AutoJournal] Missing accounts for expense journal:', {
      costAccount: !!costAccount,
      treasuryAccount: !!treasuryAccount
    })
    return
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
