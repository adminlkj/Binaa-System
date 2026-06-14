import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.attendance.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting attendance:', error)
    return NextResponse.json({ error: 'فشل في حذف سجل الحضور' }, { status: 500 })
  }
}
