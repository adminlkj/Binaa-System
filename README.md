# نظام بِنَاء — Binaa System ERP

نظام تخطيط موارد مؤسسات (ERP) متخصص في شركات المقاولات والتأجير، مصمم للسوق السعودي (ZATCA + GOSI + ضريبة 15% + الريال السعودي).

**تطبيق ويب فقط** (Next.js standalone) — لا مكونات سطح مكتب.

---

## 🛠️ التقنيات المستخدمة

| الطبقة | التقنية |
|---|---|
| Framework | Next.js 16 (App Router, standalone output) |
| Runtime | Node.js 20 |
| Language | TypeScript 5 |
| Database | PostgreSQL (الإنتاج) / SQLite (التطوير) |
| ORM | Prisma 6 |
| Auth | NextAuth.js v4 (JWT sessions) |
| UI | React 19 + shadcn/ui + Tailwind CSS 4 |
| State | Zustand (client) + TanStack Query (server) |
| Charts | recharts |
| Fonts | Cairo (Arabic + Latin) |

---

## 🚀 النشر على Render

### المتطلبات
- حساب على [Render.com](https://render.com)
- مستودع GitHub مرتبط

### الخطوات
1. اربط المستودع بـ Render
2. سيكتشف Render ملف `render.yaml` تلقائياً (Blueprint)
3. سيُنشئ:
   - **Web Service**: تطبيق Next.js (plan: starter, region: singapore)
   - **PostgreSQL Database**: قاعدة بيانات (plan: starter)
4. اضبط متغيرات البيئة في لوحة Render:
   - `DEFAULT_ADMIN_PASSWORD`: كلمة مرور المدير (ضروري قبل أول نشر)
5. اضغط **Deploy**

### البناء (buildCommand)
```bash
bun install --frozen-lockfile
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
bunx prisma generate
bunx prisma migrate deploy      # آمن — لا يُسقط بيانات
bun scripts/seed-admin.ts       # مستخدم admin + developer
bun scripts/seed-coa.ts         # دليل الحسابات + الربط المحاسبي
bun run build
```

### التشغيل (startCommand)
```bash
NODE_ENV=production node .next/standalone/server.js
```

### Health Check
- المسار: `/api/health`
- يتحقق من اتصال قاعدة البيانات

---

## 🔐 الأمان

- **RBAC**: كل مسارات API محمية (`requireAuthApi` للقراءة، `requireRoleApi` للكتابة)
- **XSS Prevention**: `escapeHtml` على كل مدخلات المستخدم في الطباعة
- **Security Headers**: CSP, HSTS, X-Frame-Options: DENY, nosniff, Referrer-Policy
- **Rate Limiting**: تسجيل دخول (10/15د) + API (100/د)
- **POSTED Immutability**: القيود المرحَّلة لا تُحذف — تُعكس فقط
- **Idempotency Indexes**: منع الترحيل المزدوج + العكس المزدوج

---

## 📊 المحاسبة

- **Single Source of Truth**: كل التقارير تقرأ من `JournalLine WHERE status='POSTED'`
- **12 Golden Rules** (R1-R12) مُطبَّقة في `src/lib/accounting/guard.ts`
- **Dynamic Account Selection**: Account → Role → Usage Properties → Module
- **IFRS 15**: نسبة الإنجاز (Cost-to-Cost POC)
- **VAT**: ZATCA Phase 1 QR + إقرارات ربع سنوية
- **Fiscal Year Closing**: محرك إقفال ذري مع عكس

---

## 🧪 الاختبارات

```bash
# اختبارات السلوك المحاسبي (21 سيناريو)
bun run test:accounting

# التحقق من الاتساق العددي (I1-I7)
bun run verify:engine

# اختبار سلامة المحاسبة الشامل (29 تأكيد)
bun scripts/e2e-accounting-integrity-test.ts

# اختبارات الدورات السبع (357 تأكيد)
bun scripts/e2e-construction-cycle.ts
bun scripts/e2e-rental-cycle.ts
bun scripts/e2e-purchase-cycle.ts
bun scripts/e2e-payroll-cycle.ts
bun scripts/e2e-fixed-assets-cycle.ts
bun scripts/e2e-vat-cycle.ts
bun scripts/e2e-closing-cycle.ts

# اختبار القبول الإنتاجي المتكامل (70 تأكيد)
bun scripts/e2e-production-acceptance.ts
```

**الإجمالي: 477 تأكيد E2E + 21 اختبار سلوكي**

---

## 📚 الوثائق

- `ACCOUNTING-RULES.md` — القواعد الذهبية R1-R12
- `docs/WORKFLOW-CONSTRUCTION-CYCLE.md` — دورة المشروع
- `docs/WORKFLOW-RENTAL-CYCLE.md` — دورة التأجير
- `docs/WORKFLOW-PURCHASE-CYCLE.md` — دورة المشتريات
- `docs/WORKFLOW-PAYROLL-CYCLE.md` — دورة الرواتب
- `docs/WORKFLOW-FIXED-ASSETS-CYCLE.md` — دورة الأصول
- `docs/WORKFLOW-VAT-CYCLE.md` — دورة VAT
- `docs/WORKFLOW-CLOSING-CYCLE.md` — دورة الإقفال

---

## 🧑‍💻 التطوير المحلي

```bash
# تثبيت الاعتماديات
bun install

# إعداد قاعدة البيانات
cp .env.example .env
bun run db:push
bun scripts/seed-admin.ts    # admin / Admin@123
bun scripts/seed-coa.ts      # دليل الحسابات

# تشغيل خادم التطوير
bun run dev

# فحص الكود
bun run lint
bun run typecheck
```

---

## 📄 الترخيص

خاص — جميع الحقوق محفوظة.
