import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PrismaTransaction } from '@/lib/accounting/engine'
import { postJournalEntry, getNextEntryNo } from '@/lib/accounting/guard'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { year, month } = body

    if (!year || !month) {
      return NextResponse.json({ error: 'year and month are required' }, { status: 400 })
    }

    // Get all active fixed assets
    const assets = await db.fixedAsset.findMany({
      where: { status: 'ACTIVE' },
    })

    if (assets.length === 0) {
      return NextResponse.json({ message: 'No active fixed assets to depreciate', results: [] })
    }

    const results: { assetId: string; assetCode: string; depreciationAmount: number; journalEntryId?: string }[] = []

    // Process all assets in a single transaction
    await db.$transaction(async (tx: PrismaTransaction) => {
      for (const asset of assets) {
        // Check if depreciation already exists for this month/year
        const existingDep = await tx.assetDepreciation.findFirst({
          where: { fixedAssetId: asset.id, year, month },
        })

        if (existingDep) {
          results.push({
            assetId: asset.id,
            assetCode: asset.assetCode,
            depreciationAmount: 0,
            journalEntryId: existingDep.journalEntryId || undefined,
          })
          continue
        }

        // Convert Decimal fields to numbers for arithmetic
        const acquisitionCost = Number(asset.acquisitionCost)
        const residualValue = Number(asset.residualValue)
        const accumulatedDepreciation = Number(asset.accumulatedDepreciation)
        const usefulLifeMonths = asset.usefulLifeMonths

        // Calculate monthly depreciation
        const monthlyDepreciation = (acquisitionCost - residualValue) / usefulLifeMonths

        // Check if asset is fully depreciated
        const newAccumDep = accumulatedDepreciation + monthlyDepreciation
        if (newAccumDep > acquisitionCost - residualValue) {
          // Skip if fully depreciated
          if (accumulatedDepreciation >= acquisitionCost - residualValue) {
            await tx.fixedAsset.update({
              where: { id: asset.id },
              data: { status: 'FULLY_DEPRECIATED' },
            })
            continue
          }
        }

        // Get depreciation expense and accumulated depreciation accounts
        const depExpenseAccount = asset.depExpenseAccountId
          ? await tx.account.findUnique({ where: { id: asset.depExpenseAccountId } })
          : null
        const accumDepAccount = asset.accumDepAccountId
          ? await tx.account.findUnique({ where: { id: asset.accumDepAccountId } })
          : null

        let journalEntryId: string | null = null

        // Create journal entry via the unbreakable guard: Dr Depreciation Expense / Cr Accumulated Depreciation
        if (depExpenseAccount && accumDepAccount) {
          const depDate = new Date(year, month - 1, 28) // Last day of the month
          const entry = await postJournalEntry({
            entryNo: await getNextEntryNo(tx),
            date: depDate,
            description: `Depreciation for ${asset.name} (${asset.assetCode}) - ${year}/${month}`,
            sourceType: 'ASSET_DEPRECIATION',
            sourceId: asset.id,
            lines: [
              { accountId: depExpenseAccount.id, debit: monthlyDepreciation, credit: 0, description: `Depreciation expense - ${asset.name}` },
              { accountId: accumDepAccount.id, debit: 0, credit: monthlyDepreciation, description: `Accumulated depreciation - ${asset.name}` },
            ],
          }, tx)
          journalEntryId = entry.id
        }

        // Create AssetDepreciation record
        await tx.assetDepreciation.create({
          data: {
            fixedAssetId: asset.id,
            year,
            month,
            depreciationAmount: monthlyDepreciation,
            journalEntryId,
          },
        })

        // Update FixedAsset accumulatedDepreciation and netBookValue
        const finalAccumDep = Math.min(accumulatedDepreciation + monthlyDepreciation, acquisitionCost - residualValue)
        const netBookValue = acquisitionCost - finalAccumDep

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: finalAccumDep,
            netBookValue: Math.max(netBookValue, residualValue),
            status: netBookValue <= residualValue ? 'FULLY_DEPRECIATED' : 'ACTIVE',
          },
        })

        results.push({
          assetId: asset.id,
          assetCode: asset.assetCode,
          depreciationAmount: monthlyDepreciation,
          journalEntryId: journalEntryId || undefined,
        })
      }
    })

    return NextResponse.json({
      message: `Depreciation processed for ${results.filter((r) => r.depreciationAmount > 0).length} assets`,
      results,
      year,
      month,
    })
  } catch (error) {
    console.error('Error processing depreciation:', error)
    return NextResponse.json({ error: 'Failed to process depreciation' }, { status: 500 })
  }
}
