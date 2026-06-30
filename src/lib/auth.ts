// ============================================================================
// نظام بِنَاء ERP — مصدر إعداد NextAuth الوحيد
// Single Source of Truth للمصادقة: Credentials Provider + JWT Strategy
// ============================================================================
//
// الاستراتيجية:
// - JWT strategy (لا حاجة لـ Session/Account models في DB — يتجنب تعارض اسم
//   Account مع نموذج دليل الحسابات الموجود مسبقاً)
// - Credentials Provider: username + password (bcrypt)
// - الـ token يحمل: id, username, role, name, email
// - الصلاحيات تُفحص في route handlers عبر requireRoleApi()
// - الحماية العامة في middleware.ts (يحمي كل /api/* وكل الصفحات)

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    // 8 ساعات — الجلسة تنتهي خلال يوم العمل
    maxAge: 8 * 60 * 60,
  },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'اسم المستخدم', type: 'text' },
        password: { label: 'كلمة المرور', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        try {
          const user = await db.user.findUnique({
            where: { username: credentials.username },
          })

          // لا نكشف ما إذا كان المستخدم غير موجود vs كلمة المرور خاطئة
          if (!user || !user.isActive) {
            return null
          }

          const valid = await bcrypt.compare(credentials.password, user.passwordHash)
          if (!valid) {
            return null
          }

          // تسجيل آخر دخول
          await db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })

          return {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        } catch (err) {
          console.error('[AUTH] authorize error:', err)
          return null
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // عند أول تسجيل دخول: user موجود → نضيف الحقول للـ token
      if (user) {
        token.id = user.id
        token.username = user.username
        token.role = user.role
      }
      return token
    },

    async session({ session, token }) {
      // نمرر الحقول من الـ token إلى الـ session المتاحة في client
      if (session.user) {
        session.user.id = token.id
        session.user.username = token.username
        session.user.role = token.role
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}
