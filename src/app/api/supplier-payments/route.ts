import { db } from '@/lib/db'
import { autoEntrySupplierPayment, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const invoiceId = searchParams.get('invoiceId')
    const paidFrom = searchParams.get('paidFrom')

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (invoiceId) where.invoiceId = invoiceId
    if (paidFrom) where.paidFrom = paidFrom

    const payments = await db.supplierPayment.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(payments)
  } catch (error) {
    console.error('Error fetching supplier payments:', error)
    return NextResponse.json({ error: 'فشل في تحميل مدفوعات الموردين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, invoiceId, amount, date, paidFrom, bankAccount, paymentMethod, reference, notes } = body

    if (!supplierId || !amount || !date) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    // Validate supplier exists
    const supplier = await db.supplier.findUnique({
      where: { id: supplierId },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }

    // If invoiceId provided, validate and check amount
    if (invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: invoiceId },
      })
      if (!invoice) {
        return NextResponse.json({ error: 'فاتورة الشراء غير موجودة' }, { status: 404 })
      }
      if (invoice.supplierId !== supplierId) {
        return NextResponse.json(
          { error: 'فاتورة الشراء لا تنتمي لهذا المورد' },
          { status: 400 }
        )
      }
    }

    // Create the payment
    const payment = await db.supplierPayment.create({
      data: {
        supplierId,
        invoiceId: invoiceId || null,
        amount,
        date: new Date(date),
        paidFrom: paidFrom || 'TREASURY',
        bankAccount: bankAccount || null,
        paymentMethod: paymentMethod || null,
        reference: reference || null,
        notes: notes || null,
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    // Create accounting entry using autoEntrySupplierPayment
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntrySupplierPayment({
        supplierName: supplier.name,
        amount,
        date: new Date(date),
        paidFrom: paidFrom === 'BANK' ? 'BANK' : 'TREASURY',
        reference: reference || undefined,
      })

      // Store the journalEntryId on the payment
      await db.supplierPayment.update({
        where: { id: payment.id },
        data: { journalEntryId: journalEntry.id },
      })
    } catch (accountingError) {
      console.error('Accounting entry failed for supplier payment:', accountingError)
    }

    // Update purchase invoice paidAmount and status
    if (invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: invoiceId },
      })
      if (invoice) {
        const newPaidAmount = invoice.paidAmount + amount
        let newStatus = invoice.status

        if (newPaidAmount >= invoice.totalAmount) {
          newStatus = 'PAID'
        } else if (newPaidAmount > 0) {
          newStatus = 'PARTIALLY_PAID'
        }

        await db.purchaseInvoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
          },
        })
      }
    }

    // Re-fetch to include journalEntryId
    const updatedPayment = await db.supplierPayment.findUnique({
      where: { id: payment.id },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(updatedPayment, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier payment:', error)
    return NextResponse.json({ error: 'فشل في إنشاء دفعة المورد' }, { status: 500 })
  }
}
