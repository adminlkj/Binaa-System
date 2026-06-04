import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: List all rental contracts with includes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const equipmentId = searchParams.get('equipmentId')
    const clientId = searchParams.get('clientId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (equipmentId) where.equipmentId = equipmentId
    if (clientId) where.clientId = clientId

    const contracts = await db.equipmentRentalContract.findMany({
      where,
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        timesheets: {
          orderBy: { year: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(contracts)
  } catch (error) {
    console.error('Error fetching rental contracts:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في تحميل عقود التأجير', detail: message }, { status: 500 })
  }
}

// POST: Create new rental contract with auto-generated contractNo
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-generate contractNo
    const lastContract = await db.equipmentRentalContract.findFirst({
      orderBy: { contractNo: 'desc' },
      select: { contractNo: true },
    })

    let nextNum = 1
    if (lastContract?.contractNo) {
      const match = lastContract.contractNo.match(/RC-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const contractNo = `RC-${String(nextNum).padStart(4, '0')}`

    // Calculate hourlyRate
    const referenceRate = parseFloat(body.referenceRate) || 0
    const referenceHours = parseFloat(body.referenceHours) || 0
    const hourlyRate = referenceHours > 0 ? referenceRate / referenceHours : 0

    const contract = await db.equipmentRentalContract.create({
      data: {
        contractNo,
        equipmentId: body.equipmentId,
        clientId: body.clientId,
        projectId: body.projectId || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        referenceRate,
        referenceHours,
        hourlyRate,
        paymentTerms: body.paymentTerms || null,
        purchaseOrderNo: body.purchaseOrderNo || null,
        deliveryExpense: parseFloat(body.deliveryExpense) || 0,
        notes: body.notes || null,
        status: body.status || 'DRAFT',
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        timesheets: true,
      },
    })

    // If status is ACTIVE, update equipment status to RENTED
    if (contract.status === 'ACTIVE') {
      await db.equipment.update({
        where: { id: contract.equipmentId },
        data: { status: 'RENTED' },
      })
    }

    return NextResponse.json(contract, { status: 201 })
  } catch (error) {
    console.error('Error creating rental contract:', error)
    return NextResponse.json({ error: 'فشل في إنشاء عقد التأجير' }, { status: 500 })
  }
}
