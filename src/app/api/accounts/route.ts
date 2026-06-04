import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getAccountBalance, NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'

export async function GET() {
  try {
    const accounts = await db.account.findMany({
      where: { isActive: true },
      include: {
        parent: { select: { id: true, code: true, name: true, nameAr: true } },
        children: {
          select: {
            id: true,
            code: true,
            name: true,
            nameAr: true,
            type: true,
            isActive: true,
          },
          where: { isActive: true },
          orderBy: { code: 'asc' },
        },
        _count: { select: { journalLines: true } },
      },
      orderBy: { code: 'asc' },
    })

    // Calculate balances for all accounts
    const accountsWithBalances = await Promise.all(
      accounts.map(async (account) => {
        const balance = await getAccountBalance(account.code)
        return {
          ...account,
          balance,
          normalBalance: NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT',
        }
      })
    )

    // Build hierarchical tree structure
    const rootAccounts = accountsWithBalances.filter((a) => !a.parentId)
    const childMap = new Map<string, typeof accountsWithBalances>()

    for (const account of accountsWithBalances) {
      if (account.parentId) {
        const children = childMap.get(account.parentId) || []
        children.push(account)
        childMap.set(account.parentId, children)
      }
    }

    // Recursive function to build tree with computed totals
    function buildTree(account: typeof accountsWithBalances[number]) {
      const children = childMap.get(account.id) || []
      const childTrees = children.map(buildTree)

      // Sum child balances for parent accounts
      const childBalanceTotal = childTrees.reduce(
        (sum, child) => sum + (child.childBalanceTotal || child.balance),
        0
      )

      return {
        ...account,
        children: childTrees,
        childBalanceTotal,
        totalBalance: account.balance + (account.children.length > 0 ? childBalanceTotal : 0),
      }
    }

    const tree = rootAccounts.map(buildTree)

    return NextResponse.json({
      accounts: accountsWithBalances,
      tree,
      total: accountsWithBalances.length,
    })
  } catch (error) {
    console.error('Error fetching accounts:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل الحسابات' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: 'اسم الحساب ونوعه مطلوبان' },
        { status: 400 }
      )
    }

    // Validate account type
    const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `نوع الحساب غير صالح. الأنواع المسموحة: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Check for duplicate code if provided
    if (body.code) {
      const existing = await db.account.findUnique({ where: { code: body.code } })
      if (existing) {
        return NextResponse.json(
          { error: `رمز الحساب ${body.code} موجود بالفعل` },
          { status: 409 }
        )
      }
    }

    // Auto-generate code if not provided
    let code = body.code
    if (!code) {
      const typePrefix: Record<string, string> = {
        ASSET: '1',
        LIABILITY: '3',
        EQUITY: '5',
        REVENUE: '6',
        EXPENSE: '7',
      }
      const prefix = typePrefix[body.type] || '9'

      const lastAccount = await db.account.findFirst({
        where: { code: { startsWith: prefix } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })

      let nextNum = 1
      if (lastAccount?.code) {
        const match = lastAccount.code.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      code = `${prefix}${String(nextNum).padStart(3, '0')}`
    }

    // Validate parent exists if provided
    if (body.parentId) {
      const parent = await db.account.findUnique({ where: { id: body.parentId } })
      if (!parent) {
        return NextResponse.json(
          { error: 'الحساب الأب غير موجود' },
          { status: 400 }
        )
      }
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
        parent: { select: { id: true, code: true, name: true, nameAr: true } },
        children: {
          select: { id: true, code: true, name: true, nameAr: true },
          where: { isActive: true },
        },
      },
    })

    return NextResponse.json(account, { status: 201 })
  } catch (error) {
    console.error('Error creating account:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء الحساب' },
      { status: 500 }
    )
  }
}
