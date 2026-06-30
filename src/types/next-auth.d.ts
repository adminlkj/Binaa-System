// NextAuth type augmentation — يضيف حقول المستخدم المخصصة (role, username, id)
// إلى جلسة JWT والـ session object المستخدم في client و server

import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'
    } & DefaultSession['user']
  }

  interface User {
    id: string
    username: string
    role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'
  }
}
