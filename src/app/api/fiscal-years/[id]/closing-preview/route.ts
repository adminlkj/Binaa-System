import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { AccountRole, getAccountsByRole, getDefaultAccountByRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'

// Revenue roles to close
const REVENUE_ROLES = [
  AccountRole.PROJECT_REVENUE,
  AccountRole.RENTAL_REVENUE,
  AccountRole.SERVICE_REVENUE,
  AccountRole.UNBILLED_REVENUE,
  AccountRole.DELAY_PENALTY_REVENUE,
  AccountRole.FX_GAIN,
]

// Expense roles to close
const EXPENSE_ROLES = [
  AccountRole.PROJECT_COST,
  AccountRole.SUBCONTRACTOR_COST,
  AccountRole.FUEL_EXPENSE,
  AccountRole.MAINTENANCE_EXPENSE,
  AccountRole.DRIVER_EXPENSE,
  AccountRole.TRANSPORT_EXPENSE,
  AccountRole.RENTAL_DEPRECIATION,
  AccountRole.PAYROLL_EXPENSE,
  AccountRole.GOSI_EXPENSE,
  AccountRole.ADMIN_EXPENSE,
  AccountRole.DEPRECIATION_EXPENSE,
  AccountRole.ZAKAT_EXPENSE,
  AccountRole.FX_LOSS,
]

// ============ GET: Preview year-end closing ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const fiscalYear = await db.fiscalYear.findUnique({ where: { id } })
    if (!fiscalYear) {
      return NextResponse.json({ error: 'السنة المالية غير موجودة' }, { status: 404 })
    }

    // Get retained earnings account
    const retainedEarningsAccount = await getDefaultAccountByRole(AccountRole.RETAINED_EARNINGS)

    // Collect all revenue accounts with their balances
    const revenueAccounts: any[] = []
    for (const role of REVENUE_ROLES) {
      const accounts = await getAccountsByRole(role)
      for (const acc of accounts) {
        const balances = await db.journalLine.groupBy({
          by: ['accountId'],
          where: {
            accountId: acc.id,
            deletedAt: null,
            journalEntry: {
              status: 'POSTED',
              deletedAt: null,
              date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate },
            },
          },
          _sum: { debit: true, credit: true },
        })
        const debit = toNumber(balances[0]?._sum?.debit) || 0
        const credit = toNumber(balances[0]?._sum?.credit) || 0
        const balance = credit - debit // Revenue is credit-normal
        if (Math.abs(balance) > 0.01) {
          revenueAccounts.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            nameAr: acc.nameAr,
            role,
            balance,
            debit, // to zero it: debit the balance
            credit: 0,
          })
        }
      }
    }

    // Collect all expense accounts with their balances
    const expenseAccounts: any[] = []
    for (const role of EXPENSE_ROLES) {
      const accounts = await getAccountsByRole(role)
      for (const acc of accounts) {
        const balances = await db.journalLine.groupBy({
          by: ['accountId'],
          where: {
            accountId: acc.id,
            deletedAt: null,
            journalEntry: {
              status: 'POSTED',
              deletedAt: null,
              date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate },
            },
          },
          _sum: { debit: true, credit: true },
        })
        const debit = toNumber(balances[0]?._sum?.debit) || 0
        const credit = toNumber(balances[0]?._sum?.credit) || 0
        const balance = debit - credit // Expense is debit-normal
        if (Math.abs(balance) > 0.01) {
          expenseAccounts.push({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            nameAr: acc.nameAr,
            role,
            balance,
            debit: 0,
            credit: balance, // to zero it: credit the balance
          })
        }
      }
    }

    const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0)
    const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0)
    const netProfit = totalRevenue - totalExpenses

    // Build closing journal entry preview
    const jeLines: any[] = []

    // Debit revenue accounts to zero them
    for (const rev of revenueAccounts) {
      jeLines.push({
        accountCode: rev.code,
        accountName: rev.nameAr || rev.name,
        debit: rev.balance,
        credit: 0,
        type: 'revenue',
        role: rev.role,
      })
    }

    // Credit expense accounts to zero them
    for (const exp of expenseAccounts) {
      jeLines.push({
        accountCode: exp.code,
        accountName: exp.nameAr || exp.name,
        debit: 0,
        credit: exp.balance,
        type: 'expense',
        role: exp.role,
      })
    }

    // Retained earnings: if profit, credit; if loss, debit
    if (netProfit > 0) {
      jeLines.push({
        accountCode: retainedEarningsAccount?.code || '5200',
        accountName: retainedEarningsAccount?.nameAr || retainedEarningsAccount?.name || 'الأرباح المرحلة',
        debit: 0,
        credit: netProfit,
        type: 'retained_earnings',
        role: 'RETAINED_EARNINGS',
      })
    } else if (netProfit < 0) {
      jeLines.push({
        accountCode: retainedEarningsAccount?.code || '5200',
        accountName: retainedEarningsAccount?.nameAr || retainedEarningsAccount?.name || 'الأرباح المرحلة',
        debit: Math.abs(netProfit),
        credit: 0,
        type: 'retained_earnings',
        role: 'RETAINED_EARNINGS',
      })
    }

    const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0)

    return NextResponse.json({
      fiscalYear: {
        id: fiscalYear.id,
        name: fiscalYear.name,
        startDate: fiscalYear.startDate,
        endDate: fiscalYear.endDate,
        status: fiscalYear.status,
      },
      revenueAccounts,
      expenseAccounts,
      retainedEarningsAccount: retainedEarningsAccount ? {
        code: retainedEarningsAccount.code,
        name: retainedEarningsAccount.name,
        nameAr: retainedEarningsAccount.nameAr,
      } : null,
      totals: {
        totalRevenue,
        totalExpenses,
        netProfit,
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      journalEntry: {
        lines: jeLines,
        description: `إقفال السنة المالية ${fiscalYear.name}`,
        descriptionAr: `إقفال السنة المالية ${fiscalYear.name}`,
      },
    })
  } catch (error) {
    console.error('Error generating closing preview:', error)
    return NextResponse.json({ error: 'فشل في توليد معاينة الإقفال' }, { status: 500 })
  }
}
