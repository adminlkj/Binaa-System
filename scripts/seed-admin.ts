// ============================================================================
// سكربت إنشاء المدير الافتراضي (seed-admin)
// ============================================================================
//
// التشغيل:  bun run scripts/seed-admin.ts
//
// ينشئ مستخدم ADMIN افتراضي إن لم يوجد أي مدير. البيانات:
//   username : admin
//   email    : admin@binaa.local
//   password : من DEFAULT_ADMIN_PASSWORD env أو Admin@123 (افتراضي)
//   role     : ADMIN
//
// يجب تغيير كلمة المرور الافتراضية فور أول تسجيل دخول في الإنتاج.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  const existingAdmin = await db.user.findFirst({
    where: { role: 'ADMIN' },
  })

  if (existingAdmin) {
    console.log('✓ يوجد مدير بالفعل:', existingAdmin.username, '(' + existingAdmin.email + ')')
    console.log('  لم يتم إنشاء مدير جديد. لتغيير كلمة المرور استخدم سكربت آخر.')
    return
  }

  const username = 'admin'
  const email = 'admin@binaa.local'
  const name = 'مدير النظام'
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123'

  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await db.user.create({
    data: {
      username,
      email,
      name,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✓ تم إنشاء المدير الافتراضي بنجاح')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  اسم المستخدم : ' + admin.username)
  console.log('  البريد       : ' + admin.email)
  console.log('  الاسم        : ' + admin.name)
  console.log('  الصلاحية     : ' + admin.role)
  console.log('  كلمة المرور  : ' + password)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  غيّر كلمة المرور فوراً بعد أول تسجيل دخول في الإنتاج.')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('✗ خطأ:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
