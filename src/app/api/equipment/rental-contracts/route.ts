import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { type PrismaTransaction } from '@/lib/accounting/engine'

// GET: List all rental contracts with includes
export async function GET(request: NextRequest) {
  const { response } = await requireAuthApi()
  if (response) return response

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

// POST: Create new rental contract atomically.
// P3-CRIT-006 (non-atomic), P3-CRIT-007 (availability check), P3-HIGH-004 (overlapping rental)
export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

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

    // P3-CRIT-007: Validate equipment exists and is available for renting
    const equipment = await db.equipment.findUnique({
      where: { id: body.equipmentId },
      select: { id: true, code: true, name: true, status: true, isActive: true, deletedAt: true },
    })
    if (!equipment) {
      return NextResponse.json({ error: 'المعدة غير موجودة' }, { status: 404 })
    }
    if (equipment.deletedAt || !equipment.isActive) {
      return NextResponse.json({ error: 'المعدة غير نشطة أو محذوفة' }, { status: 400 })
    }

    // P3-HIGH-004: Check for overlapping ACTIVE rental on the same equipment
    const startDate = new Date(body.startDate)
    const endDate = body.endDate ? new Date(body.endDate) : null

    const overlapping = await db.equipmentRental.findFirst({
      where: {
        equipmentId: body.equipmentId,
        status: { in: ['ACTIVE', 'UNDER_REVIEW', 'DRAFT'] },
        startDate: { lte: endDate || new Date('2099-12-31') },
        ...(endDate ? { OR: [{ endDate: null }, { endDate: { gte: startDate } }] } : {}),
      },
      select: { id: true, status: true, startDate: true, endDate: true },
    })

    if (overlapping) {
      return NextResponse.json({
        error: `توجد عقد تأجير آخر لنفس المعدة في الفترة المتداخلة (حالة: ${overlapping.status})`,
      }, { status: 400 })
    }

    // ─── Parse numeric fields ───
    const referenceRate = parseFloat(body.referenceRate) || 0
    const referenceHours = parseFloat(body.referenceHours) || 0
    const pricingType = body.pricingType || 'HOURLY'
    const dailyRate = parseFloat(body.dailyRate) || 0
    const monthlyRate = parseFloat(body.monthlyRate) || 0
    const lumpSumAmount = parseFloat(body.lumpSumAmount) || 0
    const deliveryFees = parseFloat(body.deliveryFees) || 0

    // ─── Calculate hourlyRate when pricingType is HOURLY ───
    let hourlyRate = parseFloat(body.hourlyRate) || 0
    if (pricingType === 'HOURLY' && referenceHours > 0) {
      hourlyRate = referenceRate / referenceHours
    }

    // P3-MED-004: Calculate totalAmount server-side if not provided
    let totalAmount = parseFloat(body.totalAmount) || 0
    if (totalAmount === 0 && referenceRate > 0) {
      totalAmount = referenceRate + deliveryFees
    }

    // ─── Resolve projectId (required for parent Contract) ───
    let projectId = body.projectId || null

    if (!projectId) {
      const clientProject = await db.project.findFirst({
        where: { clientId: body.clientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (clientProject) {
        projectId = clientProject.id
      } else {
        const anyProject = await db.project.findFirst({
          where: { deletedAt: null },
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

    const targetStatus = body.status || 'DRAFT'

    // P3-CRIT-006: Atomic creation — Contract + EquipmentRental + equipment status + contract status
    const rental = await db.$transaction(async (tx: PrismaTransaction) => {
      // ─── Auto-generate contractNo (RC-0001) inside transaction ───
      const lastContractWithRC = await tx.contract.findFirst({
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

      // ─── Auto-generate salesOrderNo (SO-0001) inside transaction ───
      const lastRentalWithSO = await tx.equipmentRental.findFirst({
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

      // ─── Create parent Contract record ───
      const contract = await tx.contract.create({
        data: {
          projectId,
          contractNo,
          date: startDate,
          value: referenceRate,
          vatRate: 0.15,
          clientId: body.clientId,
          equipmentId: body.equipmentId,
          contractType: 'RENTAL',
          startDate,
          endDate,
          status: targetStatus === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
          hourlyRate,
          deliveryFees,
          deliveryFeesTaxable,
          salesOrderNo,
          purchaseOrderNo: body.purchaseOrderNo || null,
          quotationNo: body.quotationNo || null,
        },
      })

      // ─── Create EquipmentRental record ───
      const created = await tx.equipmentRental.create({
        data: {
          contractId: contract.id,
          equipmentId: body.equipmentId,
          clientId: body.clientId,
          projectId: body.projectId || null,
          startDate,
          endDate,
          pricingType,
          referenceRate,
          referenceHours,
          hourlyRate,
          dailyRate,
          monthlyRate,
          lumpSumAmount,
          workCity: body.workCity || null,
          workLocation: body.workLocation || null,
          siteSupervisor: body.siteSupervisor || null,
          siteSupervisorPhone: body.siteSupervisorPhone || null,
          deliveryFeesType: body.deliveryFeesType || 'NONE',
          deliveryFees,
          deliveryFeesTaxable,
          operationMode: body.operationMode || 'WITHOUT_DRIVER',
          fuelResponsibility: body.fuelResponsibility || 'ON_CLIENT',
          insuranceResponsibility: body.insuranceResponsibility || 'ON_CLIENT',
          salesOrderNo,
          purchaseOrderNo: body.purchaseOrderNo || null,
          quotationNo: body.quotationNo || null,
          status: targetStatus,
          paymentDuration: body.paymentDuration || null,
          additionalTerms: body.additionalTerms || null,
          notes: body.notes || null,
          totalAmount,
        },
        include: {
          equipment: { select: { id: true, code: true, name: true, nameAr: true, status: true } },
          client: { select: { id: true, code: true, name: true, nameAr: true } },
          project: { select: { id: true, code: true, name: true, nameAr: true } },
          contract: { select: { id: true, contractNo: true, status: true } },
          timesheets: true,
        },
      })

      // P3-CRIT-007: Update equipment status to RENTED when contract is ACTIVE
      if (targetStatus === 'ACTIVE') {
        await tx.equipment.update({
          where: { id: body.equipmentId },
          data: { status: 'RENTED' },
        })
      }

      return created
    })

    return NextResponse.json(rental, { status: 201 })
  } catch (error) {
    console.error('Error creating rental contract:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'فشل في إنشاء عقد التأجير', detail: message }, { status: 500 })
  }
}
