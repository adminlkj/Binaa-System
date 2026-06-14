import { db } from '@/lib/db'
import { serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

// PATCH: Update VAT return status and/or record payment
// Cannot modify financial numbers (frozen snapshot)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.vATReturn.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الإقرار الضريبي غير موجود' }, { status: 404 })
    }

    // Validate status transitions: DRAFT → FILED → PAID
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['FILED'],
      FILED: ['PAID'],
      PAID: [],
    }

    const newStatus = body.status as string | undefined

    if (newStatus) {
      const allowed = validTransitions[existing.status] || []
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `لا يمكن تغيير الحالة من ${existing.status} إلى ${newStatus}. الانتقالات المسموحة: ${allowed.join(', ') || 'لا يوجد'}` },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (newStatus) {
      updateData.status = newStatus
    }

    // Filing: record filed date when transitioning to FILED
    if (newStatus === 'FILED') {
      updateData.filedDate = new Date()
    }

    // Payment recording (only when transitioning to PAID)
    if (newStatus === 'PAID') {
      if (body.paymentDate) {
        updateData.paymentDate = new Date(body.paymentDate)
      } else {
        updateData.paymentDate = new Date()
      }
      if (body.paymentReference) {
        updateData.paymentReference = body.paymentReference
      }
    }

    const updated = await db.vATReturn.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(serializeDecimal(updated))
  } catch (error) {
    console.error('Error updating VAT return:', error)
  }
}

// GET single VAT return
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vatReturn = await db.vATReturn.findUnique({ where: { id } })
    if (!vatReturn) {
      return NextResponse.json({ error: 'الإقرار الضريبي غير موجود' }, { status: 404 })
    }
    return NextResponse.json(serializeDecimal(vatReturn))
  } catch (error) {
    console.error('Error fetching VAT return:', error)
  }
}
