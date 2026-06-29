import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const bankAccountId = searchParams.get('bankAccountId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!bankAccountId || !year || !month) {
      return NextResponse.json({ error: 'bankAccountId, year, and month are required' }, { status: 400 })
    }

    const bankAccount = await db.bankAccount.findUnique({
      where: { id: bankAccountId },
    })

    if (!bankAccount) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })
    }

    const numYear = Number(year)
    const numMonth = Number(month)

    // Get bank transactions for the period
    const periodStart = new Date(numYear, numMonth - 1, 1)
    const periodEnd = new Date(numYear, numMonth, 0, 23, 59, 59) // Last day of month

    const transactions = await db.bankTransaction.findMany({
      where: {
        bankAccountId,
        date: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { date: 'asc' },
    })

    // Calculate bank statement balance
    const deposits = transactions
      .filter((t) => t.transactionType === 'DEPOSIT')
      .reduce((s, t) => s + Number(t.amount || 0), 0)
    const withdrawals = transactions
      .filter((t) => t.transactionType === 'WITHDRAWAL')
      .reduce((s, t) => s + Number(t.amount || 0), 0)
    const bankStatementBalance = deposits - withdrawals

    // Calculate book balance from journal lines
    let bookBalance = 0
    if (bankAccount.accountId) {
      const lines = await db.journalLine.findMany({
        where: {
          accountId: bankAccount.accountId,
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            date: { gte: periodStart, lte: periodEnd },
          },
        },
      })
      // Bank accounts are ASSET (debit normal)
      bookBalance = lines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0)
    }

    // Check for existing reconciliation
    const existingReconciliation = await db.bankReconciliation.findFirst({
      where: {
        bankAccountId,
        year: numYear,
        month: numMonth,
      },
    })

    const difference = bookBalance - bankStatementBalance

    // Unreconciled transactions
    const unreconciled = transactions.filter((t) => !t.reconciled)

    return NextResponse.json({
      bankAccount: {
        id: bankAccount.id,
        bankName: bankAccount.bankName,
        accountName: bankAccount.accountName,
        accountNumber: bankAccount.accountNumber,
      },
      period: { year: numYear, month: numMonth },
      bookBalance,
      bankStatementBalance,
      difference,
      transactions,
      unreconciledCount: unreconciled.length,
      unreconciled,
      existingReconciliation,
    })
  } catch (error) {
    console.error('Error fetching bank reconciliation:', error)
    return NextResponse.json({ error: 'Failed to fetch bank reconciliation data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bankAccountId, year, month, bankBalance, notes, action } = body

    if (!bankAccountId || !year || !month) {
      return NextResponse.json({ error: 'bankAccountId, year, and month are required' }, { status: 400 })
    }

    const numYear = Number(year)
    const numMonth = Number(month)

    const periodStart = new Date(numYear, numMonth - 1, 1)
    const periodEnd = new Date(numYear, numMonth, 0, 23, 59, 59)

    // Calculate book balance
    const bankAccount = await db.bankAccount.findUnique({ where: { id: bankAccountId } })
    if (!bankAccount) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })
    }

    let bookBalance = 0
    if (bankAccount.accountId) {
      const lines = await db.journalLine.findMany({
        where: {
          accountId: bankAccount.accountId,
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            date: { gte: periodStart, lte: periodEnd },
          },
        },
      })
      bookBalance = lines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0)
    }

    const bankBal = Number(bankBalance) || 0
    const difference = bookBalance - bankBal

    if (action === 'complete') {
      // Complete the reconciliation
      // Mark all transactions as reconciled
      await db.bankTransaction.updateMany({
        where: {
          bankAccountId,
          date: { gte: periodStart, lte: periodEnd },
          reconciled: false,
        },
        data: { reconciled: true },
      })

      // Create or update reconciliation record
      const reconciliation = await db.bankReconciliation.upsert({
        where: {
          id: (await db.bankReconciliation.findFirst({
            where: { bankAccountId, year: numYear, month: numMonth },
          }))?.id || 'nonexistent',
        },
        update: {
          bookBalance,
          bankBalance: bankBal,
          difference,
          status: 'COMPLETED',
          completedAt: new Date(),
          notes: notes || null,
        },
        create: {
          bankAccountId,
          year: numYear,
          month: numMonth,
          bookBalance,
          bankBalance: bankBal,
          difference,
          status: 'COMPLETED',
          completedAt: new Date(),
          notes: notes || null,
        },
      })

      return NextResponse.json({
        data: reconciliation,
        message: 'Bank reconciliation completed successfully',
      }, { status: 201 })
    }

    // Default: create/save as draft
    const reconciliation = await db.bankReconciliation.create({
      data: {
        bankAccountId,
        year: numYear,
        month: numMonth,
        bookBalance,
        bankBalance: bankBal,
        difference,
        status: 'DRAFT',
        notes: notes || null,
      },
    })

    return NextResponse.json({
      data: reconciliation,
      message: 'Bank reconciliation saved as draft',
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating bank reconciliation:', error)
    return NextResponse.json({ error: 'Failed to create bank reconciliation' }, { status: 500 })
  }
}
