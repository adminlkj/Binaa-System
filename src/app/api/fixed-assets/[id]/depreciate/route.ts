import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { getAccountCodeByRole, AccountRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'

// ============ POST: Run depreciation for a single asset ============
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const year = parseInt(body.year)
    const month = parseInt(body.month)

    if (!year || !month) {
      return NextResponse.json({ error: 'السنة والشهر مطلوبان' }, { status: 400 })
    }

    const asset = await db.fixedAsset.findUnique({ where: { id } })
    if (!asset) {
      return NextResponse.json({ error: 'الأصل غير موجود' }, { status: 404 })
    }

    if (asset.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `لا يمكن إهلاك أصل بحالة: ${asset.status}` },
        { status: 400 }
      )
    }

    // Check for duplicate
    const existing = await db.assetDepreciation.findFirst({
      where: { fixedAssetId: id, year, month },
    })
    if (existing) {
      return NextResponse.json(
        { error: `تم إهلاك هذا الأصل مسبقاً لفترة ${month}/${year}` },
        { status: 400 }
      )
    }

    // Calculate depreciation
    const acquisitionCost = toNumber(asset.acquisitionCost)
    const residualValue = toNumber(asset.residualValue)
    const monthlyDepreciation = asset.usefulLifeMonths > 0
      ? (acquisitionCost - residualValue) / asset.usefulLifeMonths
      : 0

    if (monthlyDepreciation <= 0) {
      return NextResponse.json(
        { error: 'قيمة الإهلاك الشهري صفر — تحقق من البيانات' },
        { status: 400 }
      )
    }

    // Check if this depreciation would bring NBV below residual
    const currentAccumDep = toNumber(asset.accumulatedDepreciation)
    const newAccumDep = currentAccumDep + monthlyDepreciation
    const newNBV = acquisitionCost - newAccumDep

    // Adjust last month depreciation to land exactly on residual value
    let depreciationAmount = monthlyDepreciation
    if (newNBV < residualValue) {
      depreciationAmount = (acquisitionCost - residualValue) - currentAccumDep
      if (depreciationAmount <= 0) {
        return NextResponse.json(
          { error: 'الأصل وصل لقيمته المتبقية — لا يمكن إهلاكه أكثر' },
          { status: 400 }
        )
      }
    }

    // Resolve accounts
    const isRental = asset.category === 'EQUIPMENT'
    const expenseRole = isRental ? AccountRole.RENTAL_DEPRECIATION : AccountRole.DEPRECIATION_EXPENSE
    const depExpenseCode = await getAccountCodeByRole(expenseRole) || '8310'
    const accumDepCode = await getAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION) || '2210'

    // Create journal entry
    const periodDate = new Date(year, month - 1, 1)
    const assetName = asset.nameAr || asset.name

    const je = await createJournalEntry({
      entryNo: `JE-DEP-${asset.assetCode}-${year}${String(month).padStart(2, '0')}`,
      date: periodDate,
      description: `Depreciation - ${asset.name} (${month}/${year})`,
      descriptionAr: `إهلاك ${assetName} - ${month}/${year}`,
      lines: [
        { accountCode: depExpenseCode, debit: depreciationAmount, credit: 0 },
        { accountCode: accumDepCode, debit: 0, credit: depreciationAmount },
      ],
      sourceType: 'DEPRECIATION',
      sourceId: id,
    })

    // Create depreciation record
    const depreciation = await db.assetDepreciation.create({
      data: {
        fixedAssetId: id,
        year,
        month,
        depreciationAmount,
        journalEntryId: je?.id || null,
      },
    })

    // Update asset
    const finalAccumDep = currentAccumDep + depreciationAmount
    const finalNBV = acquisitionCost - finalAccumDep
    const isFullyDepreciated = finalNBV <= residualValue + 0.01

    await db.fixedAsset.update({
      where: { id },
      data: {
        accumulatedDepreciation: finalAccumDep,
        netBookValue: finalNBV,
        status: isFullyDepreciated ? 'FULLY_DEPRECIATED' : 'ACTIVE',
      },
    })

    return NextResponse.json({
      success: true,
      depreciation,
      journalEntryId: je?.id || null,
      journalEntryNo: je?.entryNo || null,
      depreciationAmount,
      newNetBookValue: finalNBV,
      newAccumulatedDepreciation: finalAccumDep,
      isFullyDepreciated,
      message: isFullyDepreciated
        ? `تم إهلاك الأصل بالكامل — القيمة الدفترية وصلت للقيمة المتبقية`
        : `تم إنشاء قيد الإهلاك بنجاح`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error running depreciation:', error)
    return NextResponse.json({ error: 'فشل في تنفيذ الإهلاك' }, { status: 500 })
  }
}
