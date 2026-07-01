import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { reverseEntry, type PrismaTransaction } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const equipment = await db.equipment.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        usages: {
          include: { project: { select: { id: true, code: true, name: true } } },
          orderBy: { date: 'desc' },
        },
        maintenance: { orderBy: { date: 'desc' } },
        fuelLogs: {
          include: { project: { select: { id: true, code: true, name: true } } },
          orderBy: { date: 'desc' },
        },
        rentals: {
          include: {
            client: { select: { id: true, code: true, name: true, nameAr: true } },
            contract: { select: { id: true, contractNo: true, hourlyRate: true, deliveryFees: true, salesOrderNo: true, paymentTerms: true } },
            deliveryOrders: { orderBy: { deliveryDate: 'desc' } },
            timesheets: {
              include: {
                project: { select: { id: true, code: true, name: true } },
                invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
              },
              orderBy: { year: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        expenses: { orderBy: { date: 'desc' } },
        deliveryOrders: {
          include: {
            client: { select: { id: true, name: true } },
            rental: { select: { id: true, contract: { select: { contractNo: true } } } },
          },
          orderBy: { deliveryDate: 'desc' },
        },
        timesheets: {
          include: {
            project: { select: { id: true, code: true, name: true } },
            contract: { select: { id: true, contractNo: true, hourlyRate: true } },
            rental: { select: { id: true, hourlyRate: true, client: { select: { id: true, name: true } } } },
            invoice: { select: { id: true, invoiceNo: true, totalAmount: true, status: true } },
          },
          orderBy: { year: 'desc' },
        },
        operatorLogs: {
          include: {
            operator: { select: { id: true, name: true, nameAr: true } },
            project: { select: { id: true, code: true, name: true } },
          },
          orderBy: { date: 'desc' },
        },
      },
    })
    if (!equipment) {
      return NextResponse.json({ error: 'المعدة غير موجودة' }, { status: 404 })
    }
    return NextResponse.json(equipment)
  } catch (error) {
    console.error('Error fetching equipment:', error)
    return NextResponse.json({ error: 'فشل في تحميل المعدة' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}

    // P3-CRIT-003: Removed `clientId` — Equipment model has no such field
    if (body.name !== undefined) data.name = body.name
    if (body.nameAr !== undefined) data.nameAr = body.nameAr || null
    if (body.type !== undefined) data.type = body.type || null
    if (body.model !== undefined) data.model = body.model || null
    if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber || null
    if (body.status !== undefined) data.status = body.status
    if (body.ownershipType !== undefined) data.ownershipType = body.ownershipType
    if (body.supplierId !== undefined) data.supplierId = body.supplierId || null
    if (body.ownerId !== undefined) data.ownerId = body.ownerId || null
    if (body.purchasePrice !== undefined) data.purchasePrice = parseFloat(body.purchasePrice) || 0
    if (body.sellingPrice !== undefined) data.sellingPrice = parseFloat(body.sellingPrice) || 0
    if (body.hourlyRate !== undefined) data.hourlyRate = parseFloat(body.hourlyRate) || 0
    if (body.dailyRate !== undefined) data.dailyRate = parseFloat(body.dailyRate) || 0
    if (body.monthlyRate !== undefined) data.monthlyRate = parseFloat(body.monthlyRate) || 0
    if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null
    if (body.warrantyExpiry !== undefined) data.warrantyExpiry = body.warrantyExpiry ? new Date(body.warrantyExpiry) : null
    if (body.isActive !== undefined) data.isActive = body.isActive

    const equipment = await db.equipment.update({
      where: { id },
      data,
      include: {
        supplier: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })
    return NextResponse.json(equipment)
  } catch (error) {
    console.error('Error updating equipment:', error)
    return NextResponse.json({ error: 'فشل في تحديث المعدة' }, { status: 500 })
  }
}

// P3-CRIT-002: Replaced dangerous hard-delete cascade with protected soft-delete.
// - Blocks delete if the equipment has any financial records (rentals with invoices, JEs, timesheets).
// - Reverses the equipment-purchase JE if one exists.
// - Soft-deletes by setting isActive=false + deletedAt=now().
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.equipment.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, journalEntryId: true, deletedAt: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'المعدة غير موجودة' }, { status: 404 })
    }

    if (existing.deletedAt) {
      return NextResponse.json({ error: 'المعدة محذوفة بالفعل' }, { status: 400 })
    }

    // Count financial records that block deletion
    const [activeRentals, timesheetCount, maintenanceWithJE, fuelWithJE, expenseWithJE] = await Promise.all([
      db.equipmentRental.count({ where: { equipmentId: id, status: { in: ['ACTIVE', 'UNDER_REVIEW'] } } }),
      db.timesheet.count({ where: { equipmentId: id } }),
      db.equipmentMaintenance.count({ where: { equipmentId: id, journalEntryId: { not: null } } }),
      db.equipmentFuelLog.count({ where: { equipmentId: id, journalEntryId: { not: null } } }),
      db.equipmentExpense.count({ where: { equipmentId: id, journalEntryId: { not: null } } }),
    ])

    const blockingCount = activeRentals + timesheetCount + maintenanceWithJE + fuelWithJE + expenseWithJE
    if (blockingCount > 0) {
      return NextResponse.json({
        error: `لا يمكن حذف المعدة لوجود سجلات مالية مرتبطة: ${activeRentals} عقد نشط، ${timesheetCount} تايم شيت، ${maintenanceWithJE} صيانة مرحّلة، ${fuelWithJE} سجل وقود مرحّل، ${expenseWithJE} مصروف مرحّل. استخدم التعطيل (isActive=false) بدلاً من الحذف.`,
      }, { status: 400 })
    }

    // Safe to soft-delete: reverse purchase JE + deactivate
    await db.$transaction(async (tx: PrismaTransaction) => {
      if (existing.journalEntryId) {
        await reverseEntry(existing.journalEntryId, tx)
      }

      await tx.equipment.update({
        where: { id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          // 'RETIRED' is not a valid EquipmentStatus enum value; OUT_OF_SERVICE is the
          // closest semantic match for a decommissioned piece of equipment.
          status: 'OUT_OF_SERVICE',
        },
      })
    })

    return NextResponse.json({ success: true, message: 'تم تعطيل المعدة وعكس قيد الشراء' })
  } catch (error) {
    console.error('Error deleting equipment:', error)
    const message = error instanceof Error ? error.message : 'فشل في حذف المعدة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
