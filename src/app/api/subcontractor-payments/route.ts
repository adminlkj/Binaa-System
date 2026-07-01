import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { autoEntrySubcontractorPayment, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Payments API
// ----------------------------------------------------------------------------
// P1-2 CRIT-2 FIX: previously autoEntrySubcontractorPayment had ZERO API
// callers — SUBCONTRACTOR_AP was never relieved; cash outflow was invisible
// to the GL.
//
//   Dr SUBCONTRACTOR_AP  /  Cr CASH (or BANK)
// ============================================================================

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const subcontractorInvoiceId = searchParams.get('subcontractorInvoiceId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (subcontractorInvoiceId) where.subcontractorInvoiceId = subcontractorInvoiceId
    if (status) where.status = status

    const payments = await db.subcontractorPayment.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        subcontractorInvoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
      },
      orderBy: { paymentDate: 'desc' },
    })

    return NextResponse.json(payments)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor payments:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor payments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const {
      paymentNo,
      subcontractorId,
      subcontractorInvoiceId,
      paymentDate,
      amount,
      paymentMethod,
      bankAccountId,
      chequeNo,
      notes,
    } = body

    if (!paymentNo || !subcontractorId || !paymentDate || amount === undefined) {
      return NextResponse.json(
        { error: 'الحقول المطلوبة: رقم السداد، المقاول، التاريخ، المبلغ' },
        { status: 400 }
      )
    }

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
    }

    // Validate subcontractor exists
    const subcontractor = await db.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!subcontractor) {
      return NextResponse.json({ error: 'مقاول الباطن غير موجود' }, { status: 404 })
    }

    // Validate the linked invoice (if provided) belongs to the same subcontractor
    if (subcontractorInvoiceId) {
      const inv = await db.subcontractorInvoice.findUnique({
        where: { id: subcontractorInvoiceId },
        select: { id: true, subcontractorId: true, status: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'فاتورة مقاول الباطن غير موجودة' }, { status: 404 })
      }
      if (inv.subcontractorId !== subcontractorId) {
        return NextResponse.json(
          { error: 'الفاتورة لا تنتمي لهذا المقاول' },
          { status: 400 }
        )
      }
    }

    // Map paymentMethod to the autoEntry's CASH/BANK enum
    // (CASH, BANK_TRANSFER, CHEQUE) → 'BANK' for non-cash, 'CASH' for cash
    const method: 'CASH' | 'BANK' = paymentMethod === 'CASH' ? 'CASH' : 'BANK'

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Resolve costCenterId from linked invoice's project (if any)
      let costCenterId: string | undefined
      if (subcontractorInvoiceId) {
        const inv = await tx.subcontractorInvoice.findUnique({
          where: { id: subcontractorInvoiceId },
          select: { projectId: true, project: { select: { costCenterId: true } } },
        })
        costCenterId = inv?.project?.costCenterId || undefined
      }

      // 1. Create the source document
      const payment = await tx.subcontractorPayment.create({
        data: {
          paymentNo,
          subcontractorId,
          subcontractorInvoiceId: subcontractorInvoiceId || null,
          paymentDate: new Date(paymentDate),
          paymentMethod: paymentMethod || 'BANK_TRANSFER',
          bankAccountId: bankAccountId || null,
          chequeNo: chequeNo || null,
          amount: amountNum,
          status: 'PAID',
          notes: notes || null,
        },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          subcontractorInvoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
        },
      })

      // 2. Post the journal entry
      const je = await autoEntrySubcontractorPayment({
        paymentNo: payment.paymentNo,
        subcontractorName: subcontractor.nameAr || subcontractor.name,
        amount: amountNum,
        date: payment.paymentDate,
        paymentMethod: method,
        costCenterId,
      }, tx)

      // 3. Link back: source doc → JE
      await tx.subcontractorPayment.update({
        where: { id: payment.id },
        data: { journalEntryId: je.id },
      })

      // 4. Optionally relieve the linked invoice's paidAmount
      if (subcontractorInvoiceId) {
        const inv = await tx.subcontractorInvoice.findUnique({
          where: { id: subcontractorInvoiceId },
          select: { id: true, paidAmount: true, totalAmount: true, status: true },
        })
        if (inv) {
          const newPaid = Number(inv.paidAmount) + amountNum
          const total = Number(inv.totalAmount)
          let newStatus = inv.status
          if (newPaid >= total - 0.01) {
            newStatus = 'PAID'
          } else if (newPaid > 0) {
            newStatus = 'PARTIALLY_PAID'
          }
          await tx.subcontractorInvoice.update({
            where: { id: subcontractorInvoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          })
        }
      }

      return await tx.subcontractorPayment.findUniqueOrThrow({
        where: { id: payment.id },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          subcontractorInvoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create subcontractor payment:', error)
    return NextResponse.json({ error: 'Failed to create subcontractor payment' }, { status: 500 })
  }
}
