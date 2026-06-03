import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const accounts = await db.account.findMany({
      where: { isActive: true },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
        _count: { select: { journalLines: true } },
      },
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(accounts)
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json({ error: 'فشل في تحميل الحسابات' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const lastAccount = await db.account.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    })

    let code = body.code
    if (!code) {
      let nextNum = 1
      if (lastAccount?.code) {
        const match = lastAccount.code.match(/(\d+)/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      const typePrefix: Record<string, string> = {
        ASSET: '1', LIABILITY: '2', EQUITY: '3', REVENUE: '4', EXPENSE: '5',
      }
      const prefix = typePrefix[body.type] || '9'
      code = `${prefix}${String(nextNum).padStart(3, '0')}`
    }

    const account = await db.account.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        type: body.type,
        parentId: body.parentId || null,
        isActive: true,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    console.error('Error creating account:', error)
    return NextResponse.json({ error: 'فشل في إنشاء الحساب' }, { status: 500 })
  }
}
