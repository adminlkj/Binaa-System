// ============================================================================
// Middleware العام — حماية كل المسارات (الحاجز الأول للأمان)
// ============================================================================
//
// هذا هو خط الدفاع الأول: يحمي كل /api/* وكل الصفحات.
// - إن لم يوجد token: API → 401 JSON، الصفحات → redirect إلى /login
// - الصلاحيات الدقيقة (ADMIN/ACCOUNTANT/...) تُفحص في route handlers
//   عبر requireRoleApi() من src/lib/auth-helpers.ts
//
// مسارات عامة (لا تتطلب مصادقة):
//   /api/auth/*      — معالجات NextAuth
//   /api/health      — فحص صحة الخدمة
//   /login           — صفحة الدخول
//   /_next/*         — أصول Next.js
//   الملفقات الثابتة  — svg, png, jpg, ico, إلخ

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// المسارات التي لا تتطلب مصادقة
const PUBLIC_PREFIXES = ['/api/auth', '/api/health', '/login']
const PUBLIC_ASSET_PREFIXES = ['/_next', '/favicon']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1) اسمح بالمسارات العامة
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 2) اسمح بالأصول الثابتة
  if (PUBLIC_ASSET_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 3) استخرج الـ JWT token
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // 4) إن لم يسجل الدخول
  if (!token) {
    // API routes → 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح — يرجى تسجيل الدخول', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    // الصفحات → redirect إلى /login مع callbackUrl
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 5) مسجل الدخول — اسمح بالمرور
  return NextResponse.next()
}

export const config = {
  // طابق كل شيء إلا الأصول الثابتة المعروفة
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
}
