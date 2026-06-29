import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { autoEntrySubcontractorAdvance, type PrismaTransaction } from '@/lib/accounting/engine'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-advances?subcontractorId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: Prisma.SubcontractorAdvanceWhereInput = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId

    const advances = await db.subcontractorAdvance.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    })

    const normalized = advances.map(a => ({
      ...a,
      amount: Number(a.amount),
      recoveredAmount: Number(a.recoveredAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Subcontractor advances GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor advances' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-advances
// Creates advance + journal entry atomically (P2-CRIT-002 fix).
// R1 enforced — if the JE fails, the advance record is rolled back too.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, projectId, contractId, amount, deductionPercent, recoveryMethod, date, notes, paymentMethod } = body

    if (!subcontractorId || !projectId || !amount || !date) {
      return NextResponse.json({ error: 'subcontractorId, projectId, amount, date are required' }, { status: 400 })
    }

    // Validate subcontractor + project exist
    const [subcontractor, project] = await Promise.all([
      db.subcontractor.findUnique({ where: { id: subcontractorId }, select: { id: true, name: true } }),
      db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, costCenterId: true } }),
    ])
    if (!subcontractor) return NextResponse.json({ error: 'المقاول غير موجود' }, { status: 404 })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    const year = new Date(date).getFullYear()
    const count = await db.subcontractorAdvance.count()
    const advanceNo = `SCA-${year}-${String(count + 1).padStart(4, '0')}`

    // Use Decimal for financial precision (P2-CRIT-008 fix)
    const amt = new Prisma.Decimal(body.amount)

    // Atomic: advance record + JE in one transaction (P2-CRIT-002 fix)
    const advance = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.subcontractorAdvance.create({
        data: {
          advanceNo,
          subcontractorId,
          projectId,
          contractId,
          date: new Date(date),
          amount: amt,
          deductionPercent: Number(deductionPercent || 0),
          recoveryMethod: recoveryMethod || 'PER_CERTIFICATE',
          status: 'PENDING',
          recoveredAmount: 0,
          notes,
        },
        include: {
          subcontractor: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      })

      // R1: every financial operation MUST create a posted JE.
      // Pass project.costCenterId so the advance is attributed to the project (P2-HIGH-009 fix)
      const je = await autoEntrySubcontractorAdvance({
        advanceNo: created.advanceNo,
        subcontractorName: subcontractor.name,
        amount: Number(created.amount),
        date: created.date,
        paymentMethod: paymentMethod || 'CASH',
        costCenterId: project.costCenterId || undefined,
      }, tx)

      // Store journalEntryId on the advance
      await tx.subcontractorAdvance.update({
        where: { id: created.id },
        data: { journalEntryId: je.id },
      })

      return tx.subcontractorAdvance.findUnique({
        where: { id: created.id },
        include: {
          subcontractor: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      })
    })

    return NextResponse.json({
      data: { ...advance, amount: Number(advance!.amount), recoveredAmount: Number(advance!.recoveredAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor advances POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor advance' },
      { status: 500 }
    )
  }
}
