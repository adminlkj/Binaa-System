// ============================================================================
// Helpers للمصادقة والصلاحيات — تُستخدم في API route handlers
// ============================================================================
//
// أنماط الاستخدام:
//
//   // حماية endpoint لأي مستخدم مسجل:
//   const { user, response } = await requireAuthApi()
//   if (response) return response
//   // ... user.id متاح الآن
//
//   // حماية endpoint لصلاحية معينة:
//   const { user, response } = await requireRoleApi('ADMIN')
//   if (response) return response
//   // ... user.role === 'ADMIN' مضمون
//
//   // حماية لعدة صلاحيات:
//   const { user, response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
//   if (response) return response

import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export type SessionUser = {
  id: string
  username: string
  email: string
  name: string
  role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'
}

/** يرجع المستخدم الحالي أو null (للاستخدام في server components) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session.user as SessionUser
}

type Role = 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'

type AuthResult =
  | { user: SessionUser; response: null }
  | { user: null; response: NextResponse }

/** لأي مستخدم مسجل دخوله — يرجع 401 إن لم يسجل */
export async function requireAuthApi(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'غير مصرح — يرجى تسجيل الدخول', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    }
  }
  return { user, response: null }
}

/** لصلاحيات محددة — يرجع 401 (غير مسجل) أو 403 (مسجل لكن بلا صلاحية) */
export async function requireRoleApi(...roles: Role[]): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, error: 'غير مصرح — يرجى تسجيل الدخول', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    }
  }
  if (!roles.includes(user.role)) {
    return {
      user: null,
      response: NextResponse.json(
        {
          success: false,
          error: 'ممنوع — لا تملك الصلاحية لهذه العملية',
          code: 'FORBIDDEN',
          required: roles,
          current: user.role,
        },
        { status: 403 }
      ),
    }
  }
  return { user, response: null }
}
