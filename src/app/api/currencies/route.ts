import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const currencies = await db.currency.findMany({
      orderBy: { code: 'asc' },
    })
    
    // If no currencies exist, seed default currencies
    if (currencies.length === 0) {
      const defaults = [
        { code: 'SAR', name: 'Saudi Riyal', nameAr: 'ريال سعودي', symbol: 'ر.س', rate: 1, isActive: true },
        { code: 'USD', name: 'US Dollar', nameAr: 'دولار أمريكي', symbol: '$', rate: 3.75, isActive: true },
        { code: 'EUR', name: 'Euro', nameAr: 'يورو', symbol: '€', rate: 4.08, isActive: true },
        { code: 'GBP', name: 'British Pound', nameAr: 'جنيه إسترليني', symbol: '£', rate: 4.73, isActive: true },
        { code: 'AED', name: 'UAE Dirham', nameAr: 'درهم إماراتي', symbol: 'د.إ', rate: 1.02, isActive: true },
      ]
      await db.currency.createMany({ data: defaults })
      const seeded = await db.currency.findMany({ orderBy: { code: 'asc' } })
      return NextResponse.json(seeded)
    }
    
    return NextResponse.json(currencies)
  } catch (error) {
    console.error('Error fetching currencies:', error)
    return NextResponse.json({ error: 'فشل في تحميل العملات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const currency = await db.currency.create({
      data: {
        code: body.code,
        name: body.name,
        nameAr: body.nameAr || null,
        symbol: body.symbol,
        rate: body.rate || 1,
        isActive: body.isActive ?? true,
      },
    })
    return NextResponse.json(currency, { status: 201 })
  } catch (error) {
    console.error('Error creating currency:', error)
    return NextResponse.json({ error: 'فشل في إنشاء العملة' }, { status: 500 })
  }
}
