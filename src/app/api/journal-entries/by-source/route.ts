import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET /api/journal-entries/by-source?sourceType=...&sourceId=...
// Look up the journal entry linked to a specific source document
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get('sourceType')
    const sourceId = searchParams.get('sourceId')

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { error: 'نوع المصدر ومعرف المصدر مطلوبان (sourceType, sourceId)' },
        { status: 400 }
      )
    }

    // Look up by sourceType and sourceId on JournalEntry
    const journalEntry = await db.journalEntry.findFirst({
      where: {
        sourceType,
        sourceId,
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                nameAr: true,
                type: true,
              },
            },
            costCenter: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: { debit: 'desc' }, // Debit lines first
        },
      },
    })

    if (!journalEntry) {
      return NextResponse.json(
        { error: 'لم يتم العثور على قيد محاسبي مرتبط بهذا المستند', found: false },
        { status: 404 }
      )
    }

    // Calculate totals
    const totalDebit = journalEntry.lines.reduce((s, l) => s + toNumber(l.debit), 0)
    const totalCredit = journalEntry.lines.reduce((s, l) => s + toNumber(l.credit), 0)
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    return NextResponse.json(serializeDecimal({
      found: true,
      journalEntry: {
        id: journalEntry.id,
        entryNo: journalEntry.entryNo,
        date: journalEntry.date,
        description: journalEntry.description,
        status: journalEntry.status,
        sourceType: journalEntry.sourceType,
        sourceId: journalEntry.sourceId,
        isReversal: journalEntry.isReversal,
        reversedEntryId: journalEntry.reversedEntryId,
        createdAt: journalEntry.createdAt,
        lines: journalEntry.lines.map(l => ({
          id: l.id,
          account: l.account,
          costCenter: l.costCenter,
          debit: Math.round(toNumber(l.debit) * 10000) / 10000,
          credit: Math.round(toNumber(l.credit) * 10000) / 10000,
          description: l.description,
        })),
        totals: {
          debit: Math.round(totalDebit * 10000) / 10000,
          credit: Math.round(totalCredit * 10000) / 10000,
          isBalanced,
        },
      },
    }))
  } catch (error) {
    console.error('Error looking up journal entry by source:', error)
    return NextResponse.json(
      { error: 'فشل في البحث عن القيد المحاسبي' },
      { status: 500 }
    )
  }
}
