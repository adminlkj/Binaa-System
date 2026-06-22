import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-payments?subcontractorId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: any = {}
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
      { error: 'Failed to fetch subcontractor payments', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-payments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, subcontractorInvoiceId, paymentDate, paymentMethod, bankAccountId, chequeNo, amount, notes } = body

    if (!subcontractorId || !amount || !paymentDate) {
      return NextResponse.json({ error: 'subcontractorId, amount, paymentDate are required' }, { status: 400 })
    }

    const year = new Date(paymentDate).getFullYear()
    const count = await db.subcontractorPayment.count()
    const paymentNo = `SCP-${year}-${String(count + 1).padStart(4, '0')}`

    const payment = await db.subcontractorPayment.create({
      data: {
        paymentNo,
        subcontractorId,
        subcontractorInvoiceId,
        paymentDate: new Date(paymentDate),
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
        bankAccountId,
        chequeNo,
        amount: Number(amount),
        status: 'PENDING',
        notes,
      },
    })

    return NextResponse.json({
      data: { ...payment, amount: Number(payment.amount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor payments POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor payment', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
