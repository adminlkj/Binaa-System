# Task 2-d: إصلاح HR + المشتريات + الأصول

## ملخص التنفيذ

تم إصلاح 6 ملفات API routes لإزالة القيود المحاسبية المزدوجة وإضافة وظائف مفقودة.

## الملفات المُعدلة

### 1. `/src/app/api/salaries/route.ts`
- **استبدال** `autoEntryExpense` بـ `autoEntrySalary` عند الاعتماد
- **إضافة** `autoEntryGOSI` بحصة صاحب العمل (10.75%) وحصة الموظف (10%)
- **إضافة** مسار PUT لتحديث الحالة:
  - DRAFT→APPROVED: إنشاء قيد المصروف + GOSI
  - APPROVED→PAID: إنشاء قيد سداد فقط (Dr مستحقة / Cr صندوق)

### 2. `/src/app/api/supplier-invoices/route.ts`
- **حذف** `createPurchaseInvoiceJournalEntry` من POST
- القيد يُنشأ فقط عند DRAFT→SENT في PUT handler

### 3. `/src/app/api/purchase-invoices/route.ts`
- **حذف** `createPurchaseInvoiceJournalEntry` من POST
- القيد يُنشأ فقط عند تحديث الحالة

### 4. `/src/app/api/fixed-assets/route.ts`
- **إضافة** PATCH endpoint لبيع/تخلص من أصل
- استخدام `autoEntryAssetDisposal` من engine.ts
- التحقق من حالة الأصل والحسابات المحاسبية
- لف العملية في `$transaction`

### 5. `/src/app/api/fixed-assets/depreciate/route.ts`
- **إضافة** تحقق من الفترة المالية قبل تسجيل الإهلاك
- إذا كانت الفترة CLOSED → خطأ 400

## الدوال المستخدمة من engine.ts
- `autoEntrySalary` - قيد مصروف الرواتب
- `autoEntryGOSI` - قيد التأمينات الاجتماعية
- `autoEntryAssetDisposal` - قيد التخلص من أصل
- `createJournalEntry` - إنشاء قيد يدوي (لسداد الرواتب)
- `PrismaTransaction` - نوع المعاملة

## النتيجة
- ✅ ESLint: لا أخطاء
- ✅ Dev server يعمل بشكل طبيعي
