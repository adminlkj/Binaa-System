import { requireAuthApi } from '@/lib/auth-helpers'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { getRoleAccountMapping } from '@/lib/account-roles'

// ============================================================================
// GET /api/accounts/statement
// Returns a running-balance account statement
// Query params: accountId (required), dateFrom (optional), dateTo (optional)
// ============================================================================
export async function GET(request: NextRequest) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!accountId) {
      return NextResponse.json(
        { error: 'معرف الحساب مطلوب' },
        { status: 400 }
      )
    }

    // Get the account details
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        type: true,
        accountRole: true,
      },
    })

    if (!account) {
      return NextResponse.json(
        { error: 'الحساب غير موجود' },
        { status: 404 }
      )
    }

    // Build where clause for journal lines
    const journalEntryFilter: Record<string, unknown> = {
      status: 'POSTED',
      deletedAt: null,
    }

    // Apply date filters on the journal entry
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      journalEntryFilter.date = dateFilter
    }

    // Query journal lines where accountId matches and journalEntry.status = 'POSTED'
    const journalLines = await db.journalLine.findMany({
      where: {
        accountId,
        deletedAt: null,
        journalEntry: journalEntryFilter,
      },
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
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { entryNo: 'asc' } },
        { createdAt: 'asc' },
      ],
    })

    // Determine normal balance side based on account type
    // ASSET/EXPENSE: debit normal (debit increases balance)
    // LIABILITY/EQUITY/REVENUE: credit normal (credit increases balance)
    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE'

    // Compute opening balance (sum of all POSTED entries before dateFrom)
    let openingBalance = 0
    if (dateFrom) {
      const beforeDateLines = await db.journalLine.findMany({
        where: {
          accountId,
          deletedAt: null,
          journalEntry: {
            status: 'POSTED',
            deletedAt: null,
            date: { lt: new Date(dateFrom) },
          },
        },
        select: {
          debit: true,
          credit: true,
        },
      })

      for (const line of beforeDateLines) {
        const debit = toNumber(line.debit)
        const credit = toNumber(line.credit)
        if (isDebitNormal) {
          openingBalance += debit - credit
        } else {
          openingBalance += credit - debit
        }
      }
    }

    // Build statement lines with running balance
    let runningBalance = openingBalance
    const statementLines = journalLines.map((line) => {
      const debit = toNumber(line.debit)
      const credit = toNumber(line.credit)

      if (isDebitNormal) {
        runningBalance += debit - credit
      } else {
        runningBalance += credit - debit
      }

      return {
        date: line.journalEntry.date,
        entryNo: line.journalEntry.entryNo,
        description: line.journalEntry.description || line.description || '',
        debit,
        credit,
        balance: runningBalance,
      }
    })

    // Calculate totals
    const totalDebit = journalLines.reduce((sum, line) => sum + toNumber(line.debit), 0)
    const totalCredit = journalLines.reduce((sum, line) => sum + toNumber(line.credit), 0)

    // Get the role label if this account has a role mapping
    let roleLabel: string | null = null
    if (account.accountRole) {
      const mappings = await getRoleAccountMapping()
      const roleMapping = mappings.find((m) => m.role === account.accountRole)
      if (roleMapping) {
        roleLabel = roleMapping.labelAr
      }
    }

    return NextResponse.json({
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        nameAr: account.nameAr,
        type: account.type,
        accountRole: account.accountRole,
        roleLabel,
      },
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      openingBalance,
      lines: statementLines,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
    })
  } catch (error) {
    console.error('Error generating account statement:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل كشف الحساب' },
      { status: 500 }
    )
  }
}
