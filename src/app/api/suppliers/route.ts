import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    const suppliers = await db.supplier.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: {
        _count: { select: { purchaseOrders: true, purchaseInvoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(suppliers)
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json({ error: 'فشل في تحميل الموردين' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastSupplier = await db.supplier.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let nextNum = 1
    if (lastSupplier?.code) {
      const match = lastSupplier.code.match(/SUP-(\d+)/)
      if (match) nextNum = parseInt(match[1]) + 1
    }

    const code = `SUP-${String(nextNum).padStart(3, '0')}`

    const supplier = await db.supplier.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        taxNumber: body.taxNumber || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })

    return NextResponse.json(supplier, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json({ error: 'فشل في إنشاء المورد' }, { status: 500 })
  }
}
