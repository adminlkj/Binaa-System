import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const closings = await db.periodClosing.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
    return NextResponse.json({ data: closings })
  } catch (error) {
    console.error('Error fetching period closings:', error)
    return NextResponse.json({ error: 'Failed to fetch period closings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, year, month, type } = body

    if (!action || !year || !month || !type) {
      return NextResponse.json({ error: 'action, year, month, and type are required' }, { status: 400 })
    }

    if (action === 'close') {
      return await closePeriod(year, month, type)
    } else if (action === 'reopen') {
      return await reopenPeriod(year, month, type)
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "close" or "reopen"' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error processing period closing:', error)
    return NextResponse.json({ error: 'Failed to process period closing' }, { status: 500 })
  }
}

async function closePeriod(year: number, month: number, type: string) {
  // Check if already closed
  const existing = await db.periodClosing.findUnique({
    where: { year_month_type: { year, month, type } },
  })

  if (existing && existing.status === 'CLOSED') {
    return NextResponse.json({ error: 'Period is already closed' }, { status: 400 })
  }

  let closingEntryId: string | null = null

  // For yearly closing, create a closing journal entry
  if (type === 'YEARLY') {
    const closingDate = new Date(year, 11, 31) // Last day of the year

    // Get all revenue and expense account balances for the year
    const yearStart = new Date(year, 0, 1)
    const yearEnd = new Date(year, 11, 31, 23, 59, 59)

    const lines = await db.journalLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          date: { gte: yearStart, lte: yearEnd },
        },
      },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
      },
    })

    // Calculate revenue and expense totals
    const revenueByAccount: Record<string, { id: string; code: string; name: string; balance: number }> = {}
    const expenseByAccount: Record<string, { id: string; code: string; name: string; balance: number }> = {}

    for (const line of lines) {
      if (line.account.type === 'REVENUE') {
        const amount = line.credit - line.debit
        if (!revenueByAccount[line.account.id]) {
          revenueByAccount[line.account.id] = { id: line.account.id, code: line.account.code, name: line.account.name, balance: 0 }
        }
        revenueByAccount[line.account.id].balance += amount
      } else if (line.account.type === 'EXPENSE') {
        const amount = line.debit - line.credit
        if (!expenseByAccount[line.account.id]) {
          expenseByAccount[line.account.id] = { id: line.account.id, code: line.account.code, name: line.account.name, balance: 0 }
        }
        expenseByAccount[line.account.id].balance += amount
      }
    }

    // Get Retained Earnings account (5200)
    const retainedEarningsAccount = await db.account.findUnique({ where: { code: '5200' } })
    if (!retainedEarningsAccount) {
      return NextResponse.json({ error: 'Retained Earnings account (5200) not found' }, { status: 400 })
    }

    // Build closing journal entry lines
    // Debit all revenue accounts (to close them), Credit all expense accounts (to close them)
    // Difference goes to Retained Earnings
    const jeLines: { accountId: string; debit: number; credit: number; description: string }[] = []
    let totalRevenueBalance = 0
    let totalExpenseBalance = 0

    // Debit revenue accounts (reverse their credit balance)
    for (const rev of Object.values(revenueByAccount)) {
      if (rev.balance > 0) {
        jeLines.push({
          accountId: rev.id,
          debit: rev.balance,
          credit: 0,
          description: `Year-end closing - ${rev.name}`,
        })
        totalRevenueBalance += rev.balance
      }
    }

    // Credit expense accounts (reverse their debit balance)
    for (const exp of Object.values(expenseByAccount)) {
      if (exp.balance > 0) {
        jeLines.push({
          accountId: exp.id,
          debit: 0,
          credit: exp.balance,
          description: `Year-end closing - ${exp.name}`,
        })
        totalExpenseBalance += exp.balance
      }
    }

    // Net income goes to Retained Earnings
    const netIncome = totalRevenueBalance - totalExpenseBalance
    if (netIncome !== 0) {
      jeLines.push({
        accountId: retainedEarningsAccount.id,
        debit: netIncome < 0 ? Math.abs(netIncome) : 0,
        credit: netIncome > 0 ? netIncome : 0,
        description: `Year-end closing - Net ${netIncome > 0 ? 'Income' : 'Loss'} to Retained Earnings`,
      })
    }

    // Create the closing journal entry
    if (jeLines.length > 0) {
      const entry = await db.journalEntry.create({
        data: {
          entryNo: `JE-YE-${year}-${Date.now()}`,
          date: closingDate,
          description: `Year-end closing for ${year}`,
          status: 'POSTED',
          sourceType: 'PERIOD_CLOSING',
          isReversal: false,
          lines: {
            create: jeLines,
          },
        },
      })
      closingEntryId = entry.id
    }
  }

  // Create or update the period closing record
  const closing = await db.periodClosing.upsert({
    where: { year_month_type: { year, month, type } },
    update: {
      status: 'CLOSED',
      closingEntryId,
      closedAt: new Date(),
    },
    create: {
      year,
      month,
      type,
      status: 'CLOSED',
      closingEntryId,
      closedAt: new Date(),
    },
  })

  return NextResponse.json({ data: closing, message: `Period ${year}/${month} (${type}) closed successfully` })
}

async function reopenPeriod(year: number, month: number, type: string) {
  const existing = await db.periodClosing.findUnique({
    where: { year_month_type: { year, month, type } },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Period closing record not found' }, { status: 404 })
  }

  if (existing.status === 'REOPENED' || existing.status === 'OPEN') {
    return NextResponse.json({ error: 'Period is already open' }, { status: 400 })
  }

  // Reverse the closing journal entry if exists
  if (existing.closingEntryId) {
    const closingEntry = await db.journalEntry.findUnique({
      where: { id: existing.closingEntryId },
      include: { lines: true },
    })

    if (closingEntry) {
      // Create a reversal entry
      const reversalLines = closingEntry.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.credit,
        credit: line.debit,
        description: `Reversal of closing entry - ${line.description || ''}`,
      }))

      await db.journalEntry.create({
        data: {
          entryNo: `JE-REV-${year}-${month}-${Date.now()}`,
          date: new Date(),
          description: `Reversal of period closing for ${year}/${month}`,
          status: 'POSTED',
          sourceType: 'PERIOD_REOPENING',
          isReversal: true,
          reversedEntryId: existing.closingEntryId,
          lines: {
            create: reversalLines,
          },
        },
      })
    }
  }

  // Update the period closing record
  const updated = await db.periodClosing.update({
    where: { id: existing.id },
    data: {
      status: 'REOPENED',
      closingEntryId: null,
    },
  })

  return NextResponse.json({ data: updated, message: `Period ${year}/${month} (${type}) reopened successfully` })
}
