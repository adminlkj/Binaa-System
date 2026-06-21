import { db } from '@/lib/db'
import { serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'
import { calculateVatForQuarter } from '@/lib/vat-calc'

// ============ GET: Single VAT return with full breakdown ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vatReturn = await db.vATReturn.findUnique({ where: { id } })
    if (!vatReturn) {
      return NextResponse.json({ error: 'الإقرار الضريبي غير موجود' }, { status: 404 })
    }

    // احسب الأرقام الحية لمقارنتها بالإقرار المجمّد
    const liveCalc = await calculateVatForQuarter(vatReturn.year, vatReturn.quarter)

    // أوجد كل الإقرارات لنفس الفترة (لمعرفة السلسلة - الملغى والمعدل)
    const periodChain = await db.vATReturn.findMany({
      where: { period: vatReturn.period },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        isAmendment: true,
        cancelledAt: true,
        cancelledReason: true,
        filedDate: true,
        createdAt: true,
        netVat: true,
      },
    })

    return NextResponse.json(serializeDecimal({
      declaration: vatReturn,
      liveCalc: {
        totalSales: liveCalc.totalSales,
        outputVat: liveCalc.outputVat,
        totalPurchases: liveCalc.totalPurchases,
        inputVat: liveCalc.inputVat,
        netVat: liveCalc.netVat,
        glOutputVat: liveCalc.glOutputVat,
        glInputVat: liveCalc.glInputVat,
        glMatch: liveCalc.glMatch,
        glDiffOutput: liveCalc.glDiffOutput,
        glDiffInput: liveCalc.glDiffInput,
        categories: liveCalc.categories,
      },
      breakdown: {
        salesInvoices: liveCalc.salesInvoices,
        progressClaims: liveCalc.progressClaims,
        purchaseInvoices: liveCalc.purchaseInvoices,
        subcontractorInvoices: liveCalc.subcontractorInvoices,
        expenses: liveCalc.expenses,
      },
      periodChain,
      hasChangedSinceFiling:
        Math.abs(liveCalc.outputVat - Number(vatReturn.outputVat)) > 0.5 ||
        Math.abs(liveCalc.inputVat - Number(vatReturn.inputVat)) > 0.5,
    }))
  } catch (error) {
    console.error('Error fetching VAT return:', error)
    return NextResponse.json({ error: 'فشل في تحميل الإقرار الضريبي' }, { status: 500 })
  }
}
