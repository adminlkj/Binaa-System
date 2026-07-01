import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { autoEntrySubcontractorRetention, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Retentions API
// ----------------------------------------------------------------------------
// P1-2 CRIT-4 FIX: previously autoEntrySubcontractorRetention had ZERO API
// callers — SUBCONTRACTOR_RETENTION_PAYABLE liability was never accrued.
//
//   Dr SUBCONTRACTOR_AP  /  Cr SUBCONTRACTOR_RETENTION_PAYABLE
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

    const retentions = await db.subcontractorRetention.findMany({
      where,
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        // NOTE: SubcontractorRetention.subcontractorInvoiceId is a plain String column
        // (no Prisma @relation to SubcontractorInvoice), so we return the id only;
        // the client can fetch the invoice separately if needed.
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(retentions)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor retentions:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor retentions' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const {
      retentionNo,
      subcontractorId,
      projectId,
      subcontractorInvoiceId,
      date,
      withheldAmount,
      notes,
    } = body

    if (!retentionNo || !subcontractorId || !projectId || !date || withheldAmount === undefined) {
      return NextResponse.json(
        { error: 'الحقول المطلوبة: رقم الاحتجاز، المقاول، المشروع، التاريخ، المبلغ المحتجز' },
        { status: 400 }
      )
    }

    const amountNum = Number(withheldAmount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'المبلغ المحتجز يجب أن يكون رقماً أكبر من صفر' }, { status: 400 })
    }

    // Validate subcontractor + project
    const subcontractor = await db.subcontractor.findUnique({ where: { id: subcontractorId } })
    if (!subcontractor) {
      return NextResponse.json({ error: 'مقاول الباطن غير موجود' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Validate the linked invoice (if provided) belongs to the same subcontractor
    if (subcontractorInvoiceId) {
      const inv = await db.subcontractorInvoice.findUnique({
        where: { id: subcontractorInvoiceId },
        select: { id: true, subcontractorId: true },
      })
      if (!inv) {
        return NextResponse.json({ error: 'فاتورة مقاول الباطن غير موجودة' }, { status: 404 })
      }
      if (inv.subcontractorId !== subcontractorId) {
        return NextResponse.json(
          { error: 'الفاتورة لا تنتمي لهذا المقاول' },
          { status: 400 }
        )
      }
    }

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // 1. Create the source document
      const retention = await tx.subcontractorRetention.create({
        data: {
          retentionNo,
          subcontractorId,
          projectId,
          subcontractorInvoiceId: subcontractorInvoiceId || null,
          date: new Date(date),
          withheldAmount: amountNum,
          releasedAmount: 0,
          status: 'WITHHELD',
          notes: notes || null,
        },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })

      // 2. Post the journal entry (costCenterId from project)
      const je = await autoEntrySubcontractorRetention({
        retentionNo: retention.retentionNo,
        subcontractorName: subcontractor.nameAr || subcontractor.name,
        withheldAmount: amountNum,
        date: retention.date,
        costCenterId: project.costCenterId || undefined,
      }, tx)

      // 3. Link back
      await tx.subcontractorRetention.update({
        where: { id: retention.id },
        data: { journalEntryId: je.id },
      })

      return await tx.subcontractorRetention.findUniqueOrThrow({
        where: { id: retention.id },
        include: {
          subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[API] Failed to create subcontractor retention:', error)
    return NextResponse.json({ error: 'Failed to create subcontractor retention' }, { status: 500 })
  }
}
