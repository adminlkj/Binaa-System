import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { createAssetWithAcquisition, calculateDepreciation, generateDepreciationSchedule } from '@/lib/accounting/depreciation-engine'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// ============ GET: List fixed assets (with summary) ============
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const where: Prisma.FixedAssetWhereInput = {}
    if (category && category !== 'ALL') where.category = category
    if (status && status !== 'ALL') where.status = status
    if (search) {
      where.OR = [
        { assetCode: { contains: search } },
        { name: { contains: search } },
        { nameAr: { contains: search } },
      ]
    }

    const assets = await db.fixedAsset.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true, nameAr: true } },
        depExpenseAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        accumDepAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        _count: { select: { depreciations: true } },
      },
      orderBy: { assetCode: 'asc' },
    })

    const enriched = assets.map(a => {
      const acquisitionCost = toNumber(a.acquisitionCost)
      const residualValue = toNumber(a.residualValue)
      const accumulatedDepreciation = toNumber(a.accumulatedDepreciation)
      const netBookValue = toNumber(a.netBookValue)
      const monthlyDepreciation = toNumber(a.monthlyDepreciation)
      const annualDepreciation = toNumber(a.annualDepreciation)
      const totalDepreciable = acquisitionCost - residualValue
      const depreciatedMonths = monthlyDepreciation > 0
        ? Math.round(accumulatedDepreciation / monthlyDepreciation)
        : 0
      const remainingMonths = Math.max(0, a.usefulLifeMonths - depreciatedMonths)
      const depreciationProgress = totalDepreciable > 0
        ? (accumulatedDepreciation / totalDepreciable) * 100
        : 0

      return {
        ...serializeDecimal(a),
        monthlyDepreciation,
        annualDepreciation,
        remainingMonths,
        depreciatedMonths,
        depreciationProgress: Math.min(100, depreciationProgress),
      }
    })

    const summary = {
      totalAssets: enriched.length,
      totalCost: enriched.reduce((s, a) => s + toNumber(a.acquisitionCost), 0),
      totalAccumulatedDep: enriched.reduce((s, a) => s + toNumber(a.accumulatedDepreciation), 0),
      totalNetBookValue: enriched.reduce((s, a) => s + toNumber(a.netBookValue), 0),
      totalMonthlyDepreciation: enriched.reduce((s, a) => s + (a.monthlyDepreciation || 0), 0),
      totalAnnualDepreciation: enriched.reduce((s, a) => s + (a.annualDepreciation || 0), 0),
      activeAssets: enriched.filter(a => a.status === 'ACTIVE').length,
      fullyDepreciated: enriched.filter(a => a.status === 'FULLY_DEPRECIATED').length,
    }

    return NextResponse.json({ assets: enriched, summary })
  } catch (error) {
    console.error('Error fetching fixed assets:', error)
    return NextResponse.json({ error: 'فشل في تحميل الأصول الثابتة' }, { status: 500 })
  }
}

// ============ POST: Create a new fixed asset (SIMPLIFIED) ============
//
// المستخدم يُدخل فقط:
//   - name (مطلوب)
//   - nameAr (اختياري)
//   - category (مطلوب)
//   - acquisitionCost (مطلوب)
//   - acquisitionDate (مطلوب)
//   - usefulLifeYears (مطلوب — عدد السنوات)
//   - depreciationRate (مطلوب — النسبة المئوية السنوية)
//   - notes (اختياري)
//   - createAcquisitionEntry (افتراضياً true)
//   - payFrom (TREASURY | BANK — افتراضياً TREASURY)
//
// كل شيء آخر يُحسب ويُنشأ تلقائياً عبر createAssetWithAcquisition()
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // التحقق من الحقول المطلوبة فقط
    if (!body.name || !body.acquisitionDate || !body.acquisitionCost || !body.usefulLifeYears) {
      return NextResponse.json(
        { error: 'الاسم وتاريخ التملك والتكلفة وعدد السنوات مطلوبة' },
        { status: 400 }
      )
    }

    if (Number(body.usefulLifeYears) <= 0) {
      return NextResponse.json(
        { error: 'عدد السنوات يجب أن يكون أكبر من صفر' },
        { status: 400 }
      )
    }

    // معاينة الحساب قبل الإنشاء
    const preview = calculateDepreciation({
      acquisitionCost: Number(body.acquisitionCost),
      usefulLifeYears: Number(body.usefulLifeYears),
      depreciationRate: Number(body.depreciationRate),
    })

    const result = await createAssetWithAcquisition({
      name: body.name,
      nameAr: body.nameAr || null,
      category: body.category || 'OTHER',
      acquisitionCost: Number(body.acquisitionCost),
      acquisitionDate: body.acquisitionDate,
      usefulLifeYears: Number(body.usefulLifeYears),
      depreciationRate: Number(body.depreciationRate) || 0,
      notes: body.notes || null,
      accountId: body.accountId || null,
      depExpenseAccountId: body.depExpenseAccountId || null,
      accumDepAccountId: body.accumDepAccountId || null,
      createAcquisitionEntry: body.createAcquisitionEntry !== false,
      payFrom: body.payFrom || 'TREASURY',
    })

    return NextResponse.json({
      ...serializeDecimal(result.asset),
      monthlyDepreciation: result.calculation.monthlyDepreciation,
      annualDepreciation: result.calculation.annualDepreciation,
      residualValue: result.calculation.residualValue,
      acquisitionJournalEntryId: result.acquisitionJournalEntryId,
      schedulePreview: result.schedule.slice(0, 12), // أول 12 شهر للمعاينة
      message: result.acquisitionJournalEntryId
        ? 'تم إنشاء الأصل وقيد التملك تلقائياً'
        : 'تم إنشاء الأصل (لم يتم إنشاء قيد التملك - تأكد من ربط الحسابات)',
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating fixed asset:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء الأصل الثابت' },
      { status: 500 }
    )
  }
}
