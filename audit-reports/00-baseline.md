# تقرير خط الأساس - المرحلة 0

**التاريخ:** 2025-01-XX
**الفرع:** audit/accounting-engine
**قاعدة بيانات خط الأساس:** db/audit-baseline.db (نسخة احتياطية)

## ملخص الفحص الأولي

| الفحص | النتيجة |
|-------|---------|
| ESLint | ✅ نظيف (0 أخطاء) |
| TypeScript (tsc --noEmit) | ❌ 314 خطأ في src/ |
| عدد مسارات API | 174 |
| عدد وحدات الواجهة | 48 |
| عدد نماذج Prisma | ~75 |
| حجم schema.prisma | 2731 سطر |

## تصنيف أخطاء TypeScript حسب النوع

| كود الخطأ | العدد | الوصف |
|-----------|-------|-------|
| TS2365 | 62 | عامل حسابي على أنواع غير متوافقة (Decimal + number) |
| TS2322 | 51 | تعيين نوع غير متوافق |
| TS2345 | 39 | وسيط بنوع غير متوافق |
| TS2554 | 37 | عدد وسائط دالة خاطئ |
| TS2339 | 36 | خاصية غير موجودة على النوع |
| TS2363 | 26 | الجانب الأيمن من عملية حسابية ليس number |
| TS2362 | 24 | نتيجة حسابية ليست number |
| TS2353 | 12 | خاصية غير معروفة في object literal |
| TS18046 | 10 | المتغير من نوع unknown |
| أخرى | 17 | متنوعة |

## توزيع الأخطاء حسب الدليل

| الدليل | عدد الأخطاء |
|--------|-------------|
| src/app/api | 198 |
| src/components/modules | 46 |
| src/lib/business-flow | 25 |
| src/lib/accounting | 11 |
| src/components/sections | 8 |
| src/components/shared | 7 |
| src/components/layout | 4 |
| src/printing | 2 |
| src/lib/financial-mapping-engine.ts | 1 |
| src/lib/account-impact.ts | 1 |
| src/lib/account-roles.ts | 1 |

## الأنماط المتكررة الخطيرة

1. **Decimal vs number (TS2365/TS2363/TS2362):** ~112 خطأ — استخدام حقول Prisma Decimal مباشرة في حسابات number. قد يسبب أخطاء وقت التشغيل عند الحدود (precision loss, NaN).

2. **Property 'where' does not exist on select (TS2339):** كود يمرر `select: { where: {...} }` بدلاً من البنية الصحيحة — خطأ منطقي يسبب نتائج خاطئة صامتة.

3. **Arg count mismatch (TS2554):** 37 خطأ — دوال تُستدعى بعدد وسائط خاطئ. بعضها في accounting.tsx (محرّك القيود!).

4. **Property does not exist (TS2339):** 36 خطأ — وصول لخصائص غير موجودة على الأنواع (مثل totalEarnings على Salary).

## ملفات خط الأساس

- `audit-reports/00-baseline.md` — هذا التقرير
- `audit-reports/baseline-tsc-errors.txt` — قائمة كاملة بأخطاء TypeScript
- `db/audit-baseline.db` — نسخة احتياطية من قاعدة البيانات

## الخطوة التالية

المرحلة 1: الفحص العميق للمحرك المحاسبي (Accounting Engine).
