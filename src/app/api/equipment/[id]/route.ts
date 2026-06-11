import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
            rental: { select: { id: true, rate: true, client: { select: { id: true, name: true } } } },
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
  try {
    const { id } = await params
    const body = await request.json()

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) data.name = body.name
    if (body.nameAr !== undefined) data.nameAr = body.nameAr || null
    if (body.type !== undefined) data.type = body.type || null
    if (body.model !== undefined) data.model = body.model || null
    if (body.serialNumber !== undefined) data.serialNumber = body.serialNumber || null
    if (body.status !== undefined) data.status = body.status
    if (body.supplierId !== undefined) data.supplierId = body.supplierId || null
    if (body.clientId !== undefined) data.clientId = body.clientId || null
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.equipmentRental.deleteMany({ where: { equipmentId: id } })
    await db.equipmentExpense.deleteMany({ where: { equipmentId: id } })
    await db.equipmentUsage.deleteMany({ where: { equipmentId: id } })
    await db.equipmentMaintenance.deleteMany({ where: { equipmentId: id } })
    await db.equipmentFuelLog.deleteMany({ where: { equipmentId: id } })
    await db.equipment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting equipment:', error)
    return NextResponse.json({ error: 'فشل في حذف المعدة' }, { status: 500 })
  }
}
