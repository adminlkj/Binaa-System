import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: Single timesheet with full details
export async function GET(
  _request: NextRequest,
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
            id: true, contractNo: true, clientId: true, projectId: true,
            hourlyRate: true, deliveryFees: true, deliveryFeesTaxable: true,
            paymentTerms: true, salesOrderNo: true, purchaseOrderNo: true,
            contractType: true, startDate: true, endDate: true,
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: {
            id: true, pricingType: true, status: true,
            clientId: true, projectId: true,
            hourlyRate: true, dailyRate: true, monthlyRate: true,
            deliveryFees: true, deliveryFeesTaxable: true,
            salesOrderNo: true, paymentDuration: true,
          },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true, clientId: true, client: { select: { id: true, name: true, nameAr: true } } },
        },
        invoice: {
          select: { id: true, invoiceNo: true, status: true, totalAmount: true },
        },
      },
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // Enrich with client name from rental or contract
    let clientName = ''
    let clientNameAr = ''
    const clientId = timesheet.rental?.clientId || timesheet.contract?.clientId
    if (clientId) {
      const client = await db.client.findUnique({
        where: { id: clientId },
        select: { name: true, nameAr: true },
      })
      clientName = client?.name || ''
      clientNameAr = client?.nameAr || ''
    }

    return NextResponse.json({
      ...timesheet,
      clientName,
      clientNameAr,
    })
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحميل التايم شيت' }, { status: 500 })
  }
}

// PUT: Update timesheet (status changes, operating hours, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.timesheet.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // PREVENT MODIFICATIONS WHEN INVOICED
    if (existing.status === 'INVOICED') {
      return NextResponse.json(
        { error: 'لا يمكن تعديل تايم شيت تم إصدار فاتورة له. يجب إلغاء الفاتورة أولاً' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}

    // Handle status changes
    if (body.status !== undefined) {
      const currentStatus = existing.status
      const newStatus = body.status

      // Validate workflow transitions
      // P3-HIGH-003: Removed APPROVED→INVOICED — only generate-invoice route can set INVOICED
      if (currentStatus === 'DRAFT' && newStatus === 'SUBMITTED') {
        updateData.status = 'SUBMITTED'
      } else if (currentStatus === 'SUBMITTED' && newStatus === 'APPROVED') {
        updateData.status = 'APPROVED'
        updateData.approvedDate = new Date()
      } else if (currentStatus === 'SUBMITTED' && newStatus === 'DRAFT') {
        // Allow reverting to DRAFT
        updateData.status = 'DRAFT'
      } else if (currentStatus === 'APPROVED' && newStatus === 'APPROVED') {
        // No-op (already approved)
      } else {
        return NextResponse.json(
          { error: `لا يمكن تغيير الحالة من ${currentStatus} إلى ${newStatus}` },
          { status: 400 }
        )
      }
    }

    // If still DRAFT, allow updating fields
    if (existing.status === 'DRAFT' && body.status === undefined) {
      if (body.operatingHours !== undefined) {
        updateData.operatingHours = parseFloat(body.operatingHours) || 0
      }
      if (body.month !== undefined) {
        updateData.month = parseInt(body.month)
      }
      if (body.year !== undefined) {
        updateData.year = parseInt(body.year)
      }
      if (body.notes !== undefined) {
        updateData.notes = body.notes || null
      }
    }

    const timesheet = await db.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true, contractNo: true, hourlyRate: true, deliveryFees: true,
            deliveryFeesTaxable: true, paymentTerms: true, salesOrderNo: true,
          },
        },
        equipment: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        rental: {
          select: { id: true, hourlyRate: true, pricingType: true },
        },
        project: {
          select: { id: true, code: true, name: true, nameAr: true },
        },
        invoice: {
          select: { id: true, invoiceNo: true, status: true },
        },
      },
    })

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحديث التايم شيت' }, { status: 500 })
  }
}

// PATCH: Alias for PUT (support both methods)
export { PUT as PATCH }

// DELETE: Delete a timesheet (only DRAFT status)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const { id } = await params

    const existing = await db.timesheet.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // Only DRAFT timesheets can be deleted
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'لا يمكن حذف تايم شيت إلا في حالة المسودة' },
        { status: 403 }
      )
    }

    await db.timesheet.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'تم حذف التايم شيت بنجاح' })
  } catch (error) {
    console.error('Error deleting timesheet:', error)
    return NextResponse.json({ error: 'فشل في حذف التايم شيت' }, { status: 500 })
  }
}
