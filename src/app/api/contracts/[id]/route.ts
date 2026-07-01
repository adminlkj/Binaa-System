import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true, nameAr: true } },
        progressClaims: {
          orderBy: { date: 'desc' },
          take: 50,
        },
        changeOrders: {
          orderBy: { date: 'desc' },
        },
        _count: { select: { progressClaims: true, changeOrders: true } },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error fetching contract:', error)
    return NextResponse.json({ error: 'فشل في تحميل العقد' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    // Verify contract exists
    const existing = await db.contract.findUnique({
      where: { id },
      include: { _count: { select: { progressClaims: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Parse financial values and recalculate.
    // `Number(existing.*)` keeps the fallback numeric so the arithmetic below stays `number`
    // (Prisma Decimal is not valid as an arithmetic operand).
    const value = parseFloat(body.value) || Number(existing.value)
    const vatRate = body.vatRate != null ? parseFloat(body.vatRate) : Number(existing.vatRate)
    const vatAmount = Math.round(value * vatRate * 100) / 100
    const totalValue = Math.round((value + vatAmount) * 100) / 100

    const contract = await db.contract.update({
      where: { id },
      data: {
        projectId: body.projectId || existing.projectId,
        contractNo: body.contractNo || existing.contractNo,
        date: body.date ? new Date(body.date) : existing.date,
        value,
        vatRate,
        vatAmount,
        totalValue,
        startDate: body.startDate ? new Date(body.startDate) : existing.startDate,
        endDate: body.endDate ? new Date(body.endDate) : body.endDate === '' ? null : existing.endDate,
        status: body.status || existing.status,
        description: body.description !== undefined ? (body.description || null) : existing.description,
        contractType: body.contractType || existing.contractType,
        clientId: body.clientId !== undefined ? (body.clientId || null) : existing.clientId,
        equipmentId: body.equipmentId !== undefined ? (body.equipmentId || null) : existing.equipmentId,
        hourlyRate: body.hourlyRate != null ? parseFloat(body.hourlyRate) : existing.hourlyRate,
        deliveryFees: body.deliveryFees != null ? parseFloat(body.deliveryFees) : existing.deliveryFees,
        deliveryFeesTaxable: body.deliveryFeesTaxable !== undefined ? body.deliveryFeesTaxable : existing.deliveryFeesTaxable,
        paymentTerms: body.paymentTerms !== undefined ? (body.paymentTerms || null) : existing.paymentTerms,
        salesOrderNo: body.salesOrderNo !== undefined ? (body.salesOrderNo || null) : existing.salesOrderNo,
        journalEntryId: body.journalEntryId !== undefined ? (body.journalEntryId || null) : existing.journalEntryId,
        // New Project Contract Fields
        quotationNo: body.quotationNo !== undefined ? (body.quotationNo || null) : existing.quotationNo,
        loaNo: body.loaNo !== undefined ? (body.loaNo || null) : existing.loaNo,
        purchaseOrderNo: body.purchaseOrderNo !== undefined ? (body.purchaseOrderNo || null) : existing.purchaseOrderNo,
        projectDuration: body.projectDuration !== undefined ? (body.projectDuration || null) : existing.projectDuration,
        warrantyPeriod: body.warrantyPeriod !== undefined ? (body.warrantyPeriod || null) : existing.warrantyPeriod,
        maintenancePeriod: body.maintenancePeriod !== undefined ? (body.maintenancePeriod || null) : existing.maintenancePeriod,
        billingMethod: body.billingMethod !== undefined ? (body.billingMethod || null) : existing.billingMethod,
        firstClaimNo: body.firstClaimNo !== undefined ? (body.firstClaimNo || null) : existing.firstClaimNo,
        advancePaymentPercent: body.advancePaymentPercent != null ? parseFloat(body.advancePaymentPercent) : existing.advancePaymentPercent,
        retentionPercent: body.retentionPercent != null ? parseFloat(body.retentionPercent) : existing.retentionPercent,
        projectManager: body.projectManager !== undefined ? (body.projectManager || null) : existing.projectManager,
        projectEngineer: body.projectEngineer !== undefined ? (body.projectEngineer || null) : existing.projectEngineer,
        projectLocation: body.projectLocation !== undefined ? (body.projectLocation || null) : existing.projectLocation,
        projectCity: body.projectCity !== undefined ? (body.projectCity || null) : existing.projectCity,
        projectType: body.projectType !== undefined ? (body.projectType || null) : existing.projectType,
      },
      include: {
        project: { select: { id: true, name: true, code: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true, nameAr: true } },
      },
    })

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error updating contract:', error)
    return NextResponse.json({ error: 'فشل في تحديث العقد' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const contract = await db.contract.findUnique({
      where: { id },
      include: { _count: { select: { progressClaims: true } } },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Only allow deletion if status is DRAFT and no progress claims exist
    if (contract.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف العقد إلا في حالة المسودة' },
        { status: 400 }
      )
    }

    if (contract._count.progressClaims > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف العقد لوجود مستخلصات مرتبطة به' },
        { status: 400 }
      )
    }

    await db.contract.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting contract:', error)
    return NextResponse.json({ error: 'فشل في حذف العقد' }, { status: 500 })
  }
}
