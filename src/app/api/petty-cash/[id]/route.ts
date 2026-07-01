import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const entry = await db.pettyCash.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })
    if (!entry) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error fetching petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحميل السلفة النقدية' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.pettyCash.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }

    // Cannot modify entries with journal entries (posted)
    if (existing.journalEntryId) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل سلفة مرحّلة محاسبياً' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}

    if (body.branchId !== undefined) data.branchId = body.branchId
    if (body.description !== undefined) data.description = body.description
    if (body.amount !== undefined) data.amount = parseFloat(body.amount) || 0
    if (body.date !== undefined) data.date = new Date(body.date)
    if (body.category !== undefined) data.category = body.category || null
    if (body.reference !== undefined) data.reference = body.reference || null

    const entry = await db.pettyCash.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحديث السلفة النقدية' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.pettyCash.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'السلفة النقدية غير موجودة' }, { status: 404 })
    }

    // P1-2 HIGH-1 FIX: wrap BOTH the JE reversal and the row delete in a single
    // db.$transaction. Previously these were two separate non-tx calls — if the
    // delete failed after the reversal succeeded, the GL would be left with a
    // reversed JE + the original petty cash record still pointing to the
    // now-reversed JE (inconsistent state).
    //
    // reverseEntry HARD-REQUIRES tx (throws REVERSE_NO_TX without it) — so
    // passing the tx client is mandatory anyway.
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }
      await tx.pettyCash.delete({ where: { id } })
    })

    return NextResponse.json({ message: 'تم حذف السلفة النقدية بنجاح' })
  } catch (error) {
    console.error('Error deleting petty cash:', error)
    return NextResponse.json({ error: 'فشل في حذف السلفة النقدية' }, { status: 500 })
  }
}
