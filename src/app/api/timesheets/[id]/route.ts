import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const timesheet = await db.timesheet.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true, contractNo: true, value: true, vatRate: true, startDate: true, endDate: true, status: true,
            project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
          },
        },
        project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
        entries: { orderBy: { createdAt: 'asc' } },
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
  try {
    const { id } = await params
    const body = await request.json()
    const { status, notes, entries } = body

    // Check timesheet exists
    const existing = await db.timesheet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل ساعات العمل غير موجود' }, { status: 404 })
    }

    // If entries are provided, replace them
    if (entries !== undefined) {
      // Delete old entries
      await db.timesheetEntry.deleteMany({ where: { timesheetId: id } })

      // Create new entries
      const processedEntries = entries.map((entry: { description: string; hours: number; rate: number }) => ({
        timesheetId: id,
        description: entry.description,
        hours: parseFloat(String(entry.hours)) || 0,
        rate: parseFloat(String(entry.rate)) || 0,
        totalAmount: (parseFloat(String(entry.hours)) || 0) * (parseFloat(String(entry.rate)) || 0),
      }))

      await db.timesheetEntry.createMany({ data: processedEntries })
    }

    // Update timesheet fields
    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const timesheet = await db.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true, contractNo: true, value: true, vatRate: true,
            project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
          },
        },
        project: { select: { id: true, name: true, nameAr: true, code: true, client: { select: { id: true, name: true, nameAr: true } } } },
        entries: { orderBy: { createdAt: 'asc' } },
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
  try {
    const { id } = await params

    const existing = await db.timesheet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'سجل ساعات العمل غير موجود' }, { status: 404 })
    }

    // Entries will be cascade deleted
    await db.timesheet.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting timesheet:', error)
    return NextResponse.json({ error: 'فشل في حذف سجل ساعات العمل' }, { status: 500 })
  }
}
