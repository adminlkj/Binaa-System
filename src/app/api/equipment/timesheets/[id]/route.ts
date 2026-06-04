import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET: Single timesheet with full details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const timesheet = await db.equipmentTimesheet.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true, status: true },
            },
          },
        },
      },
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    // Enrich with client and project names
    let clientName = ''
    let clientNameAr = ''
    let projectName = ''
    let projectNameAr = ''

    if (timesheet.contract.clientId) {
      const client = await db.client.findUnique({
        where: { id: timesheet.contract.clientId },
        select: { name: true, nameAr: true },
      })
      clientName = client?.name || ''
      clientNameAr = client?.nameAr || ''
    }

    if (timesheet.contract.projectId) {
      const project = await db.project.findUnique({
        where: { id: timesheet.contract.projectId },
        select: { name: true, nameAr: true },
      })
      projectName = project?.name || ''
      projectNameAr = project?.nameAr || ''
    }

    // Get invoice if linked
    let invoice = null
    if (timesheet.invoiceId) {
      invoice = await db.salesInvoice.findUnique({
        where: { id: timesheet.invoiceId },
        select: { id: true, invoiceNo: true, status: true, totalAmount: true },
      })
    }

    return NextResponse.json({
      ...timesheet,
      contract: {
        ...timesheet.contract,
        clientName,
        clientNameAr,
        projectName,
        projectNameAr,
      },
      invoice,
    })
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحميل التايم شيت' }, { status: 500 })
  }
}

// PATCH: Update timesheet (status changes, worked hours, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.equipmentTimesheet.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'التايم شيت غير موجود' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    // Handle status changes
    if (body.status !== undefined) {
      // Validate workflow transitions
      const currentStatus = existing.status
      const newStatus = body.status

      if (currentStatus === 'DRAFT' && newStatus === 'SUBMITTED') {
        updateData.status = 'SUBMITTED'
      } else if (currentStatus === 'SUBMITTED' && newStatus === 'APPROVED') {
        updateData.status = 'APPROVED'
        updateData.approvedDate = new Date()
        updateData.approvedBy = body.approvedBy || null
      } else if (currentStatus === 'SUBMITTED' && newStatus === 'REJECTED') {
        updateData.status = 'REJECTED'
      } else if (currentStatus === 'DRAFT' && newStatus === 'DRAFT') {
        // Allow updating DRAFT fields
        updateData.status = 'DRAFT'
      } else {
        return NextResponse.json(
          { error: `لا يمكن تغيير الحالة من ${currentStatus} إلى ${newStatus}` },
          { status: 400 }
        )
      }
    }

    // If still DRAFT, allow updating fields
    if (existing.status === 'DRAFT' && body.status === undefined) {
      if (body.workedHours !== undefined) {
        const wh = parseFloat(body.workedHours) || 0
        updateData.workedHours = wh
        // Recalculate amounts
        const hourlyRate = body.hourlyRate !== undefined
          ? parseFloat(body.hourlyRate) || existing.hourlyRate
          : existing.hourlyRate
        updateData.hourlyRate = hourlyRate
        updateData.subtotal = wh * hourlyRate
        updateData.vatAmount = updateData.subtotal * existing.vatRate
        updateData.totalAmount = updateData.subtotal + updateData.vatAmount
      }
      if (body.remarks !== undefined) {
        updateData.remarks = body.remarks || null
      }
      if (body.month !== undefined) {
        updateData.month = parseInt(body.month)
      }
      if (body.year !== undefined) {
        updateData.year = parseInt(body.year)
      }
    }

    const timesheet = await db.equipmentTimesheet.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          include: {
            equipment: {
              select: { id: true, code: true, name: true, nameAr: true, status: true },
            },
          },
        },
      },
    })

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json({ error: 'فشل في تحديث التايم شيت' }, { status: 500 })
  }
}
