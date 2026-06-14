import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const withBalances = searchParams.get('withBalances') === 'true'

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

    // Compute balances efficiently using a single aggregation query
    let balanceMap = new Map<string, number>()
    const normalBalanceMap: Record<string, 'DEBIT' | 'CREDIT'> = {
      ASSET: 'DEBIT',
      LIABILITY: 'CREDIT',
      EQUITY: 'CREDIT',
      REVENUE: 'CREDIT',
      EXPENSE: 'DEBIT',
    }

    if (withBalances) {
      // Use a single efficient aggregation query
      const aggregatedLines = await db.journalLine.groupBy({
        by: ['accountId'],
        _sum: { debit: true, credit: true },
        where: { journalEntry: { status: 'POSTED' } },
      })

      // Create a map from accountId to account type for normal balance calculation
      const accountTypeMap = new Map<string, string>()
      for (const account of accounts) {
        accountTypeMap.set(account.id, account.type)
      }

      for (const line of aggregatedLines) {
        const accountType = accountTypeMap.get(line.accountId) || 'ASSET'
        const normalBalance = normalBalanceMap[accountType] || 'DEBIT'
        const debit = toNumber(line._sum.debit)
        const credit = toNumber(line._sum.credit)
        const amount = normalBalance === 'DEBIT' ? debit - credit : credit - debit
        balanceMap.set(line.accountId, amount)
      }
    }

    const accountsWithBalances = accounts.map((account) => ({
      ...account,
      balance: withBalances ? (balanceMap.get(account.id) || 0) : 0,
      normalBalance: normalBalanceMap[account.type] || 'DEBIT',
    }))

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

    return NextResponse.json(serializeDecimal({
      accounts: accountsWithBalances.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        nameAr: a.nameAr,
        type: a.type,
        parentId: a.parentId,
        isActive: a.isActive,
        activityType: a.activityType,
        isSystem: a.isSystem,
        allowPosting: a.allowPosting,
        level: a.level,
        description: a.description,
        descriptionAr: a.descriptionAr,
        parent: a.parent ? { id: a.parent.id, code: a.parent.code, name: a.parent.name, nameAr: a.parent.nameAr } : null,
        children: a.children.map(c => ({ id: c.id, code: c.code, name: c.name, nameAr: c.nameAr, type: c.type, isActive: c.isActive })),
        _count: a._count,
        balance: a.balance,
        normalBalance: a.normalBalance,
      })),
      total: accountsWithBalances.length,
    }))
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

    // Validate activity type if provided
    const validActivityTypes = ['CONSTRUCTION', 'EQUIPMENT_RENTAL', 'BOTH']
    if (body.activityType && !validActivityTypes.includes(body.activityType)) {
      return NextResponse.json(
        { error: `نوع النشاط غير صالح. الأنواع المسموحة: ${validActivityTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const account = await db.account.create({
      data: {
        code,
        name: body.name,
        nameAr: body.nameAr || null,
        type: body.type,
        parentId: body.parentId || null,
        isActive: true,
        activityType: body.activityType || null,
        isSystem: body.isSystem ?? false,
        allowPosting: body.allowPosting ?? true,
        level: body.level ?? 0,
        description: body.description || null,
        descriptionAr: body.descriptionAr || null,
      },
      include: {
        parent: { select: { id: true, code: true, name: true, nameAr: true } },
        children: {
          select: { id: true, code: true, name: true, nameAr: true },
          where: { isActive: true },
        },
      },
    })

    return NextResponse.json(serializeDecimal(account), { status: 201 })
  } catch (error) {
    console.error('Error creating account:', error)
    return NextResponse.json(
      { error: 'فشل في إنشاء الحساب' },
      { status: 500 }
    )
  }
}
