import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET: Supplier Balance Report with aging
//
// ⚠️  SSOT (P1-1-FIX / C14): الرصيد الإجمالي للمورد (`balanceOwed`) مصدره
//    JournalLine على حسابات SUPPLIER_AP + SUBCONTRACTOR_AP المرتبطة بمركز
//    تكلفة المورد. الفواتير تُستخدم فقط للحصول على تواريخ الاستحقاق (dueDate)
//    لتوزيع الأرصدة على فئات التقادم (aging buckets) — وليست مصدراً للمجموع
//    المالي. المجموع الكلي يجب أن يطابق رصيد GL.
export async function GET() {
  try {
    const now = new Date()

    const suppliers = await db.supplier.findMany({
      where: { isActive: true },
      include: {
        purchaseInvoices: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            date: true,
            dueDate: true,
            status: true,
            vatAmount: true,
          },
        },
        supplierPayments: {
          select: { amount: true, date: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    // ===== ابحث عن مراكز التكلفة لكل مورد =====
    const supplierCodes = suppliers.map(s => s.code).filter(Boolean) as string[]
    const costCenters = supplierCodes.length > 0
      ? await db.costCenter.findMany({
          where: { code: { in: supplierCodes } },
          select: { id: true, code: true },
        })
      : []
    const codeToCcId = new Map<string, string>()
    for (const cc of costCenters) codeToCcId.set(cc.code, cc.id)

    // ===== ابحث عن حسابات AP (موردين + مقاولي باطن) =====
    const apAccounts = await db.account.findMany({
      where: {
        accountRole: { in: ['SUPPLIER_AP', 'SUBCONTRACTOR_AP'] },
        isActive: true,
      },
      select: { id: true },
    })
    const apAccountIds = apAccounts.map(a => a.id)

    // ===== استعلم JournalLine على AP لكل مراكز تكلفة الموردين =====
    const ccIds = [...codeToCcId.values()]
    let apLinesByCc: { costCenterId: string | null; debit: number; credit: number }[] = []
    if (apAccountIds.length > 0 && ccIds.length > 0) {
      const agg = await db.journalLine.groupBy({
        by: ['costCenterId'],
        _sum: { debit: true, credit: true },
        where: {
          deletedAt: null,
          accountId: { in: apAccountIds },
          costCenterId: { in: ccIds },
          journalEntry: { status: 'POSTED', deletedAt: null },
        },
      })
      apLinesByCc = agg.map(a => ({
        costCenterId: a.costCenterId,
        debit: toNumber(a._sum.debit),
        credit: toNumber(a._sum.credit),
      }))
    }
    const apByCcId = new Map<string, number>()
    for (const a of apLinesByCc) {
      if (!a.costCenterId) continue
      // AP is LIABILITY (credit normal): balance = credit - debit
      apByCcId.set(a.costCenterId, a.credit - a.debit)
    }

    const supplierBalances = suppliers.map(supplier => {
      // ===== الإجمالي التشغيلي (للعرض فقط - ليس مالياً) =====
      const totalPurchased = supplier.purchaseInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
      const totalPaid = supplier.supplierPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
      const operationalBalance = totalPurchased - totalPaid

      // ===== الرصيد المعتمد من GL (SSOT) =====
      const ccId = supplier.code ? codeToCcId.get(supplier.code) : undefined
      const balanceOwed = ccId ? (apByCcId.get(ccId) || 0) : operationalBalance

      // ===== توزيع الأجنغ على الفواتير غير المدفأة =====
      let opOverdue = 0
      let opAging0to30 = 0
      let opAging31to60 = 0
      let opAging61to90 = 0
      let opAging90plus = 0

      for (const inv of supplier.purchaseInvoices) {
        const remaining = Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)
        if (remaining <= 0) continue

        if (inv.dueDate && new Date(inv.dueDate) < now) {
          opOverdue += remaining
          const daysPastDue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          if (daysPastDue <= 30) opAging0to30 += remaining
          else if (daysPastDue <= 60) opAging31to60 += remaining
          else if (daysPastDue <= 90) opAging61to90 += remaining
          else opAging90plus += remaining
        }
      }

      // معامل التوحيد: طبّق نسب الأجنغ التشغيلي على رصيد GL المعتمد
      const opTotalAging = opAging0to30 + opAging31to60 + opAging61to90 + opAging90plus
      const scale = opTotalAging > 0 && balanceOwed !== 0
        ? balanceOwed / opTotalAging
        : 1
      const aging0to30 = opAging0to30 * scale
      const aging31to60 = opAging31to60 * scale
      const aging61to90 = opAging61to90 * scale
      const aging90plus = opAging90plus * scale
      const overdue = opOverdue * scale

      return {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        nameAr: supplier.nameAr,
        nameEn: supplier.nameEn,
        totalPurchased,
        totalPaid,
        balanceOwed,
        operationalBalance,
        overdue,
        aging: {
          '0to30': aging0to30,
          '31to60': aging31to60,
          '61to90': aging61to90,
          '90plus': aging90plus,
        },
        invoiceCount: supplier.purchaseInvoices.length,
        costCenterId: ccId || null,
      }
    })

    // Totals (من GL)
    const totals = {
      totalPurchased: supplierBalances.reduce((s, b) => s + b.totalPurchased, 0),
      totalPaid: supplierBalances.reduce((s, b) => s + b.totalPaid, 0),
      totalBalance: supplierBalances.reduce((s, b) => s + b.balanceOwed, 0),
      totalOverdue: supplierBalances.reduce((s, b) => s + b.overdue, 0),
      totalAging0to30: supplierBalances.reduce((s, b) => s + b.aging['0to30'], 0),
      totalAging31to60: supplierBalances.reduce((s, b) => s + b.aging['31to60'], 0),
      totalAging61to90: supplierBalances.reduce((s, b) => s + b.aging['61to90'], 0),
      totalAging90plus: supplierBalances.reduce((s, b) => s + b.aging['90plus'], 0),
    }

    return NextResponse.json({ suppliers: supplierBalances, totals, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('Error generating supplier balance report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير أرصدة الموردين' }, { status: 500 })
  }
}
