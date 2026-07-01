import { requireAuthApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET: List equipment rentals (alias for rental-contracts)
// P3-CRIT-008: POST removed — use /api/equipment/rental-contracts for creation.
// This route is kept only for backward-compatible GET queries.
export async function GET(request: Request) {
  const { response } = await requireAuthApi()
  if (response) return response

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
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        client: { select: { id: true, name: true, code: true } },
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(rentals)
  } catch (error) {
    console.error('Error fetching equipment rentals:', error)
    return NextResponse.json({ error: 'فشل في تحميل عقود التأجير' }, { status: 500 })
  }
}
