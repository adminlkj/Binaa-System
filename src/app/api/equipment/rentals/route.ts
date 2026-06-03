import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const equipmentId = searchParams.get('equipmentId')
    const status = searchParams.get('status')

    const rentals = await db.equipmentRental.findMany({
      where: {
        ...(equipmentId ? { equipmentId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(rentals)
  } catch (error) {
    console.error('Error fetching equipment rentals:', error)
    return NextResponse.json({ error: 'فشل في تحميل عقود التأجير' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const rental = await db.equipmentRental.create({
      data: {
        equipmentId: body.equipmentId,
        clientId: body.clientId,
        projectId: body.projectId || null,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        rateType: body.rateType || 'DAILY',
        rate: parseFloat(body.rate) || 0,
        totalAmount: parseFloat(body.totalAmount) || 0,
        status: 'ACTIVE',
        notes: body.notes || null,
      },
      include: {
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })

    // Set equipment status to RENTED
    await db.equipment.update({
      where: { id: body.equipmentId },
      data: { status: 'RENTED' },
    })

    return NextResponse.json(rental, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment rental:', error)
    return NextResponse.json({ error: 'فشل في إنشاء عقد التأجير' }, { status: 500 })
  }
}
