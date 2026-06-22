import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/claim-certifications?claimId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const claimId = searchParams.get('claimId')

    const where: any = {}
    if (claimId) where.claimId = claimId

    const certifications = await db.claimCertification.findMany({
      where,
      include: {
        claim: { select: { id: true, claimNo: true, projectId: true } },
      },
      orderBy: { certificationDate: 'desc' },
    })

    const normalized = certifications.map(c => ({
      ...c,
      claimedAmount: Number(c.claimedAmount),
      certifiedAmount: Number(c.certifiedAmount),
      deductedAmount: Number(c.deductedAmount || 0),
      retentionAmount: Number(c.retentionAmount || 0),
      advanceDeduction: Number(c.advanceDeduction || 0),
      penaltyAmount: Number(c.penaltyAmount || 0),
      otherDeductions: Number(c.otherDeductions || 0),
      netPayable: Number(c.netPayable || 0),
    }))

    return NextResponse.json({ data: normalized, total: normalized.length })
  } catch (error: unknown) {
    console.error('Claim certifications GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch claim certifications', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// POST /api/claim-certifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { claimId, certifiedBy, certificationDate, claimedAmount, certifiedAmount, retentionAmount, advanceDeduction, penaltyAmount, otherDeductions, consultantName, consultantApprovalNo, notes } = body

    if (!claimId || !certifiedAmount || !certificationDate) {
      return NextResponse.json({ error: 'claimId, certifiedAmount, certificationDate are required' }, { status: 400 })
    }

    const claimed = Number(claimedAmount || 0)
    const certified = Number(certifiedAmount || 0)
    const retention = Number(retentionAmount || 0)
    const advance = Number(advanceDeduction || 0)
    const penalty = Number(penaltyAmount || 0)
    const other = Number(otherDeductions || 0)
    const deducted = retention + advance + penalty + other
    const netPayable = certified - deducted

    const cert = await db.claimCertification.create({
      data: {
        claimId,
        certifiedBy,
        certificationDate: new Date(certificationDate),
        claimedAmount: claimed,
        certifiedAmount: certified,
        deductedAmount: deducted,
        retentionAmount: retention,
        advanceDeduction: advance,
        penaltyAmount: penalty,
        otherDeductions: other,
        netPayable,
        status: 'CERTIFIED',
        notes,
      },
    })

    // Update ProgressClaim status + certifiedAmount
    try {
      await db.progressClaim.update({
        where: { id: claimId },
        data: {
          status: 'APPROVED',
          certifiedAmount: certified,
          retentionAmount: retention,
          advanceDeduction: advance,
        },
      })
    } catch (e) {
      console.error('Failed to update ProgressClaim after certification:', e)
    }

    return NextResponse.json({
      data: { ...cert, claimedAmount: Number(cert.claimedAmount), certifiedAmount: Number(cert.certifiedAmount), netPayable: Number(cert.netPayable) },
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Claim certifications POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create claim certification', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
