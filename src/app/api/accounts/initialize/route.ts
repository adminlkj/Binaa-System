import { NextResponse } from 'next/server'
import { initializeChartOfAccounts } from '@/lib/accounting/engine'
import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'

export async function POST() {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response
  try {
    const result = await initializeChartOfAccounts()
    return NextResponse.json({
      success: true,
      message: result.created > 0
        ? `تم إنشاء ${result.created} حساب بنجاح`
        : 'شجرة الحسابات موجودة بالفعل',
      ...result,
    })
  } catch (error) {
    console.error('Error initializing chart of accounts:', error)
    return NextResponse.json(
      { success: false, error: 'فشل في تهيئة شجرة الحسابات' },
      { status: 500 }
    )
  }
}

// GET: Return current chart of accounts status
export async function GET() {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const { initializeChartOfAccounts: _init } = await import('@/lib/accounting/engine')
    const { db } = await import('@/lib/db')
    
    const accountCount = await db.account.count()
    const accounts = await db.account.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
    })

    return NextResponse.json({
      initialized: accountCount > 0,
      totalAccounts: accountCount,
      accounts,
    })
  } catch (error) {
    console.error('Error fetching chart of accounts:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل شجرة الحسابات' },
      { status: 500 }
    )
  }
}
