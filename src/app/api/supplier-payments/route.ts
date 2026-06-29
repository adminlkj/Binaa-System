import { db } from '@/lib/db'
import { createSupplierPaymentJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { toNumber } from '@/lib/decimal'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')
    const invoiceId = searchParams.get('invoiceId')
    const paidFrom = searchParams.get('paidFrom')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (supplierId) where.supplierId = supplierId
    if (invoiceId) where.invoiceId = invoiceId
    if (paidFrom) where.paidFrom = paidFrom
    if (search) {
      where.OR = [
        { reference: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const include = {
      supplier: { select: { id: true, name: true, code: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const payments = await db.supplierPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(payments)
    }

    const [data, total] = await Promise.all([
      db.supplierPayment.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.supplierPayment.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch supplier payments:', error)
    return NextResponse.json({ error: 'Failed to fetch supplier payments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { supplierId, invoiceId, amount, date, paidFrom, payingAccountId, payingAccountCode, payingAccountName, bankAccount, paymentMethod, reference, notes } = body

    if (!supplierId || !amount || !date) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    const payAmount = parseFloat(amount) || 0
    if (payAmount <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 })
    }

    // Validate supplier exists
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, deletedAt: null },
    })
    if (!supplier) {
      return NextResponse.json({ error: 'المورد غير موجود' }, { status: 404 })
    }

    // P5-CRIT-009 FIX: If invoiceId provided, validate invoice status + overpayment.
    // Previously the POST allowed paying DRAFT / PAID / CANCELLED invoices and
    // had no overpayment check — a direct API call could un-CANCEL an invoice,
    // double-pay a PAID invoice, or pay a DRAFT invoice.
    // The annotation mirrors the select() return shape (Decimal — not bigint).
    let linkedInvoice: { id: string; status: string; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; purchaseOrderId: string | null } | null = null
    if (invoiceId) {
      const invoice = await db.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, status: true, totalAmount: true, paidAmount: true, supplierId: true, purchaseOrderId: true },
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
      if (invoice.status === 'CANCELLED') {
        return NextResponse.json({ error: 'لا يمكن الدفع لفاتورة ملغاة' }, { status: 400 })
      }
      if (invoice.status === 'DRAFT') {
        return NextResponse.json({ error: 'لا يمكن الدفع لفاتورة مسودة — اعتمد الفاتورة أولاً' }, { status: 400 })
      }
      if (invoice.status === 'PAID') {
        return NextResponse.json({ error: 'الفاتورة مدفوعة بالكامل' }, { status: 400 })
      }
      // Overpayment check
      const remaining = toNumber(invoice.totalAmount) - toNumber(invoice.paidAmount)
      if (payAmount > remaining + 0.01) {
        return NextResponse.json(
          { error: `المبلغ ${payAmount} يتجاوز المتبقي على الفاتورة (${remaining.toFixed(2)})` },
          { status: 400 }
        )
      }
      linkedInvoice = invoice
    }

    // Create the payment + accounting entry + update invoice + update PO in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Create the payment
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId,
          invoiceId: invoiceId || null,
          amount: payAmount,
          date: new Date(date),
          paidFrom: paidFrom || 'TREASURY',
          payingAccountId: payingAccountId || null,
          payingAccountCode: payingAccountCode || null,
          payingAccountName: payingAccountName || null,
          bankAccount: bankAccount || null,
          paymentMethod: paymentMethod || null,
          reference: reference || null,
          notes: notes || null,
        },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
      })

      // Create accounting entry (throws on failure → tx rolls back).
      await createSupplierPaymentJournalEntry(payment.id, tx)

      // Update purchase invoice paidAmount and status
      if (linkedInvoice) {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: linkedInvoice.id },
        })
        if (invoice) {
          const newPaidAmount = toNumber(invoice.paidAmount) + payAmount
          let newStatus = invoice.status

          if (newPaidAmount >= toNumber(invoice.totalAmount) - 0.01) {
            newStatus = 'PAID'
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID'
          }

          await tx.purchaseInvoice.update({
            where: { id: linkedInvoice.id },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          })

          // P5-CRIT-011 FIX: also update PurchaseOrder.paidAmount if the invoice is linked to a PO.
          // Previously PO.paidAmount was never updated — UI showed "paid: 0" forever.
          if (invoice.purchaseOrderId) {
            const po = await tx.purchaseOrder.findUnique({
              where: { id: invoice.purchaseOrderId },
              select: { id: true, paidAmount: true },
            })
            if (po) {
              await tx.purchaseOrder.update({
                where: { id: po.id },
                data: { paidAmount: toNumber(po.paidAmount) + payAmount },
              })
            }
          }
        }
      }

      // Re-fetch to include journalEntryId
      return await tx.supplierPayment.findUnique({
        where: { id: payment.id },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create supplier payment:', error)
    return NextResponse.json({ error: 'Failed to create supplier payment' }, { status: 500 })
  }
}
