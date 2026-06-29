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
// ATOMIC: All writes (status→CLOSING, balance calc, closing JE, status→CLOSED, periods→CLOSED)
// are wrapped in a single $transaction so partial failure cannot leave orphan JEs or
// inconsistent fiscal year state.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'صيغة الطلب غير صالحة' }, { status: 400 })
  }

  // ---- Pre-flight checks (outside tx, read-only) ----
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

  if (!body.approved) {
    return NextResponse.json(
      { error: 'يجب الموافقة على الإقفال أولاً' },
      { status: 400 }
    )
  }

  // Race-condition guard: atomically transition OPEN→CLOSING only if still OPEN.
  // This prevents two concurrent close requests from both proceeding.
  const lockResult = await db.fiscalYear.updateMany({
    where: { id, status: 'OPEN' },
    data: { status: 'CLOSING' },
  })
  if (lockResult.count === 0) {
    return NextResponse.json(
      { error: 'السنة المالية قيد الإقفال بالفعل أو حالتها تغيرت' },
      { status: 409 }
    )
  }

  try {
    // ---- Atomic closing transaction ----
    const result = await db.$transaction(async (tx) => {
      const fy = await tx.fiscalYear.findUniqueOrThrow({ where: { id } })

      // Get retained earnings account
      const retainedEarningsAccount = await getDefaultAccountByRole(AccountRole.RETAINED_EARNINGS, tx)
      const retainedEarningsCode = retainedEarningsAccount?.code || '5200'

      // Collect revenue and expense balances
      const jeLines: { accountCode: string; debit: number; credit: number; description?: string }[] = []
      let totalRevenue = 0
      let totalExpenses = 0

      // Revenue accounts (debit to zero them)
      for (const role of REVENUE_ROLES) {
        const accounts = await tx.account.findMany({
          where: { accountRole: role, isActive: true, allowPosting: true },
        })
        for (const acc of accounts) {
          const balances = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: acc.id,
              deletedAt: null,
              journalEntry: {
                status: 'POSTED', deletedAt: null,
                date: { gte: fy.startDate, lte: fy.endDate },
              },
            },
            _sum: { debit: true, credit: true },
          })
          const debit = toNumber(balances[0]?._sum?.debit) || 0
          const credit = toNumber(balances[0]?._sum?.credit) || 0
          const balance = credit - debit
          if (Math.abs(balance) > 0.01) {
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
        const accounts = await tx.account.findMany({
          where: { accountRole: role, isActive: true, allowPosting: true },
        })
        for (const acc of accounts) {
          const balances = await tx.journalLine.groupBy({
            by: ['accountId'],
            where: {
              accountId: acc.id,
              deletedAt: null,
              journalEntry: {
                status: 'POSTED', deletedAt: null,
                date: { gte: fy.startDate, lte: fy.endDate },
              },
            },
            _sum: { debit: true, credit: true },
          })
          const debit = toNumber(balances[0]?._sum?.debit) || 0
          const credit = toNumber(balances[0]?._sum?.credit) || 0
          const balance = debit - credit
          if (Math.abs(balance) > 0.01) {
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
          jeLines.push({
            accountCode: retainedEarningsCode,
            debit: 0,
            credit: netProfit,
            description: 'صافي ربح السنة المرحل',
          })
        } else {
          jeLines.push({
            accountCode: retainedEarningsCode,
            debit: Math.abs(netProfit),
            credit: 0,
            description: 'صافي خسارة السنة المرحل',
          })
        }
      }

      const closingDate = fy.endDate

      // If no lines, nothing to close — still mark CLOSED atomically
      let je: { id: string; entryNo: string } | null = null
      if (jeLines.length > 0) {
        je = await createJournalEntry({
          entryNo: `JE-CLOSE-${fy.name}-${Date.now()}`,
          date: closingDate,
          description: `Year-end closing - ${fy.name}`,
          descriptionAr: `إقفال السنة المالية ${fy.name}`,
          lines: jeLines,
          sourceType: 'YEAR_CLOSING',
          sourceId: id,
        }, tx)
      }

      // Update fiscal year to CLOSED
      await tx.fiscalYear.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closingJournalEntryId: je?.id || null,
          retainedEarningsAccountCode: retainedEarningsCode,
          closedAt: new Date(),
          closedBy: body.closedBy || 'system',
          closingNotes: body.notes || (jeLines.length === 0 ? 'لا توجد حركات للإقفال' : null),
          totalRevenue,
          totalExpenses,
          netProfit,
        },
      })

      // Close all periods
      await tx.fiscalPeriod.updateMany({
        where: { fiscalYearId: id },
        data: { status: 'CLOSED' },
      })

      return { je, totalRevenue, totalExpenses, netProfit, linesCount: jeLines.length }
    })

    return NextResponse.json({
      success: true,
      message: `تم إقفال السنة المالية ${fiscalYear.name} بنجاح`,
      journalEntryId: result.je?.id || null,
      journalEntryNo: result.je?.entryNo || null,
      totalRevenue: result.totalRevenue,
      totalExpenses: result.totalExpenses,
      netProfit: result.netProfit,
      linesCount: result.linesCount,
    }, { status: 201 })
  } catch (error) {
    console.error('Error closing fiscal year:', error)
    // Revert status to OPEN on failure (the $transaction already rolled back all writes)
    try {
      await db.fiscalYear.update({
        where: { id },
        data: { status: 'OPEN' },
      })
    } catch { /* expected */ }
    const message = error instanceof Error ? error.message : 'فشل في إقفال السنة المالية'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
