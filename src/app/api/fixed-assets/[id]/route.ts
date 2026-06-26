import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { updateAssetAndRecalculate, deleteAsset, generateDepreciationSchedule, calculateDepreciation } from '@/lib/accounting/depreciation-engine'
import { NextResponse } from 'next/server'

// ============ GET: Asset detail with full depreciation schedule ============
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
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        },
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 })
    }

    // جلب قيود الإهلاك المرتبطة منفصلة (لا توجد علاقة مسماة)
    const depIds = asset.depreciations.map(d => d.id).filter(Boolean)
    const depJournalEntries = depIds.length > 0
      ? await db.journalEntry.findMany({
          where: { id: { in: asset.depreciations.map(d => d.journalEntryId).filter(Boolean) as string[] } },
          select: { id: true, entryNo: true, date: true, description: true, status: true },
        })
      : []
    const jeMap = new Map(depJournalEntries.map(je => [je.id, je]))
    const depreciationsWithJE = asset.depreciations.map(d => ({
      ...d,
      journalEntry: d.journalEntryId ? jeMap.get(d.journalEntryId) || null : null,
    }))

    // جلب قيد التملك منفصلاً (لا توجد علاقة مسماة)
    let acquisitionEntry: any = null
    if (asset.journalEntryId) {
      acquisitionEntry = await db.journalEntry.findUnique({
        where: { id: asset.journalEntryId },
        select: { id: true, entryNo: true, date: true, description: true },
      })
    }

    // توليد الجدول الكامل (متوقع + منفذ) — نمرر فقط السجلات غير المعكوسة
    const activeDepreciations = depreciationsWithJE.filter(d => !d.reversed)
    const schedule = generateDepreciationSchedule(asset, activeDepreciations)

    const calc = calculateDepreciation({
      acquisitionCost: toNumber(asset.acquisitionCost),
      usefulLifeMonths: asset.usefulLifeMonths,
      usefulLifeYears: asset.usefulLifeYears,
      depreciationRate: toNumber(asset.depreciationRate),
      residualValue: toNumber(asset.residualValue),
      accumulatedDepreciation: toNumber(asset.accumulatedDepreciation),
    })

    return NextResponse.json({
      ...serializeDecimal(asset),
      monthlyDepreciation: calc.monthlyDepreciation,
      annualDepreciation: calc.annualDepreciation,
      netBookValue: toNumber(asset.netBookValue),
      schedule,
      calculation: calc,
      acquisitionEntry,
    })
  } catch (error) {
    console.error('Error fetching asset:', error)
    return NextResponse.json({ error: 'فشل في تحميل الأصل' }, { status: 500 })
  }
}

// ============ PUT: Update asset (auto-recalculates) ============
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const result = await updateAssetAndRecalculate({
      id,
      name: body.name,
      nameAr: body.nameAr,
      category: body.category,
      acquisitionDate: body.acquisitionDate,
      acquisitionCost: body.acquisitionCost !== undefined ? Number(body.acquisitionCost) : undefined,
      usefulLifeYears: body.usefulLifeYears !== undefined ? Number(body.usefulLifeYears) : undefined,
      depreciationRate: body.depreciationRate !== undefined ? Number(body.depreciationRate) : undefined,
      notes: body.notes,
      accountId: body.accountId,
      depExpenseAccountId: body.depExpenseAccountId,
      accumDepAccountId: body.accumDepAccountId,
    })

    return NextResponse.json({
      ...serializeDecimal(result.asset),
      monthlyDepreciation: result.calculation.monthlyDepreciation,
      annualDepreciation: result.calculation.annualDepreciation,
      schedule: result.schedule,
      message: 'تم تحديث الأصل وإعادة حساب الإهلاك',
    })
  } catch (error: any) {
    console.error('Error updating asset:', error)
    return NextResponse.json(
      { error: error.message || 'فشل في تحديث الأصل' },
      { status: 500 }
    )
  }
}

// ============ DELETE: Delete asset (auto-reverses acquisition JE) ============
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await deleteAsset(id)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error deleting asset:', error)
    return NextResponse.json(
      { error: error.message || 'فشل في حذف الأصل' },
      { status: 500 }
    )
  }
}
