import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Get the account
    const account = await db.account.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
    })

    if (!account) {
      return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    }

    // Build date filter
    const dateFilter: Record<string, Date> = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    // Get journal lines for this account
    const whereClause: Record<string, unknown> = { accountId: id }
    if (startDate || endDate) {
      whereClause.journalEntry = { date: dateFilter }
    }

    const lines = await db.journalLine.findMany({
      where: whereClause,
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNo: true,
            date: true,
            description: true,
            status: true,
          },
        },
      },
      orderBy: {
        journalEntry: { date: 'asc' },
      },
    })

    // Calculate running balance
    // For ASSET/EXPENSE: debit increases, credit decreases
    // For LIABILITY/EQUITY/REVENUE: credit increases, debit decreases
    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE'

    let runningBalance = 0
    const statement = lines.map(line => {
      const debit = toNumber(line.debit)
      const credit = toNumber(line.credit)
      if (isDebitNormal) {
        runningBalance += debit - credit
      } else {
        runningBalance += credit - debit
      }
      return {
        id: line.id,
        entryNo: line.journalEntry.entryNo,
        date: line.journalEntry.date,
        description: line.journalEntry.description,
        lineDescription: line.description,
        debit,
        credit,
        balance: runningBalance,
        status: line.journalEntry.status,
      }
    })

    // Calculate totals
    const totalDebit = lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = lines.reduce((s, l) => s + toNumber(l.credit), 0)

    return NextResponse.json(serializeDecimal({
      account,
      lines: statement,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
    }))
  } catch (error) {
    console.error('Error fetching account statement:', error)
    return NextResponse.json({ error: 'فشل في تحميل كشف الحساب' }, { status: 500 })
  }
}
