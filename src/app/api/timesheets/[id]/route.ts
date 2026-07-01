import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Legacy timesheet [id] route - fixed to use correct schema fields
// Previously referenced 'entries' and 'TimesheetEntry' which don't exist

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { id } = await params
    const timesheet = await db.timesheet.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true, contractNo: true, hourlyRate: true, deliveryFees: true,
            deliveryFeesTaxable: true, paymentTerms: true, salesOrderNo: true,
            startDate: true, endDate: true, status: true,
            project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
          },
        },
        project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        rental: {
          select: { id: true, hourlyRate: true, pricingType: true, status: true, clientId: true },
        },
      },
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'سجل ساعات العمل غير موجود' }, { status: 404 })
    }

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجل ساعات العمل' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()
    const { status, notes, operatingHours, month, year } = body

    const existing = await db.timesheet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل ساعات العمل غير موجود' }, { status: 404 })
    }

    // PREVENT MODIFICATIONS WHEN INVOICED
    if (existing.status === 'INVOICED') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل تايم شيت تم إصدار فاتورة له' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (operatingHours !== undefined) updateData.operatingHours = parseFloat(operatingHours) || 0
    if (month !== undefined) updateData.month = parseInt(month)
    if (year !== undefined) updateData.year = parseInt(year)

    const timesheet = await db.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: { id: true, contractNo: true, hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true, paymentTerms: true },
        },
        project: { select: { id: true, name: true, nameAr: true, code: true } },
        equipment: { select: { id: true, code: true, name: true, nameAr: true } },
        rental: {
          select: { id: true, hourlyRate: true, pricingType: true },
        },
      },
    })

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحديث سجل ساعات العمل' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.timesheet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل ساعات العمل غير موجود' }, { status: 404 })
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف تايم شيت إلا في حالة المسودة' },
        { status: 403 }
      )
    }

    await db.timesheet.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting timesheet:', error)
    return NextResponse.json({ error: 'فشل في حذف سجل ساعات العمل' }, { status: 500 })
  }
}
