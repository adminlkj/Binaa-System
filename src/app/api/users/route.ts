// ============================================================================
// إدارة المستخدمين — /api/users
// ============================================================================
// العمليات: GET (قائمة), POST (إنشاء)
// الصلاحية: ADMIN فقط
// حماية خاصة: حسابا admin و developer دائمان — لا يمكن حذفهما أو تغيير دورهما

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRoleApi } from '@/lib/auth-helpers'

// أسماء المستخدمين المحمية من الحذف/تغيير الدور
const PROTECTED_USERNAMES = ['admin', 'developer']

export async function GET() {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
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

  return NextResponse.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      isProtected: PROTECTED_USERNAMES.includes(u.username),
    })),
  })
}

export async function POST(request: Request) {
  const { response } = await requireRoleApi('ADMIN')
  if (response) return response

  try {
    const body = await request.json()
    const { username, email, name, password, role, isActive } = body

    // التحقق من البيانات المطلوبة
    if (!username || !email || !name || !password) {
      return NextResponse.json(
        { success: false, error: 'الحقول المطلوبة: اسم المستخدم، البريد، الاسم، كلمة المرور' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 }
      )
    }

    const validRoles = ['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER']
    const userRole = role || 'VIEWER'
    if (!validRoles.includes(userRole)) {
      return NextResponse.json(
        { success: false, error: 'صلاحية غير صالحة' },
        { status: 400 }
      )
    }

    // التحقق من عدم تكرار اسم المستخدم أو البريد
    const existing = await db.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'اسم المستخدم أو البريد مستخدم بالفعل' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await db.user.create({
      data: {
        username,
        email,
        name,
        passwordHash,
        role: userRole,
        isActive: isActive !== false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, data: user }, { status: 201 })
  } catch (err) {
    console.error('[USERS] POST error:', err)
    return NextResponse.json(
      { success: false, error: 'فشل إنشاء المستخدم' },
      { status: 500 }
    )
  }
}
