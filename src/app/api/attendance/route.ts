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

    // Safe date parser — returns null for invalid/missing values so Prisma
    // doesn't crash on `new Date('Invalid Date')` (which is what happens
    // when the client sends an empty string or unparseable time string).
    const safeDate = (v: unknown): Date | null => {
      if (!v) return null
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v
      const s = typeof v === 'string' ? v.trim() : ''
      if (!s) return null
      const d = new Date(s)
      return isNaN(d.getTime()) ? null : d
    }

    // Combine a date-only string (e.g. "2025-06-15") with a time-only string
    // (e.g. "08:00" from <input type="time">) into a valid Date.
    // Returns null if either part is missing or invalid.
    const combineDateTime = (dateStr: unknown, timeStr: unknown): Date | null => {
      const d = safeDate(dateStr)
      if (!d) return null
      const t = typeof timeStr === 'string' ? timeStr.trim() : ''
      if (!t) return null
      // Accept "HH:MM" or "HH:MM:SS"
      const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
      if (!m) return null
      const hours = parseInt(m[1], 10)
      const minutes = parseInt(m[2], 10)
      const seconds = m[3] ? parseInt(m[3], 10) : 0
      if (hours > 23 || minutes > 59 || seconds > 59) return null
      d.setHours(hours, minutes, seconds, 0)
      return d
    }

    // Auto-calculate workHours from checkIn/checkOut if both provided and valid
    let workHours = body.workHours ? parseFloat(body.workHours) : 0
    if (isNaN(workHours)) workHours = 0
    const checkInDate = combineDateTime(body.date, body.checkIn)
    const checkOutDate = combineDateTime(body.date, body.checkOut)
    if (checkInDate && checkOutDate) {
      const diffMs = checkOutDate.getTime() - checkInDate.getTime()
      if (diffMs > 0) {
        workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      }
    }

    const dateOnly = safeDate(body.date)
    if (!dateOnly) {
      return NextResponse.json(
        { error: 'تاريخ الحضور مطلوب' },
        { status: 400 },
      )
    }

    const attendance = await db.attendance.create({
      data: {
        employeeId: body.employeeId,
        date: dateOnly,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        workHours,
        overtimeHours: body.overtimeHours ? parseFloat(body.overtimeHours) || 0 : 0,
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
