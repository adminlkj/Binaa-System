import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const projects = await db.project.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects list:', error)
    return NextResponse.json({ error: 'فشل في تحميل المشاريع' }, { status: 500 })
  }
}
