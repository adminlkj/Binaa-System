import { db } from '@/lib/db'
import { toNumber, serializeDecimal } from '@/lib/decimal'
import { NORMAL_BALANCE, AccountTypeValue } from '@/lib/accounting/engine'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

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

    // Compute balance and last transaction for each account
    const accountIds = accounts.map(a => a.id)
    const balances = await db.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        deletedAt: null,
        journalEntry: { status: 'POSTED', deletedAt: null },
      },
      _sum: { debit: true, credit: true },
      _max: { createdAt: true },
    })

    // Build a map for quick lookup
    const balanceMap = new Map(balances.map(b => [b.accountId, b]))

    // Enrich each account with computed indicators
    const enrichedAccounts = accounts.map(account => {
      const bal = balanceMap.get(account.id)
      const totalDebit = toNumber(bal?._sum?.debit) || 0
      const totalCredit = toNumber(bal?._sum?.credit) || 0
      const normalBalance = NORMAL_BALANCE[account.type as AccountTypeValue] || 'DEBIT'
      const balance = normalBalance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit

      return {
        ...account,
        balance,
        entryCount: account._count.journalLines,
        lastTransactionDate: bal?._max?.createdAt || null,
        childrenCount: account.children.length,
        normalBalance,
      }
    })

    // Build hierarchical tree structure
    const rootAccounts = enrichedAccounts.filter((a) => !a.parentId)
    const childMap = new Map<string, typeof enrichedAccounts>()

    for (const account of enrichedAccounts) {
      if (account.parentId) {
        const children = childMap.get(account.parentId) || []
        children.push(account)
        childMap.set(account.parentId, children)
      }
    }

    // Recursive function to build tree with computed totals
    function buildTree(account: typeof enrichedAccounts[number]) {
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
        totalBalance: account.balance + (account.childrenCount > 0 ? childBalanceTotal : 0),
      }
    }

    const tree = rootAccounts.map(buildTree)

    return NextResponse.json(serializeDecimal({
      accounts: enrichedAccounts.map(a => ({
        id: a.id,
        code: a.code,
        name: a.name,
        nameAr: a.nameAr,
        type: a.type,
        parentId: a.parentId,
        parentCode: a.parentCode,
        isActive: a.isActive,
        activityType: a.activityType,
        accountRole: a.accountRole,
        isSystem: a.isSystem,
        allowPosting: a.allowPosting,
        level: a.level,
        description: a.description,
        descriptionAr: a.descriptionAr,
        parent: a.parent ? { id: a.parent.id, code: a.parent.code, name: a.parent.name, nameAr: a.parent.nameAr } : null,
        children: a.children.map(c => ({ id: c.id, code: c.code, name: c.name, nameAr: c.nameAr, type: c.type, isActive: c.isActive, balance: c.balance, normalBalance: c.normalBalance, entryCount: c.entryCount })),
        _count: a._count,
        balance: a.balance,
        normalBalance: a.normalBalance,
        entryCount: a.entryCount,
        lastTransactionDate: a.lastTransactionDate,
        childrenCount: a.childrenCount,
      })),
      total: enrichedAccounts.length,
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

    // Rule 2: Posting-level account must have a parent
    const isAllowPosting = body.allowPosting !== undefined ? body.allowPosting : true
    if (isAllowPosting && !body.parentId && !body.parentCode) {
      return NextResponse.json(
        { error: 'لا يمكن إنشاء حساب ترحيل بدون حساب أب - يرجى تحديد الحساب الأب أولاً' },
        { status: 400 }
      )
    }

    // If parentCode is provided, verify it exists
    if (body.parentCode) {
      const parentByCode = await db.account.findUnique({ where: { code: body.parentCode } })
      if (!parentByCode) {
        return NextResponse.json(
          { error: 'لا يمكن إنشاء حساب ترحيل بدون حساب أب - يرجى تحديد الحساب الأب أولاً' },
          { status: 400 }
        )
      }
      // Auto-set parentId from parentCode if not already set
      if (!body.parentId) {
        body.parentId = parentByCode.id
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

    // Validate accountRole if provided (must be a known role key)
    if (body.accountRole && body.accountRole !== '') {
      const { ACCOUNT_ROLES } = await import('@/lib/account-roles')
      const validRoles = Object.keys(ACCOUNT_ROLES)
      if (!validRoles.includes(body.accountRole)) {
        return NextResponse.json(
          { error: `دور الحساب غير صالح: ${body.accountRole}. الأدوار المسموحة: ${validRoles.join(', ')}` },
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
        parentCode: body.parentCode || null,
        isActive: true,
        activityType: body.activityType || null,
        // Allow setting the functional role at creation time so the new account
        // immediately appears in the relevant operation screens (BANK, CASH, …)
        accountRole: body.accountRole || null,
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
