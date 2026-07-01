import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getRoleAccountMapping, ACCOUNT_ROLES, AccountRoleKey } from '@/lib/account-roles'
import { requireAuthApi, requireRoleApi } from '@/lib/auth-helpers'

// ============================================================================
// GET /api/accounts/role-mapping
// Returns all role-to-account mappings
// ============================================================================
export async function GET() {
  const { response } = await requireAuthApi()
  if (response) return response

  try {
    const mappings = await getRoleAccountMapping()
    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('Error fetching role-account mappings:', error)
    return NextResponse.json(
      { error: 'فشل في تحميل ربط الأدوار بالحسابات' },
      { status: 500 }
    )
  }
}

// ============================================================================
// PUT /api/accounts/role-mapping
// Updates an account's role mapping
// Body: { accountId: string, accountRole: string }
// ============================================================================
export async function PUT(request: NextRequest) {
  // FIX-RBAC-VAT / AUDIT-SETTINGS Q4: account-role mapping rewrites every future
  // journal entry — restrict to ADMIN/ACCOUNTANT.
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { accountId, accountRole } = body

    if (!accountId || !accountRole) {
      return NextResponse.json(
        { error: 'معرف الحساب والدور مطلوبان' },
        { status: 400 }
      )
    }

    // Validate the role is a known role
    const validRoles = Object.keys(ACCOUNT_ROLES) as AccountRoleKey[]
    if (!validRoles.includes(accountRole as AccountRoleKey)) {
      return NextResponse.json(
        { error: `دور الحساب غير صالح: ${accountRole}. الأدوار المسموحة: ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the account exists
    const account = await db.account.findUnique({
      where: { id: accountId },
    })

    if (!account) {
      return NextResponse.json(
        { error: 'الحساب غير موجود' },
        { status: 404 }
      )
    }

    // Update the account's role
    const updated = await db.account.update({
      where: { id: accountId },
      data: { accountRole },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        type: true,
        accountRole: true,
        isActive: true,
        allowPosting: true,
      },
    })

    return NextResponse.json({
      message: 'تم تحديث ربط الحساب بنجاح',
      account: updated,
    })
  } catch (error) {
    console.error('Error updating role-account mapping:', error)
    return NextResponse.json(
      { error: 'فشل في تحديث ربط الحساب بالدور' },
      { status: 500 }
    )
  }
}

// ============================================================================
// POST /api/accounts/role-mapping
// Validates that all required roles have accounts mapped
// Returns a list of unmapped roles with Arabic error messages
// ============================================================================
export async function POST() {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const mappings = await getRoleAccountMapping()
    const unmappedRoles = mappings.filter(
      (m) => !m.primaryAccount || m.accounts.length === 0
    )

    const isValid = unmappedRoles.length === 0

    const unmappedDetails = unmappedRoles.map((m) => ({
      role: m.role,
      labelAr: m.labelAr,
      labelEn: m.labelEn,
      description: m.description,
      defaultCodes: m.defaultCodes,
      error: `لا يوجد حساب مرتبط بدور "${m.labelAr}" (${m.role}). يرجى ربط حساب بهذا الدور من شاشة دليل الحسابات.`,
    }))

    return NextResponse.json({
      isValid,
      totalRoles: mappings.length,
      mappedCount: mappings.length - unmappedRoles.length,
      unmappedCount: unmappedRoles.length,
      unmappedRoles: unmappedDetails,
      message: isValid
        ? 'جميع الأدوار مرتبطة بحسابات'
        : `${unmappedRoles.length} دور غير مرتبط بحساب. يرجى ربط الحسابات المطلوبة.`,
    })
  } catch (error) {
    console.error('Error validating role-account mappings:', error)
    return NextResponse.json(
      { error: 'فشل في التحقق من ربط الأدوار بالحسابات' },
      { status: 500 }
    )
  }
}
