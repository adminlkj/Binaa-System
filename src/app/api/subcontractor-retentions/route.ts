import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { autoEntrySubcontractorRetention, type PrismaTransaction } from '@/lib/accounting/engine'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/subcontractor-retentions?subcontractorId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 1000)

    const where: Prisma.SubcontractorRetentionWhereInput = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId

    const retentions = await db.subcontractorRetention.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    })

    const normalized = retentions.map(r => ({
      ...r,
      withheldAmount: Number(r.withheldAmount),
      releasedAmount: Number(r.releasedAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Subcontractor retentions GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor retentions', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/subcontractor-retentions
// Creates retention + journal entry atomically (P2-CRIT-002 fix).
// R1 enforced — if the JE fails, the retention record is rolled back too.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subcontractorId, projectId, subcontractorInvoiceId, withheldAmount, date, notes } = body

    if (!subcontractorId || !projectId || !withheldAmount || !date) {
      return NextResponse.json({ error: 'subcontractorId, projectId, withheldAmount, date are required' }, { status: 400 })
    }

    // Validate subcontractor + project exist
    const [subcontractor, project] = await Promise.all([
      db.subcontractor.findUnique({ where: { id: subcontractorId }, select: { id: true, name: true } }),
      db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, costCenterId: true } }),
    ])
    if (!subcontractor) return NextResponse.json({ error: 'المقاول غير موجود' }, { status: 404 })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    const year = new Date(date).getFullYear()
    const count = await db.subcontractorRetention.count()
    const retentionNo = `SRT-${year}-${String(count + 1).padStart(4, '0')}`

    // Use Decimal for financial precision (P2-CRIT-008 fix)
    const amt = new Prisma.Decimal(body.withheldAmount)

    // Atomic: retention record + JE in one transaction (P2-CRIT-002 fix)
    const retention = await db.$transaction(async (tx: PrismaTransaction) => {
      const created = await tx.subcontractorRetention.create({
        data: {
          retentionNo,
          subcontractorId,
          projectId,
          subcontractorInvoiceId,
          date: new Date(date),
          withheldAmount: amt,
          releasedAmount: 0,
          status: 'WITHHELD',
          notes,
        },
        include: {
          subcontractor: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      })

      // R1: every financial operation MUST create a posted JE.
      // Pass project.costCenterId so the retention is attributed to the project (P2-HIGH-009 fix)
      const je = await autoEntrySubcontractorRetention({
        retentionNo: created.retentionNo,
        subcontractorName: subcontractor.name,
        withheldAmount: Number(created.withheldAmount),
        date: created.date,
        costCenterId: project.costCenterId || undefined,
      }, tx)

      // Store journalEntryId on the retention
      await tx.subcontractorRetention.update({
        where: { id: created.id },
        data: { journalEntryId: je.id },
      })

      return tx.subcontractorRetention.findUnique({
        where: { id: created.id },
        include: {
          subcontractor: { select: { id: true, name: true } },
          project: { select: { id: true, code: true, name: true } },
        },
      })
    })

    return NextResponse.json({
      data: { ...retention, withheldAmount: Number(retention!.withheldAmount), releasedAmount: Number(retention!.releasedAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Subcontractor retentions POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor retention', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
