import { db } from '@/lib/db'
import { toNumber } from '@/lib/decimal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { getAccountCodeByRole, AccountRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'

// ============ POST: Run depreciation for ALL active assets ============
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const year = parseInt(body.year)
    const month = parseInt(body.month)

    if (!year || !month) {
      return NextResponse.json({ error: 'السنة والشهر مطلوبان' }, { status: 400 })
    }

    // Get all active assets
    const assets = await db.fixedAsset.findMany({
      where: { status: 'ACTIVE' },
    })

    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        skipped: 0,
        totalAmount: 0,
        journalEntryIds: [],
        message: 'لا توجد أصول نشطة لإهلاكها',
      })
    }

    // Resolve account codes once
    const depExpenseCode = await getAccountCodeByRole(AccountRole.DEPRECIATION_EXPENSE) || '8310'
    const rentalDepCode = await getAccountCodeByRole(AccountRole.RENTAL_DEPRECIATION) || '7250'
    const accumDepCode = await getAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION) || '2210'

    const results: {
      assetId: string
      assetCode: string
      assetName: string
      amount: number
      journalEntryId: string | null
      journalEntryNo: string | null
      newNBV: number
      fullyDepreciated: boolean
    }[] = []
    const skipped: { assetCode: string; assetName: string; reason: string }[] = []
    let totalAmount = 0
    const journalEntryIds: string[] = []

    const periodDate = new Date(year, month - 1, 1)

    for (const asset of assets) {
      // Check for duplicate
      const existing = await db.assetDepreciation.findFirst({
        where: { fixedAssetId: asset.id, year, month },
      })
      if (existing) {
        skipped.push({
          assetCode: asset.assetCode,
          assetName: asset.nameAr || asset.name,
          reason: 'تم الإهلاك مسبقاً لهذه الفترة',
        })
        continue
      }

      const acquisitionCost = toNumber(asset.acquisitionCost)
      const residualValue = toNumber(asset.residualValue)
      const monthlyDepreciation = asset.usefulLifeMonths > 0
        ? (acquisitionCost - residualValue) / asset.usefulLifeMonths
        : 0

      if (monthlyDepreciation <= 0) {
        skipped.push({
          assetCode: asset.assetCode,
          assetName: asset.nameAr || asset.name,
          reason: 'قيمة الإهلاك صفر',
        })
        continue
      }

      const currentAccumDep = toNumber(asset.accumulatedDepreciation)
      let depreciationAmount = monthlyDepreciation
      const projectedNBV = acquisitionCost - (currentAccumDep + monthlyDepreciation)

      if (projectedNBV < residualValue) {
        depreciationAmount = (acquisitionCost - residualValue) - currentAccumDep
        if (depreciationAmount <= 0) {
          skipped.push({
            assetCode: asset.assetCode,
            assetName: asset.nameAr || asset.name,
            reason: 'وصل للقيمة المتبقية',
          })
          continue
        }
      }

      // Create journal entry
      const isRental = asset.category === 'EQUIPMENT'
      const expenseCode = isRental ? rentalDepCode : depExpenseCode
      const assetName = asset.nameAr || asset.name

      try {
        const je = await createJournalEntry({
          entryNo: `JE-DEP-${asset.assetCode}-${year}${String(month).padStart(2, '0')}`,
          date: periodDate,
          description: `Depreciation - ${asset.name} (${month}/${year})`,
          descriptionAr: `إهلاك ${assetName} - ${month}/${year}`,
          lines: [
            { accountCode: expenseCode, debit: depreciationAmount, credit: 0 },
            { accountCode: accumDepCode, debit: 0, credit: depreciationAmount },
          ],
          sourceType: 'DEPRECIATION',
          sourceId: asset.id,
        })

        // Create depreciation record
        await db.assetDepreciation.create({
          data: {
            fixedAssetId: asset.id,
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
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: finalAccumDep,
            netBookValue: finalNBV,
            status: isFullyDepreciated ? 'FULLY_DEPRECIATED' : 'ACTIVE',
          },
        })

        results.push({
          assetId: asset.id,
          assetCode: asset.assetCode,
          assetName,
          amount: depreciationAmount,
          journalEntryId: je?.id || null,
          journalEntryNo: je?.entryNo || null,
          newNBV: finalNBV,
          fullyDepreciated: isFullyDepreciated,
        })

        totalAmount += depreciationAmount
        if (je?.id) journalEntryIds.push(je.id)
      } catch (jeError) {
        console.error(`JE failed for asset ${asset.assetCode}:`, jeError)
        skipped.push({
          assetCode: asset.assetCode,
          assetName: asset.nameAr || asset.name,
          reason: 'فشل إنشاء القيد المحاسبي',
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      skipped: skipped.length,
      skippedDetails: skipped,
      totalAmount,
      journalEntryIds,
      results,
      message: `تم إهلاك ${results.length} أصل بقيمة إجمالية ${totalAmount.toFixed(2)}${skipped.length > 0 ? ` — تم تخطي ${skipped.length} أصل` : ''}`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error running bulk depreciation:', error)
    return NextResponse.json({ error: 'فشل في تنفيذ الإهلاك المجمع' }, { status: 500 })
  }
}
