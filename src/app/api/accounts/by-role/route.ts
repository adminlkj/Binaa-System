import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/accounts/by-role?role=CASH,BANK
// Get accounts by their functional role(s) - used by screens for dynamic account selection
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rolesParam = searchParams.get('role') || ''
    const parentCode = searchParams.get('parentCode') || ''
    const activityType = searchParams.get('activityType') || ''

    if (rolesParam) {
      // Special case: return ALL posting accounts (used by dropdowns that need the
      // full chart of accounts regardless of role — e.g. GL / Account Statement reports)
      if (rolesParam === '__ALL_POSTING__') {
        const accounts = await db.account.findMany({
          where: {
            isActive: true,
            allowPosting: true,
          },
          select: {
            id: true,
            code: true,
            name: true,
            nameAr: true,
            type: true,
            accountRole: true,
            activityType: true,
          },
          orderBy: { code: 'asc' },
        })
        return NextResponse.json(accounts)
      }

      // Query by accountRole (comma-separated list for multiple roles)
      const roles = rolesParam.split(',').map(r => r.trim()).filter(Boolean)
      const where: any = {
        isActive: true,
        allowPosting: true,
        accountRole: { in: roles },
      }
      if (activityType) {
        where.activityType = { in: [activityType, 'BOTH'] }
      }

      const accounts = await db.account.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          nameAr: true,
          type: true,
          accountRole: true,
          activityType: true,
        },
        orderBy: { code: 'asc' },
      })

      return NextResponse.json(accounts)
    }

    if (parentCode) {
      // Query by parentCode - get all child accounts
      const where: any = {
        isActive: true,
        parentCode,
      }
      if (activityType) {
        where.activityType = { in: [activityType, 'BOTH'] }
      }

      const accounts = await db.account.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          nameAr: true,
          type: true,
          accountRole: true,
          activityType: true,
          allowPosting: true,
        },
        orderBy: { code: 'asc' },
      })

      return NextResponse.json(accounts)
    }

    // No parameters - return all accounts with roles
    const accounts = await db.account.findMany({
      where: {
        isActive: true,
        accountRole: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        type: true,
        accountRole: true,
        activityType: true,
        allowPosting: true,
      },
      orderBy: { code: 'asc' },
    })

    return NextResponse.json(accounts)
  } catch (error: any) {
    console.error('Error fetching accounts by role:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
