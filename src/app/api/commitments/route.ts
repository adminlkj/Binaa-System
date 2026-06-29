import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/commitments?projectId=xxx&status=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const commitments = await db.commitment.findMany({
      where,
      include: {
        lines: true,
        _count: { select: { lines: true } },
      },
      orderBy: { commitmentDate: 'desc' },
    })

    const normalized = commitments.map(c => ({
      ...c,
      committedAmount: Number(c.committedAmount),
      invoicedAmount: Number(c.invoicedAmount),
      receivedAmount: Number(c.receivedAmount),
      remainingCommitment: Number(c.remainingCommitment),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Commitments GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commitments' },
      { status: 500 }
    )
  }
}

// POST /api/commitments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, commitmentType, vendorId, description, committedAmount, commitmentDate, lines } = body

    if (!projectId || !commitmentType || !committedAmount) {
      return NextResponse.json({ error: 'projectId, commitmentType, committedAmount are required' }, { status: 400 })
    }

    const year = new Date(commitmentDate || Date.now()).getFullYear()
    const count = await db.commitment.count({ where: { projectId } })
    const commitmentNo = `CMT-${year}-${String(count + 1).padStart(4, '0')}`

    const commitment = await db.commitment.create({
      data: {
        commitmentNo,
        projectId,
        commitmentType,
        description,
        committedAmount: Number(committedAmount),
        commitmentDate: new Date(commitmentDate || Date.now()),
        status: 'OPEN',
        lines: lines?.length ? {
          create: lines.map((l: any) => ({
            wbsElementId: l.wbsElementId,
            costCodeId: l.costCodeId,
            description: l.description,
            quantity: Number(l.quantity || 0),
            unitPrice: Number(l.unitPrice || 0),
            lineAmount: Number(l.lineAmount || 0),
          })),
        } : undefined,
      },
      include: { lines: true },
    })

    return NextResponse.json({
      data: {
        ...commitment,
        committedAmount: Number(commitment.committedAmount),
        invoicedAmount: Number(commitment.invoicedAmount),
        receivedAmount: Number(commitment.receivedAmount),
        remainingCommitment: Number(commitment.remainingCommitment),
      },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Commitments POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create commitment' },
      { status: 500 }
    )
  }
}
