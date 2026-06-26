import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// ============ GET: Asset detail with depreciation schedule ============
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const asset = await db.fixedAsset.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, code: true, name: true, nameAr: true } },
        depExpenseAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        accumDepAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        depreciations: {
          include: {
            journalEntry: { select: { id: true, entryNo: true, date: true, description: true, descriptionAr: true } },
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 })
    }

    const acquisitionCost = toNumber(asset.acquisitionCost)
    const residualValue = toNumber(asset.residualValue)
    const accumulatedDepreciation = toNumber(asset.accumulatedDepreciation)
    const monthlyDepreciation = asset.usefulLifeMonths > 0
      ? (acquisitionCost - residualValue) / asset.usefulLifeMonths
      : 0

    return NextResponse.json({
      ...serializeDecimal(asset),
      monthlyDepreciation,
      netBookValue: toNumber(asset.netBookValue),
    })
  } catch (error) {
    console.error('Error fetching asset:', error)
    return NextResponse.json({ error: 'فشل في تحميل الأصل' }, { status: 500 })
  }
}

// ============ PUT: Update asset (only if ACTIVE and no depreciations) ============
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.fixedAsset.findUnique({
      where: { id },
      include: { _count: { select: { depreciations: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 })
    }

    if (existing._count.depreciations > 0) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل أصل تم إهلاكه — يجب عكس القيود أولاً' },
        { status: 400 }
      )
    }

    const updated = await db.fixedAsset.update({
      where: { id },
      data: {
        name: body.name || existing.name,
        nameAr: body.nameAr !== undefined ? body.nameAr : existing.nameAr,
        category: body.category || existing.category,
        acquisitionDate: body.acquisitionDate ? new Date(body.acquisitionDate) : existing.acquisitionDate,
        acquisitionCost: body.acquisitionCost !== undefined ? Number(body.acquisitionCost) : existing.acquisitionCost,
        residualValue: body.residualValue !== undefined ? Number(body.residualValue) : existing.residualValue,
        usefulLifeMonths: body.usefulLifeMonths ? parseInt(body.usefulLifeMonths) : existing.usefulLifeMonths,
        accountId: body.accountId !== undefined ? body.accountId : existing.accountId,
        depExpenseAccountId: body.depExpenseAccountId !== undefined ? body.depExpenseAccountId : existing.depExpenseAccountId,
        accumDepAccountId: body.accumDepAccountId !== undefined ? body.accumDepAccountId : existing.accumDepAccountId,
        // Recalculate NBV if cost changed
        netBookValue: body.acquisitionCost !== undefined ? Number(body.acquisitionCost) : existing.netBookValue,
      },
    })

    return NextResponse.json(serializeDecimal(updated))
  } catch (error) {
    console.error('Error updating asset:', error)
    return NextResponse.json({ error: 'فشل في تحديث الأصل' }, { status: 500 })
  }
}

// ============ DELETE: Delete asset (only if no depreciations) ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.fixedAsset.findUnique({
      where: { id },
      include: { _count: { select: { depreciations: true } } },
    })

    if (!existing) {
      return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 })
    }

    if (existing._count.depreciations > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف أصل تم إهلاكه — يجب عكس القيود أولاً' },
        { status: 400 }
      )
    }

    await db.fixedAsset.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting asset:', error)
    return NextResponse.json({ error: 'فشل في حذف الأصل' }, { status: 500 })
  }
}
