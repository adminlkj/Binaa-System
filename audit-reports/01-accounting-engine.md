# تقرير فحص المحرك المحاسبي - المرحلة 1

**Auditor:** Accounting Engine Deep Auditor (READ-ONLY)
**Task ID:** 1-a
**Scope:** `src/lib/accounting/{engine,guard,auto-journal,mapping,consistency,period-guard,ifrs15,depreciation-engine}.ts` + كل مسارات API التي تنشئ قيوداً
**Method:** تحليل ثابت للكود + تتبع التدفقات + grep للجميع المُستدعين
**Note:** لم يتم تعديل أي ملف. هذا تقرير قراءة فقط.

---

## ملخص تنفيذي

| الخطورة | العدد |
|---|---|
| CRITICAL | 16 |
| HIGH | 14 |
| MEDIUM | 12 |
| LOW | 6 |
| **الإجمالي** | **48** |

أبرز الاكتشافات:
- **الإقفال السنوي بدون معاملة** — قيد الإقفال + تحديث السنة المالية + إقفال الفترات تتم بثلاث كتابات منفصلة على `db` (لا `tx`). أي فشل جزئي يُنتج قيوداً يتيمة وسنة في حالة غير متّسقة.
- **double recognition على المستخلصات** — `progress-claims/[id]/route.ts:86` يستدعي `createProgressClaimJournalEntry` عند الاعتماد، ثم `sales-invoices/route.ts:273` يستدعي `createSalesInvoiceJournalEntry` عند تحويل المستخلص المعتمد إلى فاتورة → الإيراد يُسجل مرتين.
- **salary-payments يبتلع خطأ القيد بصمت** — `try/catch` يلتهم أي فشل في `createJournalEntry` داخل المعاملة؛ الراتب يُعلَّم PAID لكن لا يوجد قيد، و`Salaries_Payable (3310)` يدخل سالباً.
- **costCenterId = projectId** في 5 مسارات (fuel, maintenance, operations, supplier-invoices, salaries) — تمرير projectId كأنه costCenterId. إمّا خطأ FK أو ربط خاطئ للقيد بـ cost center لا علاقة له به.
- **14 دالة autoEntry ميتة** (من أصل 24) في engine.ts و ifrs15.ts — منها 5 معطّلة بالكامل (`autoEntryDepreciation`, `autoEntryRentalDepreciation`, `autoEntryDeliveryFees`, …) لأن مسار الإهلاك الفعلي يذهب عبر `depreciation-engine.ts` ومسار التوصيل مدمج في فاتورة التأجير.
- **`isPostable` بدلاً من `allowPosting`** في `journal-entries/[id]/route.ts:123` — اسم الحقل خاطئ → الفلتر `!a.isPostable` دائماً truthy → كل محاولة DRAFT→POSTED مرفوضة.
- **`account-statement` يفلتر book balance بـ costCenter غير مضبوط** — `auto-journal.ts` لا يضع `costCenterId` على سطر AR/AP؛ book balance للعميل/المورد دائماً 0.
- **`descriptionAr` يُمرَّر لكن لا يُكتَب** — `JournalEntryInput.descriptionAr` معرَّف في guard.ts:79 ويُملأ من جميع autoEntry، لكن `JournalEntry.descriptionAr` غير موجود في الـ schema (line 1785) ولا يُكتَب في `postJournalEntry`. 24 دالة تُولِّد وصفاً عربياً يضيع.
- **`initializeChartOfAccounts()` داخل `$transaction` لكنه يستخدم `db`** — يُستدعى داخل المعاملة في 7 مسارات، لكنه يكتب عبر `db.account.*` (engine.ts:343-370) لا `tx.account.*` → الكتابات غير ذرية مع المعاملة الأم، وتُكرَّر كتابياً على كل POST (مسح/تحديث 110 حساب).

---

## 1. تصميم المحرك

### 1.1 دوال مكررة (نفس المنطق، أسماء مختلفة)

- **[HIGH]** `src/lib/accounting/engine.ts:440` `autoEntrySalesInvoice` ↔ `src/lib/auto-journal.ts:28` `createSalesInvoiceJournalEntry` — كلاهما ينشئ قيد فاتورة مبيعات (Dr AR / Cr Revenue / Cr VAT). الفعلي المستخدم هو `createSalesInvoiceJournalEntry` (via auto-journal.ts). `autoEntrySalesInvoice` ميتة.
- **[HIGH]** `src/lib/accounting/engine.ts:501` `autoEntryPurchaseInvoice` ↔ `src/lib/auto-journal.ts:80` `createPurchaseInvoiceJournalEntry` — نفس المنطق، يُستخدم كلاهما في أماكن مختلفة (`supplier-invoices/[id]` يستخدم autoEntry، `purchase-invoices/route.ts` يستخدم auto-journal). لا توجد ضمانات توافق الحسابات بين الاثنين.
- **[HIGH]** `src/lib/accounting/engine.ts:603` `autoEntryExpense` ↔ `src/lib/auto-journal.ts:238` `createExpenseJournalEntry` — نفس المنطق. `salaries/route.ts` و`salaries/[id]/route.ts` يستخدمان `autoEntryExpense`، بينما `expenses/route.ts` يستخدم `createExpenseJournalEntry`. حساب التكلفة يُحل بطرق مختلفة (category→role في autoEntry، projectId→role في auto-journal) → إيرادات/مصروفات تُرحَّل لحسابات مختلفة حسب المسار.
- **[HIGH]** `src/lib/accounting/engine.ts:666` `autoEntryClientPayment` ↔ `src/lib/auto-journal.ts:131` `createClientPaymentJournalEntry` — `autoEntryClientPayment` ميتة.
- **[HIGH]** `src/lib/accounting/engine.ts:696` `autoEntrySupplierPayment` ↔ `src/lib/auto-journal.ts:184` `createSupplierPaymentJournalEntry` — `autoEntrySupplierPayment` ميتة.
- **[HIGH]** `src/lib/accounting/engine.ts:903` `autoEntryPettyCash` ↔ (لا بديل في auto-journal.ts) — يستخدم `petty-cash/route.ts`. لا يوجد قيد "عكس" موحَّد للـ petty cash.
- **[MEDIUM]** `src/lib/accounting/engine.ts:1021` `autoEntryDepreciation` ↔ `src/lib/accounting/depreciation-engine.ts:621` `runDepreciationForAsset` — كلاهما ينشئ قيد إهلاك. `autoEntryDepreciation` ميتة (لا مستدعٍ).
- **[MEDIUM]** `src/lib/accounting/engine.ts:1289` `autoEntryVATDeclaration` هو المسار الموحَّد الوحيد لقيد VAT، ولا يوجد تكرار.

### 1.2 دوال ميتة (معرَّفة، غير مستدعاة في src/)

انظر القسم 5 (الجدول الكامل).

### 1.3 استدعاءات دائرية

- **[LOW]** `ifrs15.ts:213-214` — lazy `import('./engine')` و`import('../account-roles')` لتفادي الاعتماد الدائري بين `engine.ts` (الذي يستورد من `account-roles`) و`ifrs15.ts`. هذا ليس استدعاءً دائرياً حقيقياً لكنه عَلَم على تصميم غير نظيف.
- لا استدعاءات A↔B حقيقية.

### 1.4 اعتماديات مخفية

- **[CRITICAL]** `src/lib/accounting/engine.ts:332-380` `initializeChartOfAccounts` يستخدم `db` (لا يقبل `tx`). يُستدعى داخل `$transaction` في 7 مسارات (`salaries/[id]:63`, `petty-cash:46`, `advances:40,109`, `supplier-invoices/[id]:97,183`, `subcontractor-invoices:77`, `seed:160`) لكن كتاباته ليست جزءاً من المعاملة. إذا فشلت المعاملة الأم، تظل كتابات دليل الحسابات. كما أنها تُمسح وتُحدِّث 110 حساباً على كل POST لمصروف/سلفة/فاتورة مورد = performance regression كبير.
- **[HIGH]** `src/lib/accounting/guard.ts:394` `getNextEntryNo` يفحص `client.journalEntry.findMany({ where: { entryNo: { startsWith: 'JE-' } } })` ثم يطابق regex محلياً. هذا يفترض أن كل أرقام القيود تتبع القالب `JE-NNNNNN` — لكن `autoEntrySalesInvoice` يولِّد `JE-SI-${Date.now()}`, `autoEntryVATDeclaration` يولِّد `JE-VAT-${Date.now()}`, `ifrs15.ts:220` يولِّد `IFRS15-${projectId.slice(-6)}-${asOfDate.getTime()}`, `depreciation-engine.ts:723` يولِّد `JE-DEP-AST-...-${Date.now()...}`. هذه لا تُحسَب في max → `getNextEntryNo` يُنتج رقماً مكرراً مع `JE-000123` الموجود. كما أن الاستعلام O(n) على كل قيد — لا sequence table.
- **[HIGH]** `src/lib/accounting/engine.ts:485,553,651,678,708,736,764,809,846,888,923,976,1003,1040,1068,1110,1138,1167,1194,1222,1269,1320,1346` — كل دوال autoEntry تولِّد `entryNo: \`JE-XX-${Date.now()}\``.(Date.now() بالمللي ثانية. إذا استدعى مستخدمان POST في نفس المللي ثانية على `autoEntryPettyCash` مثلاً، ينتجان نفس `entryNo` → R7 violation `DUPLICATE_ENTRY_NO`. الحارس يرفض الثاني، لكن لا `retry` في المسار. كذلك `Date.now()` لا يضمن الترتيب الزمني بين السجلات في قاعدة البيانات.
- **[HIGH]** `src/lib/accounting/engine.ts:536,539,540,634,636,675,704,732,760,761,794,795,796,840,842,843,874,875,883,919,920,957,958,960,998,999,1036,1037,1064,1065,1097,1105,1135,1163,1164,1190,1191,1218,1219,1297,1298,1299,1300,1342,1343` — كل دالة autoEntry تستخدم `getAccountCodeByRole(role, tx) || 'HARDCODED_CODE'`. هذا الـ fallback يكسر كل مزايا الـ role mapping: إذا ألغى المحاسب دور `VAT_INPUT` من حساب 3120، يستخدم النظام الكود 3120 مباشرةً (دون التحقق من نشاطه أو إمكانية ترحيله) → قيد بـ account خاطئ. الأكواد المُدمجة: `'8630','3210','3120','1210','6210','6220','3110','1130','1230','8110','7250','2220','3410','3420','1220','3830','3710','3130','8510','3810','8210','7130','3220','7210','1410','6110'`. (29 موقعاً)
- **[HIGH]** `src/lib/accounting/guard.ts:394-407` `getNextEntryNo` لا يقبل `tx` كـ "نقطة دخول وحيدة" — يقبل `tx?` لكن في `reverseJournalEntry` (line 347) يستخدم `client` المُمرَّر، وفي `auto-journal.ts:53,105,159,212,272,333` يستخدم `tx`. التناسق جيد، لكن العقد ضعيف (optional).
- **[HIGH]** `src/lib/accounting/ifrs15.ts:230` يمرر `client as any` لـ `createJournalEntry` — يتجاوز فحص النوع. `client` هنا هو `Prisma.TransactionClient` لكن `createJournalEntry` يتوقع `PrismaTransaction` من engine.ts. قد ينجح في runtime لكنه يخفي type mismatch.
- **[MEDIUM]** `src/lib/accounting/consistency.ts:44-53` raw SQL rule 1 — لا يفلتر `WHERE je."deletedAt" IS NULL AND jl."deletedAt" IS NULL AND je.status = 'POSTED'`. كل قيد DRAFT غير متوازن (طبيعي أثناء التحرير) يُحسَب كانتهاك. كل قيد محذوف يُحسَب كانتهاك.

### 1.5 حالات سباق (Race Conditions)

- **[CRITICAL]** `src/app/api/fiscal-years/[id]/close/route.ts:52-55` — `db.fiscalYear.update({ status: 'CLOSING' })` بلا lock. مديران يضغطان "إقفال" في وقت واحد → كلاهما يقرأ status='OPEN'، كلاهما ينتقل إلى CLOSING، كلاهما ينشئ قيد إقفال ← قيود إقفال مكررة.
- **[CRITICAL]** `src/app/api/fiscal-years/[id]/close/route.ts:191-221` — لا `SELECT FOR UPDATE` على FiscalYear قبل الكتابة. القراءة (line 31) والكتابة (line 202) مفصولتان بثوانٍ من حساب الأرصدة. أي ترحيل قيد بينهما يُغيِّر الأرصدة → قيد الإقفال يُحسب على أرقام قديمة.
- **[HIGH]** `src/app/api/equipment/fuel/route.ts:37-95` — 4 كتابات بدون `tx` وبدون قفل: `equipmentFuelLog.create`, `equipmentCost.create`, `autoEntryEquipmentCost` (الذي ينشئ JE), `equipmentFuelLog.update`. أي فشل جزئي يترك سجل وقود بدون قيد أو قيد بدون سجل.
- **[HIGH]** `src/app/api/equipment/maintenance/route.ts:36-117` — نفس النمط: 5 كتابات بدون `tx`.
- **[HIGH]** `src/app/api/equipment/operations/route.ts:38-99` — 4 كتابات بدون `tx`.
- **[HIGH]** `src/app/api/subcontractor-invoices/route.ts:55-90` — `subcontractorInvoice.create` و`autoEntrySubcontractorInvoice` و(تحديث journalEntryId على الفاتورة غير موجود أصلاً) بلا `tx`.
- **[HIGH]** `src/app/api/advances/route.ts:24-56` — `employeeAdvance.create` و`autoEntryEmployeeAdvance` و`employeeAdvance.update` بلا `tx`.
- **[HIGH]** `src/app/api/advances/route.ts:96-117` — PUT settlement: `employeeAdvance.update` و`autoEntryAdvanceSettlement` بلا `tx`، ولا ربط القيد بالسلفة (`journalEntryId` لا يُحدَّث للسلفة الأصلية).
- **[HIGH]** `src/app/api/salaries/route.ts:87-100,105-117` — `autoEntryExpense` (يكتب JE) و`db.equipmentCost.create` و`db.salary.create` ثلاث كتابات منفصلة بدون `tx`.
- **[HIGH]** `src/app/api/salaries/[id]/route.ts:69-103` — نفس النمط: JE + equipmentCost + salary.update بلا `tx`.
- **[HIGH]** `src/app/api/salary-payments/route.ts:165-185, 232-251` — `createJournalEntry` داخل `$transaction` ✅ لكن داخل `try/catch` يبتلع الخطأ ويُتمم المعاملة برقم قيد مفقود. (انظر 1.6)
- **[HIGH]** `src/app/api/goods-receipt/route.ts:77-176` — 5+ كتابات بدون `tx`، ولا قيد محاسبي إطلاقاً (R1 violation).

### 1.6 مشاكل المعاملات (Transactions)

- **[CRITICAL]** `src/app/api/fiscal-years/[id]/close/route.ts` — كامل عملية الإقفال (status→CLOSING، حساب الأرصدة، `createJournalEntry`, status→CLOSED, periods→CLOSED) **بدون `db.$transaction`**. (5+ كتابات منفصلة على `db`).
- **[CRITICAL]** `src/app/api/fiscal-years/[id]/reopen/route.ts:50,58,69` — `reverseEntry(closingJE.id, db)` يستخدم `db` مباشرة (لا `tx`)، ثم `db.fiscalYear.update`، ثم `db.fiscalPeriod.updateMany`. 3 كتابات غير ذرية.إذا نجح reverseEntry وفشل fiscalYear.update → قيد عكسي موجود لكن السنة لا تزال مغلقة.
- **[CRITICAL]** `src/app/api/salary-payments/route.ts:183-185, 249-251` — `createJournalEntry` داخل `$transaction` لكن `try/catch` يبتلع الخطأ → المعاملة تُكتَم بدون قيد، والراتب يُعلَّم PAID. لا rollback.
- **[HIGH]** `src/app/api/petty-cash/route.ts:29-72` — `$transaction` ✅ لكن `initializeChartOfAccounts()` (line 46) يستخدم `db` داخلياً (engine.ts:343-370) → كتاباته خارج المعاملة.
- **[HIGH]** `src/app/api/advances/route.ts:24-56` — لا `$transaction` إطلاقاً.
- **[HIGH]** `src/app/api/subcontractor-invoices/route.ts:55-90` — لا `$transaction` إطلاقاً.
- **[HIGH]** `src/app/api/salaries/route.ts:87-139` — لا `$transaction` إطلاقاً.
- **[HIGH]** `src/app/api/salaries/[id]/route.ts:62-103` — لا `$transaction` إطلاقاً.
- **[HIGH]** `src/app/api/equipment/fuel/route.ts`، `equipment/maintenance/route.ts`، `equipment/operations/route.ts`، `equipment/expenses/route.ts` — لا `$transaction`.
- **[HIGH]** `src/app/api/supplier-invoices/[id]/route.ts:97,183` — `initializeChartOfAccounts()` داخل `$transaction` لكنها تستخدم `db`.
- **[HIGH]** `src/app/api/goods-receipt/route.ts` — لا `$transaction` + لا قيد محاسبي.
- **[MEDIUM]** `src/lib/accounting/engine.ts:398-401` `reverseEntry(journalEntryId, tx)` — التوقيع يتطلب `tx` (إلزامي)، لكن `fiscal-years/[id]/reopen/route.ts:50` يمرر `db` وليس `tx`. هذا يعمل لأن `db` يتوافق مع واجهة `PrismaTransaction`، لكنه يُلغي ضمان الذرية.

---

## 2. دورة إنشاء القيد

### 2.1 تدفق فاتورة الشراء (Purchase Invoice)

**المسار A: `POST /api/purchase-invoices` (إنشاء مباشر)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `purchase-invoices/route.ts:67-145` | POST body → حساب subtotal/vat/total | ✅ |
| 2 | `purchase-invoices/route.ts:83` | `db.$transaction(async (tx) => { … })` | ✅ |
| 3 | `purchase-invoices/route.ts:85-95` | توليد `invoiceNo = PI-NNNN` بقراءة آخر سجل | ⚠️ race (لا SELECT FOR UPDATE) |
| 4 | `purchase-invoices/route.ts:97-128` | `tx.purchaseInvoice.create` (status=DRAFT) | ✅ |
| 5 | `purchase-invoices/route.ts:131` | `createPurchaseInvoiceJournalEntry(invoice.id, tx)` | ✅ |
| 5a | `auto-journal.ts:84-87` | قراءة الفاتورة + supplier | ✅ |
| 5b | `auto-journal.ts:92-96` | حلّ الحسابات: costAccount = (projectId ? PROJECT_COST : MAINTENANCE_EXPENSE), inputVatAccount = VAT_INPUT, supplierAccount = SUPPLIER_AP | ⚠️ لو لا projectId → MAINTENANCE_EXPENSE بغض النظر عن فئة المصروف |
| 5c | `auto-journal.ts:105` | `getNextEntryNo(tx)` → `JE-NNNNNN` | ✅ |
| 5d | `auto-journal.ts:106-120` | `postJournalEntry(..., tx)` → `assertJournalEntryValid` (R2-R8) → `client.journalEntry.create` | ✅ |
| 5e | `auto-journal.ts:122` | `tx.purchaseInvoice.update({ journalEntryId })` | ✅ |
| 6 | `purchase-invoices/route.ts:134-142` | re-fetch مع journalEntry | ✅ |

**الحلاصة:** هذا المسار سليم. ملفوف في `$transaction`، يستخدم `createPurchaseInvoiceJournalEntry` (المسار الموحَّد)، الحارس يُطبَّق.

**المسار B: `PUT /api/supplier-invoices/[id]` (status DRAFT → SENT)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `supplier-invoices/[id]/route.ts:91-133` | `db.$transaction(async (tx) => { … })` | ✅ |
| 2 | `supplier-invoices/[id]/route.ts:97` | `await initializeChartOfAccounts()` **داخل tx لكنها تستخدم `db`** | ❌ HIGH |
| 3 | `supplier-invoices/[id]/route.ts:98-109` | `autoEntryPurchaseInvoice({...}, tx)` | ⚠️ |
| 3a | `engine.ts:515-535` | categoryRoleMap: CONSUMABLES→PROJECT_COST, SERVICES→FUEL/SUBCONTRACTOR, … | ⚠️ |
| 3b | `engine.ts:536` | `expenseCode = getAccountCodeByRole(role, tx) || '8630'` — fallback لكد ثابت | ❌ HIGH |
| 3c | `engine.ts:539-540` | `apCode = ... || '3210'`, `vatInputCode = ... || '3120'` | ❌ HIGH |
| 3d | `engine.ts:107` | `costCenterId: existing.projectId || undefined` — **projectId كـ costCenterId** | ❌ CRITICAL |
| 3e | `engine.ts:552-560` | `createJournalEntry(template, tx)` → `guardedPost` | ✅ |
| 4 | `supplier-invoices/[id]/route.ts:111-113` | `try/catch` يبتلع فشل القيد ويُتمم المعاملة بدون قيد | ❌ CRITICAL (R1 violation) |
| 5 | `supplier-invoices/[id]/route.ts:116-129` | `tx.purchaseInvoice.update({ status: 'SENT', journalEntryId })` | ⚠️ journalEntryId قد يكون `undefined` → Prisma تحوِّله لـ null → الفاتورة في SENT بدون قيد |

**الحلاصة:** مسار معيب. `initializeChartOfAccounts` خارج tx، `try/catch` يبتلع فشل القيد، `costCenterId = projectId` خطأ نوعي.

**المسار C: `PUT /api/purchase-invoices` (تعديل فاتورة مرحَّلة)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `purchase-invoices/route.ts:174-204` | `db.$transaction` | ✅ |
| 2 | `purchase-invoices/route.ts:183` | `reverseEntry(existing.journalEntryId, tx)` | ✅ |
| 3 | `purchase-invoices/route.ts:191-198` | تحديث subtotal/vat/total على الفاتورة | ✅ |
| 4 | `purchase-invoices/route.ts:201` | `createPurchaseInvoiceJournalEntry(existing.id, tx)` | ✅ |
| 5 | `purchase-invoices/route.ts:208-221` | **خارج الـ tx!** `db.purchaseInvoice.update` لتحديث باقي الحقول | ❌ CRITICAL — هذا التحديث قد يفشل بعد commit الـ tx، فتظل الفاتورة بحالة جزئية |
| 6 | `purchase-invoices/route.ts:203` | `updateData.journalEntryId = undefined` — يمنع التحديث خارج tx من الكتابة فوق journalEntryId الجديد | ⚠️ لكن `updateData` يحوي حقولاً أخرى قد تكون مهمة |

**الحلاصة:** التحديث النهائي خارج tx. غير ذري.

### 2.2 تدفق فاتورة البيع (Sales Invoice)

**المسار A: `POST /api/sales-invoices` (sourceType='EXTRACT' — تحويل مستخلص معتمد)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `sales-invoices/route.ts:141-298` | `createInvoiceFromExtract` | ✅ |
| 2 | `sales-invoices/route.ts:152-181` | تحقق أن المستخلص APPROVED + غير مفوتر | ✅ |
| 3 | `sales-invoices/route.ts:220-287` | `db.$transaction` | ✅ |
| 4 | `sales-invoices/route.ts:222-264` | `tx.salesInvoice.create` (status=DRAFT) | ✅ |
| 5 | `sales-invoices/route.ts:267-270` | `tx.progressClaim.update({ invoiced: true })` | ✅ |
| 6 | `sales-invoices/route.ts:273` | `createSalesInvoiceJournalEntry(invoice.id, tx)` | ✅ |
| 6a | `auto-journal.ts:32-38` | قراءة الفاتورة + client | ✅ |
| 6b | `auto-journal.ts:40-44` | `CUSTOMER_AR`, `RENTAL_REVENUE`/`PROJECT_REVENUE`, `VAT_OUTPUT` | ✅ |
| 6c | `auto-journal.ts:53` | `getNextEntryNo(tx)` | ✅ |
| 6d | `auto-journal.ts:54-68` | `postJournalEntry(..., tx)` | ✅ |
| 6e | `auto-journal.ts:70` | `tx.salesInvoice.update({ journalEntryId })` | ✅ |
| 7 | `sales-invoices/route.ts:289-296` | `storeZatcaQR` — **خارج tx** | ⚠️ لكنه best-effort (try/catch داخلي) |
| 8 | `sales-invoices/route.ts:298` | return 201 | ✅ |

**الحلاصة:** هذا المسار سليم. لكن **انتبه**: المستخلص المعتمد لديه قيد مُنشأ سابقاً (انظر 2.3 flow C أدناه) → الإيراد يُسجل مرتين.

**المسار B: `POST /api/sales-invoices` (sourceType='TIMESHEET' — تأجير)**

مماثل لـ A، يستخدم `createSalesInvoiceJournalEntry` مع `invoiceType=RENTAL` → RENTAL_REVENUE. سليم.

**المسار C: `PUT /api/sales-invoices` (تعديل فاتورة مرحَّلة)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `sales-invoices/route.ts:683-717` | `db.$transaction` | ✅ |
| 2 | `sales-invoices/route.ts:695` | `reverseEntry(existing.journalEntryId, tx)` | ✅ |
| 3 | `sales-invoices/route.ts:705-713` | `tx.salesInvoice.update` بقيم جديدة | ✅ |
| 4 | `sales-invoices/route.ts:715` | `createSalesInvoiceJournalEntry(existing.id, tx)` | ✅ |
| 5 | `sales-invoices/route.ts:720-750` | `db.salesInvoice.update` **خارج tx** لتحديث باقي الحقول | ❌ CRITICAL |

نفس عيب purchase-invoices.

### 2.3 تدفق المصروف (Expense)

**المسار A: `POST /api/expenses`**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `expenses/route.ts:187-272` | POST | ✅ |
| 2 | `expenses/route.ts:216-265` | `db.$transaction` | ✅ |
| 3 | `expenses/route.ts:217-240` | `tx.expense.create` | ✅ |
| 4 | `expenses/route.ts:245-254` | if accountId && payingAccountId → `buildExpenseJournalEntryWithExplicitAccounts`، else → `createExpenseJournalEntry` | ✅ |
| 4a | `expenses/route.ts:171-181` | `postJournalEntry(..., tx)` بحسابات صريحة | ✅ |
| 4b | `auto-journal.ts:247-253` | costAccount = (projectId ? PROJECT_COST : ADMIN_EXPENSE) | ⚠️ يتجاهل `category` |
| 4c | `auto-journal.ts:266-268` | inputVAT فقط إذا vatAmount > 0 و inputVatAccount موجود | ⚠️ إذا لا يوجد حساب VAT_INPUT، يُسجِّل القيد بدون VAT (يفقد أصل الضريبة) |
| 5 | `expenses/route.ts:257-264` | re-fetch | ✅ |

**الحلاصة:** المسار سليم (في tx، يستخدم الحارس)، لكن يتجاهل `category` ويستخدم projectId فقط لاختيار حساب التكلفة → مصروف "FUEL" بدون مشروع يُرحَّل لـ ADMIN_EXPENSE بدلاً من FUEL_EXPENSE.

**المسار B: `POST /api/equipment/fuel` (مصروف وقود)**

| الخطوة | الموقع | الوصف | الحالة |
|---|---|---|---|
| 1 | `equipment/fuel/route.ts:37-50` | `db.equipmentFuelLog.create` (لا tx) | ❌ |
| 2 | `equipment/fuel/route.ts:59-66` | `db.equipmentCost.create` (لا tx) | ❌ |
| 3 | `equipment/fuel/route.ts:77-84` | `autoEntryEquipmentCost({ costType: 'FUEL', costCenterId: body.projectId || undefined, ... })` (لا tx) | ❌ |
| 3a | `engine.ts:833-840` | FUEL → FUEL_EXPENSE → fallback `'7210'` | ⚠️ |
| 3b | `engine.ts:841-843` | payFrom='CASH' → resolvePaymentAccountCode('TREASURY') | ✅ |
| 4 | `equipment/fuel/route.ts:87-90` | `db.equipmentFuelLog.update({ journalEntryId })` (لا tx) | ❌ |
| 5 | `equipment/fuel/route.ts:91-94` | `try/catch` يبتلع فشل القيد | ❌ CRITICAL (R1) |

**الحلاصة:** مسار معيب تماماً. لا tx، ابتلاع صامت، costCenterId=projectId.

---

## 3. المعاملات الذرية

جدول كل دالة في المحرك/auto-journal تُجري 2+ كتابات، مع حالة الذرية:

| الدالة | الموقع | كتابات | ملفوفة في `$transaction`؟ | تقبل `tx`؟ | مشاكل |
|---|---|---|---|---|---|
| `postJournalEntry` | guard.ts:267 | journalEntry.create + lines.createMany (nested) | لا (مفردة `create` مع nested) | ✅ | OK (prisma nested = atomic) |
| `reverseJournalEntry` | guard.ts:313 | journalEntry.create (via postJournalEntry) + journalEntry.update (isReversal) | ❌ لا | ✅ | **[CRITICAL]** الاستدعاءات يجب أن تكون داخل tx خارجية، لكن المُستدعي يمرر `db` أحياناً (fiscal-years/reopen:50) → الكتابتان غير ذريتين |
| `createJournalEntry` | engine.ts:410 | مفرد via guardedPost | ❌ لا (تُفوِّض لـ guardedPost) | ✅ | OK |
| `reverseEntry` | engine.ts:398 | يفوِّض لـ guardedReverse | ❌ لا | ✅ | OK إذا كان المُستدعي في tx |
| `autoEntrySalesInvoice` | engine.ts:440 | مفرد via createJournalEntry | ❌ لا (تُفوِّض) | ✅ | ميتة (لا مستدعي) |
| `autoEntryPurchaseInvoice` | engine.ts:501 | مفرد via createJournalEntry | ❌ لا | ✅ | OK — يُستدعى داخل tx بواسطة supplier-invoices/[id] |
| `autoEntryExpense` | engine.ts:603 | مفرد via createJournalEntry | ❌ لا | ✅ | OK — يُستدعى بدون tx بواسطة salaries routes (مُشكلة المُستدعي) |
| `autoEntryPettyCash` | engine.ts:903 | مفرد via createJournalEntry | ❌ لا | ✅ | OK — يُستدعى داخل tx بواسطة petty-cash/route.ts |
| `autoEntryEquipmentCost` | engine.ts:824 | مفرد via createJournalEntry | ❌ لا | ✅ | **[CRITICAL]** يُستدعى بدون tx بواسطة 4 مسارات equipment/* |
| `autoEntryEmployeeAdvance` | engine.ts:726 | مفرد via createJournalEntry | ❌ لا | ✅ | **[HIGH]** يُستدعى بدون tx بواسطة advances/route.ts:41 |
| `autoEntryAdvanceSettlement` | engine.ts:754 | مفرد via createJournalEntry | ❌ لا | ✅ | **[HIGH]** يُستدعى بدون tx بواسطة advances/route.ts:110 |
| `autoEntrySubcontractorInvoice` | engine.ts:783 | مفرد via createJournalEntry | ❌ لا | ✅ | **[HIGH]** يُستدعى بدون tx بواسطة subcontractor-invoices/route.ts:78 |
| `autoEntryVATDeclaration` | engine.ts:1289 | مفرد via createJournalEntry | ❌ لا | ✅ | OK — يُستدعى داخل tx بواسطة vat/route.ts:237 |
| `autoEntryVATPayment` | engine.ts:1335 | مفرد via createJournalEntry | ❌ لا | ✅ | OK — داخل tx |
| `autoEntryIFRS15Revenue` | ifrs15.ts:200 | مفرد via createJournalEntry | ❌ لا | ✅ | ميتة |
| `createSalesInvoiceJournalEntry` | auto-journal.ts:28 | postJournalEntry + salesInvoice.update | ❌ لا | ✅ (إلزامي) | OK — يُستدعى دائماً داخل tx |
| `createPurchaseInvoiceJournalEntry` | auto-journal.ts:80 | postJournalEntry + purchaseInvoice.update | ❌ لا | ✅ | OK |
| `createClientPaymentJournalEntry` | auto-journal.ts:131 | postJournalEntry + clientPayment.update | ❌ لا | ✅ | OK |
| `createSupplierPaymentJournalEntry` | auto-journal.ts:184 | postJournalEntry + supplierPayment.update | ❌ لا | ✅ | OK |
| `createExpenseJournalEntry` | auto-journal.ts:238 | postJournalEntry + expense.update | ❌ لا | ✅ | OK |
| `createProgressClaimJournalEntry` | auto-journal.ts:295 | postJournalEntry + progressClaim.update | ❌ لا | ✅ | OK (لكن مُشكلة منطق — انظر 2.3) |
| `createAssetWithAcquisition` | depreciation-engine.ts:398 | fixedAsset.create + createJournalEntry + fixedAsset.update | ✅ `db.$transaction` | ✅ | OK |
| `updateAssetAndRecalculate` | depreciation-engine.ts:508 | fixedAsset.update (واحدة) | ✅ `db.$transaction` | ✅ | OK (tx زائدة لكن غير ضارة) |
| `runDepreciationForAsset` | depreciation-engine.ts:621 | createJournalEntry + assetDepreciation.create + fixedAsset.update | ✅ `tx ? run(tx) : db.$transaction(run)` | ✅ | OK |
| `runBulkDepreciation` | depreciation-engine.ts:796 | loop on `runDepreciationForAsset` | ❌ لا — كل أصل في tx منفصلة | ❌ | **[HIGH]** إذا فشل أصل في الوسط، بعض الأصول لها قيد والبعض لا. لا rollback كلي. |
| `reverseAssetDepreciation` | depreciation-engine.ts:847 | reverseEntry + assetDepreciation.update + fixedAsset.update | ✅ | ✅ | OK |
| `deleteAsset` | depreciation-engine.ts:897 | reverseEntry + assetDepreciation.deleteMany + fixedAsset.delete | ✅ | ✅ | **[MEDIUM]** `try/catch` يبتلع فشل reverseEntry (line 920-922) — قد يحذف الأصل مع بقاء قيد التملك بدون عكس |
| `initializeChartOfAccounts` | engine.ts:332 | 110+ account.upsert متتالية | ❌ لا | ❌ لا يقبل tx | **[CRITICAL]** يُستدعى داخل tx في 7 مسارات لكنه يستخدم `db` → كتاباته غير ذرية |

### 3.1 مسارات API متعددة الكتابات بدون `$transaction` (CRITICAL)

| المسار | الكتابات | الحالة |
|---|---|---|
| `fiscal-years/[id]/close/route.ts` | FY.update(CLOSING) + createJournalEntry + FY.update(CLOSED) + FP.updateMany | ❌ لا tx |
| `fiscal-years/[id]/reopen/route.ts` | reverseEntry(db) + FY.update + FP.updateMany | ❌ لا tx |
| `equipment/fuel/route.ts` POST | fuelLog.create + equipmentCost.create + autoEntryEquipmentCost + fuelLog.update | ❌ لا tx |
| `equipment/maintenance/route.ts` POST | maint.create + equipment.update + equipmentCost.create + autoEntryEquipmentCost + maint.update | ❌ لا tx |
| `equipment/operations/route.ts` POST | op.create + equipment.update + equipmentCost.create + autoEntryEquipmentCost | ❌ لا tx |
| `equipment/expenses/route.ts` POST | expense.create + autoEntryEquipmentCost + expense.update | ❌ لا tx |
| `subcontractor-invoices/route.ts` POST | inv.create + initializeChartOfAccounts(db) + autoEntrySubcontractorInvoice | ❌ لا tx |
| `advances/route.ts` POST | advance.create + initializeChartOfAccounts(db) + autoEntryEmployeeAdvance + advance.update | ❌ لا tx |
| `advances/route.ts` PUT | advance.update + initializeChartOfAccounts(db) + autoEntryAdvanceSettlement | ❌ لا tx |
| `salaries/route.ts` POST | autoEntryExpense + equipmentCost.create + salary.create | ❌ لا tx |
| `salaries/[id]/route.ts` PUT | initializeChartOfAccounts(db) + autoEntryExpense + equipmentCost.create + salary.update | ❌ لا tx |
| `goods-receipt/route.ts` POST | gr.create + po.update + inventoryItem.update × N + equipmentCost.create × N | ❌ لا tx + لا قيد |
| `purchase-invoices/route.ts` PUT | (tx: reverse + update + create) + `db.purchaseInvoice.update` خارج tx | ❌ update خارج tx |
| `sales-invoices/route.ts` PUT | (tx: reverse + update + create) + `db.salesInvoice.update` خارج tx | ❌ update خارج tx |

---

## 4. دوال AutoEntry — فحص سطر بسطر

### 4.1 `autoEntrySalesInvoice` (engine.ts:440-493) — ميتة

- **Debit/Credit**: Dr AR (totalAmount), Cr Revenue (subtotal), Cr VAT (vatAmount). ✅ صحيح
- **Guard**: يستخدم `createJournalEntry` ← `guardedPost`. ✅
- **Transaction**: يقبل `tx?` اختياري، يمرره لـ createJournalEntry. ✅
- **Issues**:
  - [LOW] line 477-481: إذا VAT > 0 لكن `getAccountCodeByRole(VAT_OUTPUT)` تُعيد null، **القيد يُنشأ بدون سطر VAT** → غير متوازن (Dr total > Cr subtotal) → `assertJournalEntryValid` يرمي `NOT_BALANCED`. هذا "صحيح" لكن الرسالة ستكون مربكة ("غير متوازن" بدلاً من "VAT_OUTPUT account missing").
  - [HIGH] ميتة — لا مستدعي. `createSalesInvoiceJournalEntry` في auto-journal.ts هو البديل الفعلي.
  - **التوصية**: حذف.

### 4.2 `autoEntryPurchaseInvoice` (engine.ts:501-561) — مستخدمة

- **Debit/Credit**: Dr Expense (subtotal), Dr VAT_INPUT (vatAmount), Cr SUPPLIER_AP (totalAmount). ✅
- **Guard**: via createJournalEntry. ✅
- **Transaction**: يقبل `tx?`. ✅
- **Issues**:
  - [HIGH] line 536: `expenseCode = getAccountCodeByRole(role, tx) || '8630'` — fallback لكد ثابت.
  - [HIGH] line 539-540: نفس fallbacks.
  - [HIGH] لا يمرر `costCenterId` لسطر الـ AP (line 550)، فقط لسطر التكلفة. منطقياً مقبول لكن غير متسق.
  - **[CRITICAL] في المُستدعي `supplier-invoices/[id]/route.ts:107`**: `costCenterId: existing.projectId || undefined` — projectId كـ costCenterId. خطأ نوعي.
  - **[CRITICAL] في المُستدعي `supplier-invoices/[id]/route.ts:111-113`**: try/catch يبتلع فشل القيد.

### 4.3 `autoEntryProgressClaim` (engine.ts:580-595) — DEPRECATED (ترمي بالتصميم)

- **Debit/Credit**: N/A — يرمي `Error('Progress claims do not create journal entries...')`
- **Issues**:
  - **[CRITICAL]** `createProgressClaimJournalEntry` (auto-journal.ts:295) **لا تزال تُستدعى** من `progress-claims/[id]/route.ts:86` عند status→APPROVED. هذا يناقض التصميم: المستخلص المُعتمد يُنشئ قيداً، ثم تحويله لفاتورة يُنشئ قيداً ثانياً → إيراد مزدوج. (ملاحظة: العمل السابق أشار لهذه المشكلة لكن لم يُصلِحها).
  - **التوصية**: حذف `createProgressClaimJournalEntry` واستدعاءها، أو إعادة تفعيل `autoEntryProgressClaim`.

### 4.4 `autoEntryExpense` (engine.ts:603-659) — مستخدمة (salaries)

- **Debit/Credit**: Dr Expense (amount), Dr VAT_INPUT (vatAmount), Cr Cash (amount + vatAmount). ✅
- **Issues**:
  - [HIGH] line 633: `expenseRole = categoryRoleMap[data.category] || AccountRole.ADMIN_EXPENSE` — تجاهل أن `data.category` قد يكون فارغاً.
  - [HIGH] line 634, 636: fallbacks `'8630'`, `'3120'`.
  - [HIGH] line 635: `resolvePaymentAccountCode('TREASURY'|'BANK')` — لكن الـ type يصرِّح بـ `'TREASURY' | 'PETTY_CASH' | 'BANK'`. PETTY_CASH يُمرَّر لـ resolvePaymentAccountCode الذي يحوِّله لـ CASH. سيعمل لكن يفقد التمييز (يجب أن يُسجَّل على 1130 Petty Cash، لا 1110 Treasury).
  - **[CRITICAL] في المُستدعي `salaries/route.ts:87-95`**: تستخدم `autoEntryExpense` لمصروف راتب. هذا **خطأ محاسبي**: الراتب يستحق (accrue) أولاً Dr Payroll / Cr Salaries_Payable، ثم يُسدد Dr Salaries_Payable / Cr Cash. هذا المسار يخصم Cash مباشرة من حساب 8110. ثم `salary-payments/route.ts` ينشئ قيداً ثانياً Dr 3310 / Cr Cash — فتكون النتيجة: Dr 8110 + Dr 3310 / Cr Cash 2× → cash مخصوم مرتين، Salaries_Payable سالب.
  - **[CRITICAL] في المُستدعي `salaries/route.ts:97-100`**: try/catch يبتلع فشل القيد.

### 4.5 `autoEntryClientPayment` (engine.ts:666-689) — ميتة

- **Debit/Credit**: Dr Cash (amount), Cr AR (amount). ✅
- **Issues**: ميتة. البديل `createClientPaymentJournalEntry` (auto-journal.ts:131). **التوصية**: حذف.

### 4.6 `autoEntrySupplierPayment` (engine.ts:696-719) — ميتة

- **Debit/Credit**: Dr AP (amount), Cr Cash (amount). ✅
- **Issues**: ميتة. **التوصية**: حذف.

### 4.7 `autoEntryEmployeeAdvance` (engine.ts:726-747) — مستخدمة

- **Debit/Credit**: Dr EMPLOYEE_ADVANCE (amount), Cr Cash (amount). ✅
- **Issues**:
  - [HIGH] line 732: fallback `'1230'`.
  - **[HIGH] في المُستدعي `advances/route.ts:41-45`**: لا `tx`. الـ advance.create و autoEntry و advance.update ثلاث كتابات منفصلة. **[CRITICAL] try/catch يبتلع فشل القيد** (line 54-56).

### 4.8 `autoEntryAdvanceSettlement` (engine.ts:754-775) — مستخدمة

- **Debit/Credit**: Dr PAYROLL_EXPENSE (settledAmount), Cr EMPLOYEE_ADVANCE (settledAmount). ✅
- **Issues**:
  - [HIGH] line 760-761: fallbacks `'8110'`, `'1230'`.
  - **[HIGH] في المُستدعي `advances/route.ts:110-114`**: لا `tx`. الـ advance.update و autoEntry منفصلتان.
  - [HIGH] لا تحديث `journalEntryId` على السلفة الأصلية — يُفقد ربط القيد بالسلفة.
  - **[HIGH] try/catch يبتلع** (line 115-117).

### 4.9 `autoEntrySubcontractorInvoice` (engine.ts:783-817) — مستخدمة

- **Debit/Credit**: Dr SUBCONTRACTOR_COST (amount), Dr VAT_INPUT (vatAmount), Cr SUBCONTRACTOR_AP (totalAmount). ✅
- **Issues**:
  - [HIGH] line 794-796: fallbacks `'7130'`, `'3120'`, `'3220'`.
  - **[CRITICAL] في المُستدعي `subcontractor-invoices/route.ts:78-87`**: لا `tx`. **[CRITICAL] try/catch يبتلع** (line 88-90).
  - [HIGH] لا تحديث `journalEntryId` على فاتورة المقاول — يُفقد ربط القيد بالفاتورة (الحقل `SubcontractorInvoice.journalEntryId` غير موجود أصلاً في الـ schema المرئي؟).

### 4.10 `autoEntryEquipmentCost` (engine.ts:824-857) — مستخدمة (4 مسارات)

- **Debit/Credit**: Dr Cost (FUEL→FUEL_EXPENSE, MAINTENANCE→MAINTENANCE_EXPENSE, OPERATION→FUEL_EXPENSE, OTHER→PROJECT_COST), Cr Cash or AP. ✅
- **Issues**:
  - [HIGH] line 840-843: fallbacks `'7210'`, `'3210'`.
  - [MEDIUM] line 833-838: `OPERATION` يُ map إلى FUEL_EXPENSE (وقود؟). يجب أن يُ map إلى DRIVER_EXPENSE أو حساب تشغيلي مستقل. خطأ منطق.
  - **[CRITICAL] في 4 مُستدعين**: لا `tx` + `try/catch` يبتلع + `costCenterId = body.projectId`. انظر 2.3.

### 4.11 `autoEntryRentalInvoice` (engine.ts:865-896) — ميتة

- **Debit/Credit**: Dr AR (total), Cr RENTAL_REVENUE (subtotal), Cr VAT (vatAmount). ✅
- **Issues**: ميتة. **التوصية**: حذف.

### 4.12 `autoEntryPettyCash` (engine.ts:903-934) — مستخدمة

- **Debit/Credit**: Dr Expense (amount), Cr CASH (amount). ✅
- **Issues**:
  - [HIGH] line 919-920: fallbacks `'8630'`, `'1130'`.
  - **[HIGH] في المُستدعي `petty-cash/route.ts:46`**: `initializeChartOfAccounts()` داخل tx لكنها تستخدم `db`.
  - **[CRITICAL] في المُستدعي `petty-cash/route.ts:61-63`**: try/catch يبتلع فشل القيد.
  - [MEDIUM] لا `costCenterId` يُمرَّر رغم وجود `body.branchId` (يمكن أن يُربط بـ cost center للفرع).

### 4.13 `autoEntrySalary` (engine.ts:947-984) — ميتة

- **Debit/Credit**: Dr PAYROLL_EXPENSE (gross) + Dr GOSI_EXPENSE (employer) / Cr PAYROLL_EXPENSE (employee deduction) + Cr Cash (net) + Cr GOSI_PAYABLE (total GOSI). ⚠️
- **Issues**:
  - **[HIGH] خطأ محاسبي**: استخدام نفس `payrollCode` (8110) debit لـ gross و credit لـ employee deduction (lines 964, 969). الرياضي: Dr gross - Cr employee_ded = Dr (gross - employee_ded). محاسبياً صحيح لكن يُربك الـ GL (حساب 8110 له حركة مدينة ودائنة في نفس القيد).
  - [HIGH] line 957-960: fallbacks `'8110'`, `'8210'`, `'3830'`.
  - **[CRITICAL] ميتة** رغم أن المسارات الفعلية (salaries/route.ts) تستخدم `autoEntryExpense` بدلاً منها — الذي يفقد GOSI تماماً. خطأ محاسبي كبير.
  - **[HIGH] `sourceId: \`SAL-${Date.now()}\``**: غير idempotent. retry = duplicate JE.
  - **التوصية**: إما حذف وإعادة توجيه المسارات لاستخدامها، أو حذفها بالكامل.

### 4.14 `autoEntryGOSI` (engine.ts:991-1014) — ميتة

- **Debit/Credit**: Dr GOSI_EXPENSE (employer), Cr GOSI_PAYABLE (total). ⚠️
- **Issues**:
  - **[HIGH] خطأ محاسبي**: line 1008-1009: Dr employer only, Cr (employee + employer). هذا يجعل GOSI_PAYABLE يُسجِّل حصة الموظف دون أن تُخصم من راتبه أولاً (Dr Payroll / Cr GOSI_Payable للجزء الموظف). غير متوازن منطقياً مع `autoEntrySalary`.
  - [HIGH] fallbacks `'8210'`, `'3830'`.
  - **التوصية**: حذف (لا مستدعي).

### 4.15 `autoEntryDepreciation` (engine.ts:1021-1051) — ميتة

- **Debit/Credit**: Dr DEPRECIATION_EXPENSE, Cr ACCUM_DEPRECIATION. ✅
- **Issues**:
  - **[HIGH] خطأ منطق**: line 1028-1032: كل أنواع الأصول (CONSTRUCTION_EQUIPMENT, VEHICLES, OFFICE, SOFTWARE) تُ map لنفس `DEPRECIATION_EXPENSE` و `ACCUM_DEPRECIATION` roles. لا تمييز بين إهلاك معدات تأجير (7250) وإهلاك مركبات (8320). فروقات الأصل تُفقَد.
  - **التوصية**: حذف (البديل `runDepreciationForAsset` في depreciation-engine.ts يفعل ذلك بشكل صحيح).

### 4.16 `autoEntryRentalDepreciation` (engine.ts:1058-1079) — ميتة

- **Debit/Credit**: Dr RENTAL_DEPRECIATION (7250), Cr ACCUM_DEPRECIATION (2220). ✅
- **Issues**: ميتة. **التوصية**: حذف.

### 4.17 `autoEntryDeliveryFees` (engine.ts:1087-1118) — ميتة

- **Debit/Credit**: Dr AR (total), Cr RENTAL_REVENUE (amount — ⚠️ يجب أن يكون DELIVERY_REVENUE)، Cr VAT. ❌
- **Issues**:
  - **[HIGH] خطأ محاسبي**: line 1097: `revenueCode = getAccountCodeByRole(RENTAL_REVENUE) || '6220'`. يجعل رسوم التوصيل تُسجَّل في إيرادات التأجير (6210) بدلاً من إيرادات التوصيل (6220). لا يوجد `DELIVERY_REVENUE` role في account-roles.ts.
  - ميتة — رسوم التوصيل تُدمج في فاتورة التأجير (`sales-invoices/route.ts:416-426`).
  - **التوصية**: حذف.

### 4.18 `autoEntryContractAdvance` (engine.ts:1125-1149) — ميتة

- **Debit/Credit**: Dr Cash, Cr CUSTOMER_ADVANCE. ✅
- **Issues**:
  - [HIGH] line 1135: fallback لـ `'3410'` أو `'3420'` حسب activityType.
  - ميتة.
  - **التوصية**: حذف أو ربط.

### 4.19 `autoEntryRetention` (engine.ts:1156-1178) — ميتة

- **Debit/Credit**: Dr RETENTION_RECEIVABLE, Cr AR. ✅
- **Issues**: ميتة. **التوصية**: حذف أو ربط.

### 4.20 `autoEntryZakat` (engine.ts:1185-1205) — ميتة

- **Debit/Credit**: Dr ZAKAT_EXPENSE, Cr ZAKAT_PAYABLE. ✅
- **Issues**: ميتة. **التوصية**: حذف أو ربط.

### 4.21 `autoEntryEndOfService` (engine.ts:1212-1233) — ميتة

- **Debit/Credit**: Dr PAYROLL_EXPENSE, Cr EOS_PROVISION. ✅
- **Issues**:
  - [MEDIUM] محاسبياً، EOS يجب أن يكون Dr "EOS Expense" مستقل (لا يُدخَل في Payroll). الـ schema لا يُعرِّف EOS_EXPENSE role.
  - ميتة. **التوصية**: حذف أو ربط مع تصحيح الحساب.

### 4.22 `autoEntryAssetDisposal` (engine.ts:1241-1277) — ميتة

- **Debit/Credit**: Dr Cash + Dr Accum_Dep, Cr Asset + Cr Gain (6310) أو Dr Loss (8610). ✅
- **Issues**:
  - **[HIGH] خطأ محاسبي**: line 1263: إذا gain → Cr `'6310'` (Sale of Used Equipment — REVENUE). صحيح. line 1265: إذا loss → Dr `'8610'` (Loss on Asset Disposal — EXPENSE). صحيح. لكن هذه الأكواد مُدمجة hardcoded (لا role lookup).
  - ميتة. **التوصية**: حذف أو ربط.

### 4.23 `autoEntryVATDeclaration` (engine.ts:1289-1328) — مستخدمة

- **Debit/Credit**: Dr VAT_OUTPUT (output), Cr VAT_INPUT (input), Cr VAT_DUE (net) أو Dr VAT_REFUND (net). ⚠️
- **Issues**:
  - **[CRITICAL] خطأ محاسبي**: line 1300: `vatRefundCode = getAccountCodeByRole(VAT_INPUT) || '1410'` — للسطر المدين في حالة الاسترداد، تستخدم حساب VAT_INPUT (3120) كـ asset refund. هذا يخلط بين liability (3120) و asset (1410). الصحيح: حساب VAT_REFUND_RECEIVABLE (1410) المستقل. الـ role غير معرَّف. النتيجة: في حالة استرداد VAT، يُسجَّل مدين على حساب liability، يُصفِّرهُ (يجعله 0 أو سالب) بدلاً من إنشاء asset.
  - [HIGH] fallbacks `'3110'`, `'3120'`, `'3130'`.
  - **[HIGH] في المُستدعي `vat/route.ts:237`**: ✅ داخل tx. لا try/catch ابتلاعي بعد إصلاح Tier-2.

### 4.24 `autoEntryVATPayment` (engine.ts:1335-1357) — مستخدمة

- **Debit/Credit**: Dr VAT_DUE, Cr BANK. ✅
- **Issues**:
  - [HIGH] line 1343: `bankCode = await resolvePaymentAccountCode('BANK', tx)` — يُعيد الكود، لكن `resolvePaymentAccountCode` قد ترجع `'1110'` (Cash) كـ fallback أخير (account-roles.ts:675). هذا يعني أنه إذا لا يوجد حساب BANK role، يتم سداد الضريبة من الخزينة (Cash) — قد يكون أو لا يكون مقبولاً، لكن الرسالة لا توضِّح.
  - ✅ داخل tx.

### 4.25 `autoEntryIFRS15Revenue` (ifrs15.ts:200-237) — ميتة

- **Debit/Credit**: Dr CONTRACT_ASSET, Cr UNBILLED_REVENUE. ✅
- **Issues**:
  - **[HIGH] entryNo غير متوافق مع `getNextEntryNo`**: `IFRS15-${projectId.slice(-6)}-${asOfDate.getTime()}` — لا يبدأ بـ `JE-` لذا `getNextEntryNo` (guard.ts:395) لا يُحسِبه. يمكن أن يصطدم مع `JE-NNNNNN` لاحقاً (regex `^JE-(\d+)$` لا يلتقطه، لكن الـ unique constraint على entryNo يمكن أن يفشل إذا تكرر).
  - **[HIGH] lazy imports** (line 213-214) — تصميم غير نظيف.
  - **[HIGH] `as any` cast** (line 230) — يتجاوز type check.
  - ميتة — لا مستدعي في src/.
  - **التوصية**: حذف أو ربط.

---

## 5. الدوال الميتة (غير المستخدمة في src/)

| # | الدالة | الموقع | المستدعون | الحالة |
|---|---|---|---|---|
| 1 | `autoEntrySalesInvoice` | engine.ts:440 | 0 | ميتة — البديل `createSalesInvoiceJournalEntry` |
| 2 | `autoEntryProgressClaim` | engine.ts:580 | 0 (ترمي) | DEPRECATED by design — لكن `createProgressClaimJournalEntry` لا تزال تُستدعى |
| 3 | `autoEntryClientPayment` | engine.ts:666 | 0 | ميتة — البديل `createClientPaymentJournalEntry` |
| 4 | `autoEntrySupplierPayment` | engine.ts:696 | 0 | ميتة — البديل `createSupplierPaymentJournalEntry` |
| 5 | `autoEntrySalary` | engine.ts:947 | 0 | ميتة — المسارات تستخدم `autoEntryExpense` (خطأ) |
| 6 | `autoEntryGOSI` | engine.ts:991 | 0 | ميتة |
| 7 | `autoEntryDepreciation` | engine.ts:1021 | 0 | ميتة — البديل `runDepreciationForAsset` |
| 8 | `autoEntryRentalDepreciation` | engine.ts:1058 | 0 | ميتة — البديل في depreciation-engine.ts |
| 9 | `autoEntryDeliveryFees` | engine.ts:1087 | 0 | ميتة — مدمجة في فاتورة التأجير |
| 10 | `autoEntryContractAdvance` | engine.ts:1125 | 0 | ميتة |
| 11 | `autoEntryRetention` | engine.ts:1156 | 0 | ميتة |
| 12 | `autoEntryZakat` | engine.ts:1185 | 0 | ميتة |
| 13 | `autoEntryEndOfService` | engine.ts:1212 | 0 | ميتة |
| 14 | `autoEntryAssetDisposal` | engine.ts:1241 | 0 | ميتة |
| 15 | `autoEntryIFRS15Revenue` | ifrs15.ts:200 | 0 | ميتة |
| 16 | `calculatePOC` | ifrs15.ts:19 | 1 (داخلي فقط) | غير مستدعى من API route — ميتة فعلياً |
| 17 | `calculatePeriodRevenue` | ifrs15.ts:145 | 1 (داخلي فقط) | غير مستدعى من API route |
| 18 | `accountingHealthCheck` | guard.ts:414 | 0 in src/ (يُستدعى من API routes؟) — grep results: 0 | ميتة (يُستدعى عبر `/api/accounting-health`؟) |
| 19 | `validateFinancialConsistency` | consistency.ts:33 | 0 (يُستدعى عبر `/api/financial-consistency`؟) — يُستدعى عبر API مباشرة | OK |
| 20 | `getAccountBalance` | engine.ts:1459 | 0 | ميتة |
| 21 | `getSalaryAccountCode` | engine.ts:1445 | 0 | ميتة |
| 22 | `generateEntryPreview` | mapping.ts:576 | 0 | ميتة |
| 23 | `getAccountsByActivity` | mapping.ts:567 | 0 | ميتة |
| 24 | `getExpenseAccounts` | mapping.ts:572 | 0 | ميتة |
| 25 | `getAccountMapping` | mapping.ts:549 | 0 | ميتة |
| 26 | `getExpenseAccountCode` | mapping.ts:555 | 0 | ميتة |
| 27 | `getPaymentAccountCode` | mapping.ts:559 | 0 | ميتة — البديل `resolvePaymentAccountCode` في account-roles.ts |
| 28 | `EXPENSE_CATEGORY_ACCOUNT_MAP` (const) | mapping.ts:506 | 0 | ميتة |
| 29 | `EQUIPMENT_ACCOUNT_MAP` (const) | mapping.ts:539 | 0 | ميتة |
| 30 | `CLIENT_ACCOUNT`, `SUPPLIER_ACCOUNT`, `SUBCONTRACTOR_ACCOUNT` | mapping.ts:547 | 0 | ميتة |
| 31 | `PAYMENT_METHOD_ACCOUNT_MAP` (const) | mapping.ts:548 | 1 (في `getPaymentAccountCode` الميتة) | ميتة فعلياً |
| 32 | `SALARY_ACCOUNT_MAP` (const) | mapping.ts:556 | 0 | ميتة |

**إجمالي الدوال الميتة: 32** (15 منها autoEntry أو وظائف مساعدة لها).

**التوصية**: حذف كل ما سبق. mapping.ts بأكمله (~620 سطر) شبه ميت — فقط `OperationType` enum و `ACCOUNT_MAPPINGS` قد يُستخدمان في الـ UI للعرض، لكن لا تأثير محاسبي فعلي.

---

## 6. قواعد الحماية R1-R12

| القاعدة | الوصف | الإجراء في `postJournalEntry`/`createJournalEntry` | مكان Bypass |
|---|---|---|---|
| **R1** | كل عملية مالية MUST تنشئ قيد يومية مرحّل | ✅ `postJournalEntry` ينشئ دائماً status='POSTED' (guard.ts:282) | ❌ **[CRITICAL]** مسارات مع `try/catch` تبتلع فشل القيد: `petty-cash:61`, `advances:54`, `salaries/route.ts:97`, `salaries/[id]:101`, `subcontractor-invoices:88`, `supplier-invoices/[id]:111`, `equipment/fuel:91`, `equipment/maintenance:118`, `equipment/operations:95`, `equipment/expenses:84`, `salary-payments:183,249`. في كل هذه المسارات، يُنشأ المستند بدون قيد. |
| **R2** | القيد متوازن (debit = credit ضمن 0.01) | ✅ guard.ts:228-234 | ✅ لا bypass |
| **R3** | ≥ 2 بنود | ✅ guard.ts:114-121 | ✅ لا bypass |
| **R4** | حساب نشط + allowPosting | ✅ guard.ts:166-179 | ❌ **[CRITICAL]** `journal-entries/[id]/route.ts:123` يستخدم `a.isPostable` (اسم خاطئ، الصحيح `allowPosting`) → الفلتر دائماً true → كل محاولة DRAFT→POSTED مرفوضة. (المسار ميت حالياً لأن POST route ينشئ POSTED مباشرة، لكنه bug). |
| **R5** | بند واحد له مدين XOR دائن > 0 | ✅ guard.ts:194-214 | ✅ لا bypass |
| **R6** | التاريخ في فترة مفتوحة | ✅ guard.ts:245-247 (via `assertPeriodOpen`) | ❌ **[HIGH]** `reverseJournalEntry` يمرر `skipPeriodGuard: true` (guard.ts:366) — العكس يسمح في فترة مغلقة. منطقياً مقبول (عكس قيد قديم)، لكن يفتح ثغرة: أي route يستدعي `reverseEntry` يمكنه عكس قيد في فترة مغلقة دون رقابة. ❌ **[HIGH]** `journal-entries/[id]/route.ts:134-146` يفحص `db.fiscalPeriod.findFirst({ status: 'OPEN' })` — لكن `FiscalPeriod.status` حقل String (@default("OPEN"))، وليس مرتبطاً بـ `PeriodClosing` التي يفحصها `assertPeriodOpen`. اثنان من أنظمة الفترات غير متّسقتين. ❌ **[CRITICAL]** `fiscal-years/[id]/close/route.ts:191` ينشئ قيد إقفال بتاريخ `fiscalYear.endDate`، ثم يُحدِّث FiscalYear.status='CLOSED'. لكن القيد التالي (لو وُجد) لِنفس السنة سيرسب `assertPeriodOpen` لأن FY.status='CLOSED'. هذا صحيح. لكن `assertPeriodOpen` لا يفلتر `FiscalPeriod.status` (line 31-36 يفحص FY فقط). |
| **R7** | entryNo فريد | ✅ guard.ts:250-257 (findUnique on entryNo) + Prisma `@unique` | ⚠️ **[HIGH]** `getNextEntryNo` (guard.ts:394-407) يفحص فقط `JE-NNNNNN` entries. القيود ذات `JE-SI-`, `JE-VAT-`, `IFRS15-`, `JE-DEP-AST-` لا تُحسَب → قد يُولِّد `getNextEntryNo` رقماً يتطابق مع قيد موجود ببادئة مختلفة (لكن `@unique` يمنع الالتزام). |
| **R8** | نوع الحساب صحيح | ✅ guard.ts:182-188 | ✅ لا bypass |
| **R9** | المصدر: JournalLine WHERE status='POSTED' AND deletedAt IS NULL | ✅ مطبَّق في `getTrialBalance` (engine.ts:1371-1373) و `getGeneralLedger` (engine.ts:1497-1501) و `accountingHealthCheck` (guard.ts:425,441,454) | ❌ **[HIGH]** `consistency.ts:44-53` raw SQL لا يفلتر status ولا deletedAt. ❌ **[HIGH]** `accountingHealthCheck` check #4 (guard.ts:470) يفلتر `isActive: true` على الحسابات → deactivate account يُخفي أرصدته من فحص المعادلة المحاسبية. |
| **R10** | netDebit = max(0, debit-credit)؛ netCredit = max(0, credit-debit) | ✅ engine.ts:1414-1422 | ✅ مطبَّق |
| **R11** | الأصول = الخصوم + حقوق الملكية | ✅ guard.ts:464-493 (check #4) | ⚠️ انظر R9 ملاحظة حول `isActive` |
| **R12** | لا حذف قيد مرحّل — فقط عكسه | ✅ `reverseJournalEntry` (guard.ts:313) ينشئ قيد عكسي دون حذف الأصلي | ❌ **[HIGH]** `expenses/[id]/route.ts:66` `tx.expense.delete({ where: { id } })` — حذف硬 للمصروف (رغم أن Expense.deletedAt موجود). حذف السجل المالي يُفقد الـ audit trail. ❌ **[HIGH]** `purchase-invoices/[id]/route.ts:80` `tx.purchaseInvoice.update({ status: 'CANCELLED' })` لا يستخدم soft-delete. ❌ **[HIGH]** `subcontractor-invoices/[id]/route.ts:280` `tx.purchaseInvoice.delete` — حذف hard. ❌ **[HIGH]** `salary/[id]/route.ts:144` `db.salary.delete` — حذف hard. ❌ **[MEDIUM]** `JournalEntry.reversedEntry` has `onDelete: SetNull` (schema.prisma:1801) — حذف القيد العكسي يُلغي ربط الأصلي به، يُفقد audit trail للعكس. (ملاحظة سابقة) |

### 6.1 Bypass مباشر لـ `db.journalEntry.create` خارج engine/guard

grep على `journalEntry.create|journalEntry.createMany|journalEntry.upsert`:

| الموقع | الحالة |
|---|---|
| `lib/accounting/guard.ts:277` | ✅ sanctioned (`postJournalEntry`) |
| `lib/auto-journal.ts:5` | تعليق فقط |
| `lib/accounting/engine.ts:408` | تعليق فقط |
| `app/api/fiscal-years/[id]/reopen/route.ts:36` | تعليق فقط |

**النتيجة**: ✅ لا bypass مباشر. كل القيود تمر عبر `postJournalEntry` (R1-R8 enforced) أو `reverseJournalEntry` (R12 enforced). المشكلة في المُستدعين الذين يبتلعون الأخطاء.

---

## 7. دليل الحسابات

### 7.1 `initializeChartOfAccounts` (engine.ts:332-380)

- **[CRITICAL]** لا يقبل `tx`، يستخدم `db` مباشرة. كتاباته غير ذرية مع أي tx خارجية.
- **[HIGH]** يتم استدعاؤها داخل `$transaction` في 7 مسارات (انظر 1.4) — كلها تعاني من نفس المشكلة.
- **[MEDIUM]** يُعاد استدعاؤها على كل POST لمصروف/سلفة/فاتورة مورد. كل استدعاء يمسح 110 حساباً ويحاول تحديثها (engine.ts:344-370). إذا تطابقت الحقول، لا update؛ لكن `existing.activityType !== (template.activityType || null)` قد يُطلق update كاذبة (مثلاً إذا existing.activityType='BOTH' و template.activityType='BOTH' → متساويان، OK؛ لكن إذا existing.activityType=null و template.activityType='BOTH' → غير متساويان → update). أداء سيء.
- **[HIGH]** لا تحقق دوري في parent/child: إذا أُدخل حساب بـ parentCode يشير لحساب غير موجود، يُترك parentId=undefined (line 308-310: `if (parent) parentId = parent.id`). لا throw، لا تحذير. حساب يتيم.
- **[HIGH]** لا تحقق أن الـ code فريد عالمياً (فقط Prisma `@unique` على `Account.code`). إذا حاول template إضافة كود مكرر، يرمي Prisma خطأ غير مهيَّأ.
- **[MEDIUM]** لا تحقق أن نوع الحساب (type) يطابق نوع الـ parent. يمكن إنشاء حساب ASSET بـ parent LIABILITY — غير منطقي.

### 7.2 مخطط دليل الحسابات (CHART_OF_ACCOUNTS_TEMPLATE, engine.ts:65-248)

- **[MEDIUM]** `code: '8630'` — Other Expenses (line 247). يُستخدم كـ fallback في autoEntryExpense و autoEntryPettyCash. لكن `accountRole: undefined` لهذا الحساب (ليس له role). لو deactivate، الـ fallback يفشل بصمت.
- **[MEDIUM]** `code: '1130'` Petty Cash (line 73) — `accountRole: 'CASH'` (وليس PETTY_CASH مستقل). `resolvePaymentAccountCode('PETTY_CASH')` ترجع CASH role → قد تُعيد 1110 (Treasury) أو 1130 (Petty Cash) حسب الترتيب الأبجدي للكود (account-roles.ts:562-569 `orderBy: { code: 'asc' }` → 1110 أولاً). هذا يعني أن PETTY_CASH غالباً يُرحَّل لـ 1110 Treasury، ليس 1130 Petty Cash. خطأ محاسبي.
- **[HIGH]** `code: '3500'` Retention Payable (line 137) — `accountRole: undefined`. لكن `autoEntryRetention` (engine.ts:1156) تستخدم `RETENTION_RECEIVABLE` (للأصل 1220). لا يوجد role لـ Retention Payable (الخصم من المقاولين). ثغرة في الـ roles.
- **[HIGH]** `code: '1410'` VAT Refund Receivable (line 88) — `accountRole: 'VAT_INPUT'`. هذا يجعل `getAccountCodeByRole('VAT_INPUT')` ترجع 1410 أحياناً (إذا 3120 غير معرَّف أو أقل ترتيباً). الخلط بين Input VAT (liability/3120) و VAT Refund (asset/1410) في نفس الـ role.
- **[MEDIUM]** `code: '3120'` Input VAT (line 126) — `accountRole: 'VAT_INPUT'`. يُعتبر liability (نوع LIABILITY، line 126). لكن VAT_INPUT تقنياً يمكن أن يكون asset (إذا قابل الفارق لصالح المنشأة). التعريف هنا يتعارض مع `AccountRole.VAT_INPUT.defaultCodes: ['1410']` (account-roles.ts:173). تعارض بين ملفَّين.
- **[HIGH]** `code: '6310'` Sale of Used Equipment (line 185) — `accountRole: undefined`. لكن `autoEntryAssetDisposal` (engine.ts:1263) يستخدم الكود hardcoded. لا role لربطه.
- **[HIGH]** `code: '8610'` Loss on Asset Disposal (line 245) — `accountRole: undefined`. نفس المشكلة.

### 7.3 الهرمية والـ postable flag

- ✅ `Account.parent` has `onDelete: Restrict` (schema.prisma:1768) — يمنع حذف أب له أبناء.
- ✅ `Account.code` is `@unique` (schema.prisma:1751).
- ❌ **[HIGH]** لا تحقق في engine.ts أن `allowPosting=true` فقط على leaf nodes (no children). يمكن إنشاء حساب أب بـ allowPosting=true وترحيل قيود عليه — يُربك الـ trial balance (الأب يحسب والأبناء يحسبون أيضاً → double counting).
- ❌ **[HIGH]** لا تحقق من دوري في parent (A→B→A). Prisma `Restrict` لا يمنع الدورات.
- ❌ **[MEDIUM]** لا تحقق أن type الابن يطابق type الأب.

---

## 8. الربط بالأدوار

### 8.1 Roles معرَّفة في `account-roles.ts` لكن غير مستخدمة في أي autoEntry

| Role | معرَّف | مستخدم في autoEntry؟ |
|---|---|---|
| `SALARIES_PAYABLE` | account-roles.ts:50 | ❌ لا — salary-payments/route.ts يستخدم hardcoded `'3310'` بدلاً من role |
| `PROJECT_WIP` | account-roles.ts:59 | ❌ لا |
| `CONTRACT_ASSET` | account-roles.ts:60 | ✅ autoEntryIFRS15Revenue (ميتة) |
| `CONTRACT_LIABILITY` | account-roles.ts:61 | ❌ لا |
| `UNBILLED_REVENUE` | account-roles.ts:62 | ✅ autoEntryIFRS15Revenue (ميتة) |
| `FX_GAIN`, `FX_LOSS` | account-roles.ts:63,64 | ❌ لا — لا يوجد autoEntry لفروقات العملة |
| `RETAINED_EARNINGS` | account-roles.ts:65 | ✅ fiscal-years/[id]/close/route.ts:58 |
| `SUBCONTRACTOR_ADVANCE` | account-roles.ts:66 | ❌ لا |
| `SUBCONTRACTOR_RETENTION_PAYABLE` | account-roles.ts:67 | ❌ لا |
| `DELAY_PENALTY_REVENUE` | account-roles.ts:68 | ❌ لا |
| `INVENTORY` | account-roles.ts:69 | ❌ لا — goods-receipt لا ينشئ قيداً أصلاً |
| `GRNI` | account-roles.ts:70 | ❌ لا — لا قيد GRNI |
| `VAT_SETTLEMENT` | account-roles.ts:71 | ❌ لا |
| `FIXED_ASSET` | account-roles.ts:45 | ✅ depreciation-engine.ts:320 |

### 8.2 Roles مُستخدمة في autoEntry بدون mapping fallback آمن

| Role | autoEntry المستخدمة | ماذا يحدث عند عدم وجود mapping؟ |
|---|---|---|
| `CUSTOMER_AR` | autoEntrySalesInvoice, autoEntryClientPayment, autoEntryRetention, autoEntryDeliveryFees, autoEntryRentalInvoice, autoEntryContractAdvance | `autoEntrySalesInvoice` يستخدم `requireAccountByRole` → يرمي Error. **لكن** `autoEntryClientPayment` وغيرها تستخدم `getAccountCodeByRole \|\| '1210'` → fallback لكد ثابت قد لا يكون موجوداً → `ACCOUNT_NOT_FOUND` في الحارس. |
| `SUPPLIER_AP` | autoEntryPurchaseInvoice, autoEntrySupplierPayment, autoEntryEquipmentCost | `getAccountCodeByRole \|\| '3210'` → نفس المشكلة. |
| `VAT_INPUT` | autoEntryPurchaseInvoice, autoEntryExpense, autoEntrySubcontractorInvoice, autoEntryVATDeclaration | `getAccountCodeByRole \|\| '3120'` + role له `defaultCodes: ['1410']` → تناقض (انظر 7.2). |
| `VAT_OUTPUT` | autoEntrySalesInvoice, autoEntryRentalInvoice, autoEntryDeliveryFees, autoEntryVATDeclaration | `getAccountCodeByRole \|\| '3110'` → ✅ لكن في `autoEntrySalesInvoice:478` لا fallback، فقط `if (vatCode)` → إذا لا يوجد حساب، يُنشأ القيد بدون سطر VAT → غير متوازن. |
| `VAT_DUE` | autoEntryVATDeclaration, autoEntryVATPayment | `getAccountCodeByRole \|\| '3130'` → ✅ |
| `CASH` | autoEntryPettyCash, autoEntryEmployeeAdvance, autoEntryExpense, autoEntryClientPayment, autoEntrySupplierPayment, autoEntryContractAdvance, autoEntryAdvanceSettlement | `resolvePaymentAccountCode` لها fallback داخلي لـ `'1110'` (account-roles.ts:673-676) → دائماً يُرجع كوداً. **لكن** قد يُرجع كود حساب غير موجود إذا قُتل 1110. |
| `BANK` | autoEntryExpense, autoEntryClientPayment, autoEntrySupplierPayment, autoEntryVATPayment, autoEntryContractAdvance | `resolvePaymentAccountCode` fallback لـ `'1120'` → نفس المشكلة. |
| `EMPLOYEE_ADVANCE` | autoEntryEmployeeAdvance, autoEntryAdvanceSettlement | `getAccountCodeByRole \|\| '1230'` → ✅ |
| `PAYROLL_EXPENSE` | autoEntrySalary, autoEntryAdvanceSettlement, autoEntryEndOfService, autoEntryDepreciation | `getAccountCodeByRole \|\| '8110'` → ✅ |
| `GOSI_EXPENSE` | autoEntrySalary, autoEntryGOSI | `getAccountCodeByRole \|\| '8210'` → ✅ |
| `GOSI_PAYABLE` | autoEntrySalary, autoEntryGOSI | `getAccountCodeByRole \|\| '3830'` → ✅ |
| `RENTAL_REVENUE` | autoEntrySalesInvoice, autoEntryRentalInvoice, autoEntryDeliveryFees | `getAccountCodeByRole \|\| '6210'` أو `'6220'` → ✅ |
| `PROJECT_REVENUE` | autoEntrySalesInvoice | `requireAccountByRole` → يرمي. ✅ |
| `SERVICE_REVENUE` | autoEntrySalesInvoice | `requireAccountByRole` → يرمي. ✅ |
| `PROJECT_COST` | autoEntryPurchaseInvoice, autoEntryExpense, autoEntryEquipmentCost | `getAccountCodeByRole \|\| '8630'` أو `'7110'` → ✅ |
| `SUBCONTRACTOR_COST` | autoEntrySubcontractorInvoice, autoEntryPurchaseInvoice | `getAccountCodeByRole \|\| '7130'` → ✅ |
| `FUEL_EXPENSE`, `MAINTENANCE_EXPENSE`, `DRIVER_EXPENSE`, `TRANSPORT_EXPENSE` | autoEntryEquipmentCost, autoEntryExpense | fallbacks متنوعة → ✅ |
| `RENTAL_DEPRECIATION` | autoEntryRentalDepreciation | `getAccountCodeByRole \|\| '7250'` → ✅ |
| `DEPRECIATION_EXPENSE`, `ACCUM_DEPRECIATION` | autoEntryDepreciation, autoEntryRentalDepreciation | fallbacks → ✅ |
| `ZAKAT_EXPENSE`, `ZAKAT_PAYABLE` | autoEntryZakat | `getAccountCodeByRole \|\| '8510'/'3810'` → ✅ |
| `EOS_PROVISION` | autoEntryEndOfService | `getAccountCodeByRole \|\| '3710'` → ✅ |
| `CUSTOMER_ADVANCE` | autoEntryContractAdvance | `getAccountCodeByRole \|\| ('3410'/'3420')` → ✅ |
| `RETENTION_RECEIVABLE` | autoEntryRetention | `getAccountCodeByRole \|\| '1220'` → ✅ |
| **`SALARIES_PAYABLE`** | لا autoEntry — salary-payments/route.ts يستخدم `'3310'` hardcoded | ❌ Role غير مستخدم رغم تعريفه |
| **`SUBCONTRACTOR_RETENTION_PAYABLE`** | لا autoEntry | ❌ Role غير مستخدم |
| **`CONTRACT_LIABILITY`** | لا autoEntry | ❌ Role غير مستخدم — `defaultCodes: ['2110']` خاطئ (2110 = Construction Equipment asset، وليس contract liability) |

### 8.3 أخطاء في defaultCodes

- **[HIGH]** `CONTRACT_LIABILITY.defaultCodes: ['2110']` (account-roles.ts:398) — `2110` هو "Construction Equipment" (ASSET). يجب أن يكون `3610` أو `3620` (Contract Liabilities).
- **[HIGH]** `SUBCONTRACTOR_RETENTION_PAYABLE.defaultCodes: ['2130']` (account-roles.ts:440) — `2130` هو "Vehicles" (ASSET). يجب أن يكون `3500` (Retention Payable).
- **[HIGH]** `GRNI.defaultCodes: ['2120']` (account-roles.ts:461) — `2120` هو "Rental Equipment" (ASSET). GRNI يجب أن يكون liability مثل `3240` (غير موجود في الـ template).
- **[HIGH]** `INVENTORY.defaultCodes: ['1100']` (account-roles.ts:454) — `1100` هو "Cash & Cash Equivalents". يجب أن يكون `1300` (Inventory parent).
- **[HIGH]** `FX_GAIN.defaultCodes: ['4290']` (account-roles.ts:412) — `4290` غير موجود في CHART_OF_ACCOUNTS_TEMPLATE. ✅ FX_GAIN مفهوم لكن لا حساب له.
- **[HIGH]** `FX_LOSS.defaultCodes: ['5290']` (account-roles.ts:419) — `5290` غير موجود. ✅ نفس المشكلة.
- **[HIGH]** `UNBILLED_REVENUE.defaultCodes: ['4210']` (account-roles.ts:405) — `4210` غير موجود. الـ template يملك `4310` (Deferred Construction Revenue) و `4320` (Deferred Rental Revenue).
- **[HIGH]** `DELAY_PENALTY_REVENUE.defaultCodes: ['4280']` (account-roles.ts:447) — `4280` غير موجود.
- **[HIGH]** `VAT_SETTLEMENT.defaultCodes: ['2305']` (account-roles.ts:468) — `2305` غير موجود.
- **[HIGH]** `SUBCONTRACTOR_ADVANCE.defaultCodes: ['1230']` (account-roles.ts:433) — يتشارك مع `EMPLOYEE_ADVANCE.defaultCodes: ['1230']`. نفس الكود لدورين مختلفين. هذا يعني `getDefaultAccountByRole('EMPLOYEE_ADVANCE')` و `getDefaultAccountByRole('SUBCONTRACTOR_ADVANCE')` يُرجعان نفس الحساب (1230) → لا تمييز بين سلف الموظف وسلف المقاول في الـ GL.

### 8.4 Roles غير معرَّفة مطلوباً

- **`PETTY_CASH`** role غير معرَّف — Petty Cash (1130) يستخدم role `CASH`. هذا يسبب ارتباك في `resolvePaymentAccountCode('PETTY_CASH')` (ترجع CASH role، ثم 1110 أو 1130 حسب الترتيب).
- **`RETENTION_PAYABLE`** role غير معرَّف — Retention Payable (3500) لا role له.
- **`GAIN_ON_DISPOSAL`** role غير معرَّف — `autoEntryAssetDisposal` يستخدم hardcoded `'6310'`.
- **`LOSS_ON_DISPOSAL`** role غير معرَّف — `autoEntryAssetDisposal` يستخدم hardcoded `'8610'`.
- **`VAT_REFUND_RECEIVABLE`** role غير معرَّف — `autoEntryVATDeclaration` يستخدم VAT_INPUT كـ refund account (خطأ).

---

## توصيات الإصلاح المرتبة حسب الأولوية

### CRITICAL (16)

1. **[CRITICAL]** `fiscal-years/[id]/close/route.ts` — لفّ كامل العملية (status CLOSING, createJournalEntry, status CLOSED, periods CLOSED) في `db.$transaction(async (tx) => { … })`. مرر `tx` لـ `createJournalEntry`.
2. **[CRITICAL]** `fiscal-years/[id]/reopen/route.ts` — لفّ `reverseEntry` + `fiscalYear.update` + `fiscalPeriod.updateMany` في `db.$transaction`. مرر `tx` لـ `reverseEntry`.
3. **[CRITICAL]** `progress-claims/[id]/route.ts:86` — أزِل `createProgressClaimJournalEntry` (المستخلص المعتمد لا يُنشئ قيداً؛ الفاتورة المُولَّدة منه هي التي تنشئ القيد). هذا يُصلح الـ double revenue recognition.
4. **[CRITICAL]** `salaries/route.ts:97-100` و `salaries/[id]/route.ts:101-103` — أزِل `try/catch` الابتلاعي. إذا فشل القيد، يجب أن تفشل المعاملة بالكامل. أيضاً استبدل `autoEntryExpense` بـ `autoEntrySalary` (الدالة الميتة) التي تسجِّل GOSI بشكل صحيح، أو أنشئ `createSalaryJournalEntry` جديد في auto-journal.ts يطبِّق accrual (Dr Payroll / Cr Salaries_Payable).
5. **[CRITICAL]** `salary-payments/route.ts:183-185, 249-251` — أزِل `try/catch` الابتلاعي. استخدم `AccountRole.SALARIES_PAYABLE` بدلاً من hardcoded `'3310'`.
6. **[CRITICAL]** `supplier-invoices/[id]/route.ts:111-113` — أزِل `try/catch`. السماح بفشل المعاملة إذا القيد فشل.
7. **[CRITICAL]** `petty-cash/route.ts:61-63` — أزِل `try/catch`.
8. **[CRITICAL]** `advances/route.ts:54-56, 115-117` — أزِل `try/catch`.
9. **[CRITICAL]** `subcontractor-invoices/route.ts:88-90` — أزِل `try/catch`.
10. **[CRITICAL]** `equipment/fuel/route.ts:91-94`, `equipment/maintenance/route.ts:118-121`, `equipment/operations/route.ts:95-98`, `equipment/expenses/route.ts:84-87` — أزِل `try/catch` + لفّ في `$transaction`.
11. **[CRITICAL]** `supplier-invoices/[id]/route.ts:107`, `equipment/fuel/route.ts:83`, `equipment/maintenance/route.ts:110`, `equipment/operations/route.ts:93`, `salaries/route.ts` (salary projectId→costCenterId) — أصلِح `costCenterId: projectId` bug. أنشئ lookup من projectId→costCenterId أو مرر null.
12. **[CRITICAL]** `initializeChartOfAccounts` (engine.ts:332) — اقبل `tx?` واستخدمه في كل كتابة. أو أزِل الاستدعاءات من داخل المسارات (استدعِه مرة واحدة في seed/initialize فقط).
13. **[CRITICAL]** `journal-entries/[id]/route.ts:123` — استبدل `a.isPostable` بـ `a.allowPosting`. (اليوم المسار ميت لأن POST route ينشئ POSTED مباشرة، لكن إذا أُضيف دعم DRAFT فسينكسر).
14. **[CRITICAL]** `autoEntryVATDeclaration` (engine.ts:1300) — أصلِح `vatRefundCode`. أنشئ role `VAT_REFUND_RECEIVABLE` واربطه بحساب 1410.
15. **[CRITICAL]** `goods-receipt/route.ts` — أنشئ قيد GRNI (Dr Inventory / Cr GRNI) أو على الأقل Dr Project Cost / Cr Supplier AP. لفّ كل الكتابات في `$transaction`.
16. **[CRITICAL]** `purchase-invoices/route.ts:208-221`, `sales-invoices/route.ts:720-750` — انقل `db.*.update` الأخير داخل `$transaction` السابقة (أو ادمج كل التحديثات في tx واحدة).

### HIGH (14)

17. **[HIGH]** `account-statement/route.ts:135-163, 276-304` — `auto-journal.ts` يجب أن يضع `costCenterId` على سطر AR/AP (لا فقط على revenue/expense). أو غيِّر `account-statement` لِعدم الفلترة بـ costCenter على AR/AP lines.
18. **[HIGH]** `getNextEntryNo` (guard.ts:394) — استبدل بـ sequence table أو `db.journalEntry.count() + 1` (مع قفل). دعم القيود ذات البادئات المختلفة.
19. **[HIGH]** `autoEntry*` fallbacks — أزِل كل `|| 'HARDCODED'` fallbacks. استخدم `requireAccountByRole` بدلاً من `getAccountCodeByRole` لتُرمي خطأً واضحاً بدلاً من استخدام حساب خاطئ.
20. **[HIGH]** `consistency.ts:44-53` — أضِف `WHERE je."deletedAt" IS NULL AND jl."deletedAt" IS NULL AND je.status = 'POSTED'` للـ raw SQL.
21. **[HIGH]** `accountingHealthCheck` check #4 (guard.ts:470) — أزِل فلتر `isActive: true`. يجب أن تُحسَب كل الحسابات (نشطة وغير نشطة) في المعادلة المحاسبية.
22. **[HIGH]** `autoEntrySalary` (engine.ts:947) — أصلِح `sourceId: \`SAL-${Date.now()}\`` لِيكون idempotent (استخدم salary ID).
23. **[HIGH]** أزِل 14 دالة autoEntry ميتة + 6 دوال مساعدة ميتة + 6 ثوابت ميتة في mapping.ts. (انظر القسم 5).
24. **[HIGH]** `JournalEntry` schema — أضِف `descriptionAr` column، أو أزِل `descriptionAr` من `JournalEntryInput` و `JournalEntryTemplate` والـ 24 autoEntry callers.
25. **[HIGH]** `account-roles.ts` defaultCodes errors — أصلِح `CONTRACT_LIABILITY`, `SUBCONTRACTOR_RETENTION_PAYABLE`, `GRNI`, `INVENTORY`, `UNBILLED_REVENUE`, `FX_GAIN`, `FX_LOSS`, `DELAY_PENALTY_REVENUE`, `VAT_SETTLEMENT` defaultCodes.
26. **[HIGH]** `SUBCONTRACTOR_ADVANCE.defaultCodes: ['1230']` — اعرض حساباً مستقلاً (مثل 1240 "Advances to Subcontractors") أو أضِف حقل ActivityType لِلتمييز.
27. **[HIGH]** `expenses/[id]/route.ts:66` — استخدم soft-delete (`deletedAt: new Date()`) بدلاً من `tx.expense.delete`.
28. **[HIGH]** `subcontractor-invoices/[id]/route.ts:280`, `salary/[id]/route.ts:144` — استخدم soft-delete.
29. **[HIGH]** `autoEntryEquipmentCost` (engine.ts:833) — أصلِح `OPERATION` mapping. يجب أن يُ map لـ DRIVER_EXPENSE أو حساب تشغيل مستقل، لا FUEL_EXPENSE.
30. **[HIGH]** `petty-cash/route.ts` و`advances/route.ts` — مرر `costCenterId` (مثلاً من branchId).

### MEDIUM (12)

31. **[MEDIUM]** `autoEntryDeliveryFees` (engine.ts:1097) — أنشئ role `DELIVERY_REVENUE` واربطه بـ 6220.
32. **[MEDIUM]** `autoEntryGOSI` (engine.ts:1008) — أصلِح منطق الـ double-entry (Dr Payroll للموظف + Dr GOSI_Employer / Cr GOSI_Payable total).
33. **[MEDIUM]** `autoEntryDepreciation` (engine.ts:1028) — ميِّز بين أنواع الأصول (CONSTRUCTION_EQUIPMENT vs VEHICLES vs OFFICE vs SOFTWARE) بِـ roles مستقلة.
34. **[MEDIUM]** `autoEntryEndOfService` (engine.ts:1218) — أنشئ role `EOS_EXPENSE` مستقل بدلاً من استخدام PAYROLL_EXPENSE.
35. **[MEDIUM]** `initializeChartOfAccounts` — تحقق من دوري parent/child ومن type-consistency بين الأب والابن.
36. **[MEDIUM]** `runBulkDepreciation` (depreciation-engine.ts:796) — لفّ كل الأصول في `$transaction` واحدة (أو على الأقل سجِّل الأصول التي نجحت/فشلت في جدول batch).
37. **[MEDIUM]** `deleteAsset` (depreciation-engine.ts:920) — أزِل `try/catch` الابتلاعي لِـ reverseEntry.
38. **[MEDIUM]** `ProgressClaim.claimNo` (schema.prisma:958) — أضِف `@unique`.
39. **[MEDIUM]** `Salary` — أضِف `@@unique([employeeId, year, month])` لمنع تكرار الراتب.
40. **[MEDIUM]** `account-statement/route.ts:135,276` — أزِل `arCodes`/`apCodes` (متغيرات معرَّفة غير مستخدمة).
41. **[MEDIUM]** `JournalEntry.reversedEntry onDelete: SetNull` (schema.prisma:1801) — غيِّر لـ `Restrict` لمنع فقدان audit trail.
42. **[MEDIUM]** `assertPeriodOpen` (period-guard.ts) و `journal-entries/[id]/route.ts:134` — وحِّد نظام الفترات (FiscalPeriod.status vs PeriodClosing). استخدم أحدهما.

### LOW (6)

43. **[LOW]** `ifrs15.ts:213-214` lazy imports — أعد الترتيب لتفاديها.
44. **[LOW]** `ifrs15.ts:230` `as any` cast — اكتب الـ types بشكل صحيح.
45. **[LOW]** `mapping.ts` كاملاً (~620 سطر) — احذف إذا غير مستخدم فعلياً.
46. **[LOW]** `autoEntrySalary` (engine.ts:964,969) — استخدم حسابين مستقلين (Dr Payroll, Cr Payroll) بدلاً من حساب واحد بجهتين.
47. **[LOW]** `autoEntry*` descriptions — وحِّد صياغة `description` و `descriptionAr` (بعضها يبدأ بـ "فاتورة" وبعضها بـ "Invoice").
48. **[LOW]** `getPaymentAccountCode` (mapping.ts:559) — حذف (ميتة، البديل `resolvePaymentAccountCode`).

---

## ملاحظات ختامية

- هذا التقرير READ-ONLY. لم تُعدَّل أي ملفات.
- تم التحقق من كل استدعاءات `journalEntry.create` خارج engine/guard — لا bypass مباشر موجود. المشكلة الأساسية في المُستدعين الذين يبتلعون أخطاء القيد بصمت (11 موقعاً).
- 14 دالة autoEntry ميتة (من 24). mapping.ts شبه ميت بالكامل. التنظيف سيُقلِّل engine.ts من 1529 سطراً إلى ~900 سطر.
- الـ double revenue recognition في progress-claims ← sales-invoices هو الأخطر محاسبياً (يُضخِّم الإيراد ويُؤدي لِضريبة VAT مستحقة خاطئة).
- الـ salary cycle (salaries/route.ts + salaries/[id] + salary-payments) يعاني من 3 مشاكل متشابكة: استخدام autoEntryExpense بدلاً من accrual، ابتلاع صامت، hardcoded 3310. إصلاحها يتطلب إعادة تصميم الـ salary JE cycle.
- `initializeChartOfAccounts` المُستدعى على كل POST هو performance regression خطير — يحتاج refactor عاجل.
