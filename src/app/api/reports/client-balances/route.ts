import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET: Client Balance Report with aging
export async function GET() {
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

    // Get client payments
    const clientPayments = await db.clientPayment.findMany({
      select: { clientId: true, amount: true, date: true },
    })

    const paymentsByClient: Record<string, number> = {}
    for (const p of clientPayments) {
      paymentsByClient[p.clientId] = (paymentsByClient[p.clientId] || 0) + p.amount
    }

    const clientBalances = clients.map(client => {
      const totalInvoiced = client.salesInvoices.reduce((s, i) => s + i.totalAmount, 0)
      const totalPaid = paymentsByClient[client.id] || 0
      const balanceReceivable = totalInvoiced - totalPaid

      // Aging analysis on unpaid invoices
      let overdue = 0
      let aging0to30 = 0
      let aging31to60 = 0
      let aging61to90 = 0
      let aging90plus = 0

      for (const inv of client.salesInvoices) {
        const remaining = inv.totalAmount - inv.paidAmount
        if (remaining <= 0) continue

        if (inv.dueDate && new Date(inv.dueDate) < now) {
          overdue += remaining
          const daysPastDue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          if (daysPastDue <= 30) aging0to30 += remaining
          else if (daysPastDue <= 60) aging31to60 += remaining
          else if (daysPastDue <= 90) aging61to90 += remaining
          else aging90plus += remaining
        }
      }

      return {
        id: client.id,
        code: client.code,
        name: client.name,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        totalInvoiced,
        totalPaid,
        balanceReceivable,
        overdue,
        aging: {
          '0to30': aging0to30,
          '31to60': aging31to60,
          '61to90': aging61to90,
          '90plus': aging90plus,
        },
        invoiceCount: client.salesInvoices.length,
      }
    })

    // Totals
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

    return NextResponse.json({ clients: clientBalances, totals })
  } catch (error) {
    console.error('Error generating client balance report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير أرصدة العملاء' }, { status: 500 })
  }
}
