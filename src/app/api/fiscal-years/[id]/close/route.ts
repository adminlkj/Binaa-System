import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { AccountRole, getDefaultAccountByRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'

// Revenue roles to close
const REVENUE_ROLES = [
  AccountRole.PROJECT_REVENUE, AccountRole.RENTAL_REVENUE, AccountRole.SERVICE_REVENUE,
  AccountRole.UNBILLED_REVENUE, AccountRole.DELAY_PENALTY_REVENUE, AccountRole.FX_GAIN,
]

// Expense roles to close
const EXPENSE_ROLES = [
  AccountRole.PROJECT_COST, AccountRole.SUBCONTRACTOR_COST, AccountRole.FUEL_EXPENSE,
  AccountRole.MAINTENANCE_EXPENSE, AccountRole.DRIVER_EXPENSE, AccountRole.TRANSPORT_EXPENSE,
  AccountRole.RENTAL_DEPRECIATION, AccountRole.PAYROLL_EXPENSE, AccountRole.GOSI_EXPENSE,
  AccountRole.ADMIN_EXPENSE, AccountRole.DEPRECIATION_EXPENSE, AccountRole.ZAKAT_EXPENSE,
  AccountRole.FX_LOSS,
]

// ============ POST: Execute year-end closing ============
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const fiscalYear = await db.fiscalYear.findUnique({ where: { id } })
    if (!fiscalYear) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    if (fiscalYear.status !== 'OPEN') {
      return NextResponse.json(
        { error: `لا يمكن إقفال سنة بحالة: ${fiscalYear.status}` },
        { status: 400 }
      )
    }

    // Confirm user approval
    if (!body.approved) {
      return NextResponse.json(
        { error: 'يجب الموافقة على الإقفال أولاً' },
        { status: 400 }
      )
    }

    // Set status to CLOSING
    await db.fiscalYear.update({
      where: { id },
      data: { status: 'CLOSING' },
    })

    // Get retained earnings account
    const retainedEarningsAccount = await getDefaultAccountByRole(AccountRole.RETAINED_EARNINGS)
    const retainedEarningsCode = retainedEarningsAccount?.code || '5200'

    // Collect revenue and expense balances
    const jeLines: { accountCode: string; debit: number; credit: number; description?: string }[] = []
    let totalRevenue = 0
    let totalExpenses = 0

    // Revenue accounts (debit to zero them)
    for (const role of REVENUE_ROLES) {
      const accounts = await db.account.findMany({
        where: { accountRole: role, isActive: true, allowPosting: true },
      })
      for (const acc of accounts) {
        const balances = await db.journalLine.groupBy({
          by: ['accountId'],
          where: {
            accountId: acc.id,
            deletedAt: null,
            journalEntry: {
              status: 'POSTED', deletedAt: null,
              date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate },
            },
          },
          _sum: { debit: true, credit: true },
        })
        const debit = toNumber(balances[0]?._sum?.debit) || 0
        const credit = toNumber(balances[0]?._sum?.credit) || 0
        const balance = credit - debit
        if (Math.abs(balance) > 0.01) {
          // To zero a revenue: positive balance → debit it; negative balance → credit abs value
          const isPositive = balance > 0
          jeLines.push({
            accountCode: acc.code,
            debit: isPositive ? balance : 0,
            credit: isPositive ? 0 : Math.abs(balance),
            description: `إقفال ${acc.nameAr || acc.name}`,
          })
          totalRevenue += balance
        }
      }
    }

    // Expense accounts (credit positive balances to zero them, debit negative ones)
    for (const role of EXPENSE_ROLES) {
      const accounts = await db.account.findMany({
        where: { accountRole: role, isActive: true, allowPosting: true },
      })
      for (const acc of accounts) {
        const balances = await db.journalLine.groupBy({
          by: ['accountId'],
          where: {
            accountId: acc.id,
            deletedAt: null,
            journalEntry: {
              status: 'POSTED', deletedAt: null,
              date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate },
            },
          },
          _sum: { debit: true, credit: true },
        })
        const debit = toNumber(balances[0]?._sum?.debit) || 0
        const credit = toNumber(balances[0]?._sum?.credit) || 0
        const balance = debit - credit
        if (Math.abs(balance) > 0.01) {
          // To zero an expense: positive balance → credit it; negative balance → debit abs value
          const isPositive = balance > 0
          jeLines.push({
            accountCode: acc.code,
            debit: isPositive ? 0 : Math.abs(balance),
            credit: isPositive ? balance : 0,
            description: `إقفال ${acc.nameAr || acc.name}`,
          })
          totalExpenses += balance
        }
      }
    }

    const netProfit = totalRevenue - totalExpenses

    // Add retained earnings line
    if (Math.abs(netProfit) > 0.01) {
      if (netProfit > 0) {
        // Profit: credit retained earnings
        jeLines.push({
          accountCode: retainedEarningsCode,
          debit: 0,
          credit: netProfit,
          description: 'صافي ربح السنة المرحل',
        })
      } else {
        // Loss: debit retained earnings
        jeLines.push({
          accountCode: retainedEarningsCode,
          debit: Math.abs(netProfit),
          credit: 0,
          description: 'صافي خسارة السنة المرحل',
        })
      }
    }

    // If no lines, nothing to close
    if (jeLines.length === 0) {
      await db.fiscalYear.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: body.closedBy || 'system',
          closingNotes: body.notes || 'لا توجد حركات للإقفال',
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          retainedEarningsAccountCode: retainedEarningsCode,
        },
      })
      // Close all periods
      await db.fiscalPeriod.updateMany({
        where: { fiscalYearId: id },
        data: { status: 'CLOSED' },
      })
      return NextResponse.json({
        success: true,
        message: 'تم إقفال السنة المالية (لا توجد حركات)',
        journalEntryId: null,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
      })
    }

    // Create closing journal entry
    const closingDate = fiscalYear.endDate
    const je = await createJournalEntry({
      entryNo: `JE-CLOSE-${fiscalYear.name}-${Date.now()}`,
      date: closingDate,
      description: `Year-end closing - ${fiscalYear.name}`,
      descriptionAr: `إقفال السنة المالية ${fiscalYear.name}`,
      lines: jeLines,
      sourceType: 'YEAR_CLOSING',
      sourceId: id,
    })

    // Update fiscal year
    await db.fiscalYear.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closingJournalEntryId: je?.id || null,
        retainedEarningsAccountCode: retainedEarningsCode,
        closedAt: new Date(),
        closedBy: body.closedBy || 'system',
        closingNotes: body.notes || null,
        totalRevenue,
        totalExpenses,
        netProfit,
      },
    })

    // Close all periods
    await db.fiscalPeriod.updateMany({
      where: { fiscalYearId: id },
      data: { status: 'CLOSED' },
    })

    return NextResponse.json({
      success: true,
      message: `تم إقفال السنة المالية ${fiscalYear.name} بنجاح`,
      journalEntryId: je?.id || null,
      journalEntryNo: je?.entryNo || null,
      totalRevenue,
      totalExpenses,
      netProfit,
      linesCount: jeLines.length,
    }, { status: 201 })
  } catch (error) {
    console.error('Error closing fiscal year:', error)
    // Revert status to OPEN on failure
    try {
      const { id } = await params
      await db.fiscalYear.update({
        where: { id },
        data: { status: 'OPEN' },
      })
    } catch {}
    return NextResponse.json({ error: 'فشل في إقفال السنة المالية' }, { status: 500 })
  }
}
