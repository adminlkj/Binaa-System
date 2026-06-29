import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/claim-items?claimId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const claimId = searchParams.get('claimId')

    const where: any = {}
    if (claimId) where.claimId = claimId

    const items = await db.claimItem.findMany({
      where,
      include: {
        boqItem: { select: { id: true, description: true, unit: true, unitPrice: true } },
        wbsElement: { select: { id: true, code: true, name: true } },
        measurement: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const normalized = items.map(i => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      totalAmount: Number(i.totalAmount),
      previousQuantity: Number(i.previousQuantity),
      currentQuantity: Number(i.currentQuantity),
      cumulativeQuantity: Number(i.cumulativeQuantity),
      retentionAmount: Number(i.retentionAmount || 0),
      advanceDeduction: Number(i.advanceDeduction || 0),
      penaltyAmount: Number(i.penaltyAmount || 0),
      otherDeductions: Number(i.otherDeductions || 0),
      netAmount: Number(i.netAmount || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Claim items GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch claim items' },
      { status: 500 }
    )
  }
}

// POST /api/claim-items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { claimId, boqItemId, wbsElementId, description, unit, previousQuantity, currentQuantity, cumulativeQuantity, unitPrice, retentionPercent, advanceDeduction, penaltyAmount, otherDeductions } = body

    // L3A-CRIT-004 FIX: clean Arabic error messages instead of leaking Prisma internals.
    if (!claimId || !description) {
      return NextResponse.json({ error: 'claimId, description are required' }, { status: 400 })
    }

    // Validate claimId exists (return clean 404 instead of P2003 FK violation leak).
    const claimExists = await db.progressClaim.findUnique({ where: { id: claimId }, select: { id: true, status: true } })
    if (!claimExists) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }
    if (claimExists.status !== 'DRAFT') {
      return NextResponse.json({ error: 'لا يمكن إضافة بنود لمستخلص غير مسودة' }, { status: 400 })
    }

    // L3A-CRIT-003 FIX: over-claim prevention — currentQuantity must not exceed BOQ item quantity.
    if (boqItemId) {
      const boqItem = await db.bOQItem.findUnique({ where: { id: boqItemId }, select: { id: true, quantity: true, description: true } })
      if (!boqItem) {
        return NextResponse.json({ error: 'بند جدول الكميات غير موجود' }, { status: 404 })
      }
      const boqQty = Number(boqItem.quantity)
      const claimQty = Number(currentQuantity || 0)
      if (claimQty < 0) {
        return NextResponse.json({ error: 'الكمية لا يمكن أن تكون سالبة' }, { status: 400 })
      }
      if (claimQty > boqQty) {
        return NextResponse.json({
          error: `الكمية المطلوبة (${claimQty}) تتجاوز كمية بند جدول الكميات (${boqQty})`,
        }, { status: 400 })
      }
      // Also check cumulative claimed qty across previous claim items for this BOQ item.
      const previousClaims = await db.claimItem.findMany({
        where: { boqItemId, claim: { status: { in: ['SUBMITTED', 'APPROVED', 'CERTIFIED', 'INVOICED'] } } },
        select: { currentQuantity: true },
      })
      const previouslyClaimed = previousClaims.reduce((sum, c) => sum + Number(c.currentQuantity), 0)
      if (previouslyClaimed + claimQty > boqQty) {
        return NextResponse.json({
          error: `إجمالي الكميات المطلوبة (${previouslyClaimed + claimQty}) تتجاوز كمية بند جدول الكميات (${boqQty})`,
        }, { status: 400 })
      }
    }

    const totalAmount = Number(unitPrice || 0) * Number(currentQuantity || 0)
    const retentionAmount = totalAmount * Number(retentionPercent || 0) / 100
    const netAmount = totalAmount - retentionAmount - Number(advanceDeduction || 0) - Number(penaltyAmount || 0) - Number(otherDeductions || 0)

    const item = await db.claimItem.create({
      data: {
        claimId,
        boqItemId,
        wbsElementId,
        description,
        unit,
        previousQuantity: Number(previousQuantity || 0),
        currentQuantity: Number(currentQuantity || 0),
        cumulativeQuantity: Number(cumulativeQuantity || 0),
        unitPrice: Number(unitPrice || 0),
        totalAmount,
        retentionPercent: Number(retentionPercent || 0),
        retentionAmount,
        advanceDeduction: Number(advanceDeduction || 0),
        penaltyAmount: Number(penaltyAmount || 0),
        otherDeductions: Number(otherDeductions || 0),
        netAmount,
      },
    })

    return NextResponse.json({
      data: { ...item, unitPrice: Number(item.unitPrice), totalAmount: Number(item.totalAmount), netAmount: Number(item.netAmount) },
    }, { status: 201 })
  } catch (error: unknown) {
    // L3A-CRIT-004 FIX: never leak Prisma stack trace / internal file paths to the client.
    console.error('Claim items POST error:', error)
    const isKnown = error instanceof Error && (error as any).code === 'P2003'
    return NextResponse.json(
      { error: isKnown ? 'مرجع غير صالح: تأكد من صحة المعرفات المرتبطة' : 'فشل في إنشاء بند المستخلص' },
      { status: isKnown ? 400 : 500 }
    )
  }
}
