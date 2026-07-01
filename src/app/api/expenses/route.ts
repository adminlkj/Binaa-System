import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { createExpenseJournalEntry, type PrismaTransaction } from '@/lib/auto-journal'
import { reverseEntry } from '@/lib/accounting/engine'
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'
import { getDefaultAccountByRole, AccountRole } from '@/lib/account-roles'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============================================================================
// Unified Expenses API
// ----------------------------------------------------------------------------
// All expense operations (fuel, maintenance, transport, drivers, operations,
// administrative, general) flow through this single endpoint.
//
// The caller may pass explicit account IDs:
//   - accountId:        the expense account to DEBIT (selected from a role-based dropdown)
//   - payingAccountId:  the cash/bank account to CREDIT
//
// When both are present, the journal entry is built inline using those exact
// accounts (no fallback to the default role-mapped account). This lets the
// accountant pick a specific fuel / maintenance / transport sub-account.
//
// When they are absent, the legacy `createExpenseJournalEntry` is used which
// resolves accounts by role (PROJECT_COST or ADMIN_EXPENSE).
// ============================================================================

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const category = searchParams.get('category')
    // NEW: comma-separated list of categories — used by the unified expenses screen
    // to fetch all expenses that belong to a specific section (e.g. fuel, maintenance).
    const categoriesParam = searchParams.get('categories')
    const expenseType = searchParams.get('expenseType')
    const equipmentId = searchParams.get('equipmentId')
    const costCenterId = searchParams.get('costCenterId')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (category) where.category = category
    if (categoriesParam) {
      const categories = categoriesParam.split(',').map(c => c.trim()).filter(Boolean)
      if (categories.length > 0) where.category = { in: categories }
    }
    if (expenseType) where.expenseType = expenseType
    if (equipmentId) where.equipmentId = equipmentId
    if (costCenterId) where.costCenterId = costCenterId
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { reference: { contains: search } },
        { category: { contains: search } },
      ]
    }
    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) dateFilter.lte = new Date(to)
      where.date = dateFilter
    }

    const include = {
      project: { select: { id: true, code: true, name: true, projectType: true } },
      equipment: { select: { id: true, code: true, name: true, nameAr: true } },
      costCenter: { select: { id: true, code: true, name: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const expenses = await db.expense.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(expenses)
    }

    const [data, total] = await Promise.all([
      db.expense.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.expense.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch expenses:', error)
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Helper: build the expense journal entry using EXPLICIT account IDs.
// Falls back to role-based defaults for VAT_INPUT when not provided.
// ---------------------------------------------------------------------------
async function buildExpenseJournalEntryWithExplicitAccounts(
  expenseId: string,
  expenseAccountId: string,
  payingAccountId: string,
  tx: PrismaTransaction
) {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } })
  if (!expense) {
    throw new Error(`المصروف غير موجود: ${expenseId}`)
  }

  // Validate the two explicit accounts exist, are active, and allow posting
  const [expenseAccount, payingAccount] = await Promise.all([
    tx.account.findUnique({ where: { id: expenseAccountId } }),
    tx.account.findUnique({ where: { id: payingAccountId } }),
  ])

  if (!expenseAccount || !expenseAccount.isActive || !expenseAccount.allowPosting) {
    throw new Error(
      `حساب المصروف غير صالح: ${expenseAccountId} ` +
      `(found=${!!expenseAccount}, active=${expenseAccount?.isActive}, posting=${expenseAccount?.allowPosting})`
    )
  }
  if (!payingAccount || !payingAccount.isActive || !payingAccount.allowPosting) {
    throw new Error(
      `حساب السداد غير صالح: ${payingAccountId} ` +
      `(found=${!!payingAccount}, active=${payingAccount?.isActive}, posting=${payingAccount?.allowPosting})`
    )
  }

  // VAT Input account — resolved by role (fallback to default)
  const inputVatAccount = await getDefaultAccountByRole(AccountRole.VAT_INPUT, tx)

  const lines: Array<{ accountId: string; debit: number; credit: number; costCenterId?: string | null; description: string }> = [
    {
      accountId: expenseAccount.id,
      debit: toNumber(expense.amount),
      credit: 0,
      costCenterId: expense.costCenterId || undefined,
      description: `مصروف ${expense.description}`,
    },
  ]

  if (toNumber(expense.vatAmount) > 0 && inputVatAccount) {
    lines.push({
      accountId: inputVatAccount.id,
      debit: toNumber(expense.vatAmount),
      credit: 0,
      costCenterId: expense.costCenterId || undefined,
      description: `ضريبة مدخلات مصروف`,
    })
  }

  lines.push({
    accountId: payingAccount.id,
    debit: 0,
    credit: toNumber(expense.totalAmount),
    costCenterId: expense.costCenterId || undefined,
    description: `صرف من ${payingAccount.nameAr || payingAccount.name}`,
  })

  const entryNo = await getNextEntryNo(tx)
  const entry = await postJournalEntry(
    {
      entryNo,
      date: expense.date,
      description: `مصروف ${expense.description}`,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      lines,
    },
    tx
  )

  await tx.expense.update({ where: { id: expenseId }, data: { journalEntryId: entry.id } })
  return entry
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()

    const amount = parseFloat(body.amount)
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
    }

    // Determine expenseType based on projectId
    const hasProject = !!body.projectId
    const expenseType = body.expenseType || (hasProject ? 'PROJECT' : 'INTERNAL')

    // Validate: PROJECT expenses require projectId
    if (expenseType === 'PROJECT' && !body.projectId) {
      return NextResponse.json({ error: 'مصروفات المشاريع تتطلب تحديد المشروع' }, { status: 400 })
    }

    // For INTERNAL expenses, ensure projectId is null
    const projectId = expenseType === 'INTERNAL' ? null : (body.projectId || null)

    // Calculate VAT — when VAT is disabled (vatRate === 0), vatAmount is 0
    const vatRate = body.vatRate !== undefined ? parseFloat(body.vatRate) : 0.15
    const vatAmount = body.vatAmount !== undefined
      ? parseFloat(body.vatAmount)
      : Math.round(amount * vatRate * 100) / 100
    const totalAmount = Math.round((amount + vatAmount) * 100) / 100

    // Create expense + accounting entry in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const expense = await tx.expense.create({
        data: {
          projectId,
          equipmentId: body.equipmentId || null,
          costCenterId: body.costCenterId || null,
          expenseType,
          activityType: body.activityType || 'GENERAL',
          category: body.category,
          description: body.description,
          amount,
          vatRate,
          vatAmount,
          totalAmount,
          date: new Date(body.date),
          reference: body.reference || null,
          payFrom: body.payFrom || 'TREASURY',
          attachmentPath: body.attachmentPath || null,
        },
        include: {
          project: { select: { id: true, code: true, name: true, projectType: true } },
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          costCenter: { select: { id: true, code: true, name: true } },
        },
      })

      // ── Journal Entry ────────────────────────────────────────────────
      // If the caller provided BOTH explicit account IDs, use them directly.
      // Otherwise, fall back to the legacy role-based createExpenseJournalEntry.
      if (body.accountId && body.payingAccountId) {
        await buildExpenseJournalEntryWithExplicitAccounts(
          expense.id,
          body.accountId,
          body.payingAccountId,
          tx
        )
      } else {
        await createExpenseJournalEntry(expense.id, tx)
      }

      // Re-fetch to include journalEntryId
      return await tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          project: { select: { id: true, code: true, name: true, projectType: true } },
          equipment: { select: { id: true, code: true, name: true, nameAr: true } },
          costCenter: { select: { id: true, code: true, name: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create expense:', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}

// PUT: Update an expense (with reversal for posted expenses)
export async function PUT(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف المصروف مطلوب' }, { status: 400 })
    }

    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المصروف غير موجود' }, { status: 404 })
    }

    // Handle expenseType and projectId consistency
    if (updateData.expenseType === 'INTERNAL') {
      updateData.projectId = null
    } else if (updateData.expenseType === 'PROJECT' && !existing.projectId && !updateData.projectId) {
      return NextResponse.json({ error: 'مصروفات المشاريع تتطلب تحديد المشروع' }, { status: 400 })
    }

    // Auto-determine expenseType if projectId is changing
    if (updateData.projectId !== undefined && !updateData.expenseType) {
      updateData.expenseType = updateData.projectId ? 'PROJECT' : 'INTERNAL'
    }

    // If the expense has a journal entry and amounts are changing, create reversal + new entry
    if (existing.journalEntryId && (updateData.amount !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)) {
      await db.$transaction(async (tx: PrismaTransaction) => {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId!, deletedAt: null },
          include: { lines: { where: { deletedAt: null } } },
        })

        if (originalEntry) {
          // Use unified reverseEntry() — creates proper reversal, keeps original POSTED.
          // Avoids double-cancellation bug.
          await reverseEntry(existing.journalEntryId!, tx)
        }

        // Update the expense with new values so the JE builder reads them
        const newAmount = updateData.amount !== undefined ? parseFloat(updateData.amount) : toNumber(existing.amount)
        const newVatAmount = updateData.vatAmount !== undefined ? (updateData.vatAmount ? parseFloat(updateData.vatAmount) : 0) : toNumber(existing.vatAmount)
        const newTotalAmount = newAmount + newVatAmount

        await tx.expense.update({
          where: { id: existing.id },
          data: {
            amount: newAmount,
            vatAmount: newVatAmount,
            totalAmount: newTotalAmount,
          },
        })

        // Create new journal entry — explicit accounts if provided, else legacy default
        if (updateData.accountId && updateData.payingAccountId) {
          await buildExpenseJournalEntryWithExplicitAccounts(
            existing.id,
            updateData.accountId,
            updateData.payingAccountId,
            tx
          )
        } else {
          await createExpenseJournalEntry(existing.id, tx)
        }

        updateData.journalEntryId = undefined // Will be set by the JE builder
      })
    }

    // Recalculate totalAmount if amount or vatAmount changed
    if (updateData.amount !== undefined || updateData.vatAmount !== undefined) {
      const newAmount = updateData.amount !== undefined ? parseFloat(updateData.amount) : toNumber(existing.amount)
      const newVat = updateData.vatAmount !== undefined ? (updateData.vatAmount ? parseFloat(updateData.vatAmount) : 0) : toNumber(existing.vatAmount || 0)
      updateData.totalAmount = newAmount + newVat
    }

    const updated = await db.expense.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.amount && { amount: parseFloat(updateData.amount) }),
        ...(updateData.vatAmount !== undefined && { vatAmount: updateData.vatAmount ? parseFloat(updateData.vatAmount) : 0 }),
        ...(updateData.date && { date: new Date(updateData.date) }),
        ...(updateData.projectId !== undefined && { projectId: updateData.projectId || null }),
      },
      include: {
        project: { select: { id: true, code: true, name: true, projectType: true } },
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        costCenter: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update expense:', error)
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}
