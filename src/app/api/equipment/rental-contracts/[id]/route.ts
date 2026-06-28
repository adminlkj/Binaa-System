import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: Single rental contract with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contract = await db.equipmentRental.findUnique({
      where: { id },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true, status: true },
        },
        client: {
          select: { id: true, code: true, name: true, nameAr: true, phone: true, email: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        contract: {
          select: {
            id: true, contractNo: true, status: true, contractType: true,
            value: true, vatRate: true, vatAmount: true, totalValue: true,
            clientId: true, equipmentId: true, hourlyRate: true,
            deliveryFees: true, deliveryFeesTaxable: true,
            salesOrderNo: true, purchaseOrderNo: true, quotationNo: true,
            startDate: true, endDate: true,
          },
        },
        timesheets: {
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
        deliveryOrders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!contract) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error fetching rental contract:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في تحميل العقد', detail: message }, { status: 500 })
  }
}

// PATCH: Update rental contract (status changes, field updates, recalculation)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.equipmentRental.findUnique({
      where: { id },
      select: {
        status: true,
        equipmentId: true,
        contractId: true,
        pricingType: true,
        referenceRate: true,
        referenceHours: true,
        hourlyRate: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    // P3-HIGH-001: Atomic PATCH — rental + contract + equipment status in one transaction
    const rental = await db.$transaction(async (tx) => {
      // ─── Build update data for EquipmentRental ───
      const updateData: Record<string, unknown> = {}

      if (body.equipmentId !== undefined) updateData.equipmentId = body.equipmentId
      if (body.clientId !== undefined) updateData.clientId = body.clientId
      if (body.projectId !== undefined) updateData.projectId = body.projectId || null
      if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
      if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null

      const pricingType = body.pricingType || existing.pricingType
      if (body.pricingType !== undefined) updateData.pricingType = body.pricingType

      if (body.referenceRate !== undefined) {
        const referenceRate = parseFloat(body.referenceRate) || 0
        updateData.referenceRate = referenceRate
        if (pricingType === 'HOURLY') {
          const referenceHours = body.referenceHours !== undefined
            ? parseFloat(body.referenceHours) || 0
            : existing.referenceHours
          updateData.hourlyRate = referenceHours > 0 ? referenceRate / referenceHours : 0
        }
      }

      if (body.referenceHours !== undefined) {
        const referenceHours = parseFloat(body.referenceHours) || 0
        updateData.referenceHours = referenceHours
        if (pricingType === 'HOURLY') {
          const referenceRate = body.referenceRate !== undefined
            ? parseFloat(body.referenceRate) || 0
            : existing.referenceRate
          updateData.hourlyRate = referenceHours > 0 ? referenceRate / referenceHours : 0
        }
      }

      if (body.hourlyRate !== undefined) updateData.hourlyRate = parseFloat(body.hourlyRate) || 0
      if (body.dailyRate !== undefined) updateData.dailyRate = parseFloat(body.dailyRate) || 0
      if (body.monthlyRate !== undefined) updateData.monthlyRate = parseFloat(body.monthlyRate) || 0
      if (body.lumpSumAmount !== undefined) updateData.lumpSumAmount = parseFloat(body.lumpSumAmount) || 0

      if (body.workCity !== undefined) updateData.workCity = body.workCity || null
      if (body.workLocation !== undefined) updateData.workLocation = body.workLocation || null
      if (body.siteSupervisor !== undefined) updateData.siteSupervisor = body.siteSupervisor || null
      if (body.siteSupervisorPhone !== undefined) updateData.siteSupervisorPhone = body.siteSupervisorPhone || null

      if (body.deliveryFeesType !== undefined) updateData.deliveryFeesType = body.deliveryFeesType || 'NONE'
      if (body.deliveryFees !== undefined) updateData.deliveryFees = parseFloat(body.deliveryFees) || 0
      if (body.deliveryFeesTaxable !== undefined) updateData.deliveryFeesTaxable = Boolean(body.deliveryFeesTaxable)

      if (body.operationMode !== undefined) updateData.operationMode = body.operationMode || 'WITHOUT_DRIVER'
      if (body.fuelResponsibility !== undefined) updateData.fuelResponsibility = body.fuelResponsibility || null
      if (body.insuranceResponsibility !== undefined) updateData.insuranceResponsibility = body.insuranceResponsibility || null

      if (body.salesOrderNo !== undefined) updateData.salesOrderNo = body.salesOrderNo || null
      if (body.purchaseOrderNo !== undefined) updateData.purchaseOrderNo = body.purchaseOrderNo || null
      if (body.quotationNo !== undefined) updateData.quotationNo = body.quotationNo || null

      if (body.status !== undefined) updateData.status = body.status
      if (body.paymentDuration !== undefined) updateData.paymentDuration = body.paymentDuration || null
      if (body.additionalTerms !== undefined) updateData.additionalTerms = body.additionalTerms || null
      if (body.notes !== undefined) updateData.notes = body.notes || null
      if (body.totalAmount !== undefined) updateData.totalAmount = parseFloat(body.totalAmount) || 0

      // ─── Update EquipmentRental ───
      const updated = await tx.equipmentRental.update({
        where: { id },
        data: updateData,
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true, status: true } },
          client: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
          contract: { select: { id: true, contractNo: true, status: true } },
          timesheets: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
        },
      })

      // ─── Sync parent Contract fields ───
      const contractUpdateData: Record<string, unknown> = {}
      if (body.referenceRate !== undefined) contractUpdateData.value = parseFloat(body.referenceRate) || 0
      if (updateData.hourlyRate !== undefined) contractUpdateData.hourlyRate = updateData.hourlyRate as number
      if (body.deliveryFees !== undefined) contractUpdateData.deliveryFees = parseFloat(body.deliveryFees) || 0
      if (body.deliveryFeesTaxable !== undefined) contractUpdateData.deliveryFeesTaxable = Boolean(body.deliveryFeesTaxable)
      if (body.salesOrderNo !== undefined) contractUpdateData.salesOrderNo = body.salesOrderNo || null
      if (body.purchaseOrderNo !== undefined) contractUpdateData.purchaseOrderNo = body.purchaseOrderNo || null
      if (body.quotationNo !== undefined) contractUpdateData.quotationNo = body.quotationNo || null
      if (body.startDate !== undefined) contractUpdateData.startDate = new Date(body.startDate)
      if (body.endDate !== undefined) contractUpdateData.endDate = body.endDate ? new Date(body.endDate) : null

      if (Object.keys(contractUpdateData).length > 0) {
        await tx.contract.update({
          where: { id: existing.contractId },
          data: contractUpdateData,
        })
      }

      // ─── Handle equipment status on contract status change ───
      if (body.status !== undefined) {
        const equipmentId = updated.equipmentId

        if (body.status === 'ACTIVE') {
          await tx.equipment.update({
            where: { id: equipmentId },
            data: { status: 'RENTED' },
          })
          await tx.contract.update({
            where: { id: existing.contractId },
            data: { status: 'ACTIVE' },
          })
        } else if (['EXPIRED', 'CANCELLED', 'TERMINATED'].includes(body.status)) {
          const activeContracts = await tx.equipmentRental.count({
            where: { equipmentId, status: 'ACTIVE', id: { not: id } },
          })
          if (activeContracts === 0) {
            await tx.equipment.update({
              where: { id: equipmentId },
              data: { status: 'AVAILABLE' },
            })
          }
          const contractStatus = body.status === 'TERMINATED' ? 'TERMINATED' : (body.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED')
          await tx.contract.update({
            where: { id: existing.contractId },
            data: { status: contractStatus as 'TERMINATED' | 'EXPIRED' | 'CANCELLED' },
          })
        } else if (body.status === 'UNDER_REVIEW' || body.status === 'DRAFT') {
          await tx.contract.update({
            where: { id: existing.contractId },
            data: { status: body.status as 'UNDER_REVIEW' | 'DRAFT' },
          })
        }
      }

      return updated
    })

    return NextResponse.json(rental)
  } catch (error) {
    console.error('Error updating rental contract:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في تحديث العقد', detail: message }, { status: 500 })
  }
}

// DELETE: Delete a rental contract (only in DRAFT status).
// P3-HIGH-002: Atomic + check for timesheets/invoices before deleting.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.equipmentRental.findUnique({
      where: { id },
      select: { id: true, status: true, contractId: true, equipmentId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'العقد غير موجود' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف العقد إلا في حالة المسودة' },
        { status: 400 }
      )
    }

    // P3-HIGH-002: Block delete if timesheets exist
    const timesheetCount = await db.timesheet.count({
      where: { rentalId: id },
    })
    if (timesheetCount > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف العقد لوجود ${timesheetCount} تايم شيت مرتبط. احذف التايم شيتات أولاً.` },
        { status: 400 }
      )
    }

    // Atomic: delete rental + parent contract in one transaction
    await db.$transaction(async (tx) => {
      await tx.equipmentRental.delete({ where: { id } })
      await tx.contract.delete({ where: { id: existing.contractId } }).catch(() => {
        // Parent contract may already be deleted — not fatal
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting rental contract:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في حذف العقد', detail: message }, { status: 500 })
  }
}
