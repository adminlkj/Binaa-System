import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { autoEntrySubcontractorInvoice, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Invoices API
// ----------------------------------------------------------------------------
// P1-2 CRIT-1 FIX: previously the autoEntrySubcontractorInvoice function in
// engine.ts had ZERO API callers — subcontractor invoices were recorded only
// as operational rows with no GL impact (SUBCONTRACTOR_AP understated,
// SUBCONTRACTOR_COST understated, VAT_INPUT never claimed).
//
// This endpoint wires the source document to the journal engine:
//   1. requireRoleApi('ADMIN', 'ACCOUNTANT')
//   2. parse + validate body
//   3. db.$transaction:
//      a. create SubcontractorInvoice row
//      b. autoEntrySubcontractorInvoice(tx) → Dr SUBCONTRACTOR_COST + Dr VAT_INPUT / Cr SUBCONTRACTOR_AP
//      c. update row.journalEntryId = je.id
//      d. re-fetch with relations
// ============================================================================

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { deletedAt: null }
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const invoices = await db.subcontractorInvoice.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor invoices:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { subcontractorId, projectId, invoiceNo, date, amount, vatRate, vatAmount, totalAmount, description } = body

    if (!subcontractorId || !invoiceNo || !date || amount === undefined) {
      return NextResponse.json(
        { error: 'الحقول المطلوبة: المقاول، رقم الفاتورة، التاريخ، المبلغ' },
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

    // Compute VAT / total when not provided
    const vatRateNum = vatRate !== undefined ? Number(vatRate) : 0.15
    const vatAmountNum = vatAmount !== undefined
      ? Number(vatAmount)
      : Math.round(amountNum * vatRateNum * 100) / 100
    const totalAmountNum = totalAmount !== undefined
      ? Number(totalAmount)
      : Math.round((amountNum + vatAmountNum) * 100) / 100

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // Resolve costCenterId from project (if linked)
      let costCenterId: string | undefined
      if (projectId) {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { costCenterId: true },
        })
        costCenterId = project?.costCenterId || undefined
      }

      // 1. Create the source document
      const invoice = await tx.subcontractorInvoice.create({
        data: {
          subcontractorId,
          projectId: projectId || null,
          invoiceNo,
          date: new Date(date),
          amount: amountNum,
          vatRate: vatRateNum,
          vatAmount: vatAmountNum,
          totalAmount: totalAmountNum,
          paidAmount: 0,
          // SENT = approved & posted to GL, awaiting payment (InvoiceStatus enum:
          // DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED)
          status: 'SENT',
          description: description || null,
        },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      // 2. Post the journal entry via the unified autoEntry (uses getNextEntryNo(tx) + R1-R12 guard)
      const je = await autoEntrySubcontractorInvoice({
        invoiceNo: invoice.invoiceNo,
        subcontractorName: subcontractor.nameAr || subcontractor.name,
        amount: amountNum,
        vatRate: vatRateNum,
        vatAmount: vatAmountNum,
        totalAmount: totalAmountNum,
        date: invoice.date,
        costCenterId,
      }, tx)

      // 3. Link back: source doc → JE
      await tx.subcontractorInvoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: je.id },
      })

      // 4. Re-fetch with the journalEntryId populated
      return await tx.subcontractorInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create subcontractor invoice:', error)
    return NextResponse.json({ error: 'Failed to create subcontractor invoice' }, { status: 500 })
  }
}
