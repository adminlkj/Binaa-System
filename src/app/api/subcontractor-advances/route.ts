import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { autoEntrySubcontractorAdvance, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Advances API
// ----------------------------------------------------------------------------
// P1-2 CRIT-3 FIX: previously autoEntrySubcontractorAdvance had ZERO API
// callers — SUBCONTRACTOR_ADVANCE asset was never debited; cash credit was
// invisible to GL.
//
//   Dr SUBCONTRACTOR_ADVANCE  /  Cr CASH (or BANK)
// ============================================================================

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const subcontractorId = searchParams.get('subcontractorId')
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (subcontractorId) where.subcontractorId = subcontractorId
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const advances = await db.subcontractorAdvance.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(advances)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor advances:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor advances' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const {
      advanceNo,
      subcontractorId,
      projectId,
      contractId,
      date,
      amount,
      deductionPercent,
      recoveryMethod,
      notes,
      paymentMethod,
    } = body

    if (!advanceNo || !subcontractorId || !projectId || !date || amount === undefined) {
      return NextResponse.json(
        { error: 'الحقول المطلوبة: رقم السلفة، المقاول، المشروع، التاريخ، المبلغ' },
        { status: 400 }
      )
    }

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
    }

    // Validate subcontractor + project exist
    const subcontractor = await db.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!subcontractor) {
      return NextResponse.json({ error: 'مقاول الباطن غير موجود' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Map paymentMethod to the autoEntry's CASH/BANK enum
    const method: 'CASH' | 'BANK' = paymentMethod === 'CASH' ? 'CASH' : 'BANK'

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Create the source document
      const advance = await tx.subcontractorAdvance.create({
        data: {
          advanceNo,
          subcontractorId,
          projectId,
          contractId: contractId || null,
          date: new Date(date),
          amount: amountNum,
          deductionPercent: deductionPercent !== undefined ? Number(deductionPercent) : 0,
          recoveryMethod: recoveryMethod || 'PER_CERTIFICATE',
          status: 'PENDING',
          recoveredAmount: 0,
          notes: notes || null,
        },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      // 2. Post the journal entry (costCenterId from project)
      const je = await autoEntrySubcontractorAdvance({
        advanceNo: advance.advanceNo,
        subcontractorName: subcontractor.nameAr || subcontractor.name,
        amount: amountNum,
        date: advance.date,
        paymentMethod: method,
        costCenterId: project.costCenterId || undefined,
      }, tx)

      // 3. Link back
      await tx.subcontractorAdvance.update({
        where: { id: advance.id },
        data: { journalEntryId: je.id },
      })

      return await tx.subcontractorAdvance.findUniqueOrThrow({
        where: { id: advance.id },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create subcontractor advance:', error)
    return NextResponse.json({ error: 'Failed to create subcontractor advance' }, { status: 500 })
  }
}
