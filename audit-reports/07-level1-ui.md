# Level 1 — UI Audit Report

Generated: 2026-06-28 21:10 UTC
Scope: 47 files in `src/components/modules/` (40,274 LOC total)
Methodology: read-only static audit — every issue cites file path + line numbers actually read; cross-layer check spot-verified 5 modules against their `/api/<module>/route.ts` files.

## Summary

- Total issues: **48** (CRITICAL: 6, HIGH: 16, MEDIUM: 17, LOW: 9)
- Modules audited: **47/47** (41 reachable via sidebar; 6 orphaned — `purchases.tsx`, `labor.tsx`, `petty-cash.tsx`, `salary-payments.tsx`, `advances.tsx`, `service-invoices.tsx` — never rendered via `moduleMap` in `src/app/page.tsx`)
- Cross-layer inconsistencies found: **0/5** spot-checked modules had field-name mismatches; **1** button-vs-verb inconsistency found in `payroll-runs.tsx` (button "اعتماد" implies simple approval but actually creates accrual JE — text is honest, just under-explains side-effect)

Phases 1–6 (per `worklog.md` last 600 lines) fixed accounting/engine/logic bugs only; **none of the issues below overlap with prior phases** because Phase 1–6 did not touch UI text/labels/layout.

---

## Issues

### L1-CRIT-001: Six modules exist but are unreachable from the sidebar (orphaned code)
- **Module**: `src/components/modules/{purchases,labor,petty-cash,salary-payments,advances,service-invoices}.tsx`
- **Lines**: `src/app/page.tsx:80-129` (moduleMap) — these 6 files are never imported
- **Dimension**: 1 (page title / reachability)
- **Problem**: ست وحدات (المشتريات، تكاليف العمالة، الصندوق النقدي، سداد الرواتب، السلف، فواتير الخدمات) مبنية بالكامل لكنها غير مسجَّلة في `moduleMap` بـ `src/app/page.tsx` ولا تظهر في أي عنصر من عناصر القائمة الجانبية. المستخدم لا يستطيع الوصول إليها إطلاقاً من الواجهة.
- **Evidence**: `moduleMap` في `src/app/page.tsx:80-129` يحتوي على 41 عنصر NavItem فقط؛ الأسماء `purchases`, `labor`, `petty-cash`, `salary-payments`, `advances`, `service-invoices` غير موجودة في `NavItem` union (`src/stores/app-store.ts:6-22`). كل وحدة لها API route فعلي (`/api/petty-cash`, `/api/labor-costs`, `/api/salary-payments`, `/api/advances`, `/api/sales-invoices`-manual) لكن لا توجد أي طريقة للوصول للواجهة.
- **كيفية التحقق العملي**: `grep -rn "modules/purchases\|modules/labor\|modules/petty-cash\|modules/salary-payments\|modules/advances\|modules/service-invoices" src/app src/components/sections` → صفر نتائج استيراد (باستثناء `service-invoices.tsx` يُستورد محلياً فقط داخل `sales.tsx` كتبويب ثانوي اختياري).
- **Fix recommendation**: إما إضافة عناصر NavItem جديدة وإدراجها في moduleMap، أو حذف الملفات اليتيمة إذا لم تعد ضرورية.

### L1-CRIT-002: `projects.tsx` dialog title Arabic-only — English language toggle broken
- **Module**: `src/components/modules/projects.tsx`
- **Lines**: 342, 343, 366-371, 388-394
- **Dimension**: 7 (translation)
- **Problem**: عنوان الـ dialog ووصفه مكتوبان بالعربية فقط بدون استدعاء `t()`. عند تفعيل اللغة الإنجليزية يبقى النص عربياً. كذلك داخل الـ project-type selector، النص الفرعي بالإنجليزية يظهر حتى في الوضع العربي.
- **Evidence**: 
  - السطر 342: `<DialogTitle>{isEdit ? 'تعديل المشروع' : 'مشروع جديد'}</DialogTitle>` — بدون `t()`
  - السطر 343: `<DialogDescription>{isEdit ? 'تعديل بيانات المشروع' : 'إضافة مشروع جديد للنظام'}</DialogDescription>` — بدون `t()`
  - السطر 369: `<p className="text-xs text-gray-500">{lang === 'ar' ? 'Construction Project' : 'Construction Project'}</p>` — كلا الفرعين إنجليزي!
  - السطر 392: نفس المشكلة للـ EQUIPMENT_RENTAL (`'Equipment Rental Project'` في كلا الفرعين)
- **كيفية التحقق العملي**: `curl -s http://localhost:3000/` ← افتح الموقع ← اضغط زر "English" في الأسفل ← انتقل إلى المشاريع ← اضغط "مشروع جديد" ← عنوان الديالوج سيظل "مشروع جديد" بدلاً من "New Project"، والوصف أسفل "مشروع تنفيذي" سيكون "Construction Project" (إنجليزي) في الوضع العربي.
- **Fix recommendation**: استبدل النصوص الثابتة بـ `t('تعديل المشروع', 'Edit Project', lang)` و `t('مشروع جديد', 'New Project', lang)`، وأصلح الترجمات الفرعية لتكون عربية في الوضع العربي.

### L1-CRIT-003: Two divergent toast systems produce visually different notifications
- **Module**: 15 modules use `sonner` (`vat.tsx:33`, `settings.tsx:5`, `financial-years.tsx:30`, `purchase-orders.tsx:9`, `supplier-invoices.tsx:9`, `reports.tsx:34`, `salary-payments.tsx:9`, `depreciation.tsx:31`, `financial-statements-tab.tsx:25`, `attendance.tsx:9`, `employee-contracts.tsx:9`, `goods-receipt.tsx:9`, `purchase-requests.tsx:9`, `supplier-payments.tsx:9`, `salaries.tsx:9`) vs 7 modules use `useToast` hook (`client-payments.tsx:35`, `accounting.tsx:36`, `rental-payments.tsx:33`, `labor.tsx:30`, `boq.tsx:31`, `inventory.tsx:33`, `petty-cash.tsx:32`)
- **Lines**: as above
- **Dimension**: 6 (messages) + 9 (visual consistency)
- **Problem**: نظامان مختلفان للإشعارات (toasts) يعملان في نفس التطبيق. Sonner يضع الإشعارات في زاوية معينة بنمط معين، بينما `useToast` (shadcn) يضعها في مكان آخر بنمط مختلف. المستخدم يرى نوعين مختلفين من الإشعارات لنفس الحدث (مثلاً حفظ عميل vs حفظ صنف مخزون).
- **Evidence**: 
  - `import { toast } from 'sonner'` في `vat.tsx:33` ثم `toast.success(t('تم إنشاء الإقرار الضريبي بنجاح', ...))` — Sonner
  - `import { useToast } from '@/hooks/use-toast'` في `inventory.tsx:33` ثم `const { toast } = useToast(); toast({ title: t('خطأ', ...), variant: 'destructive' })` — shadcn toast
  - استدعاءات API مختلفة: Sonner يستخدم `toast.success(message)` و `toast.error(message)`، بينما shadcn يستخدم `toast({ title, description, variant })`.
- **كيفية التحقق العملي**: `grep -rn "from 'sonner'" src/components/modules | wc -l` → 15 ; `grep -rn "use-toast" src/components/modules | wc -l` → 7. ثم افتح المتصفح، احفظ صنف مخزون (shadcn toast يظهر) ثم احفظ إقرار ضريبي (Sonner toast يظهر) — موقع/شكل مختلف.
- **Fix recommendation**: وحِّد على نظام واحد (يُفضَّل Sonner لأنه الأحدث في shadcn/ui) في كل الـ 22 وحدة، أو على الأقل استبدل `useToast` بـ Sonner في الـ 7 وحدات المتبقية.

### L1-CRIT-004: `projects.tsx` and `delivery-orders.tsx` skip the shared `ModuleLayout` wrapper
- **Module**: `src/components/modules/projects.tsx`, `src/components/modules/delivery-orders.tsx`
- **Lines**: `projects.tsx:1732-1749` (uses raw `<div className="space-y-6">` + raw `<h1>`); `delivery-orders.tsx:607-627` (same pattern); compare to `clients.tsx:161-173` (uses `<ModuleLayout title=...>`)
- **Dimension**: 9 (responsiveness) + 4 (element ordering)
- **Problem**: 41 من الـ 47 وحدة تستخدم `ModuleLayout` المشترك الذي يوفر padding موحَّد (`p-4 md:p-6`) و header responsive (`flex flex-col sm:flex-row`). وحدتا `projects` و `delivery-orders` لا تستخدمانه، مما يسبب:
  - padding مختلف (لا يوجد `p-4 md:p-6`) — المحتوى يلتصق بحواف الشاشة على الموبايل
  - ترتيب different للـ header (بدون `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`)
  - لا توجد subtitle على الرغم من أن باقي الوحدات تعرضها
- **Evidence**: `grep ModuleLayout src/components/modules/projects.tsx` → 0 نتائج. `grep ModuleLayout src/components/modules/delivery-orders.tsx` → 0 نتائج.
- **كيفية التحقق العملي**: افتح http://localhost:3000/ ← "المشاريع" ← لاحظ أن العنوان "المشاريع" ملتصق بأعلى الشاشة بدون padding. قارن بـ "العملاء" الذي يستخدم ModuleLayout ولاحظ الفرق في الـ padding والـ responsive header.
- **Fix recommendation**: استبدل الـ raw `<div>` + `<h1>` في كلا الوحدتين بـ `<ModuleLayout title=... subtitle=... actions=...>` مطابقاً لباقي الوحدات.

### L1-CRIT-005: `payroll-runs.tsx` page title doesn't match its sidebar menu label
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 887 (title `{ ar: 'كشوف الرواتب', en: 'Payroll Statements' }`) vs `src/stores/app-store.ts:119` (`'payroll-runs': { ar: 'مسيرات الرواتب', en: 'Payroll Runs' }`)
- **Dimension**: 1 (page title vs sidebar label)
- **Problem**: القائمة الجانبية تعرض "مسيرات الرواتب" لكن عند الدخول للصفحة العنوان "كشوف الرواتب". هذا يُربك المستخدم ويجعله يظن أنه دخل صفحة مختلفة.
- **Evidence**: `navItemLabels['payroll-runs']` في `src/stores/app-store.ts:119` = `{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }` بينما `title` في `payroll-runs.tsx:887` = `{ ar: 'كشوف الرواتب', en: 'Payroll Statements' }`.
- **كيفية التحقق العملي**: افتح http://localhost:3000/ ← القائمة الجانبية ← "الموارد البشرية" ← "مسيرات الرواتب" ← لاحظ أن عنوان الصفحة المعروض هو "كشوف الرواتب" بدلاً من "مسيرات الرواتب".
- **Fix recommendation**: وحِّد العنوان ليكون "مسيرات الرواتب" في `payroll-runs.tsx:887` لمطابقة القائمة الجانبية.

### L1-CRIT-006: `attendance.tsx` page title doesn't match its sidebar menu label
- **Module**: `src/components/modules/attendance.tsx`
- **Lines**: 404 (title `{ ar: 'الحضور والانصراف', en: 'Attendance' }`) vs `src/stores/app-store.ts:118` (`'attendance': { ar: 'الساعات', en: 'Hours' }`)
- **Dimension**: 1 (page title vs sidebar label)
- **Problem**: القائمة الجانبية تعرض "الساعات" لكن عنوان الصفحة "الحضور والانصراف". تضارب كامل في التسمية.
- **Evidence**: `navItemLabels['attendance']` = `{ ar: 'الساعات', en: 'Hours' }` بينما `title` = `{ ar: 'الحضور والانصراف', en: 'Attendance' }`.
- **كيفية التحقق العملي**: افتح http://localhost:3000/ ← "الموارد البشرية" ← "الساعات" ← لاحظ أن عنوان الصفحة "الحضور والانصراف" بدلاً من "الساعات".
- **Fix recommendation**: وحِّد التسمية — يُفضَّل تحديث الـ sidebar label إلى "الحضور والانصراف" لأنه أدق وظيفياً، أو تحديث عنوان الصفحة إلى "الساعات" لمطابقة القائمة.

---

### L1-HIGH-001: Inconsistent "Save" button labels across modules (8 different wordings)
- **Module**: all 41 reachable modules with create/edit forms
- **Lines**: 
  - `clients.tsx:96` → "تحديث" (Update) / "إنشاء" (Create)
  - `suppliers.tsx:94` → "تحديث" / "إنشاء"
  - `employees.tsx:213` → "تحديث" / "إنشاء"
  - `inventory.tsx:215` → "حفظ التعديلات" (Save Changes) / "إضافة" (Add)
  - `labor.tsx:191` → "حفظ التعديلات" / "إضافة تكلفة العمالة" (Add Labor Cost)
  - `petty-cash.tsx:193` → "حفظ التعديلات" / "إضافة" (Add)
  - `boq.tsx:205` → "حفظ التعديلات" / "إنشاء" (Create)
  - `rental-contracts.tsx:1265` → "حفظ التعديلات"
  - `accounting.tsx:1597` → "حفظ" (Save)
  - `accounting.tsx:2898` → "حفظ القيد" (Save Entry)
  - `accounting-mapping.tsx:808` → "حفظ" (Save)
  - `expenses.tsx:835` → "حفظ المصروف" (Save Expense)
  - `attendance.tsx:154` → "تسجيل" (Record)
- **Dimension**: 3 (button names consistency)
- **Problem**: لا يوجد convention موحَّد لتسمية زر الحفظ في نماذج الإنشاء/التعديل. ثمانية صياغات مختلفة لنفس الإجراء: "حفظ"، "حفظ التعديلات"، "حفظ القيد"، "حفظ المصروف"، "تحديث"، "إنشاء"، "إضافة"، "تسجيل". هذا يُربك المستخدم ويجعل التعلم بطيئاً.
- **Evidence**: see lines above; the same logical action (persist form to API) uses 8 different verbs.
- **كيفية التحقق العملي**: افتح 5 نماذج مختلفة (عميل، مورد، موظف، صنف مخزون، بند BOQ) ولاحظ أن زر الحفظ في كل واحد له تسمية مختلفة.
- **Fix recommendation**: اعتمد convention واحد: "حفظ" للـ create، "حفظ التعديلات" للـ edit. استبدل باقي الصياغات بهذا.

### L1-HIGH-002: Inconsistent "New X" button labels across modules (verb-form vs noun-form mix)
- **Module**: all 41 reachable list modules
- **Lines**: 
  - Noun form "X جديد": `clients.tsx:170` "عميل جديد", `suppliers.tsx:161` "مورد جديد", `employees.tsx:293` "موظف جديد", `equipment.tsx:1562` "معدة جديدة", `work-teams.tsx:262` "فريق جديد", `subcontractors.tsx:163` "مقاول جديد", `employee-contracts.tsx:280` "عقد جديد", `purchase-requests.tsx:486` "طلب جديد", `supplier-payments.tsx:377` "سداد جديد", `salary-payments.tsx:476` "سداد جديد", `goods-receipt.tsx:494` "استلام جديد", `purchase-orders.tsx:632` "أمر شراء جديد", `delivery-orders.tsx:624` "أمر توصيل جديد", `projects.tsx:1746` "مشروع جديد", `petty-cash.tsx:310` "سلفة نقدية جديدة", `advances.tsx:252` "سلفة جديدة", `labor.tsx:336` "تكلفة عمالة جديدة", `boq.tsx:338` "بند جديد", `inventory.tsx:576` "صنف جديد"
  - Verb form "تسجيل/إعداد X": `attendance.tsx:414` "تسجيل حضور", `equipment-operations.tsx:263` "تسجيل تشغيل", `fuel.tsx:244` "سجل وقود", `equipment-maintenance.tsx:241` "سجل صيانة", `resource-distribution.tsx:489` "توزيع مورد", `salaries.tsx:378` "إعداد راتب", `payroll-runs.tsx:895` "كشف جديد"
- **Dimension**: 3 (button names consistency)
- **Problem**: بعض الوحدات تستخدم صيغة الاسم "X جديد" والبعض الآخر يستخدم صيغة الفعل "تسجيل X" أو "إعداد X" لنفس الإجراء (فتح dialog إنشاء). هذا يجعل تجربة المستخدم غير متسقة.
- **Evidence**: see lines above; 19 modules use noun form, 7 use verb form, for the same "open create dialog" action.
- **كيفية التحقق العملي**: افتح "الموارد البشرية" ← "الموظفون" (زر "موظف جديد") ثم "الساعات" (زر "تسجيل حضور") — نفس الإجراء لكن تسمية مختلفة.
- **Fix recommendation**: اعتمد صيغة موحَّدة "X جديد" في كل الوحدات الـ 26 ذات الـ list+create pattern.

### L1-HIGH-003: Two different "in-dialog add" button wordings ("إضافة X" vs "إنشاء X")
- **Module**: multiple
- **Lines**: 
  - "إضافة X": `clients.tsx:185` "إضافة عميل", `suppliers.tsx:174` "إضافة مورد", `employees.tsx:308` "إضافة موظف", `subcontractors.tsx:176` "إضافة مقاول", `work-teams.tsx:277` (uses "إنشاء فريق" — different!), `equipment.tsx:1638` "إضافة معدة", `fuel.tsx:315` "إضافة سجل وقود", `equipment-maintenance.tsx:265` "إضافة صيانة", `petty-cash.tsx:362` "إضافة سلفة", `labor.tsx:412` "إضافة تكلفة عمالة"
  - "إنشاء X": `projects.tsx:1848` "إنشاء مشروع", `work-teams.tsx:277` "إنشاء فريق", `purchase-orders.tsx:698` "إنشاء أمر شراء", `supplier-invoices.tsx:591` "إنشاء فاتورة", `delivery-orders.tsx:688` "إنشاء أمر توصيل", `service-invoices.tsx:796` "إنشاء فاتورة خدمة", `payroll-runs.tsx:940` "إنشاء كشف", `boq.tsx:403` "إضافة بند"
- **Dimension**: 3 (button names consistency)
- **Problem**: نفس زر "submit form inside dialog" يستخدم صياغتين مختلفتين عبر الوحدات: "إضافة X" و "إنشاء X". الـ work-teams.tsx وحدها تستخدم "إنشاء فريق" (line 277) بينما تستخدم معظم الوحدات "إضافة X".
- **Evidence**: see lines above; ~14 modules use "إضافة X" and ~8 use "إنشاء X" for the same action.
- **كيفية التحقق العملي**: افتح dialog إنشاء مورد (زر "إضافة مورد") ثم dialog إنشاء أمر شراء (زر "إنشاء أمر شراء") — نفس الإجراء لكن تسمية مختلفة.
- **Fix recommendation**: اعتمد "إضافة X" للـ create-form submit button، و "حفظ التعديلات" للـ edit-form submit button، في كل الوحدات.

### L1-HIGH-004: Delete confirmation UX is split between `AlertDialog` (modern) and `confirm()` (browser-native)
- **Module**: 13 modules use `confirm()`: `payroll-runs.tsx:504,518,980`, `suppliers.tsx:202`, `equipment-maintenance.tsx:308`, `equipment-operations.tsx:368`, `work-teams.tsx:315`, `goods-receipt.tsx:591`, `employees.tsx:339`, `clients.tsx:215`, `supplier-invoices.tsx:339,641`, `salary-payments.tsx:620`, `fuel.tsx:353`, `subcontractors.tsx:204`, `resource-distribution.tsx:570,620`, `projects.tsx:1860`
- **Lines**: as above (each `confirm(t('هل أنت متأكد...', 'Are you sure...', lang))`)
- **Dimension**: 3 (button names) + 6 (messages)
- **Problem**: 6 وحدات تستخدم `AlertDialog` من shadcn (timesheets, client-payments, sales, petty-cash, labor, rental-payments, contracts) بنمط بصري متسق مع RTL ودعم أزرار ملوَّنة. 13 وحدة تستخدم `confirm()` الأصلية من المتصفح التي:
  - لا تدعم RTL بشكل صحيح في معظم المتصفحات
  - تظهر بنمط مختلف بين Chrome/Firefox/Safari
  - لا تدعم أزراراً ملوَّنة (destructive variant)
  - لا تظهر وصفاً تفصيلياً
  - تحجب الـ UI thread بالكامل
- **Evidence**: `grep -n "if (confirm(" src/components/modules/*.tsx` → 17 hits across 13 files. Compare to `grep -n "<AlertDialog" src/components/modules/*.tsx` → 6 files use the proper component.
- **كيفية التحقق العملي**: افتح "العملاء" ← احذف عميلاً ← يظهر confirm box صغير من المتصفح بنمط بدائي. ثم افتح "العقود" ← احذف عقداً ← يظهر AlertDialog أنيق متسق مع باقي الواجهة. نفس الإجراء، تجربتان مختلفتان تماماً.
- **Fix recommendation**: استبدل كل استدعاءات `confirm()` بـ `<AlertDialog>` مثل النمط الموجود في `timesheets.tsx:723-736` و `contracts.tsx:1256-1273`.

### L1-HIGH-005: `payroll-runs.tsx` uses `alert()` for bank-account validation
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 515 — `alert(t('يرجى اختيار حساب البنك للدفع أولاً', 'Please select a bank account for payment first', lang))`
- **Dimension**: 6 (messages)
- **Problem**: استدعاء `alert()` الأصلية يحجب الـ UI thread ويعرض رسالة بنمط متصفح بدائي بدلاً من toast. يجب أن يكون inline error أو toast.
- **Evidence**: السطر 515 `alert(t('يرجى اختيار حساب البنك...', ...))` داخل `handlePay()`.
- **كيفية التحقق العملي**: افتح "مسيرات الرواتب" ← اختر كشفاً معتمداً ← اضغط "صرف الرواتب" بدون اختيار حساب بنك ← يظهر alert box من المتصفح بدلاً من toast.
- **Fix recommendation**: استبدل بـ `toast.error(t('يرجى اختيار حساب البنك للدفع أولاً', ...))` أو inline validation message.

### L1-HIGH-006: `projects.tsx` tables missing `overflow-x-auto` wrappers (mobile overflow)
- **Module**: `src/components/modules/projects.tsx`
- **Lines**: 799, 844, 892, 935, 984, 1080, 1132, 1292, 1326, 1368, 1406 — كلها `<Table>` مباشرة داخل `<CardContent className="px-0 pb-2">` بدون `overflow-x-auto`
- **Dimension**: 9 (responsiveness)
- **Problem**: 11 جدولاً في صفحة تفاصيل المشروع (مشتريات، مصروفات، مستخلصات، فواتير، تحصيلات، BOQ، عقود، إلخ) ليس لها wrapper `overflow-x-auto` مما يجعلها تتجاوز عرض الشاشة على الموبايل وتسبب scroll أفقي على مستوى الصفحة.
- **Evidence**: `grep -A1 "px-0 pb-2" src/components/modules/projects.tsx` يُظهر `<Table>` مباشرة بدون wrapper. مقارنة بـ `clients.tsx:187-188` الذي يلف الجدول بـ `<div className="overflow-x-auto">`.
- **كيفية التحقق العملي**: افتح http://localhost:3000/ على موبايل (أو viewport 375px) ← "المشاريع" ← افتح مشروعاً له فواتير/مستخلصات ← اسحب أفقياً — ستجد أن الصفحة كلها تتحرك بدلاً من الجدول فقط.
- **Fix recommendation**: الف كل `<Table>` بـ `<div className="overflow-x-auto">` في `projects.tsx` (نفس النمط الموجود في `clients.tsx:187`).

### L1-HIGH-007: `equipment-operations.tsx` "Project Cost Summary" table missing `overflow-x-auto`
- **Module**: `src/components/modules/equipment-operations.tsx`
- **Lines**: 294 (`<Table>` مباشرة داخل `<CardContent className="p-0">` بدون wrapper)
- **Dimension**: 9 (responsiveness)
- **Problem**: جدول تكاليف حسب المشروع يتجاوز عرض الشاشة على الموبايل.
- **Evidence**: السطر 294 — `<Table>` بدون `<div className="overflow-x-auto">` قبله.
- **كيفية التحقق العملي**: افتح "التشغيل" على موبايل عندما يكون هناك عمليات مرتبطة بمشاريع متعددة ← الجدول يسبب overflow أفقي.
- **Fix recommendation**: الف الجدول بـ `<div className="overflow-x-auto">`.

### L1-HIGH-008: Icon-only action buttons missing `title=` accessibility attribute (multiple modules)
- **Module**: `clients.tsx:213-215`, `suppliers.tsx:202`, `employees.tsx:339`, `equipment-maintenance.tsx:308`, `equipment-operations.tsx:368`, `work-teams.tsx:315`, `fuel.tsx:353`, `subcontractors.tsx:204`, `salary-payments.tsx:620`, `payroll-runs.tsx:971-985`
- **Lines**: as above — every `<Button variant="ghost" size="icon">` with only an icon child and no `title=` attribute
- **Dimension**: 5 (icons) + accessibility
- **Problem**: الأزرار التي تحتوي على أيقونات فقط (Pencil للتعديل، Trash2 للحذف، ToggleLeft/ToggleRight للتفعيل، Eye للعرض) لا تحتوي على `title=` attribute، مما يعني:
  - لا يوجد tooltip عند الـ hover
  - قارئات الشاشة (screen readers) لا تقرأ الغرض من الزر
  - المستخدم الجديد لا يعرف ماذا يفعل كل زر حتى ينقره
- **Evidence**: 
  - `clients.tsx:213` `<Button variant="ghost" size="icon" className="size-8" onClick={...toggleMutation...}>{c.isActive ? <ToggleRight ... /> : <ToggleLeft ... />}</Button>` — بدون `title`
  - `clients.tsx:214` `<Button variant="ghost" size="icon" className="size-8" onClick={...edit...}><Pencil className="size-4" /></Button>` — بدون `title`
  - `clients.tsx:215` `<Button variant="ghost" size="icon" className="size-8 text-rose-600..." onClick={...delete...}><Trash2 className="size-4" /></Button>` — بدون `title`
  - مقارنة بـ `clients.tsx:170` الذي يضيف `title=` على أزرار الـ header فقط
- **كيفية التحقق العملي**: افتح "العملاء" ← مرر فوق أيقونة القلم (Pencil) في عمود الإجراءات ← لا يظهر tooltip. افتح DevTools ← role="button" للزر ← Accessibility tab ← لا يوجد accessible name.
- **Fix recommendation**: أضف `title={t('تعديل', 'Edit', lang)}` و `title={t('حذف', 'Delete', lang)}` و `title={t('تفعيل/تعطيل', 'Toggle Active', lang)}` لكل زر أيقوني.

### L1-HIGH-009: Touch targets below 44×44px WCAG minimum (multiple modules)
- **Module**: many — `clients.tsx:213-215,214-215`, `suppliers.tsx:202`, `employees.tsx:339`, `payroll-runs.tsx:971,985`, `equipment-maintenance.tsx:308`, `equipment-operations.tsx:368`, `fuel.tsx:353`, `subcontractors.tsx:204`, `work-teams.tsx:315`, `resource-distribution.tsx:570` (size-6 = 24px!), `inventory.tsx:394,397`, `rental-payments.tsx:662,665`, `client-payments.tsx:933,939`, `delivery-orders.tsx:737`, `sales.tsx:1330`, `timesheets.tsx:706`, `progress-claims.tsx:689`, `rental-invoices.tsx:921`, `contracts.tsx:1236,1239`, `accounting.tsx:1224,1228,1232,1528,1535,1836,2175,2255`, `depreciation.tsx:924,932,940`, `accounting-mapping.tsx:558`
- **Lines**: as above — every `size="icon" className="size-8"` (32px) or `size-6` (24px) or `size-7`/`h-7` (28px)
- **Dimension**: 9 (responsiveness — touch targets)
- **Problem**: WCAG 2.5.5 يتطلب أن يكون الـ touch target على الأقل 44×44 CSS pixels. معظم أزرار الإجراءات في الجداول تستخدم `size-8` (32px) أو `size-6` (24px) أو `h-7` (28px) — كلها أقل من الحد الأدنى. هذا يجعل النقر على الأزرار صعباً على الموبايل وعلى المستخدمين ذوي الإعاقات الحركية.
- **Evidence**: `grep -n 'size="icon" className="size-8"' src/components/modules/*.tsx` → dozens of hits. `grep -n 'size-6' src/components/modules/*.tsx` → multiple hits including `resource-distribution.tsx:570` with `className="size-6"` (24px).
- **كيفية التحقق العملي**: افتح "العملاء" على موبايل (375px) ← حاول النقر على أيقونة القلم في عمود الإجراءات ← الـ target 32px فقط، صعب النقر بدقة. افتح Lighthouse ← Accessibility audit ← سيُبلِّغ عن "Tap targets are not sized appropriately".
- **Fix recommendation**: غيِّر `size-8` إلى `size-10` (40px) كحد أدنى، ويفضَّل `size-11` (44px) للموبايل. أضف `min-w-[44px] min-h-[44px]` كـ safety net.

### L1-HIGH-010: `equipment.tsx` English subtitle "Equipment Hub" doesn't match sidebar "Equipment"
- **Module**: `src/components/modules/equipment.tsx`
- **Lines**: 1554 (`title={{ ar: 'المعدات', en: 'Equipment Hub' }}`) vs `src/stores/app-store.ts:108` (`'equipment': { ar: 'المعدات', en: 'Equipment' }`)
- **Dimension**: 1 (page title vs sidebar label)
- **Problem**: العنوان الإنجليزي في الصفحة "Equipment Hub" لكن في القائمة الجانبية "Equipment". عدم تطابق في الوضع الإنجليزي.
- **Evidence**: `equipment.tsx:1554` title `en: 'Equipment Hub'` vs `navItemLabels['equipment'].en = 'Equipment'`.
- **كيفية التحقق العملي**: بدِّل للإنجليزية ← القائمة الجانبية تعرض "Equipment" لكن عنوان الصفحة "Equipment Hub".
- **Fix recommendation**: غيِّر `en: 'Equipment Hub'` إلى `en: 'Equipment'` في `equipment.tsx:1554`.

### L1-HIGH-011: `equipment.tsx` empty-state button label differs from header button label
- **Module**: `src/components/modules/equipment.tsx`
- **Lines**: 1562 (header button "معدة جديدة" / "New Equipment") vs 1638 (empty-state button "إضافة معدة" / "Add Equipment")
- **Dimension**: 3 (button names)
- **Problem**: نفس الإجراء (فتح dialog إنشاء معدة) له تسميتان مختلفتان في نفس الصفحة: "معدة جديدة" في الـ header و "إضافة معدة" في الـ empty state.
- **Evidence**: 
  - `equipment.tsx:1562` `<Plus className="size-4" /> {t('معدة جديدة', 'New Equipment')}` (header)
  - `equipment.tsx:1638` `<Plus className="size-4 mr-1" /> {t('إضافة معدة', 'Add Equipment')}` (empty state)
- **كيفية التحقق العملي**: افتح "المعدات" عندما لا توجد معدات ← سترى زر "إضافة معدة". أضف معدة ثم احذفها ← الزر في الـ header (أعلى الصفحة) يصبح "معدة جديدة". نفس الإجراء، تسميتان.
- **Fix recommendation**: وحِّد على "معدة جديدة" في كلا الموقعين (matching the noun-form convention).

### L1-HIGH-012: Two-column form layout on mobile (no `grid-cols-1 sm:grid-cols-2`)
- **Module**: `payroll-runs.tsx:215`, `client-payments.tsx:338,514,602`
- **Lines**: as above
- **Dimension**: 9 (responsiveness — forms)
- **Problem**: بعض النماذج تستخدم `<div className="grid grid-cols-2 gap-4">` بدون `grid-cols-1 sm:grid-cols-2` breakpoint، مما يجبرها على عمودين حتى على الموبايل (375px). هذا يسبب ضغطاً شديداً في الـ inputs وعدم قابلية قراءة.
- **Evidence**: 
  - `payroll-runs.tsx:215` `<div className="grid grid-cols-2 gap-4">` (create dialog)
  - `client-payments.tsx:338` `<div className="grid grid-cols-2 gap-4">` (payment form)
  - `client-payments.tsx:514` `<div className="grid grid-cols-2 gap-4">` (edit payment form)
  - مقارنة بـ `clients.tsx:85` الذي يستخدم `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">` (صحيح)
- **كيفية التحقق العملي**: افتح "مسيرات الرواتب" على موبايل (375px) ← اضغط "كشف جديد" ← سترى أن الـ form يضغط حقلين في كل صف بشكل غير مقروء.
- **Fix recommendation**: استبدل `grid grid-cols-2` بـ `grid grid-cols-1 sm:grid-cols-2` في كل المواقع المذكورة.

### L1-HIGH-013: `payroll-runs.tsx` status-action button "اعتماد" creates a JE without explaining that in the label
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 564-569 (button "اعتماد" / "Approve") — onClick triggers `handleApprove()` at line 503 which calls `statusMutation.mutate({ status: 'APPROVED' })` — backend creates an accrual JE (Dr Salaries / Cr Salaries Payable)
- **Dimension**: 3 (button names) + cross-layer
- **Problem**: الزر "اعتماد" يوحي بأنه مجرد تغيير حالة (status change) لكنه فعلياً ينشئ قيداً محاسبياً (accrual JE). التأكيد يأتي فقط في `confirm()` box (الذي هو بدوره مشكلة منفصلة L1-HIGH-004). المستخدم قد ينقر "اعتماد" متوقعاً flag بسيط ثم يفاجأ بـ JE في GL.
- **Evidence**: 
  - `payroll-runs.tsx:564-569` `<Button className="gap-1 bg-emerald-600..." onClick={handleApprove}...><CheckCircle2 className="size-4" />{t('اعتماد', 'Approve', lang)}</Button>`
  - `handleApprove` at line 503-510 يستدعي `statusMutation.mutate({ status: 'APPROVED' })` الذي بدوره يشغِّل `/api/payroll-runs/[id]` PATCH الذي ينشئ JE عبر `createPayrollAccrualJournalEntry`.
- **كيفية التحقق العملي**: افتح "مسيرات الرواتب" ← كشف بحالة REVIEW ← اضغط "اعتماد" ← تأكد من confirm box (الذي يشرح الـ JE) لكن الزر نفسه لا يوضح. لنفس الكشف اضغط "صرف الرواتب" (line 576) — نفس النمط، الزر يوحي بـ "pay" لكنه ينشئ JE منفصل للدفع.
- **Fix recommendation**: غيِّر تسمية الزر إلى "اعتماد وترحيل" أو "اعتماد (إنشاء قيد)" ليكون صريحاً، أو أضف `<Tooltip>` يشرح الـ side effect.

### L1-HIGH-014: `expenses.tsx` hardcoded English word "materials" in Arabic description
- **Module**: `src/components/modules/expenses.tsx`
- **Lines**: 155 — `descriptionAr: 'تكاليف نقل المعدات والآليات وال materials'`
- **Dimension**: 7 (translation — English leak-through)
- **Problem**: كلمة "materials" الإنجليزية موجودة في منتصف جملة عربية. يجب أن تكون "والمواد" أو "والمستلزمات".
- **Evidence**: السطر 155: `descriptionAr: 'تكاليف نقل المعدات والآليات وال materials'` — كلمة "materials" بالإنجليزية في نهاية الوصف العربي.
- **كيفية التحقق العملي**: افتح "المصروفات" ← تبويب "نقل" ← اقرأ الوصف تحت العنوان — ستجد "materials" بالإنجليزية في منتصف النص العربي.
- **Fix recommendation**: استبدل "وال materials" بـ "والمواد".

### L1-HIGH-015: `depreciation.tsx` English-only placeholder "e.g. Excavator CAT 320"
- **Module**: `src/components/modules/depreciation.tsx`
- **Lines**: 324 — `placeholder="e.g. Excavator CAT 320"`
- **Dimension**: 7 (translation — untranslated placeholder)
- **Problem**: الـ placeholder مكتوب بالإنجليزية فقط، بدون استدعاء `t()` ولا ترجمة عربية. يظهر في الوضع العربي.
- **Evidence**: السطر 324: `<Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Excavator CAT 320" />` — نص ثابت بدون `t()`.
- **كيفية التحقق العملي**: افتح "الإهلاك" ← تبويب "الأصول الثابتة" ← اضغط "إضافة أصل" ← حقل "الاسم" يعرض placeholder "e.g. Excavator CAT 320" بالإنجليزية حتى في الوضع العربي.
- **Fix recommendation**: استبدل بـ `placeholder={t(lang, 'مثال: حفار CAT 320', 'e.g. Excavator CAT 320')}`.

### L1-HIGH-016: Inconsistent "Print Date" formatting across modules (system locale vs explicit ar-SA)
- **Module**: 19 modules use `new Date().toLocaleDateString()` (no locale): `payroll-runs.tsx:837`, `attendance.tsx:381`, `suppliers.tsx:143`, `equipment-maintenance.tsx:203`, `inventory.tsx:558`, `expenses.tsx:1033`, `equipment-operations.tsx:219`, `employees.tsx:268`, `labor.tsx:299`, `work-teams.tsx:232`, `resource-distribution.tsx:447`, `clients.tsx:152`, `salaries.tsx:341`, `salary-payments.tsx:461`, `employee-contracts.tsx:245`, `equipment.tsx:1526`, `fuel.tsx:201`, `supplier-payments.tsx:363`, `rental-payments.tsx:536`. Only `accounting.tsx:1156,1421,1790,2083,2691,3181` uses `toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')`.
- **Lines**: as above
- **Dimension**: 8 (formatting — date)
- **Problem**: 19 وحدة تستخدم `toLocaleDateString()` بدون locale، مما يجعل التاريخ يُعرض بنمط النظام (في معظم المتصفحات `M/D/YYYY` أمريكي). وحدة `accounting.tsx` وحدها تستخدم `ar-SA` التي قد تُفلت إلى تقويم هجري في بعض المتصفحات. التواريخ تظهر بأنماط مختلفة عبر الوحدات.
- **Evidence**: 
  - `clients.tsx:152` `value: new Date().toLocaleDateString()` — لا locale
  - `accounting.tsx:1156` `value: new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')` — locale صريح
- **كيفية التحقق العملي**: افتح "العملاء" ← اطبع الجدول ← "تاريخ الطباعة" يظهر بنمط `M/D/YYYY`. افتح "المحاسبة" ← قيود اليومية ← اطبع ← "تاريخ الطباعة" قد يظهر بنمط مختلف (يعتمد على المتصفح).
- **Fix recommendation**: استخدم helper `formatDate(new Date().toISOString(), lang)` من `app-store.ts:425` في كل مكان، أو على الأقل `toLocaleDateString('en-GB')` للحصول على `DD/MM/YYYY` المتوقع في السعودية.

---

### L1-MED-001: `t()` helper has 3 different signatures across modules
- **Module**: 
  - Signature A `t(ar, en, lang)` (32 files)
  - Signature B `t(lang, ar, en)` (8 files: `purchases.tsx:97`, `financial-years.tsx:101`, `expenses.tsx:95`, `depreciation.tsx:101`, `boq.tsx:43`, `labor.tsx:42`, `petty-cash.tsx:44`, `advances.tsx:38`)
  - Signature C `t(ar, en)` (closure-bound, many files: `projects.tsx:499`, `contracts.tsx:318`, `delivery-orders.tsx:108`, `sales.tsx:178`, `service-invoices.tsx:118`, `equipment.tsx:295`, `timesheets.tsx:145`, `client-payments.tsx` uses `tt` closure, `rental-invoices.tsx:152`, `progress-claims.tsx:122`, `rental-payments.tsx` uses `tt`)
- **Lines**: see above
- **Dimension**: 7 (translation — code consistency)
- **Problem**: ثلاث صياغات مختلفة لنفس الـ helper. هذا يجعل قراءة الكود صعبة على المطور الجديد، ويزيد خطر تمرير الوسائط بترتيب خاطئ. بالفعل Signature A و Signature B يمرران `lang` في موضع مختلف — خطأ واحد في النسخ/اللصق ينتج عنه نص خاطئ بصمت.
- **Evidence**: 
  - `clients.tsx:42` `function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }` (A)
  - `purchases.tsx:97` `const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en` (B — `lang` first!)
  - `projects.tsx:499` `const t = (ar: string, en: string) => lang === 'ar' ? ar : en` (C — closure)
- **كيفية التحقق العملي**: `grep -n "^const t = \|^function t(" src/components/modules/*.tsx` يُظهر 3 صياغات مختلفة.
- **Fix recommendation**: وحِّد على Signature C (closure-bound `t(ar, en)`) لأنها الأكثر إيجازاً، أو انقل الـ helper إلى ملف مشترك في `src/lib/i18n.ts`.

### L1-MED-002: `payroll-runs.tsx` save button label "إنشاء الكشف" differs from sibling modules' "حفظ"/"إضافة"
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 354 — `{createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إنشاء الكشف', 'Create Statement', lang)}`
- **Dimension**: 3 (button names)
- **Problem**: زر الحفظ في dialog إنشاء كشف رواتب uses "إنشاء الكشف" (Create Statement) بدلاً من "حفظ" أو "إضافة" المعتمدة في باقي الوحدات.
- **Evidence**: السطر 354 أعلاه.
- **كيفية التحقق العملي**: افتح "مسيرات الرواتب" ← "كشف جديد" ← زر الحفظ في الأسفل يقول "إنشاء الكشف".
- **Fix recommendation**: استبدل بـ "حفظ" أو "إضافة" لمطابقة convention الموحَّد المقترح في L1-HIGH-001.

### L1-MED-003: `attendance.tsx` save button "تسجيل" (Record) instead of "حفظ"
- **Module**: `src/components/modules/attendance.tsx`
- **Lines**: 154 — `{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('تسجيل', 'Record', lang)}`
- **Dimension**: 3 (button names)
- **Problem**: زر الحفظ يستخدم "تسجيل" (Record) بدلاً من "حفظ". حتى loading state يقول "جاري الحفظ..." مما يكشف عدم اتساق داخلي.
- **Evidence**: السطر 154 — زر "تسجيل" بينما loading "جاري الحفظ".
- **كيفية التحقق العملي**: افتح "الحضور والانصراف" ← "تسجيل حضور" ← زر الحفظ في الأسفل يقول "تسجيل".
- **Fix recommendation**: استبدل "تسجيل" بـ "حفظ".

### L1-MED-004: `rental-invoices.tsx` cancel-invoice button uses generic "إلغاء" instead of "إلغاء الفاتورة"
- **Module**: `src/components/modules/rental-invoices.tsx`
- **Lines**: 655 — `<XCircle className="size-4" /> {t('إلغاء', 'Cancel')}`
- **Dimension**: 3 (button names)
- **Problem**: زر إلغاء الفاتورة (الذي يغيِّر status إلى CANCELLED وينشئ JE عكسي) يستخدم كلمة "إلغاء" عامة بدلاً من "إلغاء الفاتورة". هذا قد يُربك المستخدم الذي يظن أنه زر إغلاق الـ dialog. كذلك الزر نفسه يقوم بـ destructive action لكن لا يطلب تأكيداً.
- **Evidence**: السطر 655 — `{t('إلغاء', 'Cancel')}` بجانب XCircle icon. السطر 660 — زر "حذف" بجانب Trash2 — واضح. لكن "إلغاء" قد يُفهم خطأً كـ close dialog.
- **كيفية التحقق العملي**: افتح "فواتير التأجير" ← اختر فاتورة SENT ← زر "إلغاء" (XCircle) ← يلغي الفاتورة بدون تأكيد.
- **Fix recommendation**: غيِّر التسمية إلى "إلغاء الفاتورة" وأضف `AlertDialog` للتأكيد قبل الإلغاء.

### L1-MED-005: `contracts.tsx` dialog title uses same label as header button (inconsistent with rest)
- **Module**: `src/components/modules/contracts.tsx`
- **Lines**: 338 (`<h1>{isEdit ? t(labels.editContract.ar, labels.editContract.en) : t(labels.newContract.ar, labels.newContract.en)}</h1>`)
- **Dimension**: 2 (dialog titles)
- **Problem**: معظم الوحدات تستخدم label مختلف للـ dialog title مقابل الـ header button (مثلاً header "عميل جديد" و dialog "إضافة عميل"). `contracts.tsx` يستخدم نفس label "عقد مشروع جديد" في كلا الموقعين. هذا في حد ذاته ليس خطأً لكنه non-conventional مقارنة بباقي الوحدات.
- **Evidence**: السطر 338 يستخدم `labels.newContract` (نفس الـ header button).
- **كيفية التحقق العملي**: افتح "العقود" ← اضغط "عقد مشروع جديد" (header) ← عنوان الـ dialog هو "عقد مشروع جديد" (نفسه).
- **Fix recommendation**: إما أن تتبنى كل الوحدات هذا النمط (نفس label في header و dialog) أو تتبنى contracts.tsx النمط الآخر. المهم هو الاتساق.

### L1-MED-006: `projects.tsx` save button uses raw Arabic without `t()` (partial English leak)
- **Module**: `src/components/modules/projects.tsx`
- **Lines**: 1848 — `<Plus className="size-4 mr-1" /> {t('إنشاء مشروع', 'Create Project')}` (this one is OK) but the dialog title at line 342 is Arabic-only (see L1-CRIT-002)
- **Dimension**: 7 (translation)
- **Problem**: While the submit button uses `t()` correctly, the dialog title and description at line 342-343 are raw Arabic. Inconsistent within the same dialog.
- **Evidence**: see L1-CRIT-002 above.
- **Fix recommendation**: fix together with L1-CRIT-002.

### L1-MED-007: `depreciation.tsx` dialog titles in English are inconsistent (verb mismatch)
- **Module**: `src/components/modules/equipment.tsx`
- **Lines**: 540, 584, 627, 671 — `<DialogTitle>{t('مصروف معدة', 'Equipment Expense')}</DialogTitle>`, `<DialogTitle>{t('سجل استخدام', 'Add Usage')}</DialogTitle>`, `<DialogTitle>{t('سجل صيانة', 'Add Maintenance')}</DialogTitle>`, `<DialogTitle>{t('سجل وقود', 'Add Fuel Log')}</DialogTitle>`
- **Dimension**: 2 (dialog titles — Arabic/English semantic mismatch)
- **Problem**: العناوين العربية تستخدم صيغة الاسم "سجل X" (Log of X) بينما الإنجليزية تستخدم صيغة الفعل "Add X". غير متسق دلالياً.
- **Evidence**: 
  - السطر 540: AR "مصروف معدة" / EN "Equipment Expense" — كلاهما اسم ✅
  - السطر 584: AR "سجل استخدام" / EN "Add Usage" — AR اسم، EN فعل ❌
  - السطر 627: AR "سجل صيانة" / EN "Add Maintenance" — AR اسم، EN فعل ❌
  - السطر 671: AR "سجل وقود" / EN "Add Fuel Log" — AR اسم، EN فعل+اسم ❌
- **كيفية التحقق العملي**: افتح "المعدات" ← اختر معدة ← اضغط "إضافة" في تبويب "سجلات الاستخدام" ← عنوان الـ dialog "سجل استخدام" (AR) / "Add Usage" (EN) — عدم تطابق دلالي.
- **Fix recommendation**: وحِّد على صيغة الفعل في كلا اللغتين: "إضافة سجل استخدام" / "Add Usage Log"، أو صيغة الاسم: "سجل استخدام" / "Usage Log".

### L1-MED-008: `dashboard.tsx` WorkflowChain forces `dir="ltr"` on Arabic labels
- **Module**: `src/components/modules/dashboard.tsx`
- **Lines**: 176 — `<div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin" dir="ltr">`
- **Dimension**: 7 (translation — RTL/LTR)
- **Problem**: سلسلة الـ workflow تحتوي على عناصر عربية (مثل "العميل"، "المشروع"، "العقد") لكن الـ container بأكمله مجبر على `dir="ltr"`. هذا يعكس ترتيب العناصر بصرياً (الأول يصبح على اليسار بدلاً من اليمين) لكن النص العربي داخل كل فقاعة يظل يعرض بشكل RTL داخلياً — مما يسبب ازدواجية في الاتجاه قد تُربك القارئ.
- **Evidence**: السطر 176 أعلاه — `dir="ltr"` على container يحتوي نصوصاً عربية.
- **كيفية التحقق العملي**: افتح الـ dashboard ← انظر لسلسلة "العميل ← المشروع ← العقد ← ..." — الترتيب البصري معكوس (العميل على اليسار بدلاً من اليمين) في الوضع العربي.
- **Fix recommendation**: أزِل `dir="ltr"` ودع الاتجاه يتبع لغة الواجهة. إذا كان الـ workflow خطياً زمنياً (left-to-right دائماً)، استخدم `<ArrowLeft>` بدلاً من `<ArrowRight>` في الوضع العربي.

### L1-MED-009: `payroll-runs.tsx` title differs between main view and detail view
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 875 (main view title `{ ar: 'كشوف الرواتب', en: 'Payroll Statements' }`) vs 887 (separate `ModuleLayout` with same title) — and the detail view at line 540 uses raw `<h2>` with `payrollRun.code` instead of consistent title pattern
- **Dimension**: 1 (page title consistency within module)
- **Problem**: العنوان "كشوف الرواتب" لا يطابق sidebar "مسيرات الرواتب" (انظر L1-CRIT-005). وعلاوة على ذلك، عرض التفاصيل يستخدم `<h2>` raw مع `payrollRun.code` بدون ModuleLayout.
- **Evidence**: 
  - `payroll-runs.tsx:540` `<h2 className="text-xl font-bold">{payrollRun.code}</h2>` (detail view, raw)
  - `payroll-runs.tsx:875` `<ModuleLayout title={{ ar: 'كشوف الرواتب', ... }}>`
- **كيفية التحقق العملي**: افتح "مسيرات الرواتب" ← اختر كشفاً ← العنوان يتغير من "كشوف الرواتب" إلى كود الكشف فقط بدون subtitle.
- **Fix recommendation**: وحِّد على "مسيرات الرواتب" + استخدم ModuleLayout في عرض التفاصيل أيضاً.

### L1-MED-010: `rental-contracts.tsx` line 1007 uses raw SAR symbol character
- **Module**: `src/components/modules/rental-contracts.tsx`
- **Lines**: 1007 — `<span className="text-emerald-600">{t('﷼', 'SAR', lang)}</span>`
- **Dimension**: 8 (formatting — currency)
- **Problem**: استخدام حرف "﷼" (U+FDFC RIAL SIGN) كرمز للريال. هذا الحرف قد لا يُعرض بشكل صحيح في كل الخطوط، والنظام لديه `CurrencySymbol` component (`src/components/ui/currency-symbol.tsx`) و `MoneyDisplay` (`src/components/ui/money-display.tsx`) مخصصان لهذا الغرض ويحترمان إعدادات رمز العملة المرفوع من الـ settings.
- **Evidence**: السطر 1007 — استخدام حرف "﷼" مباشرة بدلاً من `<CurrencySymbol />`.
- **كيفية التحقق العملي**: افتح "عقود التأجير" ← اختر عقداً ← انظر لقيمة الـ hourly rate — يظهر "﷼" قد يظهر كمستطيل فارغ أو بشكل غير صحيح في بعض المتصفحات.
- **Fix recommendation**: استبدل بـ `<CurrencySymbol lang={lang} />` أو `<MoneyDisplay value={...} lang={lang} />`.

### L1-MED-011: `client-payments.tsx` and `rental-payments.tsx` use "(ر.س / SAR)" suffix on amount labels
- **Module**: `client-payments.tsx:320,510`, `rental-payments.tsx:254,395`
- **Lines**: as above — `<Label>{tt(labels.amount.ar, labels.amount.en)} (ر.س / SAR) *</Label>`
- **Dimension**: 8 (formatting — currency)
- **Problem**: إلحاق "(ر.س / SAR)" بكل label للمبلغ يُنتج تكراراً (كل قيمة مالية يظهر بجانبها الرمز). النظام لديه `MoneyDisplay` و `CurrencySymbol` لإدارة هذا بشكل مركزي. أيضاً كتابة "ر.س / SAR" معاً تظهر كلا الرمزين دائماً بغض النظر عن اللغة.
- **Evidence**: السطر 320 `<Label>{tt(labels.amount.ar, labels.amount.en)} (ر.س / SAR) *</Label>` — يظهر "المبلغ (ر.س / SAR) *" في كلا الوضعين.
- **كيفية التحقق العملي**: افتح "التحصيلات" ← "سداد جديد" ← حقل "المبلغ" يعرض "المبلغ (ر.س / SAR) *".
- **Fix recommendation**: أزِل الـ suffix واعتمد على `MoneyDisplay` لعرض القيمة بالرمز الصحيح حسب الـ settings.

### L1-MED-012: `fuel.tsx` line 123 mixes Arabic + English units in inline calculation display
- **Module**: `src/components/modules/fuel.tsx`
- **Lines**: 123 — `<p className="text-xs text-emerald-500 mt-1">{form.liters} {t('لتر ×', 'L ×', lang)} {form.costPerLiter} {t('ريال/لتر', 'SAR/L', lang)}</p>`
- **Dimension**: 7 (translation — mixed RTL/LTR)
- **Problem**: النص "5 لتر × 2.5 ريال/لتر" يخلط بين أرقام لاتينية وكلمات عربية ورموز إنجليزية، مما يسببBidirectional text rendering issues (البعض سيظهر بترتيب خاطئ). كذلك "ريال/لتر" و "SAR/L" — يجب استخدام `CurrencySymbol` للريال.
- **Evidence**: السطر 123 — `{form.liters} {t('لتر ×', 'L ×', lang)} {form.costPerLiter} {t('ريال/لتر', 'SAR/L', lang)}`.
- **كيفية التحقق العملي**: افتح "الوقود" ← "سجل وقود" ← أدخل 50 لتر × 2.5 — يظهر "50 لتر × 2.5 ريال/لتر" بترتيب قد يبدو مربكاً.
- **Fix recommendation**: أعِد صياغة الجملة أو ضع كل جزء في `<span dir="ltr">` منفصل. استخدم `<CurrencySymbol>` للريال.

### L1-MED-013: `rental-contracts.tsx` phone input placeholder "05XXXXXXXX" not Arabic
- **Module**: `src/components/modules/rental-contracts.tsx`
- **Lines**: 845 — `placeholder="05XXXXXXXX"`
- **Dimension**: 7 (translation — placeholder)
- **Problem**: placeholder للهاتف يستخدم "05XXXXXXXX" (X لاتينية) بدلاً من رمز عربي أو شكل أكثر وضوحاً مثل "05XXXXXXXX" لا بأس به لكن يفضل تنسيقه بـ dir=ltr صريح (موجود) لكن قد يُفهم كـ "exactly 10 digits starting with 05".
- **Evidence**: السطر 845.
- **كيفية التحقق العملي**: افتح "عقود التأجير" ← dialog إنشاء ← حقل "الهاتف" يعرض "05XXXXXXXX".
- **Fix recommendation**: هذا LOW-MEDIUM. يمكن تركه كما هو لأن صيغة الهاتف السعودي فعلية.

### L1-MED-014: `attendance.tsx` uses `toast.success()` (Sonner) while sibling HR modules use `useToast` (shadcn)
- **Module**: `src/components/modules/attendance.tsx`
- **Lines**: 228 — `toast.success(t('تم تسجيل الحضور الجماعي', 'Bulk attendance recorded', lang))`
- **Dimension**: 6 (messages — toast system consistency)
- **Problem**: attendance.tsx يستخدم Sonner بينما sibling وحدات HR (salaries, payroll-runs) — salaries تستخدم Sonner لكن payroll-runs لا يستخدم أي toast (يعتمد على `confirm()` فقط). هذا تناقض داخلي داخل قسم الـ HR.
- **Evidence**: `attendance.tsx:9` `import { toast } from 'sonner'` vs `payroll-runs.tsx` لا يستورد أي toast.
- **كيفية التحقق العملي**: افتح "الحضور" ← سجِّل حضوراً جماعياً ← يظهر Sonner toast. افتح "مسيرات الرواتب" ← اعتمد كشفاً ← لا يظهر أي toast (فقط confirm box).
- **Fix recommendation**: وحِّد نظام الـ toast في كل وحدات HR (يُفضَّل Sonner) — جزء من إصلاح L1-CRIT-003.

### L1-MED-015: `reports.tsx` line 329 mixes `<Table>` and inline JSX in one line (readability)
- **Module**: `src/components/modules/reports.tsx`
- **Lines**: 329 — `<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-right">{t('البند', 'Item', lang)}</TableHead><TableHead className="text-right">{t('المبلغ', 'Amount', lang)}</TableHead><TableHead className="text-right">{t('النسبة', '%', lang)}</TableHead></TableRow></TableHeader>`
- **Dimension**: 4 (element ordering — code structure)
- **Problem**: 200+ حرف في سطر واحد مما يصعّب قراءة الكود وصيانته. غير مؤثر على المستخدم لكنه code-quality issue.
- **Evidence**: السطر 329 أعلاه.
- **Fix recommendation**: افرمقه على عدة أسطر.

### L1-MED-016: `purchases.tsx` (orphaned module) imports `ModuleLayout` but never gets rendered
- **Module**: `src/components/modules/purchases.tsx`
- **Lines**: 25 (imports ModuleLayout), 727-1007 (uses it)
- **Dimension**: 1 (reachability)
- **Problem**: على الرغم من أن الـ module مكتمل ويستخدم ModuleLayout بشكل صحيح، إلا أنه لا يُستورد في أي مكان. هذا dead code.
- **Evidence**: `grep "modules/purchases" src/` → 0 imports outside purchases.tsx itself.
- **Fix recommendation**: إما أضِفه إلى moduleMap في `src/app/page.tsx` أو احذفه.

### L1-MED-017: Many internal `throw new Error('Failed to fetch')` strings are English-only
- **Module**: 20+ files including `timesheets.tsx:389`, `settings.tsx:273,315,1140,1177`, `client-payments.tsx:214,706`, `sales.tsx:1135`, `projects.tsx:1668,1678`, `service-invoices.tsx:448,459,470`, `purchase-orders.tsx:576`, `contracts.tsx:626,636`, `rental-payments.tsx:456`, `progress-claims.tsx:306`, `expenses.tsx:865`, `delivery-orders.tsx:314`, `rental-invoices.tsx:508`
- **Lines**: as above — `if (!res.ok) throw new Error('Failed to fetch')` or `throw new Error('Failed')`
- **Dimension**: 6 (messages)
- **Problem**: هذه الأخطاء تُلتقط بواسطة react-query وتُعرض في الـ toast / error UI. في الـ toast عادةً يتم تجاهلها (`toast({ description: 'فشل في...' })` لكن في `payroll-runs.tsx:177` مثلاً `throw new Error(e.error || 'Error')` — إذا فشل الـ API بدون رسالة خطأ عربية، فالـ message الإنجليزي "Error" يظهر للمستخدم.
- **Evidence**: السطور أعلاه — `throw new Error('Failed to fetch')` في 20+ ملف.
- **كيفية التحقق العملي**: افتح Network tab ← حاول تنفيذ عملية تفشل (مثلاً offline mode) ← toast error يظهر — في بعض الـ modules يحتوي على "Failed" الإنجليزية.
- **Fix recommendation**: استبدل بـ `throw new Error(t('فشل في الاتصال', 'Connection failed', lang))` أو على الأقل اجعل الـ toast descriptions لا تعتمد على `error.message` الإنجليزي.

---

### L1-LOW-001: `placeholder="2026"` in `financial-years.tsx` is OK but lacks translation
- **Module**: `src/components/modules/financial-years.tsx`
- **Lines**: 198 — `placeholder="2026"`
- **Dimension**: 7 (translation — placeholder)
- **Problem**: الـ placeholder رقم سنة، غير ضروري ترجمته. مذكور للتأكيد فقط.
- **Evidence**: السطر 198.
- **Fix recommendation**: لا إجراء مطلوب — مقبول.

### L1-LOW-002: `settings.tsx` dialog titles use inline ternary instead of `t()` helper
- **Module**: `src/components/modules/settings.tsx`
- **Lines**: 723, 777, 836 — `<DialogTitle>{lang === 'ar' ? 'فرع جديد' : 'New Branch'}</DialogTitle>` etc.
- **Dimension**: 3 (button names) + 7 (translation — code consistency)
- **Problem**: settings.tsx يستخدم inline ternary بدلاً من `t()` helper. يعمل لكنه non-conventional.
- **Evidence**: 3 occurrences at lines above.
- **Fix recommendation**: حوِّل إلى `t('فرع جديد', 'New Branch', lang)` لـ consistency.

### L1-LOW-003: `rental-payments.tsx` uses `tt` instead of `t` (typo or local convention?)
- **Module**: `src/components/modules/rental-payments.tsx`
- **Lines**: 91 — `function t(ar: string, en: string, lang: Lang) { ... }` (defined as `t`) but called as `tt(labels.amount.ar, labels.amount.en)` at lines 254, 395, 548, 551, 662, 665, 697, 698
- **Dimension**: 7 (translation — code consistency)
- **Problem**: الـ helper اسمه `t` لكن يُستدعى باسم `tt` في معظم الأماكن. هذا إما typo أو local convention لم يكتمل.
- **Evidence**: السطر 91 يُعرِّف `t`، لكن السطور 254 وغيرها تستدعي `tt(...)`.
- **Fix recommendation**: وحِّد على `t` في كل مكان.

### L1-LOW-004: `client-payments.tsx` uses `tt` instead of `t` (same as L1-LOW-003)
- **Module**: `src/components/modules/client-payments.tsx`
- **Lines**: 98 — `function t(ar: string, en: string, lang: Lang) { ... }` defined as `t`, called as `tt` in 219, 223, 456, 460, 731, 735, 796, 871, 933, 939, 966, 967
- **Dimension**: 7 (translation — code consistency)
- **Problem**: نفس مشكلة L1-LOW-003.
- **Evidence**: see above.
- **Fix recommendation**: same as L1-LOW-003.

### L1-LOW-005: `equipment.tsx` dialog titles use 2-arg `t()` (closure signature)
- **Module**: `src/components/modules/equipment.tsx`
- **Lines**: 301, 488, 540, 584, 627, 671
- **Dimension**: 7 (translation — code consistency)
- **Problem**: equipment.tsx يستخدم signature ثالث `t(ar, en)` (closure-bound) في كل الـ dialogs، بينما معظم الوحدات الأخرى تستخدم signature أول `t(ar, en, lang)`. هذا يعمل بشكل صحيح لكنه inconsistency في الكود.
- **Evidence**: `equipment.tsx:295` `const t = (ar: string, en: string) => lang === 'ar' ? ar : en` (closure signature).
- **Fix recommendation**: جزء من L1-MED-001.

### L1-LOW-006: `sales.tsx` defines `t` helper multiple times in nested components
- **Module**: `src/components/modules/sales.tsx`
- **Lines**: 178, 210, 846, 1121 — كل مكوِّن فرعي يُعرِّف `t` محلياً
- **Dimension**: 7 (translation — code duplication)
- **Problem**: تعريف `t` يتكرر 4 مرات في نفس الملف بدلاً من تعريفه مرة واحدة على مستوى الـ module.
- **Evidence**: 4 تعريفات في السطور أعلاه.
- **Fix recommendation**: انقل التعريف إلى أعلى الملف (module-level) أو إلى ملف i18n مشترك.

### L1-LOW-007: `projects.tsx` defines `t` helper 7 times in nested components
- **Module**: `src/components/modules/projects.tsx`
- **Lines**: 499, 616, 743, 1032, 1205, 1453, 1603, 1661
- **Dimension**: 7 (translation — code duplication)
- **Problem**: مثل L1-LOW-006 لكن أكثر.
- **Evidence**: 7+ تعريفات.
- **Fix recommendation**: same as L1-LOW-006.

### L1-LOW-008: `dashboard.tsx` line 176 scrollbar-thin class is custom (not shadcn standard)
- **Module**: `src/components/modules/dashboard.tsx`
- **Lines**: 176 — `className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin"`
- **Dimension**: 9 (responsiveness)
- **Problem**: `scrollbar-thin` ليست class قياسية في Tailwind بدون plugin. قد لا تعمل في كل البيئات.
- **Evidence**: السطر 176.
- **Fix recommendation**: تأكد أن `tailwind-scrollbar` plugin مثبَّت، أو احذف الـ class.

### L1-LOW-009: `payroll-runs.tsx` dialog title "إنشاء كشف رواتب" vs module title "كشوف الرواتب" — singular vs plural mismatch
- **Module**: `src/components/modules/payroll-runs.tsx`
- **Lines**: 206 (`<DialogTitle>{t('إنشاء كشف رواتب', 'Create Payroll Statement', lang)}</DialogTitle>`) vs 887 (`title={{ ar: 'كشوف الرواتب', en: 'Payroll Statements' }}`)
- **Dimension**: 2 (dialog titles)
- **Problem**: عنوان الـ dialog مفرد "كشف رواتب" لكن عنوان الصفحة جمع "كشوف الرواتب". مقبول لغوياً لكن يستحق التوحيد.
- **Evidence**: see lines above.
- **Fix recommendation**: لا إجراء مطلوب — مقبول.

---

## Cross-layer inconsistency check

تم التحقق من 5 وحدات عشوائية بمقارنة أسماء الحقول بين UI و `/api/<module>/route.ts`:

| Module | UI Form Fields (sent in POST body) | API Expected Fields (`body.*`) | Match? |
|---|---|---|---|
| `clients.tsx` (line 66) | `name, nameAr, contactPerson, email, phone, address, taxNumber, isActive` | `body.name, body.nameAr, body.contactPerson, body.email, body.phone, body.address, body.taxNumber, body.isActive` (clients/route.ts:91-98) | ✅ Match |
| `suppliers.tsx` (line 64) | `name, nameAr, contactPerson, email, phone, address, taxNumber, isActive` | `body.name, body.nameAr, body.contactPerson, body.email, body.phone, body.address, body.taxNumber, body.isActive` (suppliers/route.ts:79-86) | ✅ Match |
| `employees.tsx` (line 120-127) | `name, nameAr, nationality, profession, residenceNumber, residenceExpiry, hireDate, basicSalary (number), branchId, phone, email, expenseAccountId` | `body.name, body.nameAr, body.nationality, body.profession, body.residenceNumber, body.residenceExpiry, body.hireDate, body.basicSalary, body.branchId, body.phone, body.email, body.expenseAccountId, body.status, body.isActive` (employees/route.ts:97-110) | ✅ Match (API has 2 extra optional fields with defaults) |
| `sales.tsx` (line 311-326) | `sourceType: 'EXTRACT'\|'TIMESHEET', progressClaimId/timesheetId, date, dueDate, notes` | `timesheetId, date, dueDate, notes` (mode B, sales-invoices/route.ts:308); `progressClaimId, date, dueDate, notes` (mode A) | ✅ Match |
| `payroll-runs.tsx` (line 183-190) | `month, year, selectionType, selectionIds, salaryTypeFilter, notes` | `body.month, body.year, body.notes, body.selectionType, body.selectionIds, body.salaryTypeFilter` (payroll-runs/route.ts:43-49) | ✅ Match |

**Cross-layer field name inconsistencies: 0/5** — كل الحقول متطابقة. الـ API labels والـ UI labels متسقة.

**Button-vs-verb inconsistencies:** عُثِر على L1-HIGH-013 فقط (زر "اعتماد" ينشئ JE بدون توضيح في الزر). باقي الأزرار متسقة دلالياً مع الـ action الذي تنفّذه:
- "حفظ" / "Save" → POST/PUT ✅
- "تحديث" / "Update" → PUT ✅  
- "حذف" / "Delete" → DELETE ✅
- "إرسال" / "Send" → PATCH status=SENT ✅
- "تأكيد الدفع" / "Mark Paid" → PATCH status=PAID ✅
- "صرف الرواتب" / "Pay Salaries" → PATCH status=PAID + creates payment JE ✅ (honest verb)

---

## Top 5 CRITICAL issues (priority order)

1. **L1-CRIT-001**: Six complete modules (purchases, labor, petty-cash, salary-payments, advances, service-invoices) are unreachable — never imported in `moduleMap`.
2. **L1-CRIT-002**: `projects.tsx:342-343,366-371,388-394` dialog titles are Arabic-only — English language toggle broken.
3. **L1-CRIT-003**: Two divergent toast systems (Sonner in 15 modules, useToast in 7 modules) produce visually different notifications.
4. **L1-CRIT-004**: `projects.tsx` and `delivery-orders.tsx` skip the shared `ModuleLayout` wrapper — broken padding, no subtitle, inconsistent header.
5. **L1-CRIT-005/006**: Page titles in `payroll-runs.tsx` ("كشوف الرواتب") and `attendance.tsx` ("الحضور والانصراف") don't match their sidebar labels ("مسيرات الرواتب" and "الساعات").
