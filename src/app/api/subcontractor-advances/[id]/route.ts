import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRoleApi, requireAuthApi } from '@/lib/auth-helpers'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'

// ============================================================================
// Subcontractor Advances [id] API
// ----------------------------------------------------------------------------
// GET    /api/subcontractor-advances/[id]   — fetch single advance
// DELETE /api/subcontractor-advances/[id]   — reverse JE + delete row
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const advance = await db.subcontractorAdvance.findUnique({
      where: { id },
      include: {
        subcontractor: { select: { id: true, code: true, name: true, nameAr: true } },
        project: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    if (!advance) {
      return NextResponse.json({ error: 'سلفة مقاول الباطن غير موجودة' }, { status: 404 })
    }

    return NextResponse.json(advance)
  } catch (error) {
    console.error('[API] Failed to fetch subcontractor advance:', error)
    return NextResponse.json({ error: 'Failed to fetch subcontractor advance' }, { status: 500 })
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

    const existing = await db.subcontractorAdvance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سلفة مقاول الباطن غير موجودة' }, { status: 404 })
    }

    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.subcontractorAdvance.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف السلفة وعكس القيد المحاسبي بنجاح' })
  } catch (error) {
    console.error('[API] Failed to delete subcontractor advance:', error)
    return NextResponse.json({ error: 'Failed to delete subcontractor advance' }, { status: 500 })
  }
}
