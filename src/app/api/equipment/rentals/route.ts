import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const status = searchParams.get('status')

    const rentals = await db.equipmentRental.findMany({
      where: {
        ...(equipmentId ? { equipmentId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(rentals)
  } catch (error) {
    console.error('Error fetching equipment rentals:', error)
    return NextResponse.json({ error: 'فشل في تحميل عقود التأجير' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Calculate hourly rate if pricing type is HOURLY
    const pricingType = body.pricingType || 'HOURLY'
    const referenceRate = parseFloat(body.referenceRate) || 0
    const referenceHours = parseFloat(body.referenceHours) || 0
    const hourlyRate = pricingType === 'HOURLY' && referenceHours > 0 ? referenceRate / referenceHours : 0

    // Auto-generate contract number
    const lastContract = await db.contract.findFirst({
      where: { contractType: 'RENTAL' },
      orderBy: { contractNo: 'desc' },
    })
    let nextNum = 1
    if (lastContract?.contractNo) {
      const match = lastContract.contractNo.match(/RC-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }
    const contractNo = `RC-${String(nextNum).padStart(4, '0')}`

    // Auto-generate sales order number
    const lastSO = await db.contract.findFirst({
      where: { salesOrderNo: { not: null } },
      orderBy: { salesOrderNo: 'desc' },
    })
    let soNum = 1
    if (lastSO?.salesOrderNo) {
      const match = lastSO.salesOrderNo.match(/SO-(\d+)/)
      if (match) soNum = parseInt(match[1]) + 1
    }
    const salesOrderNo = `SO-${String(soNum).padStart(4, '0')}`

    // Find or use provided projectId
    let projectId = body.projectId
    if (!projectId) {
      const anyProject = await db.project.findFirst()
      if (anyProject) projectId = anyProject.id
    }
    if (!projectId) {
      return NextResponse.json({ error: 'لا يوجد مشروع متاح' }, { status: 400 })
    }

    // Create parent Contract first
    const contract = await db.contract.create({
      data: {
        projectId,
        contractNo,
        date: new Date(body.startDate),
        value: referenceRate,
        vatRate: 0.15,
        clientId: body.clientId,
        equipmentId: body.equipmentId,
        contractType: 'RENTAL',
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: 'DRAFT',
        deliveryFees: parseFloat(body.deliveryFees) || 0,
        deliveryFeesTaxable: body.deliveryFeesTaxable !== false,
        salesOrderNo,
      },
    })

    // Create EquipmentRental
    const rental = await db.equipmentRental.create({
      data: {
        contractId: contract.id,
        equipmentId: body.equipmentId,
        clientId: body.clientId,
        projectId: body.projectId || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        pricingType,
        referenceRate,
        referenceHours,
        hourlyRate,
        dailyRate: parseFloat(body.dailyRate) || 0,
        monthlyRate: parseFloat(body.monthlyRate) || 0,
        lumpSumAmount: parseFloat(body.lumpSumAmount) || 0,
        workCity: body.workCity || null,
        workLocation: body.workLocation || null,
        siteSupervisor: body.siteSupervisor || null,
        siteSupervisorPhone: body.siteSupervisorPhone || null,
        deliveryFeesType: body.deliveryFeesType || 'NONE',
        deliveryFees: parseFloat(body.deliveryFees) || 0,
        deliveryFeesTaxable: body.deliveryFeesTaxable !== false,
        operationMode: body.operationMode || 'WITHOUT_DRIVER',
        fuelResponsibility: body.fuelResponsibility || 'ON_CLIENT',
        insuranceResponsibility: body.insuranceResponsibility || 'ON_CLIENT',
        salesOrderNo,
        purchaseOrderNo: body.purchaseOrderNo || null,
        quotationNo: body.quotationNo || null,
        status: 'DRAFT',
        paymentDuration: body.paymentDuration || null,
        additionalTerms: body.additionalTerms || null,
        notes: body.notes || null,
        totalAmount: parseFloat(body.totalAmount) || referenceRate,
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json(rental, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment rental:', error)
    return NextResponse.json({ error: 'فشل في إنشاء عقد التأجير' }, { status: 500 })
  }
}
