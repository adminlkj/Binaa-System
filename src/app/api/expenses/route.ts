import { db } from '@/lib/db'
import { autoEntryExpense, initializeChartOfAccounts, createJournalEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const category = searchParams.get('category')
    const expenseType = searchParams.get('expenseType')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (category) where.category = category
    if (expenseType) where.expenseType = expenseType
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { reference: { contains: search } },
        { category: { contains: search } },
      ]
    }

    const include = {
      project: { select: { id: true, code: true, name: true, projectType: true } },
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
    console.error('Error fetching expenses:', error)
    return NextResponse.json({ error: 'فشل في تحميل المصروفات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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

    // Calculate VAT
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
          expenseType,
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
        },
      })

      // Auto-create accounting journal entry and store journalEntryId
      try {
        await initializeChartOfAccounts()
        const journalEntry = await autoEntryExpense({
          description: expense.description,
          amount: expense.amount,
          vatAmount: expense.vatAmount,
          category: expense.category,
          date: expense.date,
          payFrom: body.payFrom || 'TREASURY',
          costCenterId: expense.projectId || undefined,
        }, tx)

        // Store the journalEntryId on the expense
        await tx.expense.update({
          where: { id: expense.id },
          data: { journalEntryId: journalEntry.id },
        })
      } catch (accountingError) {
        console.error('Accounting entry failed for expense:', accountingError)
      }

      // Re-fetch to include journalEntryId
      return await tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          project: { select: { id: true, code: true, name: true, projectType: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating expense:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المصروف' }, { status: 500 })
  }
}

// PUT: Update an expense (with reversal for posted expenses)
export async function PUT(request: Request) {
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
          where: { id: existing.journalEntryId! },
          include: { lines: true },
        })

        if (originalEntry) {
          const accountIds = originalEntry.lines.map(l => l.accountId)
          const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } })
          const accountMap = new Map(accounts.map(a => [a.id, a.code]))

          const resolvedReversalLines = originalEntry.lines.map(line => ({
            accountCode: accountMap.get(line.accountId) || '',
            debit: line.credit,
            credit: line.debit,
            costCenterId: line.costCenterId || undefined,
            description: `Reversal: ${line.description || ''}`,
          }))

          await createJournalEntry({
            entryNo: `JE-REV-EXP-${Date.now()}`,
            date: new Date(),
            description: `Reversal for Expense: ${existing.description}`,
            descriptionAr: `قيد عكسي لمصروف: ${existing.description}`,
            lines: resolvedReversalLines,
            sourceType: 'EXPENSE_REVERSAL',
            sourceId: existing.id,
          }, tx)

          await tx.journalEntry.update({
            where: { id: existing.journalEntryId! },
            data: { status: 'CANCELLED' },
          })
        }

        // Create new entry with updated values
        const newAmount = updateData.amount !== undefined ? parseFloat(updateData.amount) : existing.amount
        const newVatAmount = updateData.vatAmount !== undefined ? (updateData.vatAmount ? parseFloat(updateData.vatAmount) : 0) : existing.vatAmount
        const newPayFrom = updateData.payFrom || existing.payFrom
        const newDate = updateData.date ? new Date(updateData.date) : existing.date
        const newCategory = updateData.category || existing.category
        const newDescription = updateData.description || existing.description
        const newProjectId = updateData.projectId !== undefined ? updateData.projectId : existing.projectId

        await initializeChartOfAccounts()
        const newJournalEntry = await autoEntryExpense({
          description: newDescription,
          amount: newAmount,
          vatAmount: newVatAmount,
          category: newCategory,
          date: newDate,
          payFrom: newPayFrom,
          costCenterId: newProjectId || undefined,
        }, tx)

        updateData.journalEntryId = newJournalEntry.id
      })
    }

    // Recalculate totalAmount if amount or vatAmount changed
    if (updateData.amount !== undefined || updateData.vatAmount !== undefined) {
      const newAmount = updateData.amount !== undefined ? parseFloat(updateData.amount) : existing.amount
      const newVat = updateData.vatAmount !== undefined ? (updateData.vatAmount ? parseFloat(updateData.vatAmount) : 0) : (existing.vatAmount || 0)
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
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating expense:', error)
    return NextResponse.json({ error: 'فشل في تحديث المصروف' }, { status: 500 })
  }
}
