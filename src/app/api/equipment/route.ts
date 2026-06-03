import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const equipment = await db.equipment.findMany({
      where: { isActive: true },
      include: {
        supplier: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(equipment)
  } catch (error) {
    console.error('Error fetching equipment:', error)
    return NextResponse.json({ error: 'فشل في تحميل المعدات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastEquipment = await db.equipment.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastEquipment?.code) {
      const match = lastEquipment.code.match(/EQ-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `EQ-${String(nextNum).padStart(3, '0')}`

    const equipment = await db.equipment.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        type: body.type || null,
        model: body.model || null,
        serialNumber: body.serialNumber || null,
        status: body.status || 'AVAILABLE',
        supplierId: body.supplierId || null,
        clientId: body.clientId || null,
        purchasePrice: parseFloat(body.purchasePrice) || 0,
        sellingPrice: parseFloat(body.sellingPrice) || 0,
        hourlyRate: parseFloat(body.hourlyRate) || 0,
        dailyRate: parseFloat(body.dailyRate) || 0,
        monthlyRate: parseFloat(body.monthlyRate) || 0,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
        warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
        isActive: true,
      },
      include: {
        supplier: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
      },
    })

    return NextResponse.json(equipment, { status: 201 })
  } catch (error) {
    console.error('Error creating equipment:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المعدة' }, { status: 500 })
  }
}
