import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {}
    if (employeeId) where.employeeId = employeeId
    if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      }
    }

    const attendance = await db.attendance.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(attendance)
  } catch (error) {
    console.error('Error fetching attendance:', error)
    return NextResponse.json({ error: 'فشل في تحميل سجلات الحضور' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Auto-calculate workHours from checkIn/checkOut if both provided
    let workHours = body.workHours ? parseFloat(body.workHours) : 0
    if (body.checkIn && body.checkOut) {
      const checkIn = new Date(body.checkIn)
      const checkOut = new Date(body.checkOut)
      const diffMs = checkOut.getTime() - checkIn.getTime()
      if (diffMs > 0) {
        workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      }
    }

    const attendance = await db.attendance.create({
      data: {
        employeeId: body.employeeId,
        date: new Date(body.date),
        checkIn: body.checkIn ? new Date(body.checkIn) : null,
        checkOut: body.checkOut ? new Date(body.checkOut) : null,
        workHours,
        overtimeHours: body.overtimeHours ? parseFloat(body.overtimeHours) : 0,
        notes: body.notes || null,
      },
      include: {
        employee: { select: { id: true, code: true, name: true, nameAr: true } },
      },
    })

    return NextResponse.json(attendance, { status: 201 })
  } catch (error) {
    console.error('Error creating attendance:', error)
    return NextResponse.json({ error: 'فشل في إنشاء سجل الحضور' }, { status: 500 })
  }
}
