import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
import { autoEntryProgressClaim, initializeChartOfAccounts, createJournalEntry } from '@/lib/accounting/engine'
import { toNumber } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const uninvoiced = searchParams.get('uninvoiced')
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    // Filter for uninvoiced claims (APPROVED but not yet invoiced)
    if (uninvoiced === 'true' || uninvoiced === '1') {
      where.invoiced = false
      where.status = 'APPROVED'
    }

    const include = {
      project: { select: { id: true, name: true, code: true, clientId: true, client: { select: { id: true, name: true, nameAr: true, code: true } } } },
      contract: { select: { id: true, contractNo: true, totalValue: true } },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const claims = await db.progressClaim.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
      })
      return NextResponse.json(claims)
    }

    const [data, total] = await Promise.all([
      db.progressClaim.findMany({
        where: whereClause,
        include,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.progressClaim.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('[API] Failed to fetch progress claims:', error)
    return NextResponse.json({ error: 'Failed to fetch progress claims', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { projectId, contractId, claimNo, date, percentage, amount, vatRate, status, approvedDate, notes } = body

    if (!projectId || !contractId || !claimNo || !date || percentage === undefined || amount === undefined) {
      return NextResponse.json({ error: 'الحقول المطلوبة: المشروع، العقد، رقم المستخلص، التاريخ، النسبة، المبلغ' }, { status: 400 })
    }

    const rate = vatRate ?? 0.15
    const vatAmount = Math.round(parseFloat(amount) * rate * 100) / 100
    const totalAmount = Math.round((parseFloat(amount) + vatAmount) * 100) / 100

    // Create claim + accounting entry in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const claim = await tx.progressClaim.create({
        data: {
          projectId,
          contractId,
          claimNo,
          date: new Date(date),
          percentage: parseFloat(percentage),
          amount: parseFloat(amount),
          vatRate: rate,
          vatAmount,
          totalAmount,
          status: status || 'DRAFT',
          approvedDate: approvedDate ? new Date(approvedDate) : null,
          notes: notes || null,
          invoiced: false,
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          contract: { select: { id: true, contractNo: true, totalValue: true } },
        },
      })

      // Auto-create accounting journal entry and store journalEntryId
      try {
        await initializeChartOfAccounts()
        const journalEntry = await autoEntryProgressClaim({
          claimNo: claim.claimNo,
          projectId: claim.projectId,
          contractId: claim.contractId,
          amount: toNumber(claim.amount),
          vatRate: toNumber(claim.vatRate),
          vatAmount: toNumber(claim.vatAmount),
          totalAmount: toNumber(claim.totalAmount),
          date: claim.date,
        }, tx)

        // Store the journalEntryId on the claim
        await tx.progressClaim.update({
          where: { id: claim.id },
          data: { journalEntryId: journalEntry.id },
        })
      } catch (accountingError) {
        console.error('[API] Accounting entry failed for progress claim:', accountingError)
      }

      // Re-fetch to include journalEntryId
      return await tx.progressClaim.findUnique({
        where: { id: claim.id },
        include: {
          project: { select: { id: true, name: true, code: true } },
          contract: { select: { id: true, contractNo: true, totalValue: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create progress claim:', error)
    return NextResponse.json({ error: 'Failed to create progress claim', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

// PUT: Update a progress claim (with reversal for approved/posted claims)
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'معرف المستخلص مطلوب' }, { status: 400 })
    }

    const existing = await db.progressClaim.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }

    // Cannot modify REJECTED claims
    if (existing.status === 'REJECTED') {
      return NextResponse.json({ error: 'لا يمكن تعديل مستخلص مرفوض' }, { status: 400 })
    }

    // Cannot modify invoiced claims (must cancel the invoice first)
    if (existing.invoiced && (updateData.amount !== undefined || updateData.status !== undefined)) {
      return NextResponse.json({ error: 'لا يمكن تعديل مستخلص تم إصدار فاتورة له. يجب إلغاء الفاتورة أولاً' }, { status: 400 })
    }

    // If the claim has a journal entry and amounts are changing, create reversal + new entry
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
            debit: toNumber(line.credit),
            credit: toNumber(line.debit),
            costCenterId: line.costCenterId || undefined,
            description: `Reversal: ${line.description || ''}`,
          }))

          await createJournalEntry({
            entryNo: `JE-REV-PC-${Date.now()}`,
            date: new Date(),
            description: `Reversal for Progress Claim ${existing.claimNo}`,
            descriptionAr: `قيد عكسي لمستخلص ${existing.claimNo}`,
            lines: resolvedReversalLines,
            sourceType: 'PROGRESS_CLAIM_REVERSAL',
            sourceId: existing.claimNo,
          }, tx)

          await tx.journalEntry.update({
            where: { id: existing.journalEntryId! },
            data: { status: 'CANCELLED' },
          })
        }

        // Create new entry with updated values
        const newAmount = updateData.amount !== undefined ? parseFloat(updateData.amount) : toNumber(existing.amount)
        const newVatAmount = updateData.vatAmount !== undefined ? parseFloat(updateData.vatAmount) : toNumber(existing.vatAmount)
        const newTotalAmount = updateData.totalAmount !== undefined ? parseFloat(updateData.totalAmount) : toNumber(existing.totalAmount)
        const newDate = updateData.date ? new Date(updateData.date) : existing.date

        await initializeChartOfAccounts()
        const newJournalEntry = await autoEntryProgressClaim({
          claimNo: existing.claimNo,
          projectId: existing.projectId,
          contractId: existing.contractId,
          amount: newAmount,
          vatRate: toNumber(existing.vatRate),
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          date: newDate,
        }, tx)

        updateData.journalEntryId = newJournalEntry.id
      })
    }

    // Recalculate amounts if amount changed
    if (updateData.amount !== undefined && updateData.vatAmount === undefined) {
      const newAmount = parseFloat(updateData.amount)
      const rate = toNumber(existing.vatRate)
      updateData.vatAmount = Math.round(newAmount * rate * 100) / 100
      updateData.totalAmount = Math.round((newAmount + updateData.vatAmount) * 100) / 100
    }

    const updated = await db.progressClaim.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.amount && { amount: parseFloat(updateData.amount) }),
        ...(updateData.percentage && { percentage: parseFloat(updateData.percentage) }),
        ...(updateData.date && { date: new Date(updateData.date) }),
        ...(updateData.approvedDate && { approvedDate: new Date(updateData.approvedDate) }),
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Failed to update progress claim:', error)
    return NextResponse.json({ error: 'Failed to update progress claim', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
