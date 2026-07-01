import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'

export const dynamic = 'force-dynamic'

// GET /api/reports/aging?type=client|supplier&asOfDate=YYYY-MM-DD
//
// ⚠️  SSOT (P1-1-FIX / C15): المجموع الإجمالي للديون المستحقة (totalOutstanding)
//    مصدره JournalLine على:
//      - CUSTOMER_AR (للعملاء - clients)
//      - SUPPLIER_AP + SUBCONTRACTOR_AP (للموردين - suppliers)
//    مُصفّاةً بمراكز التكلفة المرتبطة بالعميل/المورد.
//
//    توزيع الأرصدة على فئات الأجنغ (0-30, 31-60, 61-90, 90+) يبقى من
//    الفواتير التشغيلية لأنها المصدر الوحيد لتواريخ الاستحقاق (dueDate).
//    لكن النِّسب تُطبَّق على الرصيد الكلي من GL حتى يتطابق المجموع الكلي
//    (`summary.totalOutstanding` + `Σ details.total` + `Σ byBucket`).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'client'
    const asOfDateStr = searchParams.get('asOfDate') || new Date().toISOString().slice(0, 10)
    const asOfDate = new Date(asOfDateStr)
    asOfDate.setHours(23, 59, 59, 999)

    if (type === 'client') {
      // ===== 1) المجموع المعتمد من GL على مستوى كل عميل =====
      // ابحث عن مراكز تكلفة العملاء
      const clients = await db.client.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
      })
      const clientCodes = clients.map(c => c.code).filter(Boolean) as string[]
      const costCenters = clientCodes.length > 0
        ? await db.costCenter.findMany({
            where: { code: { in: clientCodes } },
            select: { id: true, code: true },
          })
        : []
      const codeToCcId = new Map<string, string>()
      const ccIdToCode = new Map<string, string>()
      for (const cc of costCenters) {
        codeToCcId.set(cc.code, cc.id)
        ccIdToCode.set(cc.id, cc.code)
      }
      const ccIds = [...codeToCcId.values()]

      // حسابات CUSTOMER_AR
      const arAccounts = await db.account.findMany({
        where: { accountRole: 'CUSTOMER_AR', isActive: true },
        select: { id: true },
      })
      const arAccountIds = arAccounts.map(a => a.id)

      // GL aggregation per cost center
      const glByClientId = new Map<string, number>()
      if (arAccountIds.length > 0 && ccIds.length > 0) {
        const agg = await db.journalLine.groupBy({
          by: ['costCenterId'],
          _sum: { debit: true, credit: true },
          where: {
            deletedAt: null,
            accountId: { in: arAccountIds },
            costCenterId: { in: ccIds },
            journalEntry: {
              status: 'POSTED',
              deletedAt: null,
              date: { lte: asOfDate },
            },
          },
        })
        for (const a of agg) {
          if (!a.costCenterId) continue
          const ccCode = ccIdToCode.get(a.costCenterId)
          const client = clients.find(c => c.code === ccCode)
          if (!client) continue
          // AR is ASSET (debit normal): balance = debit - credit
          const balance = toNumber(a._sum.debit) - toNumber(a._sum.credit)
          glByClientId.set(client.id, balance)
        }
      }

      // ===== 2) توزيع الأجنغ التشغيلي على الفواتير =====
      const invoices = await db.salesInvoice.findMany({
        where: {
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          date: { lte: asOfDate },
        },
        include: { client: true },
      })

      const byClient = new Map<string, {
        partyId: string; partyCode: string; partyName: string; partyNameAr: string;
        current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number;
        opTotal: number; invoiceCount: number;
      }>()
      const opTotals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }

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
            opTotal: 0, invoiceCount: 0,
          })
        }
        const c = byClient.get(clientId)!
        c[bucket as keyof typeof opTotals] += outstanding
        c.opTotal += outstanding
        c.invoiceCount++
        opTotals[bucket as keyof typeof opTotals] += outstanding
        opTotals.total += outstanding
      }

      // ===== 3) ادمج GL totals مع الأجنغ التشغيلي =====
      // لكل عميل: استخدم رصيد GL كرصيد كلي (إذا وُجد) ونطبّق نسب الأجنغ عليه.
      const totals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }
      const details: any[] = []

      // ابدأ بالعملاء الذين لديهم فواتير معلّقة (لهم أجنغ)
      for (const [clientId, c] of byClient.entries()) {
        const glBalance = glByClientId.get(clientId)
        const useGL = glBalance !== undefined && Math.abs(glBalance) > 0.01
        // الرصيد الكلي: من GL إذا وُجد، وإلا من الأجنغ التشغيلي
        const totalBalance = useGL ? glBalance : c.opTotal
        // وزّع النسب
        const scale = c.opTotal > 0 ? totalBalance / c.opTotal : 0
        const row = {
          partyId: c.partyId,
          partyCode: c.partyCode,
          partyName: c.partyName,
          partyNameAr: c.partyNameAr,
          current: c.current * scale,
          '1-30': c['1-30'] * scale,
          '31-60': c['31-60'] * scale,
          '61-90': c['61-90'] * scale,
          '90+': c['90+'] * scale,
          total: totalBalance,
          invoiceCount: c.invoiceCount,
        }
        details.push(row)
        totals.current += row.current
        totals['1-30'] += row['1-30']
        totals['31-60'] += row['31-60']
        totals['61-90'] += row['61-90']
        totals['90+'] += row['90+']
        totals.total += row.total
      }

      // أضف العملاء الذين لهم رصيد GL لكن بلا فواتير معلّقة (current bucket)
      for (const [clientId, glBalance] of glByClientId.entries()) {
        if (byClient.has(clientId)) continue
        if (Math.abs(glBalance) <= 0.01) continue
        const client = clients.find(c => c.id === clientId)
        if (!client) continue
        const row = {
          partyId: client.id,
          partyCode: client.code || '',
          partyName: client.name,
          partyNameAr: client.nameAr || client.name,
          current: glBalance,
          '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
          total: glBalance,
          invoiceCount: 0,
        }
        details.push(row)
        totals.current += glBalance
        totals.total += glBalance
      }

      details.sort((a, b) => b.total - a.total)

      return NextResponse.json({
        asOfDate: asOfDate.toISOString(),
        type: 'client',
        summary: { totalOutstanding: totals.total, byBucket: totals },
        details,
        source: 'posted-journal-entries',
      })
    } else if (type === 'supplier') {
      // ===== 1) المجموع المعتمد من GL على مستوى كل مورد =====
      const suppliers = await db.supplier.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
      })
      const supplierCodes = suppliers.map(s => s.code).filter(Boolean) as string[]
      const costCenters = supplierCodes.length > 0
        ? await db.costCenter.findMany({
            where: { code: { in: supplierCodes } },
            select: { id: true, code: true },
          })
        : []
      const codeToCcId = new Map<string, string>()
      const ccIdToCode = new Map<string, string>()
      for (const cc of costCenters) {
        codeToCcId.set(cc.code, cc.id)
        ccIdToCode.set(cc.id, cc.code)
      }
      const ccIds = [...codeToCcId.values()]

      const apAccounts = await db.account.findMany({
        where: { accountRole: { in: ['SUPPLIER_AP', 'SUBCONTRACTOR_AP'] }, isActive: true },
        select: { id: true },
      })
      const apAccountIds = apAccounts.map(a => a.id)

      const glBySupplierId = new Map<string, number>()
      if (apAccountIds.length > 0 && ccIds.length > 0) {
        const agg = await db.journalLine.groupBy({
          by: ['costCenterId'],
          _sum: { debit: true, credit: true },
          where: {
            deletedAt: null,
            accountId: { in: apAccountIds },
            costCenterId: { in: ccIds },
            journalEntry: {
              status: 'POSTED',
              deletedAt: null,
              date: { lte: asOfDate },
            },
          },
        })
        for (const a of agg) {
          if (!a.costCenterId) continue
          const ccCode = ccIdToCode.get(a.costCenterId)
          const supplier = suppliers.find(s => s.code === ccCode)
          if (!supplier) continue
          // AP is LIABILITY (credit normal): balance = credit - debit
          const balance = toNumber(a._sum.credit) - toNumber(a._sum.debit)
          glBySupplierId.set(supplier.id, balance)
        }
      }

      // ===== 2) توزيع الأجنغ التشغيلي على الفواتير =====
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

      const bySupplier = new Map<string, {
        partyId: string; partyCode: string; partyName: string; partyNameAr: string;
        current: number; '1-30': number; '31-60': number; '61-90': number; '90+': number;
        opTotal: number; invoiceCount: number;
      }>()
      const opTotals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }

      const processInvoice = (inv: any, supplierField: 'supplier' | 'subcontractor', supplierId: string) => {
        const paid = Number(inv.paidAmount || 0)
        const total = Number(inv.totalAmount || inv.amount || 0)
        const outstanding = total - paid
        if (outstanding <= 0.01) return

        const days = Math.floor((asOfDate.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
        let bucket = 'current'
        if (days > 90) bucket = '90+'
        else if (days > 60) bucket = '61-90'
        else if (days > 30) bucket = '31-60'
        else if (days > 0) bucket = '1-30'

        if (!bySupplier.has(supplierId)) {
          const party = inv[supplierField]
          bySupplier.set(supplierId, {
            partyId: supplierId,
            partyCode: party?.code || '',
            partyName: party?.name || '',
            partyNameAr: party?.nameAr || party?.name || '',
            current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
            opTotal: 0, invoiceCount: 0,
          })
        }
        const s = bySupplier.get(supplierId)!
        s[bucket as keyof typeof opTotals] += outstanding
        s.opTotal += outstanding
        s.invoiceCount++
        opTotals[bucket as keyof typeof opTotals] += outstanding
        opTotals.total += outstanding
      }

      for (const inv of purchaseInvoices as any[]) {
        processInvoice(inv, 'supplier', inv.supplierId)
      }
      for (const inv of subInvoices as any[]) {
        processInvoice(inv, 'subcontractor', inv.subcontractorId)
      }

      // ===== 3) ادمج GL totals مع الأجنغ =====
      const totals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }
      const details: any[] = []

      for (const [supplierId, s] of bySupplier.entries()) {
        const glBalance = glBySupplierId.get(supplierId)
        const useGL = glBalance !== undefined && Math.abs(glBalance) > 0.01
        const totalBalance = useGL ? glBalance : s.opTotal
        const scale = s.opTotal > 0 ? totalBalance / s.opTotal : 0
        const row = {
          partyId: s.partyId,
          partyCode: s.partyCode,
          partyName: s.partyName,
          partyNameAr: s.partyNameAr,
          current: s.current * scale,
          '1-30': s['1-30'] * scale,
          '31-60': s['31-60'] * scale,
          '61-90': s['61-90'] * scale,
          '90+': s['90+'] * scale,
          total: totalBalance,
          invoiceCount: s.invoiceCount,
        }
        details.push(row)
        totals.current += row.current
        totals['1-30'] += row['1-30']
        totals['31-60'] += row['31-60']
        totals['61-90'] += row['61-90']
        totals['90+'] += row['90+']
        totals.total += row.total
      }

      // أضف الموردين الذين لهم رصيد GL لكن بلا فواتير معلّقة
      for (const [supplierId, glBalance] of glBySupplierId.entries()) {
        if (bySupplier.has(supplierId)) continue
        if (Math.abs(glBalance) <= 0.01) continue
        const supplier = suppliers.find(s => s.id === supplierId)
        if (!supplier) continue
        const row = {
          partyId: supplier.id,
          partyCode: supplier.code || '',
          partyName: supplier.name,
          partyNameAr: supplier.nameAr || supplier.name,
          current: glBalance,
          '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
          total: glBalance,
          invoiceCount: 0,
        }
        details.push(row)
        totals.current += glBalance
        totals.total += glBalance
      }

      details.sort((a, b) => b.total - a.total)

      return NextResponse.json({
        asOfDate: asOfDate.toISOString(),
        type: 'supplier',
        summary: { totalOutstanding: totals.total, byBucket: totals },
        details,
        source: 'posted-journal-entries',
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
