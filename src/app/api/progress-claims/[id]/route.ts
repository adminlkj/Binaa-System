import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const claim = await db.progressClaim.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, code: true, client: { select: { id: true, name: true, nameAr: true, code: true } } } },
        contract: { select: { id: true, contractNo: true, totalValue: true } },
      },
    })

    if (!claim) {
      return NextResponse.json({ error: 'المستخلص غير موجود' }, { status: 404 })
    }

    return NextResponse.json(claim)
  } catch (error) {
    console.error('Error fetching progress claim:', error)
    return NextResponse.json({ error: 'فشل في تحميل المستخلص' }, { status: 500 })
  }
}
