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

    const contracts = await db.equipmentRental.findMany({
      where,
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true, status: true },
        },
        client: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        contract: {
          select: { id: true, contractNo: true, status: true },
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

// POST: Create new rental contract with auto-generated contractNo and salesOrderNo
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.equipmentId) {
      return NextResponse.json({ error: 'المعدة مطلوبة' }, { status: 400 })
    }
    if (!body.clientId) {
      return NextResponse.json({ error: 'العميل مطلوب' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'تاريخ البداية مطلوب' }, { status: 400 })
    }

    // ─── Auto-generate contractNo (RC-0001) from Contract table ───
    const lastContractWithRC = await db.contract.findFirst({
      where: { contractNo: { startsWith: 'RC-' } },
      orderBy: { contractNo: 'desc' },
      select: { contractNo: true },
    })

    let nextContractNum = 1
    if (lastContractWithRC?.contractNo) {
      const match = lastContractWithRC.contractNo.match(/RC-(\d+)/)
      if (match) nextContractNum = parseInt(match[1]) + 1
    }

    const contractNo = `RC-${String(nextContractNum).padStart(4, '0')}`

    // ─── Auto-generate salesOrderNo (SO-0001) ───
    const lastRentalWithSO = await db.equipmentRental.findFirst({
      where: { salesOrderNo: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { salesOrderNo: true },
    })

    let nextSONum = 1
    if (lastRentalWithSO?.salesOrderNo) {
      const match = lastRentalWithSO.salesOrderNo.match(/SO-(\d+)/)
      if (match) nextSONum = parseInt(match[1]) + 1
    }

    const salesOrderNo = `SO-${String(nextSONum).padStart(4, '0')}`

    // ─── Parse numeric fields ───
    const referenceRate = parseFloat(body.referenceRate) || 0
    const referenceHours = parseFloat(body.referenceHours) || 0
    const pricingType = body.pricingType || 'HOURLY'
    const dailyRate = parseFloat(body.dailyRate) || 0
    const monthlyRate = parseFloat(body.monthlyRate) || 0
    const lumpSumAmount = parseFloat(body.lumpSumAmount) || 0
    const deliveryFees = parseFloat(body.deliveryFees) || 0
    const totalAmount = parseFloat(body.totalAmount) || 0

    // ─── Calculate hourlyRate when pricingType is HOURLY ───
    let hourlyRate = parseFloat(body.hourlyRate) || 0
    if (pricingType === 'HOURLY' && referenceHours > 0) {
      hourlyRate = referenceRate / referenceHours
    }

    // ─── Resolve projectId (required for parent Contract) ───
    let projectId = body.projectId || null

    if (!projectId) {
      // Fallback: find the first project for the given clientId
      const clientProject = await db.project.findFirst({
        where: { clientId: body.clientId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (clientProject) {
        projectId = clientProject.id
      } else {
        // Ultimate fallback: find any project in the system
        const anyProject = await db.project.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (anyProject) {
          projectId = anyProject.id
        } else {
          return NextResponse.json(
            { error: 'لا يوجد مشروع في النظام. يرجى إنشاء مشروع أولاً' },
            { status: 400 }
          )
        }
      }
    }

    const deliveryFeesTaxable = body.deliveryFeesTaxable !== undefined
      ? Boolean(body.deliveryFeesTaxable)
      : true

    // ─── Create parent Contract record ───
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
        hourlyRate,
        deliveryFees,
        deliveryFeesTaxable,
        salesOrderNo,
        purchaseOrderNo: body.purchaseOrderNo || null,
        quotationNo: body.quotationNo || null,
      },
    })

    // ─── Create EquipmentRental record ───
    const rental = await db.equipmentRental.create({
      data: {
        contractId: contract.id,
        equipmentId: body.equipmentId,
        clientId: body.clientId,
        projectId: body.projectId || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        // Pricing
        pricingType,
        referenceRate,
        referenceHours,
        hourlyRate,
        dailyRate,
        monthlyRate,
        lumpSumAmount,
        // Work Location
        workCity: body.workCity || null,
        workLocation: body.workLocation || null,
        siteSupervisor: body.siteSupervisor || null,
        siteSupervisorPhone: body.siteSupervisorPhone || null,
        // Delivery
        deliveryFeesType: body.deliveryFeesType || 'NONE',
        deliveryFees,
        deliveryFeesTaxable,
        // Operation
        operationMode: body.operationMode || 'WITHOUT_DRIVER',
        fuelResponsibility: body.fuelResponsibility || 'ON_CLIENT',
        insuranceResponsibility: body.insuranceResponsibility || 'ON_CLIENT',
        // References
        salesOrderNo,
        purchaseOrderNo: body.purchaseOrderNo || null,
        quotationNo: body.quotationNo || null,
        // Terms
        status: body.status || 'DRAFT',
        paymentDuration: body.paymentDuration || null,
        additionalTerms: body.additionalTerms || null,
        notes: body.notes || null,
        totalAmount,
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true, status: true },
        },
        client: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        contract: {
          select: { id: true, contractNo: true, status: true },
        },
        timesheets: true,
      },
    })

    // If status is ACTIVE, update equipment status to RENTED
    if (rental.status === 'ACTIVE') {
      await db.equipment.update({
        where: { id: rental.equipmentId },
        data: { status: 'RENTED' },
      })
      // Also update parent contract status
      await db.contract.update({
        where: { id: contract.id },
        data: { status: 'ACTIVE' },
      })
    }

    return NextResponse.json(rental, { status: 201 })
  } catch (error) {
    console.error('Error creating rental contract:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في إنشاء عقد التأجير', detail: message }, { status: 500 })
  }
}
