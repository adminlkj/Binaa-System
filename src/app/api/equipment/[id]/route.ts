import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const equipment = await db.equipment.findUnique({
      where: { id },
      include: {
        usages: {
          include: { project: { select: { id: true, code: true, name: true } } },
          orderBy: { date: 'desc' },
        },
        maintenance: { orderBy: { date: 'desc' } },
        fuelLogs: { orderBy: { date: 'desc' } },
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

    const equipment = await db.equipment.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr || null,
        type: body.type || null,
        model: body.model || null,
        serialNumber: body.serialNumber || null,
        status: body.status,
        hourlyRate: body.hourlyRate !== undefined ? parseFloat(body.hourlyRate) : undefined,
        dailyRate: body.dailyRate !== undefined ? parseFloat(body.dailyRate) : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
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
