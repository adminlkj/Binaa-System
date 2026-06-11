import { db } from '@/lib/db'
import { autoEntryPettyCash, initializeChartOfAccounts } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId')

    const pettyCash = await db.pettyCash.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(pettyCash)
  } catch (error) {
    console.error('Error fetching petty cash:', error)
    return NextResponse.json({ error: 'فشل في تحميل السلفة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const pettyCash = await db.pettyCash.create({
      data: {
        branchId: body.branchId,
        description: body.description,
        amount: parseFloat(body.amount),
        date: new Date(body.date),
        category: body.category || null,
        reference: body.reference || null,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    // Auto-create accounting journal entry
    try {
      await initializeChartOfAccounts()
      const journalEntry = await autoEntryPettyCash({
        description: pettyCash.description,
        amount: pettyCash.amount,
        category: pettyCash.category || 'OTHER',
        date: pettyCash.date,
      })

      // Store journalEntryId on the petty cash entry
      if (journalEntry) {
        await db.pettyCash.update({
          where: { id: pettyCash.id },
          data: { journalEntryId: journalEntry.id },
        })
      }
    } catch (accountingError) {
      console.error('Accounting entry failed for petty cash:', accountingError)
    }

    // Re-fetch to include journalEntryId
    const updatedPettyCash = await db.pettyCash.findUnique({
      where: { id: pettyCash.id },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(updatedPettyCash, { status: 201 })
  } catch (error) {
    console.error('Error creating petty cash:', error)
    return NextResponse.json({ error: 'فشل في إنشاء السلفة' }, { status: 500 })
  }
}
