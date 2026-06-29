import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/reports/aging?type=client|supplier&asOfDate=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'client'
    const asOfDateStr = searchParams.get('asOfDate') || new Date().toISOString().slice(0, 10)
    const asOfDate = new Date(asOfDateStr)
    asOfDate.setHours(23, 59, 59, 999)

    if (type === 'client') {
      // Client aging: outstanding invoices
      const invoices = await db.salesInvoice.findMany({
        where: {
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          date: { lte: asOfDate },
        },
        include: { client: true },
      })

      const byClient = new Map<string, any>()
      const totals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }

      for (const inv of invoices) {
        const paid = Number(inv.paidAmount || 0)
        const outstanding = Number(inv.totalAmount || 0) - paid
        if (outstanding <= 0.01) continue

        const days = Math.floor((asOfDate.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        let bucket = 'current'
        if (days > 90) bucket = '90+'
        else if (days > 60) bucket = '61-90'
        else if (days > 30) bucket = '31-60'
        else if (days > 0) bucket = '1-30'

        const clientId = inv.clientId
        if (!byClient.has(clientId)) {
          byClient.set(clientId, {
            partyId: clientId,
            partyCode: inv.client?.code || '',
            partyName: inv.client?.name || '',
            partyNameAr: inv.client?.nameAr || inv.client?.name || '',
            current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
            total: 0, invoiceCount: 0,
          })
        }
        const c = byClient.get(clientId)
        c[bucket] += outstanding
        c.total += outstanding
        c.invoiceCount++
        totals[bucket as keyof typeof totals] += outstanding
        totals.total += outstanding
      }

      return NextResponse.json({
        asOfDate: asOfDate.toISOString(),
        type: 'client',
        summary: { totalOutstanding: totals.total, byBucket: totals },
        details: Array.from(byClient.values()).sort((a, b) => b.total - a.total),
      })
    } else if (type === 'supplier') {
      // Supplier aging: outstanding purchase invoices + subcontractor invoices
      const [purchaseInvoices, subInvoices] = await Promise.all([
        db.purchaseInvoice.findMany({
          where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, date: { lte: asOfDate } },
          include: { supplier: true },
        }).catch(() => []),
        db.subcontractorInvoice.findMany({
          where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, date: { lte: asOfDate } },
          include: { subcontractor: true },
        }).catch(() => []),
      ])

      const bySupplier = new Map<string, any>()
      const totals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }

      for (const inv of purchaseInvoices as any[]) {
        const paid = Number(inv.paidAmount || 0)
        const outstanding = Number(inv.totalAmount || inv.amount || 0) - paid
        if (outstanding <= 0.01) continue

        const days = Math.floor((asOfDate.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        let bucket = 'current'
        if (days > 90) bucket = '90+'
        else if (days > 60) bucket = '61-90'
        else if (days > 30) bucket = '31-60'
        else if (days > 0) bucket = '1-30'

        const supplierId = inv.supplierId
        if (!bySupplier.has(supplierId)) {
          bySupplier.set(supplierId, {
            partyId: supplierId,
            partyCode: inv.supplier?.code || '',
            partyName: inv.supplier?.name || '',
            partyNameAr: inv.supplier?.nameAr || inv.supplier?.name || '',
            current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
            total: 0, invoiceCount: 0,
          })
        }
        const s = bySupplier.get(supplierId)
        s[bucket] += outstanding
        s.total += outstanding
        s.invoiceCount++
        totals[bucket as keyof typeof totals] += outstanding
        totals.total += outstanding
      }

      // Add subcontractor invoices
      for (const inv of subInvoices as any[]) {
        const paid = Number(inv.paidAmount || 0)
        const outstanding = Number(inv.amount || 0) - paid
        if (outstanding <= 0.01) continue

        const days = Math.floor((asOfDate.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        let bucket = 'current'
        if (days > 90) bucket = '90+'
        else if (days > 60) bucket = '61-90'
        else if (days > 30) bucket = '31-60'
        else if (days > 0) bucket = '1-30'

        const supplierId = inv.subcontractorId
        if (!bySupplier.has(supplierId)) {
          bySupplier.set(supplierId, {
            partyId: supplierId,
            partyCode: inv.subcontractor?.code || '',
            partyName: inv.subcontractor?.name || '',
            partyNameAr: inv.subcontractor?.nameAr || inv.subcontractor?.name || '',
            current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
            total: 0, invoiceCount: 0,
          })
        }
        const s = bySupplier.get(supplierId)
        s[bucket] += outstanding
        s.total += outstanding
        s.invoiceCount++
        totals[bucket as keyof typeof totals] += outstanding
        totals.total += outstanding
      }

      return NextResponse.json({
        asOfDate: asOfDate.toISOString(),
        type: 'supplier',
        summary: { totalOutstanding: totals.total, byBucket: totals },
        details: Array.from(bySupplier.values()).sort((a, b) => b.total - a.total),
      })
    }

    return NextResponse.json({ error: 'Invalid type. Use client or supplier.' }, { status: 400 })
  } catch (error: unknown) {
    console.error('Aging report GET error:', error)
    return NextResponse.json(
      { error: 'Failed to generate aging report' },
      { status: 500 }
    )
  }
}
