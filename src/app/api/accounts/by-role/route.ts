import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET /api/accounts/by-role?role=CASH,BANK
// GET /api/accounts/by-property?usableInExpenses=true   (new: property-based)
// Get accounts by their functional role(s) OR by usage properties.
// Property-based querying is the NEW preferred way — it lets accountants
// control which accounts appear in which screens by setting properties
// on the account itself, rather than relying on hardcoded roles.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rolesParam = searchParams.get('role') || ''
    const parentCode = searchParams.get('parentCode') || ''
    const activityType = searchParams.get('activityType') || ''

    // ── NEW: Property-based querying ──────────────────────────────────
    // Any of these query params triggers property-based filtering:
    //   ?usableInExpenses=true
    //   ?usableInFuel=true&usableInMaintenance=true
    //   ?showInCash=true
    //   ?requiresEmployee=true
    // Multiple properties are AND-ed together.
    const PROPERTY_FIELDS = [
      'usableInExpenses', 'usableInProjects', 'usableInRental', 'usableInPayroll',
      'usableInAdvances', 'usableInMaintenance', 'usableInFuel', 'usableInPurchases',
      'usableInRevenue', 'showInCash', 'showInBank',
      'allowsProject', 'allowsCostCenter', 'allowsEmployee', 'allowsEquipment',
      'allowsSupplier', 'allowsClient',
      'requiresEmployee', 'requiresProject', 'requiresEquipment', 'requiresContract',
    ] as const

    const propertyFilters: Record<string, boolean> = {}
    for (const field of PROPERTY_FIELDS) {
      const val = searchParams.get(field)
      if (val === 'true' || val === 'false') {
        propertyFilters[field] = val === 'true'
      }
    }

    // Common select fields (include all new property fields)
    const selectFields = {
      id: true,
      code: true,
      name: true,
      nameAr: true,
      type: true,
      accountRole: true,
      activityType: true,
      allowPosting: true,
      // NEW: include all usage/selection/behavior properties
      usableInExpenses: true, usableInProjects: true, usableInRental: true,
      usableInPayroll: true, usableInAdvances: true, usableInMaintenance: true,
      usableInFuel: true, usableInPurchases: true, usableInRevenue: true,
      showInCash: true, showInBank: true,
      allowsProject: true, allowsCostCenter: true, allowsEmployee: true,
      allowsEquipment: true, allowsSupplier: true, allowsClient: true,
      requiresEmployee: true, requiresProject: true, requiresEquipment: true,
      requiresContract: true, allowsVat: true, documentType: true,
    }

    // ── Property-based path ───────────────────────────────────────────
    if (Object.keys(propertyFilters).length > 0) {
      const where: Record<string, unknown> = {
        isActive: true,
        allowPosting: true,
        ...propertyFilters,
      }
      if (activityType) {
        where.activityType = { in: [activityType, 'BOTH'] }
      }
      const accounts = await db.account.findMany({
        where,
        select: selectFields,
        orderBy: { code: 'asc' },
      })
      return NextResponse.json(accounts)
    }

    if (rolesParam) {
      // Special case: return ALL posting accounts (used by dropdowns that need the
      // full chart of accounts regardless of role — e.g. GL / Account Statement reports)
      if (rolesParam === '__ALL_POSTING__') {
        const accounts = await db.account.findMany({
          where: { isActive: true, allowPosting: true },
          select: selectFields,
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
        select: selectFields,
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
        select: selectFields,
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
      select: selectFields,
      orderBy: { code: 'asc' },
    })

    return NextResponse.json(accounts)
  } catch (error: unknown) {
    console.error('Error fetching accounts by role:', error)
    return NextResponse.json({ error: 'فشل في تحميل الحسابات' }, { status: 500 })
  }
}
