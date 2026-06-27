import { db } from '@/lib/db'
import { autoEntrySubcontractorInvoice, initializeChartOfAccounts, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId

    const invoices = await db.subcontractorInvoice.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true, code: true, specialty: true } },
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching subcontractor invoices:', error)
    return NextResponse.json({ error: 'فشل في تحميل فواتير مقاولي الباطن' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { subcontractorId, projectId, date, amount, vatRate = 0.15, description } = body

    if (!subcontractorId || !date || !amount) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 })
    }

    const vatAmount = amount * vatRate
    const totalAmount = amount + vatAmount

    // Auto-generate invoice number
    const lastInvoice = await db.subcontractorInvoice.findFirst({
      orderBy: { invoiceNo: 'desc' },
      select: { invoiceNo: true },
    })

    let nextNum = 1
    if (lastInvoice?.invoiceNo) {
      const match = lastInvoice.invoiceNo.match(/SCI-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const invoiceNo = `SCI-${String(nextNum).padStart(4, '0')}`

    // Atomic: invoice record + JE in one transaction.
    // R1 enforced — if the JE fails, the invoice record is rolled back too.
    // costCenterId is NOT projectId (distinct entities) — left undefined here.
    const invoice = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.subcontractorInvoice.create({
        data: {
          subcontractorId,
          projectId: projectId || null,
          invoiceNo,
          date: new Date(date),
          amount,
          vatRate,
          vatAmount,
          totalAmount,
          paidAmount: 0,
          status: 'DRAFT',
          description: description || null,
        },
        include: {
          subcontractor: { select: { id: true, name: true, code: true, specialty: true } },
          project: { select: { id: true, name: true, code: true } },
        },
      })

      await initializeChartOfAccounts()
      await autoEntrySubcontractorInvoice({
        invoiceNo: created.invoiceNo,
        subcontractorName: created.subcontractor.name,
        amount: created.amount,
        vatRate: created.vatRate,
        vatAmount: created.vatAmount,
        totalAmount: created.totalAmount,
        date: created.date,
        costCenterId: undefined,
      }, tx)

      return created
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    console.error('Error creating subcontractor invoice:', error)
    return NextResponse.json({ error: 'فشل في إنشاء فاتورة مقاول الباطن' }, { status: 500 })
  }
}
