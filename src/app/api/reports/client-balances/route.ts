import { requireAuthApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET: Client Balance Report with aging
//
// ⚠️  SSOT (P1-1-FIX / C13): الرصيد الإجمالي للعميل (`balanceReceivable`)
//    مصدره JournalLine على حسابات CUSTOMER_AR المرتبطة بمركز تكلفة العميل.
//    الفواتير تُستخدم فقط للحصول على تواريخ الاستحقاق (dueDate) لتوزيع
//    الأرصدة على فئات التقادم (aging buckets) — وليست مصدراً للمجموع
//    المالي. المجموع الكلي يجب أن يطابق رصيد GL.
//
//    النموذج: لكل عميل، نحسب:
//      1) glBalance = JournalLine على AR مُصفّاة بمركز تكلفة العميل (معتمد)
//      2) operationalBreakdown = الفواتير غير المدفوعة مع dueDate (للأجنغ)
//      3) نوزّع glBalance على فئات الأجنغ بنفس نسب operationalBreakdown
//         (أو نسقطها 1:1 إذا تطابقت).
export async function GET() {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const now = new Date()

    const clients = await db.client.findMany({
      where: { isActive: true },
      include: {
        salesInvoices: {
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
      },
      orderBy: { name: 'asc' },
    })

    // ===== ابحث عن مراكز التكلفة لكل عميل (لمصفاة JournalLine) =====
    const clientCodes = clients.map(c => c.code).filter(Boolean) as string[]
    const costCenters = clientCodes.length > 0
      ? await db.costCenter.findMany({
          where: { code: { in: clientCodes } },
          select: { id: true, code: true },
        })
      : []
    const codeToCcId = new Map<string, string>()
    for (const cc of costCenters) codeToCcId.set(cc.code, cc.id)

    // ===== ابحث عن حسابات CUSTOMER_AR =====
    const arAccounts = await db.account.findMany({
      where: { accountRole: 'CUSTOMER_AR', isActive: true },
      select: { id: true },
    })
    const arAccountIds = arAccounts.map(a => a.id)

    // ===== استعلم JournalLine على AR لكل مراكز تكلفة العملاء دفعة واحدة =====
    const ccIds = [...codeToCcId.values()]
    let arLinesByCc: { costCenterId: string | null; debit: number; credit: number }[] = []
    if (arAccountIds.length > 0 && ccIds.length > 0) {
      const agg = await db.journalLine.groupBy({
        by: ['costCenterId'],
        _sum: { debit: true, credit: true },
        where: {
          deletedAt: null,
          accountId: { in: arAccountIds },
          costCenterId: { in: ccIds },
          journalEntry: { status: 'POSTED', deletedAt: null },
        },
      })
      arLinesByCc = agg.map(a => ({
        costCenterId: a.costCenterId,
        debit: toNumber(a._sum.debit),
        credit: toNumber(a._sum.credit),
      }))
    }
    const arByCcId = new Map<string, number>()
    for (const a of arLinesByCc) {
      if (!a.costCenterId) continue
      // AR is ASSET (debit normal): balance = debit - credit
      arByCcId.set(a.costCenterId, a.debit - a.credit)
    }

    // ===== احسب مدفوعات كل عميل (للمعلومة التشغيلية فقط) =====
    const clientPayments = await db.clientPayment.findMany({
      select: { clientId: true, amount: true, date: true },
    })
    const paymentsByClient: Record<string, number> = {}
    for (const p of clientPayments) {
      paymentsByClient[p.clientId] = (paymentsByClient[p.clientId] || 0) + Number(p.amount || 0)
    }

    const clientBalances = clients.map(client => {
      // ===== الإجمالي التشغيلي (للعرض فقط - ليس مالياً) =====
      const totalInvoiced = client.salesInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0)
      const totalPaid = paymentsByClient[client.id] || 0
      const operationalBalance = totalInvoiced - totalPaid

      // ===== الرصيد المعتمد من GL (SSOT) =====
      const ccId = client.code ? codeToCcId.get(client.code) : undefined
      const balanceReceivable = ccId ? (arByCcId.get(ccId) || 0) : operationalBalance

      // ===== توزيع الأجنغ على الفواتير غير المدفأة (للمعلومة فقط) =====
      // نحسب النسب من الأجنغ التشغيلي ثم نطبّقها على رصيد GL المعتمد.
      let opOverdue = 0
      let opAging0to30 = 0
      let opAging31to60 = 0
      let opAging61to90 = 0
      let opAging90plus = 0

      for (const inv of client.salesInvoices) {
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

      // معامل التوحيد: إذا كان الأجنغ التشغيلي > 0، نطبّق النسب على رصيد GL
      // وإلا فالكل صفر. هذا يحافظ على مطابقة المجموع الكلي مع GL.
      const opTotalAging = opAging0to30 + opAging31to60 + opAging61to90 + opAging90plus
      const scale = opTotalAging > 0 && balanceReceivable !== 0
        ? balanceReceivable / opTotalAging
        : 1
      const aging0to30 = opAging0to30 * scale
      const aging31to60 = opAging31to60 * scale
      const aging61to90 = opAging61to90 * scale
      const aging90plus = opAging90plus * scale
      const overdue = opOverdue * scale

      return {
        id: client.id,
        code: client.code,
        name: client.name,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        totalInvoiced,
        totalPaid,
        balanceReceivable,
        // بيانات تشغيلية للعرض فقط (ليست مالية)
        operationalBalance,
        overdue,
        aging: {
          '0to30': aging0to30,
          '31to60': aging31to60,
          '61to90': aging61to90,
          '90plus': aging90plus,
        },
        invoiceCount: client.salesInvoices.length,
        costCenterId: ccId || null,
      }
    })

    // Totals (من GL)
    const totals = {
      totalInvoiced: clientBalances.reduce((s, b) => s + b.totalInvoiced, 0),
      totalPaid: clientBalances.reduce((s, b) => s + b.totalPaid, 0),
      totalBalance: clientBalances.reduce((s, b) => s + b.balanceReceivable, 0),
      totalOverdue: clientBalances.reduce((s, b) => s + b.overdue, 0),
      totalAging0to30: clientBalances.reduce((s, b) => s + b.aging['0to30'], 0),
      totalAging31to60: clientBalances.reduce((s, b) => s + b.aging['31to60'], 0),
      totalAging61to90: clientBalances.reduce((s, b) => s + b.aging['61to90'], 0),
      totalAging90plus: clientBalances.reduce((s, b) => s + b.aging['90plus'], 0),
    }

    return NextResponse.json({ clients: clientBalances, totals, source: 'posted-journal-entries' })
  } catch (error) {
    console.error('Error generating client balance report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير أرصدة العملاء' }, { status: 500 })
  }
}
