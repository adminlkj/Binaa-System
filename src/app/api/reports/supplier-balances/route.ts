import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET: Supplier Balance Report with aging
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

    const supplierBalances = suppliers.map(supplier => {
      const totalPurchased = supplier.purchaseInvoices.reduce((s, i) => s + i.totalAmount, 0)
      const totalPaid = supplier.supplierPayments.reduce((s, p) => s + p.amount, 0)
      const balanceOwed = totalPurchased - totalPaid

      // Aging analysis on unpaid invoices
      let overdue = 0
      let aging0to30 = 0
      let aging31to60 = 0
      let aging61to90 = 0
      let aging90plus = 0

      for (const inv of supplier.purchaseInvoices) {
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
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        nameAr: supplier.nameAr,
        nameEn: supplier.nameEn,
        totalPurchased,
        totalPaid,
        balanceOwed,
        overdue,
        aging: {
          '0to30': aging0to30,
          '31to60': aging31to60,
          '61to90': aging61to90,
          '90plus': aging90plus,
        },
        invoiceCount: supplier.purchaseInvoices.length,
      }
    })

    // Totals
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

    return NextResponse.json({ suppliers: supplierBalances, totals })
  } catch (error) {
    console.error('Error generating supplier balance report:', error)
    return NextResponse.json({ error: 'فشل في إنشاء تقرير أرصدة الموردين' }, { status: 500 })
  }
}
