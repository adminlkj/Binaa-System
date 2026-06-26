import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: List all depreciation records ============
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const fixedAssetId = searchParams.get('fixedAssetId')

    const where: any = {}
    if (year) where.year = parseInt(year)
    if (month) where.month = parseInt(month)
    if (fixedAssetId) where.fixedAssetId = fixedAssetId

    const records = await db.assetDepreciation.findMany({
      where,
      include: {
        fixedAsset: {
          select: { id: true, assetCode: true, name: true, nameAr: true, category: true },
        },
        journalEntry: {
          select: { id: true, entryNo: true, date: true, description: true, descriptionAr: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
    })

    const enriched = records.map(r => ({
      ...serializeDecimal(r),
      depreciationAmount: toNumber(r.depreciationAmount),
    }))

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching depreciation records:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الإهلاك' }, { status: 500 })
  }
}
