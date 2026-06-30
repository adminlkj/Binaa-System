import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'
import { requireRoleApi } from '@/lib/auth-helpers'
import { requireAccountByRole, AccountRole } from '@/lib/account-roles'

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
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response
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

  // Perform all operations in a transaction
  const closing = await db.$transaction(async (tx: PrismaTransaction) => {
    // For yearly closing, create a closing journal entry
    if (type === 'YEARLY') {
      const closingDate = new Date(year, 11, 31) // Last day of the year

      // Get all revenue and expense account balances for the year
      const yearStart = new Date(year, 0, 1)
      const yearEnd = new Date(year, 11, 31, 23, 59, 59)

      const lines = await tx.journalLine.findMany({
        where: {
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
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
          const amount = Number(line.credit) - Number(line.debit)
          if (!revenueByAccount[line.account.id]) {
            revenueByAccount[line.account.id] = { id: line.account.id, code: line.account.code, name: line.account.name, balance: 0 }
          }
          revenueByAccount[line.account.id].balance += amount
        } else if (line.account.type === 'EXPENSE') {
          const amount = Number(line.debit) - Number(line.credit)
          if (!expenseByAccount[line.account.id]) {
            expenseByAccount[line.account.id] = { id: line.account.id, code: line.account.code, name: line.account.name, balance: 0 }
          }
          expenseByAccount[line.account.id].balance += amount
        }
      }

      // BA-08: resolve Retained Earnings account by role — no hardcoded code.
      const retainedEarningsAccount = await requireAccountByRole(AccountRole.RETAINED_EARNINGS, 'إقفال فترة', tx)
      if (!retainedEarningsAccount) {
        throw new Error('Retained Earnings account not found — please map the RETAINED_EARNINGS role in the Chart of Accounts')
      }

      // Build closing journal entry lines
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

      // Create the closing journal entry via the unbreakable guard
      if (jeLines.length > 0) {
        const entry = await postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: closingDate,
          description: `Year-end closing for ${year}`,
          sourceType: 'PERIOD_CLOSING',
          sourceId: `YE-${year}`,
          lines: jeLines.filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0).map(l => ({
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description,
          })),
          skipPeriodGuard: true,
        }, tx)
        closingEntryId = entry.id
      }
    }

    // Create or update the period closing record
    return await tx.periodClosing.upsert({
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

  // Perform all operations in a transaction
  const updated = await db.$transaction(async (tx: PrismaTransaction) => {
    // Reverse the closing journal entry if exists
    if (existing.closingEntryId) {
      const closingEntry = await tx.journalEntry.findUnique({
        where: { id: existing.closingEntryId, deletedAt: null },
        include: { lines: { where: { deletedAt: null } } },
      })

      if (closingEntry) {
        // Create a reversal entry via the unbreakable guard
        const reversalLines = closingEntry.lines
          .filter(line => Number(line.debit) > 0 || Number(line.credit) > 0)
          .map((line) => ({
            accountId: line.accountId,
            debit: Number(line.credit),
            credit: Number(line.debit),
            description: `Reversal of closing entry - ${line.description || ''}`,
          }))

        await postJournalEntry({
          entryNo: await getNextEntryNo(tx),
          date: new Date(),
          description: `Reversal of period closing for ${year}/${month}`,
          sourceType: 'PERIOD_REOPENING',
          sourceId: `REOPEN-${year}-${month}`,
          lines: reversalLines,
          skipPeriodGuard: true,
        }, tx)
      }
    }

    // Update the period closing record
    return await tx.periodClosing.update({
      where: { id: existing.id },
      data: {
        status: 'REOPENED',
        closingEntryId: null,
      },
    })
  })

  return NextResponse.json({ data: updated, message: `Period ${year}/${month} (${type}) reopened successfully` })
}
