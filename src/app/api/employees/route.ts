import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const employees = await db.employee.findMany({
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(employees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json({ error: 'فشل في تحميل الموظفين' }, { status: 500 })
  }
}
