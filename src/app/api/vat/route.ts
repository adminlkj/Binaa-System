import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const vatReturns = await db.vATReturn.findMany({
      orderBy: { period: 'desc' },
    })
    return NextResponse.json(vatReturns)
  } catch (error) {
    console.error('Error fetching VAT returns:', error)
    return NextResponse.json({ error: 'فشل في تحميل إقرارات الضريبة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const salesVAT = parseFloat(body.salesVAT) || 0
    const purchaseVAT = parseFloat(body.purchaseVAT) || 0
    const netVAT = salesVAT - purchaseVAT

    const vatReturn = await db.vATReturn.create({
      data: {
        period: body.period,
        salesVAT,
        purchaseVAT,
        netVAT,
        status: body.status || 'DRAFT',
        filedDate: body.filedDate ? new Date(body.filedDate) : null,
      },
    })

    return NextResponse.json(vatReturn, { status: 201 })
  } catch (error) {
    console.error('Error creating VAT return:', error)
    return NextResponse.json({ error: 'فشل في إنشاء إقرار الضريبة' }, { status: 500 })
  }
}
