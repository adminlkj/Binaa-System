// ============================================================================
// إدارة مستخدم فردي — /api/users/[id]
// ============================================================================
// العمليات: PATCH (تحديث), DELETE (حذف)
// الصلاحية: ADMIN فقط
// حماية خاصة: حسابا admin و developer دائمان — لا يمكن حذفهما أو إلغاء تفعيلهما
// أو تغيير دورهما. يمكن تغيير كلمة مرورهما فقط.

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRoleApi } from '@/lib/auth-helpers'

const PROTECTED_USERNAMES = ['admin', 'developer']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  const { id } = await params

  try {
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    const isProtected = PROTECTED_USERNAMES.includes(existing.username)
    const body = await request.json()
    const { username, email, name, password, role, isActive } = body

    // حماية الحسابات الدائمة: لا يمكن تغيير الدور أو الإلغاء
    if (isProtected) {
      if (role !== undefined && role !== existing.role) {
        return NextResponse.json(
          { success: false, error: `لا يمكن تغيير صلاحية الحساب الدائم (${existing.username})` },
          { status: 403 }
        )
      }
      if (isActive === false) {
        return NextResponse.json(
          { success: false, error: `لا يمكن إلغاء تفعيل الحساب الدائم (${existing.username})` },
          { status: 403 }
        )
      }
      // لا يمكن تغيير اسم المستخدم للحساب الدائم
      if (username !== undefined && username !== existing.username) {
        return NextResponse.json(
          { success: false, error: `لا يمكن تغيير اسم المستخدم للحساب الدائم (${existing.username})` },
          { status: 403 }
        )
      }
    }

    // التحقق من التكرار عند تغيير username/email
    if ((username && username !== existing.username) || (email && email !== existing.email)) {
      const conflict = await db.user.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                ...(username ? [{ username }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
          ],
        },
      })
      if (conflict) {
        return NextResponse.json(
          { success: false, error: 'اسم المستخدم أو البريد مستخدم بالفعل' },
          { status: 409 }
        )
      }
    }

    // بناء بيانات التحديث
    const updateData: Record<string, unknown> = {}
    if (username !== undefined) updateData.username = username
    if (email !== undefined) updateData.email = email
    if (name !== undefined) updateData.name = name
    if (role !== undefined) {
      const validRoles = ['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER']
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { success: false, error: 'صلاحية غير صالحة' },
          { status: 400 }
        )
      }
      updateData.role = role
    }
    if (isActive !== undefined) updateData.isActive = isActive

    // تغيير كلمة المرور إن وُجدت
    if (password !== undefined && password !== '') {
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
          { status: 400 }
        )
      }
      updateData.passwordHash = await bcrypt.hash(password, 10)
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[USERS] PATCH error:', err)
    return NextResponse.json(
      { success: false, error: 'فشل تحديث المستخدم' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  const { id } = await params

  try {
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    // الحسابات الدائمة لا يمكن حذفها
    if (PROTECTED_USERNAMES.includes(existing.username)) {
      return NextResponse.json(
        { success: false, error: `لا يمكن حذف الحساب الدائم (${existing.username})` },
        { status: 403 }
      )
    }

    await db.user.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[USERS] DELETE error:', err)
    return NextResponse.json(
      { success: false, error: 'فشل حذف المستخدم' },
      { status: 500 }
    )
  }
}
