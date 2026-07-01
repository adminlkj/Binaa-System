import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Retentions [id] API
// ----------------------------------------------------------------------------
// GET    /api/subcontractor-retentions/[id]   — fetch single retention
// DELETE /api/subcontractor-retentions/[id]   — reverse JE + delete row
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const retention = await db.subcontractorRetention.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
        // NOTE: SubcontractorRetention.subcontractorInvoiceId is a plain String column
        // (no Prisma @relation to SubcontractorInvoice), so we return the id only.
      },
    })

    if (!retention) {
      return NextResponse.json({ error: 'احتجاز الضمان غير موجود' }, { status: 404 })
    }

    return NextResponse.json(retention)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor retention:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor retention' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.subcontractorRetention.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'احتجاز الضمان غير موجود' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.subcontractorRetention.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف الاحتجاز وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('[API] Failed to delete subcontractor retention:', error)
    return NextResponse.json({ error: 'Failed to delete subcontractor retention' }, { status: 500 })
  }
}
