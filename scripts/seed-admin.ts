// ============================================================================
// سكربت إنشاء الحسابات الدائمة (seed-accounts)
// ============================================================================
//
// التشغيل:  bun run scripts/seed-admin.ts
//
// ينشئ حسابين دائمين إن لم يكونا موجودين:
//
//   1) حساب المدير (ADMIN) — لإدارة النظام
//      username : admin
//      email    : admin@binaa.local
//      password : من DEFAULT_ADMIN_PASSWORD env أو Admin@123 (افتراضي)
//      role     : ADMIN
//
//   2) حساب المطوّر (DEVELOPER) — للصيانة والتشخيص (يُضاف كـ ADMIN)
//      username : developer
//      email    : developer@binaa.local
//      password : من DEFAULT_DEVELOPER_PASSWORD env أو Dev@Binaa2026! (افتراضي)
//      role     : ADMIN
//
// كلا الحسابين دائمان ولا يمكن حذفهما من الواجهة (يُحمَيان عبر علامة username).
// يجب تغيير كلمات المرور الافتراضية فور أول تسجيل دخول في الإنتاج عبر شاشة
// إدارة المستخدمين.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function ensureUser(opts: {
  username: string
  email: string
  name: string
  passwordEnv: string
  defaultPassword: string
  role: 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'
}) {
  const existing = await db.user.findUnique({
    where: { username: opts.username },
  })

  if (existing) {
    console.log(`✓ يوجد بالفعل: ${existing.username} (${existing.email}) — ${existing.role}`)
    return existing
  }

  const password = process.env[opts.passwordEnv] || opts.defaultPassword
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await db.user.create({
    data: {
      username: opts.username,
      email: opts.email,
      name: opts.name,
      passwordHash,
      role: opts.role,
      isActive: true,
    },
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✓ تم إنشاء الحساب: ${user.username}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  اسم المستخدم : ${user.username}`)
  console.log(`  البريد       : ${user.email}`)
  console.log(`  الاسم        : ${user.name}`)
  console.log(`  الصلاحية     : ${user.role}`)
  console.log(`  كلمة المرور  : ${password}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  return user
}

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   تهيئة الحسابات الدائمة — نظام بِنَاء   ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // 1) حساب المدير الدائم
  await ensureUser({
    username: 'admin',
    email: 'admin@binaa.local',
    name: 'مدير النظام',
    passwordEnv: 'DEFAULT_ADMIN_PASSWORD',
    defaultPassword: 'Admin@123',
    role: 'ADMIN',
  })

  console.log('')

  // 2) حساب المطوّر الدائم
  await ensureUser({
    username: 'developer',
    email: 'developer@binaa.local',
    name: 'مطوّر النظام',
    passwordEnv: 'DEFAULT_DEVELOPER_PASSWORD',
    defaultPassword: 'Dev@Binaa2026!',
    role: 'ADMIN',
  })

  console.log('\n⚠️  غيّر كلمات المرور الافتراضية فوراً بعد أول تسجيل دخول في الإنتاج')
  console.log('   عبر شاشة إدارة المستخدمين في النظام.\n')
}

main()
  .catch((e) => {
    console.error('✗ خطأ:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
