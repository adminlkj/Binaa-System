import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const currencies = await db.currency.findMany({
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(currencies)
  } catch (error) {
    console.error('Error fetching currencies:', error)
    return NextResponse.json({ error: 'فشل في تحميل العملات' }, { status: 500 })
  }
}
