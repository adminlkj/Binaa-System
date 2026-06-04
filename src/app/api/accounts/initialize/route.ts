import { NextResponse } from 'next/server'
import { initializeChartOfAccounts } from '@/lib/accounting/engine'

export async function POST() {
  try {
    const result = await initializeChartOfAccounts()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error initializing chart of accounts:', error)
    return NextResponse.json(
      { error: 'فشل في تهيئة شجرة الحسابات' },
      { status: 500 }
    )
  }
}
