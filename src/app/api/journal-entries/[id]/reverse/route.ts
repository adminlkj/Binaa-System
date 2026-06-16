import { db } from '@/lib/db'
import { reverseEntry } from '@/lib/accounting/engine'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const result = await db.$transaction(async (tx: PrismaTransaction) => {
      const reversalEntry = await reverseEntry(id, tx)
      return reversalEntry
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error reversing journal entry:', error)
    const message = error instanceof Error ? error.message : 'فشل في عكس القيد المحاسبي'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
