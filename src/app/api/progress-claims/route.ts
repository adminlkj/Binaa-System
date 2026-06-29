import { db } from '@/lib/db'
import { type PrismaTransaction } from '@/lib/auto-journal'
// L3A-CRIT-006: removed unused imports (reverseEntry, toNumber) after dead PUT handler removal.
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

    // BUG-P2-02 FIX: Validate claimNo uniqueness BEFORE attempting create,
    // to return a clean 400 instead of leaking a Prisma P2002 error as 500.
    const existingClaim = await db.progressClaim.findUnique({ where: { claimNo } })
    if (existingClaim) {
      return NextResponse.json(
        { error: `رقم المستخلص '${claimNo}' مستخدم بالفعل` },
        { status: 400 }
      )
    }

    // BUG-P2-06 FIX: Validate cumulative claim amount does not exceed
    // contract.value + approved change orders.
    const contract = await db.contract.findUnique({ where: { id: contractId } })
    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }
    // Effective contract value = contract.value + sum of APPROVED change orders
    const approvedCOs = await db.changeOrder.findMany({
      where: { contractId, status: 'APPROVED' },
      select: { changeValue: true },
    })
    const effectiveContractValue =
      Number(contract.value) + approvedCOs.reduce((s, co) => s + Number(co.changeValue), 0)

    const newAmount = parseFloat(amount)
    const existingClaims = await db.progressClaim.findMany({
      where: { contractId, deletedAt: null, status: { not: 'REJECTED' } },
      select: { amount: true },
    })
    const cumulativeSoFar = existingClaims.reduce((s, c) => s + Number(c.amount), 0)
    if (cumulativeSoFar + newAmount > effectiveContractValue) {
      return NextResponse.json(
        {
          error: `مجموع المستخلصات (${cumulativeSoFar + newAmount}) يتجاوز قيمة العقد الفعّالة (${effectiveContractValue}). يجب اعتماد أمر تغيير أولاً أو تصحيح المبلغ.`,
        },
        { status: 400 }
      )
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

// L3A-CRIT-006 FIX: removed dead duplicate PUT handler that took `id` from request body.
// The live PUT handler is at /api/progress-claims/[id]/route.ts (URL parameter routing).
// The UI always calls `fetch(\`/api/progress-claims/${id}\`, { method: 'PUT' })` which
// routes to [id]/route.ts, so this body-id handler was unreachable dead code (75 lines)
// and a maintenance hazard.
