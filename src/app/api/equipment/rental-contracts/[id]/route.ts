import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: Single contract with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contract = await db.equipmentRentalContract.findUnique({
      where: { id },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true, status: true },
        },
        timesheets: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error fetching rental contract:', error)
    return NextResponse.json({ error: 'فشل في تحميل العقد' }, { status: 500 })
  }
}

// PATCH: Update contract (status changes, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.equipmentRentalContract.findUnique({
      where: { id },
      select: { status: true, equipmentId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (body.equipmentId !== undefined) updateData.equipmentId = body.equipmentId
    if (body.clientId !== undefined) updateData.clientId = body.clientId
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null
    if (body.referenceRate !== undefined) {
      const referenceRate = parseFloat(body.referenceRate) || 0
      updateData.referenceRate = referenceRate
      // Recalculate hourly rate
      const referenceHours = body.referenceHours !== undefined
        ? parseFloat(body.referenceHours) || 0
        : (await db.equipmentRentalContract.findUnique({ where: { id }, select: { referenceHours: true } }))?.referenceHours ?? 0
      updateData.hourlyRate = referenceHours > 0 ? referenceRate / referenceHours : 0
    }
    if (body.referenceHours !== undefined) {
      const referenceHours = parseFloat(body.referenceHours) || 0
      updateData.referenceHours = referenceHours
      // Recalculate hourly rate
      const referenceRate = body.referenceRate !== undefined
        ? parseFloat(body.referenceRate) || 0
        : (await db.equipmentRentalContract.findUnique({ where: { id }, select: { referenceRate: true } }))?.referenceRate ?? 0
      updateData.hourlyRate = referenceHours > 0 ? referenceRate / referenceHours : 0
    }
    if (body.paymentTerms !== undefined) updateData.paymentTerms = body.paymentTerms || null
    if (body.purchaseOrderNo !== undefined) updateData.purchaseOrderNo = body.purchaseOrderNo || null
    if (body.deliveryExpense !== undefined) updateData.deliveryExpense = parseFloat(body.deliveryExpense) || 0
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.status !== undefined) updateData.status = body.status

    const contract = await db.equipmentRentalContract.update({
      where: { id },
      data: updateData,
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true, status: true },
        },
        timesheets: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    })

    // Handle equipment status on contract status change
    if (body.status !== undefined) {
      if (body.status === 'ACTIVE') {
        await db.equipment.update({
          where: { id: contract.equipmentId },
          data: { status: 'RENTED' },
        })
      } else if (body.status === 'TERMINATED' || body.status === 'EXPIRED') {
        // Check if equipment has other active contracts
        const activeContracts = await db.equipmentRentalContract.count({
          where: {
            equipmentId: contract.equipmentId,
            status: 'ACTIVE',
            id: { not: id },
          },
        })
        if (activeContracts === 0) {
          await db.equipment.update({
            where: { id: contract.equipmentId },
            data: { status: 'AVAILABLE' },
          })
        }
      }
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error updating rental contract:', error)
    return NextResponse.json({ error: 'فشل في تحديث العقد' }, { status: 500 })
  }
}
