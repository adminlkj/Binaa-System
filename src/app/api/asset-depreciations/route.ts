import { requireAuthApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: List all depreciation records ============
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const fixedAssetId = searchParams.get('fixedAssetId')
    const includeReversed = searchParams.get('includeReversed') === 'true'

    const where: any = {}
    if (year) where.year = parseInt(year)
    if (month) where.month = parseInt(month)
    if (fixedAssetId) where.fixedAssetId = fixedAssetId
    if (!includeReversed) where.reversed = false

    const records = await db.assetDepreciation.findMany({
      where,
      include: {
        fixedAsset: {
          select: { id: true, assetCode: true, name: true, nameAr: true, category: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
    })

    // جلب القيود منفصلة (لا توجد علاقة مسماة)
    const jeIds = records.map(r => r.journalEntryId).filter(Boolean) as string[]
    const journalEntries = jeIds.length > 0
      ? await db.journalEntry.findMany({
          where: { id: { in: jeIds } },
          select: { id: true, entryNo: true, date: true, description: true, status: true },
        })
      : []
    const jeMap = new Map(journalEntries.map(je => [je.id, je]))

    const enriched = records.map(r => ({
      ...serializeDecimal(r),
      depreciationAmount: toNumber(r.depreciationAmount),
      beginningNBV: toNumber(r.beginningNBV),
      endingNBV: toNumber(r.endingNBV),
      journalEntry: r.journalEntryId ? jeMap.get(r.journalEntryId) || null : null,
    }))

    // ملخص
    const summary = {
      totalRecords: enriched.length,
      totalAmount: enriched.reduce((s, r) => s + (r.reversed ? 0 : r.depreciationAmount), 0),
      activeRecords: enriched.filter(r => !r.reversed).length,
      reversedRecords: enriched.filter(r => r.reversed).length,
    }

    return NextResponse.json({ records: enriched, summary })
  } catch (error) {
    console.error('Error fetching depreciation records:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الإهلاك' }, { status: 500 })
  }
}
