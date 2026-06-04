import { NextResponse } from 'next/server'
import { getTrialBalance } from '@/lib/accounting/engine'

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

    return NextResponse.json({
      data: trialBalance,
      totals: {
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      filters: {
        dateFrom: from?.toISOString() || null,
        dateTo: to?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error('Error fetching trial balance:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل ميزان المراجعة' },
      { status: 500 }
    )
  }
}
