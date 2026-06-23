import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
import { createJournalEntry } from '@/lib/accounting/engine'
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

    // Create claim ONLY — no journal entry.
    // A progress claim is a request for payment, NOT an invoice. The JE will
    // be created when an invoice is generated FROM the approved claim.
    // (See /api/progress-claims/[id]/generate-invoice or the sales-invoices API.)
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

      return claim
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

    // If the claim has a journal entry (legacy data) and amounts are changing,
    // reverse the old entry. We do NOT create a new entry here — the claim
    // workflow does not auto-create JEs. The new JE (if any) will be created
    // when an invoice is generated from the approved claim.
    if (existing.journalEntryId && (updateData.amount !== undefined || updateData.totalAmount !== undefined || updateData.vatAmount !== undefined)) {
      await db.$transaction(async (tx: PrismaTransaction) => {
        const originalEntry = await tx.journalEntry.findUnique({
          where: { id: existing.journalEntryId!, deletedAt: null },
          include: { lines: { where: { deletedAt: null } } },
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

        // Detach the cancelled JE — a fresh JE will be created only when an
        // invoice is generated from this claim.
        updateData.journalEntryId = null
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
