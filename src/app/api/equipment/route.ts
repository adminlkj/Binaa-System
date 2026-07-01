import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { autoEntryEquipmentPurchase, type PrismaTransaction } from '@/lib/accounting/engine'

export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') !== 'false' // default true
    const pageParam = searchParams.get('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam) || 1) : null
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50') || 50)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = { deletedAt: null }
    if (activeOnly) where.isActive = true
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { code: { contains: search } },
        { type: { contains: search } },
        { model: { contains: search } },
        { serialNumber: { contains: search } },
      ]
    }

    const include = {
      supplier: {
        select: { id: true, code: true, name: true, nameAr: true },
      },
    }

    const whereClause = Object.keys(where).length > 0 ? where : undefined

    // Backward compatibility: return array if no page param, paginated object if page provided
    if (page === null) {
      const equipment = await db.equipment.findMany({
        where: whereClause,
        include,
        orderBy: { code: 'asc' },
      })
      return NextResponse.json(equipment)
    }

    const [data, total] = await Promise.all([
      db.equipment.findMany({
        where: whereClause,
        include,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.equipment.count({ where: whereClause }),
    ])

    return NextResponse.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Error fetching equipment:', error)
    return NextResponse.json({ error: 'فشل في تحميل المعدات' }, { status: 500 })
  }
}

// POST: Create equipment + auto-capitalize purchase as fixed asset when purchasePrice > 0
// P3-CRIT-001 (purchase JE), P3-CRIT-009 (race-safe code generation)
export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()

    const purchasePrice = parseFloat(body.purchasePrice) || 0
    const payFrom: 'CASH' | 'AP' = body.supplierId ? 'AP' : 'CASH'

    // Atomic: code generation + equipment create + purchase JE in one transaction.
    // If the code collides (P2002), the transaction aborts and we retry with next number.
    const MAX_RETRIES = 3
    let lastError: unknown = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const equipment = await db.$transaction(async (tx: PrismaTransaction) => {
          // Generate code inside the transaction
          const lastEquipment = await tx.equipment.findFirst({
            orderBy: { code: 'desc' },
            select: { code: true },
          })

          let nextNum = 1
          if (lastEquipment?.code) {
            const match = lastEquipment.code.match(/EQ-(\d+)/)
            if (match) nextNum = parseInt(match[1]) + 1
          }
          const code = `EQ-${String(nextNum).padStart(3, '0')}`

          const created = await tx.equipment.create({
            data: {
              code,
              name: body.name,
              nameAr: body.nameAr || null,
              type: body.type || null,
              model: body.model || null,
              serialNumber: body.serialNumber || null,
              status: body.status || 'AVAILABLE',
              ownershipType: body.ownershipType || 'COMPANY_OWNED',
              supplierId: body.supplierId || null,
              ownerId: body.ownerId || null,
              purchasePrice,
              sellingPrice: parseFloat(body.sellingPrice) || 0,
              hourlyRate: parseFloat(body.hourlyRate) || 0,
              dailyRate: parseFloat(body.dailyRate) || 0,
              monthlyRate: parseFloat(body.monthlyRate) || 0,
              purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
              warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : null,
              assetAccountId: body.assetAccountId || null,
              assetAccountCode: body.assetAccountCode || null,
              isActive: true,
            },
            include: {
              supplier: { select: { id: true, code: true, name: true, nameAr: true } },
            },
          })

          // P3-CRIT-001: Capitalize equipment purchase as a fixed asset
          if (purchasePrice > 0) {
            const entry = await autoEntryEquipmentPurchase({
              equipmentCode: created.code,
              equipmentName: created.name,
              amount: purchasePrice,
              date: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
              payFrom,
            }, tx)

            await tx.equipment.update({
              where: { id: created.id },
              data: { journalEntryId: entry.id },
            })
          }

          return tx.equipment.findUniqueOrThrow({
            where: { id: created.id },
            include: { supplier: { select: { id: true, code: true, name: true, nameAr: true } } },
          })
        })

        return NextResponse.json(equipment, { status: 201 })
      } catch (err: unknown) {
        lastError = err
        // Retry only on unique constraint violation (P2002 — code collision)
        const code = (err as { code?: string })?.code
        if (code !== 'P2002') break
      }
    }

    throw lastError
  } catch (error) {
    console.error('Error creating equipment:', error)
    const message = error instanceof Error ? error.message : 'فشل في إنشاء المعدة'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
