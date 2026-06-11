import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const contractType = searchParams.get('contractType')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status
    if (contractType) where.contractType = contractType

    const contracts = await db.contract.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true, nameAr: true } },
        _count: { select: { progressClaims: true } },
      },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json(contracts)
  } catch (error) {
    console.error('Error fetching contracts:', error)
    return NextResponse.json({ error: 'فشل في تحميل العقود' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      projectId, clientId, contractNo, date, value, vatRate,
      startDate, endDate, status, description, contractType,
      equipmentId, hourlyRate, deliveryFees, deliveryFeesTaxable,
      paymentTerms, salesOrderNo, journalEntryId,
      // New Project Contract Fields
      quotationNo, loaNo, purchaseOrderNo,
      projectDuration, warrantyPeriod, maintenancePeriod,
      billingMethod, firstClaimNo,
      advancePaymentPercent, retentionPercent,
      projectManager, projectEngineer, projectLocation, projectCity, projectType,
    } = body

    if (!projectId || !date || value === undefined || !startDate) {
      return NextResponse.json(
        { error: 'الحقول المطلوبة: المشروع، التاريخ، القيمة، تاريخ البدء' },
        { status: 400 }
      )
    }

    // Auto-generate contractNo if not provided
    let finalContractNo = contractNo
    if (!finalContractNo) {
      const lastContract = await db.contract.findFirst({
        where: { contractNo: { startsWith: 'CTR-' } },
        orderBy: { contractNo: 'desc' },
      })
      const lastNum = lastContract ? parseInt(lastContract.contractNo.replace('CTR-', '')) : 0
      finalContractNo = `CTR-${String(lastNum + 1).padStart(4, '0')}`
    }

    // Check uniqueness
    const existingNo = await db.contract.findUnique({ where: { contractNo: finalContractNo } })
    if (existingNo) {
      return NextResponse.json({ error: 'رقم العقد موجود بالفعل' }, { status: 400 })
    }

    const rate = vatRate ?? 0.15
    const parsedValue = parseFloat(value) || 0
    const vatAmount = Math.round(parsedValue * rate * 100) / 100
    const totalValue = Math.round((parsedValue + vatAmount) * 100) / 100

    const contract = await db.contract.create({
      data: {
        projectId,
        contractNo: finalContractNo,
        date: new Date(date),
        value: parsedValue,
        vatRate: rate,
        vatAmount,
        totalValue,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'DRAFT',
        description: description || null,
        contractType: contractType || 'PROJECT',
        clientId: clientId || null,
        equipmentId: equipmentId || null,
        hourlyRate: hourlyRate != null ? parseFloat(hourlyRate) : null,
        deliveryFees: parseFloat(deliveryFees) || 0,
        deliveryFeesTaxable: deliveryFeesTaxable !== false,
        paymentTerms: paymentTerms || null,
        salesOrderNo: salesOrderNo || null,
        journalEntryId: journalEntryId || null,
        // New Project Contract Fields
        quotationNo: quotationNo || null,
        loaNo: loaNo || null,
        purchaseOrderNo: purchaseOrderNo || null,
        projectDuration: projectDuration || null,
        warrantyPeriod: warrantyPeriod || null,
        maintenancePeriod: maintenancePeriod || null,
        billingMethod: billingMethod || null,
        firstClaimNo: firstClaimNo || null,
        advancePaymentPercent: advancePaymentPercent != null ? parseFloat(advancePaymentPercent) : 0,
        retentionPercent: retentionPercent != null ? parseFloat(retentionPercent) : 0,
        projectManager: projectManager || null,
        projectEngineer: projectEngineer || null,
        projectLocation: projectLocation || null,
        projectCity: projectCity || null,
        projectType: projectType || null,
      },
      include: {
        project: { select: { id: true, name: true, code: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true, nameAr: true } },
      },
    })

    return NextResponse.json(contract, { status: 201 })
  } catch (error) {
    console.error('Error creating contract:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العقد' }, { status: 500 })
  }
}
