import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentCost } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const supplierId = searchParams.get('supplierId')

    const where: Record<string, unknown> = {}
    if (equipmentId) where.equipmentId = equipmentId
    if (supplierId) where.supplierId = supplierId

    const maintenance = await db.equipmentMaintenance.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        supplier: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(maintenance)
  } catch (error) {
    console.error('Error fetching equipment maintenance:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الصيانة' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const cost = parseFloat(body.cost)

    // Create maintenance record
    const maintenance = await db.equipmentMaintenance.create({
      data: {
        equipmentId: body.equipmentId,
        date: new Date(body.date),
        description: body.description,
        cost,
        supplierId: body.supplierId || null,
        nextDate: body.nextDate ? new Date(body.nextDate) : null,
      },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        supplier: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    // Update equipment status to MAINTENANCE
    await db.equipment.update({
      where: { id: body.equipmentId },
      data: { status: 'MAINTENANCE' },
    })

    // Auto accounting entry: if cost > 0
    if (cost > 0) {
      try {
        const equipment = await db.equipment.findUnique({
          where: { id: body.equipmentId },
          select: { name: true },
        })

        // Determine payFrom: if supplierId provided → AP (3110), else Cash (1110)
        const payFrom = body.supplierId ? 'AP' : 'CASH'

        const entry = await autoEntryEquipmentCost({
          equipmentName: equipment?.name || 'Unknown',
          costType: 'MAINTENANCE',
          amount: cost,
          date: new Date(body.date),
          payFrom: payFrom as 'CASH' | 'AP',
        })

        // Link journal entry to maintenance record
        await db.equipmentMaintenance.update({
          where: { id: maintenance.id },
          data: { journalEntryId: entry.id },
        })
      } catch (entryError) {
        console.error('Error creating maintenance accounting entry:', entryError)
        // Don't block maintenance creation
      }
    }

    // Refetch to include journalEntryId
    const updatedMaintenance = await db.equipmentMaintenance.findUnique({
      where: { id: maintenance.id },
      include: {
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        supplier: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json(updatedMaintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment maintenance:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الصيانة' }, { status: 500 })
  }
}
