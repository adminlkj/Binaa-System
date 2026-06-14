import { NextResponse } from 'next/server'
import { getTrialBalance } from '@/lib/accounting/engine'
import { serializeDecimal } from '@/lib/decimal'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const from = dateFrom ? new Date(dateFrom) : undefined
    const to = dateTo ? new Date(dateTo) : undefined

    const trialBalance = await getTrialBalance(from, to)

    // Calculate grand totals
    const totalDebit = trialBalance.reduce((sum, item) => sum + item.netDebit, 0)
    const totalCredit = trialBalance.reduce((sum, item) => sum + item.netCredit, 0)

    // Group by account type for summary
    const byType = trialBalance.reduce((acc, item) => {
      const type = item.account.type
      if (!acc[type]) {
        acc[type] = { totalDebit: 0, totalCredit: 0, count: 0 }
      }
      acc[type].totalDebit += item.netDebit
      acc[type].totalCredit += item.netCredit
      acc[type].count += 1
      return acc
    }, {} as Record<string, { totalDebit: number; totalCredit: number; count: number }>)

    return NextResponse.json(serializeDecimal({
      data: trialBalance,
      totals: {
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      byType,
      filters: {
        dateFrom: from?.toISOString() || null,
        dateTo: to?.toISOString() || null,
      },
    }))
  } catch (error) {
    console.error('Error fetching trial balance:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل ميزان المراجعة' },
      { status: 500 }
    )
  }
}
