import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const assets = await db.fixedAsset.findMany({
      include: {
        depreciations: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      },
      orderBy: { acquisitionDate: 'desc' },
    })
    return NextResponse.json({ data: assets })
  } catch (error) {
    console.error('Error fetching fixed assets:', error)
    return NextResponse.json({ error: 'Failed to fetch fixed assets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      assetCode,
      name,
      nameAr,
      category,
      acquisitionDate,
      acquisitionCost,
      residualValue,
      usefulLifeMonths,
      depreciationMethod,
    } = body

    if (!assetCode || !name || !category || !acquisitionDate || !acquisitionCost || !usefulLifeMonths) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cost = Number(acquisitionCost)
    const residual = Number(residualValue) || 0
    const lifeMonths = Number(usefulLifeMonths)

    // Determine accounts based on category
    let assetAccountCode: string
    let depExpenseAccountCode: string
    let accumDepAccountCode: string

    switch (category) {
      case 'EQUIPMENT':
        assetAccountCode = '2110'
        depExpenseAccountCode = '8310'
        accumDepAccountCode = '2210'
        break
      case 'VEHICLE':
        assetAccountCode = '2130'
        depExpenseAccountCode = '8320'
        accumDepAccountCode = '2230'
        break
      case 'OFFICE_EQUIPMENT':
        assetAccountCode = '2140'
        depExpenseAccountCode = '8330'
        accumDepAccountCode = '2240'
        break
      case 'SOFTWARE':
        assetAccountCode = '2410'
        depExpenseAccountCode = '8340'
        accumDepAccountCode = '2240'
        break
      default:
        assetAccountCode = '2110'
        depExpenseAccountCode = '8310'
        accumDepAccountCode = '2210'
    }

    // Find the accounts
    const assetAccount = await db.account.findUnique({ where: { code: assetAccountCode } })
    const depExpenseAccount = await db.account.findUnique({ where: { code: depExpenseAccountCode } })
    const accumDepAccount = await db.account.findUnique({ where: { code: accumDepAccountCode } })
    const cashAccount = await db.account.findUnique({ where: { code: '1110' } })

    if (!assetAccount) {
      return NextResponse.json({ error: `Asset account ${assetAccountCode} not found` }, { status: 400 })
    }

    // Create the fixed asset
    const fixedAsset = await db.fixedAsset.create({
      data: {
        assetCode,
        name,
        nameAr: nameAr || null,
        category,
        acquisitionDate: new Date(acquisitionDate),
        acquisitionCost: cost,
        residualValue: residual,
        usefulLifeMonths: lifeMonths,
        depreciationMethod: depreciationMethod || 'STRAIGHT_LINE',
        accumulatedDepreciation: 0,
        netBookValue: cost - residual,
        status: 'ACTIVE',
        accountId: assetAccount.id,
        depExpenseAccountId: depExpenseAccount?.id || null,
        accumDepAccountId: accumDepAccount?.id || null,
      },
    })

    // Create acquisition journal entry: Dr Fixed Asset Account / Cr Cash or Bank
    if (cashAccount) {
      const entry = await db.journalEntry.create({
        data: {
          entryNo: `JE-FA-${Date.now()}`,
          date: new Date(acquisitionDate),
          description: `Acquisition of fixed asset ${assetCode} - ${name}`,
          status: 'POSTED',
          sourceType: 'FIXED_ASSET',
          sourceId: fixedAsset.id,
          lines: {
            create: [
              {
                accountId: assetAccount.id,
                debit: cost,
                credit: 0,
                description: `Acquisition of ${name}`,
              },
              {
                accountId: cashAccount.id,
                debit: 0,
                credit: cost,
                description: `Payment for ${name}`,
              },
            ],
          },
        },
      })

      // Update fixed asset with journal entry reference
      await db.fixedAsset.update({
        where: { id: fixedAsset.id },
        data: { journalEntryId: entry.id },
      })
    }

    return NextResponse.json({
      data: fixedAsset,
      message: 'Fixed asset registered successfully',
    })
  } catch (error) {
    console.error('Error creating fixed asset:', error)
    return NextResponse.json({ error: 'Failed to create fixed asset' }, { status: 500 })
  }
}
