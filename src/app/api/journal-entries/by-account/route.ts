import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// GET /api/journal-entries/by-account?accountId=...
// Fetch all journal entries that include a specific account
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return NextResponse.json(
        { error: 'معرف الحساب مطلوب (accountId)' },
        { status: 400 }
      )
    }

    // Verify the account exists
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { id: true, code: true, name: true, nameAr: true, type: true },
    })

    if (!account) {
      return NextResponse.json(
        { error: 'الحساب غير موجود' },
        { status: 404 }
      )
    }

    // Get all journal lines for this account, with their parent journal entries
    const lines = await db.journalLine.findMany({
      where: { accountId },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNo: true,
            date: true,
            description: true,
            status: true,
            sourceType: true,
          },
        },
      },
      orderBy: { journalEntry: { date: 'desc' } },
    })

    // Group by journal entry and compute totals per entry for this account
    const entryMap = new Map<string, {
      id: string
      entryNo: string
      date: string
      description: string | null
      status: string
      sourceType: string | null
      debit: number
      credit: number
    }>()

    for (const line of lines) {
      const je = line.journalEntry
      const existing = entryMap.get(je.id)
      if (existing) {
        existing.debit += toNumber(line.debit)
        existing.credit += toNumber(line.credit)
      } else {
        entryMap.set(je.id, {
          id: je.id,
          entryNo: je.entryNo,
          date: je.date as unknown as string,
          description: je.description,
          status: je.status,
          sourceType: je.sourceType,
          debit: toNumber(line.debit),
          credit: toNumber(line.credit),
        })
      }
    }

    const entries = Array.from(entryMap.values())

    return NextResponse.json(serializeDecimal({
      account,
      entries,
      totalLines: lines.length,
    }))
  } catch (error) {
    console.error('Error fetching journal entries by account:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل حركات الحساب' },
      { status: 500 }
    )
  }
}
