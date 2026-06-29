import { db } from '@/lib/db'
import { autoEntryPettyCash, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')

    const pettyCash = await db.pettyCash.findMany({
      where: { 
        ...(branchId ? { branchId } : {}),
        deletedAt: null,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(pettyCash)
  } catch (error) {
    console.error('Error fetching petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحميل النثرية' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Create petty cash + accounting entry in transaction
    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      // P4-CRIT-011 FIX: support FUND (Dr PETTY_CASH / Cr BANK) vs DISBURSE (Dr EXPENSE / Cr PETTY_CASH)
      const transactionType: 'FUND' | 'DISBURSE' = body.transactionType === 'FUND' ? 'FUND' : 'DISBURSE'

      const pettyCash = await tx.pettyCash.create({
        data: {
          branchId: body.branchId,
          description: body.description,
          amount: parseFloat(body.amount) || 0,
          date: new Date(body.date),
          category: body.category || null,
          reference: body.reference || null,
          transactionType,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      })

      // Auto-create accounting journal entry.
      // R1 (every financial operation MUST create a posted JE) is enforced: if the JE
      // fails, the entire transaction rolls back — no petty cash record without a JE.
      const journalEntry = await autoEntryPettyCash({
        description: pettyCash.description,
        amount: Number(pettyCash.amount),
        category: pettyCash.category || 'OTHER',
        date: pettyCash.date,
        transactionType,
        bankAccountCode: body.bankAccountCode,
      }, tx)

      // Store journalEntryId on the petty cash entry
      if (journalEntry) {
        await tx.pettyCash.update({
          where: { id: pettyCash.id },
          data: { journalEntryId: journalEntry.id },
        })
      }

      // Re-fetch to include journalEntryId
      return await tx.pettyCash.findUnique({
        where: { id: pettyCash.id },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      })
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating petty cash:', error)
    return NextResponse.json({ error: 'فشل في إنشاء النثرية' }, { status: 500 })
  }
}
