import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { createJournalEntry } from '@/lib/accounting/engine'
import { getAccountCodeByRole, AccountRole, requireAccountByRole } from '@/lib/account-roles'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// ============ GET: List fixed assets ============
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
      const monthlyDepreciation = a.usefulLifeMonths > 0
        ? (acquisitionCost - residualValue) / a.usefulLifeMonths
        : 0
      const depreciatedMonths = Math.floor(accumulatedDepreciation / (monthlyDepreciation || 1))
      const remainingMonths = Math.max(0, a.usefulLifeMonths - depreciatedMonths)

      return {
        ...serializeDecimal(a),
        monthlyDepreciation,
        remainingMonths,
        depreciatedMonths,
        depreciationCount: a._count.depreciations,
      }
    })

    const summary = {
      totalAssets: enriched.length,
      totalCost: enriched.reduce((s, a) => s + toNumber(a.acquisitionCost), 0),
      totalAccumulatedDep: enriched.reduce((s, a) => s + toNumber(a.accumulatedDepreciation), 0),
      totalNetBookValue: enriched.reduce((s, a) => s + toNumber(a.netBookValue), 0),
      activeAssets: enriched.filter(a => a.status === 'ACTIVE').length,
      fullyDepreciated: enriched.filter(a => a.status === 'FULLY_DEPRECIATED').length,
    }

    return NextResponse.json({ assets: enriched, summary })
  } catch (error) {
    console.error('Error fetching fixed assets:', error)
    return NextResponse.json({ error: 'فشل في تحميل الأصول الثابتة' }, { status: 500 })
  }
}

// ============ POST: Create a new fixed asset ============
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate
    if (!body.name || !body.acquisitionDate || !body.acquisitionCost || !body.usefulLifeMonths) {
      return NextResponse.json(
        { error: 'الاسم وتاريخ التملك والتكلفة والعمر الإنتاجي مطلوبة' },
        { status: 400 }
      )
    }

    // Generate asset code
    const lastAsset = await db.fixedAsset.findFirst({
      orderBy: { assetCode: 'desc' },
      select: { assetCode: true },
    })
    let nextNum = 1
    if (lastAsset?.assetCode) {
      const match = lastAsset.assetCode.match(/(\d+)$/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const assetCode = `AST-${String(nextNum).padStart(4, '0')}`

    // Resolve accounts by role
    const fixedAssetCode = body.accountId
      ? (await db.account.findUnique({ where: { id: body.accountId } }))?.code
      : await getAccountCodeByRole(AccountRole.FIXED_ASSET)
    const depExpenseCode = body.depExpenseAccountId
      ? (await db.account.findUnique({ where: { id: body.depExpenseAccountId } }))?.code
      : await getAccountCodeByRole(AccountRole.DEPRECIATION_EXPENSE)
    const accumDepCode = body.accumDepAccountId
      ? (await db.account.findUnique({ where: { id: body.accumDepAccountId } }))?.code
      : await getAccountCodeByRole(AccountRole.ACCUM_DEPRECIATION)

    const acquisitionCost = Number(body.acquisitionCost) || 0
    const residualValue = Number(body.residualValue) || 0

    // Create asset
    const asset = await db.fixedAsset.create({
      data: {
        assetCode,
        name: body.name,
        nameAr: body.nameAr || null,
        category: body.category || 'OTHER',
        acquisitionDate: new Date(body.acquisitionDate),
        acquisitionCost,
        residualValue,
        usefulLifeMonths: parseInt(body.usefulLifeMonths) || 0,
        depreciationMethod: body.depreciationMethod || 'STRAIGHT_LINE',
        accumulatedDepreciation: 0,
        netBookValue: acquisitionCost,
        status: 'ACTIVE',
        accountId: body.accountId || null,
        depExpenseAccountId: body.depExpenseAccountId || null,
        accumDepAccountId: body.accumDepAccountId || null,
      },
      include: {
        account: { select: { id: true, code: true, name: true, nameAr: true } },
        depExpenseAccount: { select: { id: true, code: true, name: true, nameAr: true } },
        accumDepAccount: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Create acquisition journal entry (if payment account provided)
    let journalEntryId: string | null = null
    if (body.createAcquisitionEntry !== false && fixedAssetCode) {
      const paymentRole = body.payFrom === 'BANK' ? AccountRole.BANK : AccountRole.CASH
      const paymentCode = await getAccountCodeByRole(paymentRole) || '1110'

      try {
        const je = await createJournalEntry({
          entryNo: `JE-AST-${Date.now()}`,
          date: new Date(body.acquisitionDate),
          description: `Acquisition of ${body.name}`,
          descriptionAr: `تملك أصل: ${body.nameAr || body.name}`,
          lines: [
            { accountCode: fixedAssetCode, debit: acquisitionCost, credit: 0 },
            { accountCode: paymentCode, debit: 0, credit: acquisitionCost },
          ],
          sourceType: 'ASSET_ACQUISITION',
          sourceId: asset.id,
        })
        journalEntryId = je?.id || null

        await db.fixedAsset.update({
          where: { id: asset.id },
          data: { journalEntryId },
        })
      } catch (jeError) {
        console.error('Journal entry creation failed:', jeError)
        // Asset created but JE failed — return warning
      }
    }

    return NextResponse.json({
      ...serializeDecimal(asset),
      journalEntryId,
      message: journalEntryId ? 'تم إنشاء الأصل والقيد المحاسبي' : 'تم إنشاء الأصل (لم يتم إنشاء قيد)',
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating fixed asset:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الأصل الثابت' }, { status: 500 })
  }
}
