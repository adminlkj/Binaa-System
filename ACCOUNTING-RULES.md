# القواعد المحاسبية غير القابلة للكسر — Binaa ERP
# Unbreakable Accounting Rules

هذه القواعد تُفرض برمجياً في `src/lib/accounting/guard.ts` ولا يمكن تجاوزها
تحت أي ظرف، حتى لو تغيّر المودل أو الـ schema أو الكود. أي محاولة لكسرها
تُرفض بـ `AccountingGuardError` وتُدحرج الـ transaction.

---

## القواعد الـ 12 الذهبية (R1-R12)

### R1: كل عملية مالية MUST تنشئ قيد يومية مرحّل
- لا توجد عملية مالية في النظام بدون قيد
- كل قيد يُنشأ بحالة `POSTED` فوراً
- لا يجوز حفظ قيد بحالة `DRAFT` إلا عبر واجهة القيود اليدوية الصريحة

### R2: كل قيد MUST يكون متوازن
- `Σ(debit) == Σ(credit)` ضمن 0.01
- أي فرق > 0.01 → `NOT_BALANCED` error
- لا يمكن ترحيل قيد غير متوازن نهائياً

### R3: كل قيد MUST له ≥ 2 بنود
- قيد ببند واحد ممنوع (`MIN_LINES` error)
- القيد المركب (متعدد البنود) هو المعيار

### R4: كل بند MUST له حساب نشط يسمح بالترحيل
- الحساب يجب أن يكون `isActive = true`
- الحساب يجب أن يكون `allowPosting = true` (ليس حساباً أب/رأسياً)
- الحسابات الرأسية (مثل 1000, 1100, 3000) لا تقبل الترحيل

### R5: كل بند MUST له قيمة في جهة واحدة فقط
- إما `debit > 0` و `credit = 0`
- أو `credit > 0` و `debit = 0`
- كلاهما > 0 → `LINE_BOTH_SIDES` error
- كلاهما = 0 → `LINE_ZERO` error
- قيم سالبة → `LINE_NEGATIVE` error

### R6: كل قيد MUST له تاريخ في فترة مفتوحة
- `assertPeriodOpen(date)` تتحقق من:
  - FiscalYear.status !== 'CLOSED'
  - لا PeriodClosing record بحالة CLOSED لتلك الفترة
- الاستثناء: قيود الإقفال نفسها (`skipPeriodGuard: true`)

### R7: كل قيد MUST له رقم فريد
- `entryNo` هو `@unique` في الـ schema
- الحارس يتحقق من عدم التكرار قبل الإنشاء
- `getNextEntryNo()` يولّد الرقم التسلسلي (JE-NNNNNN)

### R8: كل حساب MUST له نوع صحيح
- الأنواع المسموحة: `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE`
- أي نوع آخر → `INVALID_ACCOUNT_TYPE` error

### R9: المصدر الوحيد للحقيقة في كل التقارير
- جميع التقارير تقرأ من: `JournalLine WHERE journalEntry.status='POSTED' AND deletedAt IS NULL`
- لا يجوز لأي تقرير أن يجمع الأرقام من الجداول التشغيلية مباشرةً
- الدالة `postedLinesWhere()` في `report-engine.ts` هي نقطة الإفراض الموحدة

### R10: ميزان المراجعة
- `netDebit = max(0, debit - credit)` لكل حساب
- `netCredit = max(0, credit - debit)` لكل حساب
- `isBalanced = |Σ(totalDebit) - Σ(totalCredit)| < 0.01`
- الأصول/المصروفات → عمود المدين (عندما debit > credit)
- الخصوم/حقوق الملكية/الإيرادات → عمود الدائن (عندما credit > debit)

### R11: المعادلة المحاسبية
- `الأصول = الخصوم + حقوق الملكية`
- حقوق الملكية = رأس المال + الأرباح المحتجزة + أرباح السنة الحالية
- أرباح السنة الحالية = الإيرادات - المصروفات
- `signForType`:
  - ASSET/EXPENSE → `+(debit - credit)`
  - LIABILITY/EQUITY/REVENUE → `-(debit - credit)` = `(credit - debit)`

### R12: لا يمكن حذف قيد مرحّل — فقط عكسه
- `reverseJournalEntry()` تنشئ قيداً عكسياً ببنود معكوسة
- القيد الأصلي يبقى `POSTED` (لا يُلغى)
- القيد العكسي يُوسم بـ `isReversal = true` و `reversedEntryId = original.id`
- القيدان Netoutan في الميزان إلى صفر
- لا يمكن عكس قيد غير مرحّل
- لا يمكن عكس قيد عكسي بالفعل

---

## نقاط الإفراض الموحدة

### 1. `postJournalEntry(input, tx?)` — الإنشاء
- النقطة الوحيدة لإنشاء قيد مرحّل
- تستدعي `assertJournalEntryValid()` ثم تنشئ
- كل دوال `auto-journal.ts` و `createJournalEntry` في `engine.ts` تمرّ عبرها
- كل APIs (journal-entries, fixed-assets, provisions, period-closing) تمرّ عبرها

### 2. `reverseJournalEntry(entryId, tx?, reason?)` — العكس
- النقطة الوحيدة لعكس قيد
- تنشئ قيداً عكسياً عبر `postJournalEntry`
- تربط القيدين عبر `reversedEntryId`

### 3. `assertJournalEntryValid(input, tx?)` — التحقق
- تُفرض كل القواعد R1-R8 هنا
- يمكن استدعاؤها مستقلةً للتحقق قبل الإنشاء

### 4. `accountingHealthCheck()` — الفحص
- تتحقق من R2, R5, R9, R10, R11 على البيانات الفعلية
- مكشوفة عبر `GET /api/accounting-guard/health`
- تُعرض على لوحة التحكم

---

## المحظورات المطلقة (لا تُكسر أبداً)

1. **لا** تستدعي `db.journalEntry.create()` مباشرةً — استخدم `postJournalEntry()`
2. **لا** تجمع الأرقام من الجداول التشغيلية في التقارير — اقرأ من القيود المرحّلة فقط
3. **لا** تستخدم أكواد حسابات hardcoded — استخدم `getDefaultAccountByRole()`
4. **لا** تعدّل `status` لقيد إلى `POSTED` يدوياً — `postJournalEntry` يفعل ذلك
5. **لا** تحذف قيداً مرحّلاً — اعكسه عبر `reverseJournalEntry()`
6. **لا** تنشئ بنداً له مدين ودائن معاً — جهة واحدة فقط
7. **لا** تتجاوز فحص الفترة المفتوحة — إلا لقيود الإقفال نفسها (`skipPeriodGuard`)

---

## خريطة الملفات

| الملف | الدور |
|------|------|
| `src/lib/accounting/guard.ts` | **الحارس** — نقطة الإفراض الموحدة (R1-R12) |
| `src/lib/accounting/engine.ts` | المحرك — `createJournalEntry` و `reverseEntry` (proxies للحارس) |
| `src/lib/accounting/period-guard.ts` | حارس الفترات — `assertPeriodOpen` (R6) |
| `src/lib/auto-journal.ts` | الإنشاء التلقائي — 6 دوال تمرّ عبر الحارس |
| `src/lib/report-engine.ts` | محرك التقارير — يقرأ من القيود المرحّلة فقط (R9) |
| `src/lib/account-roles.ts` | أدوار الحسابات — حل الأدوار بدل الأكواد |
| `src/app/api/accounting-guard/health/route.ts` | API فحص السلامة |

---

## التحقق المستمر

- `bun scripts/audit-db.ts` — تدقيق شامل لقاعدة البيانات
- `GET /api/accounting-guard/health` — فحص السلامة عبر HTTP
- `bun run lint` — فحص جودة الكود
- جميعها يجب أن تمر بنجاح قبل أي إطلاق
