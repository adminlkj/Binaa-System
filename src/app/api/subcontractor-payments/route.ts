import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { autoEntrySubcontractorPayment, type PrismaTransaction } from '@/lib/accounting/engine'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-payments?subcontractorId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: Prisma.SubcontractorPaymentWhereInput = {}
    if (subcontractorId) where.subcontractorId = subcontractorId

    const payments = await db.subcontractorPayment.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true } },
        subcontractorInvoice: { select: { id: true, invoiceNo: true, projectId: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
    })

    const normalized = payments.map(p => ({
      ...p,
      amount: Number(p.amount),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Subcontractor payments GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor payments' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-payments
// Creates payment + journal entry + updates invoice paidAmount atomically
// (P2-CRIT-002 + P2-CRIT-003 fix).
// R1 enforced — if the JE fails, the payment record is rolled back too.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, subcontractorInvoiceId, paymentDate, paymentMethod, bankAccountId, chequeNo, amount, notes } = body

    if (!subcontractorId || !amount || !paymentDate) {
      return NextResponse.json({ error: 'subcontractorId, amount, paymentDate are required' }, { status: 400 })
    }

    // Validate subcontractor exists
    const subcontractor = await db.subcontractor.findUnique({
      where: { id: subcontractorId },
      select: { id: true, name: true },
    })
    if (!subcontractor) return NextResponse.json({ error: 'المقاول غير موجود' }, { status: 404 })

    // Validate invoice exists + fetch project costCenterId (P2-HIGH-009 fix)
    let projectCostCenterId: string | undefined
    if (subcontractorInvoiceId) {
      const invoice = await db.subcontractorInvoice.findUnique({
        where: { id: subcontractorInvoiceId },
        select: { id: true, invoiceNo: true, totalAmount: true, paidAmount: true, status: true, projectId: true },
      })
      if (!invoice) return NextResponse.json({ error: 'فاتورة المقاول غير موجودة' }, { status: 404 })

      // Fetch project cost center for JE attribution
      if (invoice.projectId) {
        const project = await db.project.findUnique({
          where: { id: invoice.projectId },
          select: { costCenterId: true },
        })
        projectCostCenterId = project?.costCenterId || undefined
      }
    }

    const year = new Date(paymentDate).getFullYear()
    const count = await db.subcontractorPayment.count()
    const paymentNo = `SCP-${year}-${String(count + 1).padStart(4, '0')}`

    // Use Decimal for financial precision (P2-CRIT-008 fix)
    const amt = new Prisma.Decimal(body.amount)

    // Atomic: payment record + JE + invoice paidAmount update (P2-CRIT-002, P2-CRIT-003 fix)
    const payment = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.subcontractorPayment.create({
        data: {
          paymentNo,
          subcontractorId,
          subcontractorInvoiceId,
          paymentDate: new Date(paymentDate),
          paymentMethod: paymentMethod || 'BANK_TRANSFER',
          bankAccountId,
          chequeNo,
          amount: amt,
          status: 'PAID', // payment is immediately effective
          notes,
        },
        include: {
          subcontractor: { select: { id: true, name: true } },
          subcontractorInvoice: { select: { id: true, invoiceNo: true, projectId: true } },
        },
      })

      // R1: every financial operation MUST create a posted JE.
      const je = await autoEntrySubcontractorPayment({
        paymentNo: created.paymentNo,
        subcontractorName: subcontractor.name,
        amount: Number(created.amount),
        date: created.paymentDate,
        paymentMethod: created.paymentMethod === 'BANK_TRANSFER' || created.paymentMethod === 'CHEQUE' ? 'BANK' : 'CASH',
        costCenterId: projectCostCenterId,
      }, tx)

      // Store journalEntryId on the payment
      await tx.subcontractorPayment.update({
        where: { id: created.id },
        data: { journalEntryId: je.id },
      })

      // P2-CRIT-003 fix: increment invoice paidAmount + transition status
      if (subcontractorInvoiceId) {
        const updated = await tx.subcontractorInvoice.update({
          where: { id: subcontractorInvoiceId },
          data: { paidAmount: { increment: amt } },
          select: { paidAmount: true, totalAmount: true, status: true },
        })

        // Transition status: DRAFT → PARTIALLY_PAID → PAID
        const paid = Number(updated.paidAmount)
        const total = Number(updated.totalAmount)
        let newStatus: string | null = null
        if (paid >= total - 0.01) {
          newStatus = 'PAID'
        } else if (paid > 0) {
          newStatus = 'PARTIALLY_PAID'
        }
        if (newStatus && newStatus !== updated.status) {
          await tx.subcontractorInvoice.update({
            where: { id: subcontractorInvoiceId },
            data: { status: newStatus },
          })
        }
      }

      return tx.subcontractorPayment.findUnique({
        where: { id: created.id },
        include: {
          subcontractor: { select: { id: true, name: true } },
          subcontractorInvoice: { select: { id: true, invoiceNo: true, projectId: true } },
        },
      })
    })

    return NextResponse.json({
      data: { ...payment, amount: Number(payment!.amount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor payments POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor payment' },
      { status: 500 }
    )
  }
}
