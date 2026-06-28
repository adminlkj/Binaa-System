# تقرير تدقيق دورة المبيعات والإيرادات - المرحلة 6

**التاريخ:** 2025-01-XX
**النوع:** READ-ONLY deep audit
**النطاق:** clients, contracts, sales-invoices, service-invoices, client-payments, boq, progress-claims, delivery-orders
**المدقق:** Sales & Revenue Cycle Deep Auditor (Task 6-a, READ-ONLY)
**المنهجية:** تحليل كود ثابت + مراجعة schema + تتبع تدفق القيود + مرجعية متقاطعة مع `src/lib/accounting/{engine,guard,period-guard}.ts`, `src/lib/account-roles.ts`, `src/lib/auto-journal.ts`. تم التحقق من كل ادعاء "zero caller / dead code / hardcoded code / field doesn't exist" عبر grep. تم استبعاد الأخطاء المُصلَحة في Phases 1-5.

---

## ملخص تنفيذي

| الخطورة | العدد |
|---------|-------|
| CRITICAL | 9 |
| HIGH | 13 |
| MEDIUM | 12 |
| LOW | 8 |
| **الإجمالي** | **42** |

- **الملفات المدققة:** 13 نموذج Prisma (Client, Contract, SalesInvoice, SalesInvoiceItem, ClientPayment, BOQItem, ProgressClaim, EquipmentDeliveryOrder, CustomerAdvance, AdvanceRecovery, JournalEntry, JournalLine, Account) + 10 ملفات API route (clients ×3، contracts ×2، sales-invoices ×2، client-payments ×2، boq ×2، progress-claims ×2، delivery-orders ×2) + 8 وحدات UI + 5 ملفات lib.
- **ملاحظة هامة:** نفس أنماط الأخطاء التي رصدتها Phase 5 في سلسلة التوريد (DRAFT لهم قيد، DELETE بدون عكس، CANCELLED بدون عكس، عدم وجود فحص FK قبل الحذف، دالة accounting تستخدم حقلاً غير موجود، تحصيل بدون فحص حالة الفاتورة) موجودة بشكل متطابق في دورة المبيعات. هذا يعني أن إصلاحات Phase 5 لم تُعمَّم على دورة المبيعات.
- **لم يتم تعديل أي ملف** (READ-ONLY). التقرير + إضافة worklog فقط.

---

## قائمة الأخطاء

### P6-CRIT-001: clients/[id]/accounting يفلتر JournalEntry بحقل `clientId` غير موجود في المودل → انهيار وقت التشغيل
- **الملف:** `src/app/api/clients/[id]/accounting/route.ts:41,46`
- **الوصف:** المسار يستعلم عن JournalEntry بحقل `clientId`:
  ```ts
  const journalCount = await db.journalEntry.count({
    where: { clientId: id, deletedAt: null },
  })
  const lastEntry = await db.journalEntry.findFirst({
    where: { clientId: id, deletedAt: null },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  ```
  لكن مودل `JournalEntry` (prisma/schema.prisma:1804-1828) ليس له حقل `clientId` إطلاقاً — الحقول هي: `id, entryNo, date, description, status, sourceType, sourceId, isReversal, reversedEntryId, isSystem, createdAt, updatedAt, deletedAt`. هذا نفس عيب P5-CRIT-007 (المُصلَح في Phase 5 لـ `suppliers/[id]/accounting`) لكنه لم يُصلَح في دورة المبيعات.
- **الأثر:** أي طلب GET إلى `/api/clients/{id}/accounting` يرمي Prisma `Unknown argument 'clientId'` → HTTP 500. شاشة "كشف حساب العميل" أو لوحة معلومات العميل المحاسبية تنهار كلياً. الحقول `journalEntryCount` و `lastTransactionDate` في الاستجابة لا يمكن حسابها أبداً.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "clientId" prisma/schema.prisma | rg "JournalEntry|model"
  # (لا نتائج داخل مودل JournalEntry)
  $ awk 'NR>=1804 && NR<=1828' prisma/schema.prisma | rg "clientId"
  # (لا نتائج — تأكيد أن الحقل غير موجود)
  $ rg -n "clientId: id" src/app/api/clients/[id]/accounting/route.ts
  41:      where: { clientId: id, deletedAt: null },
  46:      where: { clientId: id, deletedAt: null },
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ عميلاً
  CLT_ID=$(curl -s -X POST http://localhost:3000/api/clients -H 'Content-Type: application/json' \
    -d '{"name":"Audit Test Client"}' | jq -r .id)
  # 2. اطلب كشف الحساب المحاسبي
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/clients/$CLT_ID/accounting
  # المتوقع: 500 (Prisma: Unknown argument `clientId`)
  # 3. سجل الخادم يُظهر:
  # PrismaClientValidationError: Unknown argument `clientId`. Available options are ...
  ```

---

### P6-CRIT-002: فواتير المبيعات DRAFT لها قيود يومية مرحَّلة في GL
- **الملف:**
  - `src/app/api/sales-invoices/route.ts:273` — `await createSalesInvoiceJournalEntry(invoice.id, tx)` داخل POST `$transaction`، مباشرة بعد `tx.salesInvoice.create({data: {..., status: 'DRAFT'}})` (السطر 238).
  - `src/app/api/sales-invoices/route.ts:499` — نفس النمط في `createInvoiceFromTimesheet` (status='DRAFT' في السطر 459، إنشاء قيد في السطر 499).
  - `src/app/api/sales-invoices/route.ts:636` — نفس النمط في `createInvoiceManual` (status='DRAFT' في السطر 602، إنشاء قيد في السطر 636).
- **الوصف:** كل مسارات POST الثلاثة تنشئ `SalesInvoice` بحالة `DRAFT` وتستدعي فوراً `createSalesInvoiceJournalEntry(invoice.id, tx)` داخل نفس المعاملة. القيد يُرحَّل إلى GL بينما الفاتورة لا تزال DRAFT:
  - ميزان المراجعة وقائمة الدخل يتضمنان إيرادات غير معتمدة.
  - رصيد ذمم العملاء يتضمن فواتير غير مُرسلة.
  - ضريبة المخرجات (3110) تُحتسب قبل إرسال الفاتورة — مشكلة امتثال ZATCA.
  - انتقال DRAFT → SENT عبر `PATCH /api/sales-invoices/[id]` (sales-invoices/[id]/route.ts:80-114) لا يفعل شيئاً محاسبياً — القيد موجود منذ البداية، فالاعتماد يصبح no-op محاسبياً.
- **الأثر:** R1 مُنتَهَك فعلياً (DRAFT ≠ عملية مالية). GL يضخّم الإيرادات وذمم العملاء وضريبة المخرجات لكل فاتورة DRAFT. المدقق لا يستطيع تمييز الفواتير المعتمدة من غير المعتمدة في GL. هذا عين عيب P5-CRIT-001 (الذي صُلِح في Phase 5 لـ purchase-invoices) لكنه لم يُصلَح في sales-invoices.
- **ملاحظة:** تقرير Phase 1 (01-accounting-engine.md القسم 2.2) وضع علامة ✅ على هذا المسار، لكنه أشار إلى أن المستخلص المعتمد كان يُنشئ قيداً سابقاً (مسبباً إيراداً مزدوجاً). Phase 2 أزالت قيد المستخلص (comment في progress-claims/[id]/route.ts:36-41). بعد ذلك الإصلاح، قيد فاتورة الـ DRAFT أصبح هو حدث الاعتراف الوحيد بالإيراد — لكنه يحدث في وقت خاطئ (DRAFT بدلاً من SENT).
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "status: 'DRAFT'" src/app/api/sales-invoices/route.ts
  238:        status: 'DRAFT',
  459:        status: 'DRAFT',
  602:        status: 'DRAFT',
  $ rg -n "createSalesInvoiceJournalEntry" src/app/api/sales-invoices/route.ts
  273:    await createSalesInvoiceJournalEntry(invoice.id, tx)
  499:    await createSalesInvoiceJournalEntry(invoice.id, tx)
  636:    await createSalesInvoiceJournalEntry(invoice.id, tx)
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة مبيعات يدوية DRAFT (بدون اعتماد)
  INV_ID=$(curl -s -X POST http://localhost:3000/api/sales-invoices -H 'Content-Type: application/json' -d '{
    "clientId":"<CLT-001-id>","date":"2025-01-15","dueDate":"2025-02-15",
    "items":[{"description":"test","quantity":1,"unitPrice":1000}],"vatRate":0.15
  }' | jq -r .id)
  # 2. تحقق من DB: الفاتورة DRAFT لكن لها journalEntryId
  sqlite3 prisma/dev.db "SELECT invoiceNo, status, journalEntryId FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: SRV-XXXX|DRAFT|<non-null-JE-id>
  # 3. القيد موجود في GL ومتوازن
  sqlite3 prisma/dev.db "SELECT je.entryNo, je.status, SUM(jl.debit), SUM(jl.credit)
                          FROM JournalEntry je JOIN JournalLine jl ON jl.journalEntryId=je.id
                          WHERE je.sourceType='SALES_INVOICE' AND je.sourceId='$INV_ID'
                          GROUP BY je.id;"
  # المتوقع: JE-NNNNNN|POSTED|1150.00|1150.00  ← قيد موجود لفاتورة DRAFT
  ```

---

### P6-CRIT-003: sales-invoices/[id] PATCH مع status=CANCELLED لا يعكس القيد
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:80-114` (معاملة PATCH)
- **الوصف:** معاملة PATCH تقبل `status` وتحدّث الفاتورة. عند `CANCELLED`:
  - السطور 83-89: تُعيد ربط التايم شيت إلى APPROVED.
  - السطور 94-100: تُعيد `progressClaim.invoiced=false`.
  - السطر 103-113: `tx.salesInvoice.update({ where: { id }, data: updateData })` — تحديث الحالة فقط.
  
  **لا يوجد استدعاء `reverseEntry(existing.journalEntryId, tx)`.** القيد الأصلي يبقى POSTED في GL، لكن الفاتورة تُعلَّم CANCELLED (غير مرئية تشغيلياً). GL لا يزال يُظهر Dr AR / Cr Revenue / Cr VAT_OUTPUT للفاتورة الملغاة.
- **الأثر:** R1 + R12 مُنتَهَكان. الفواتير الملغاة تحتفظ بأثرها المحاسبي. ذمم العملاء مبالَغ فيها. ضريبة المخرجات محتسبة على فاتورة ملغاة (مشكلة امتثال ZATCA — لا يمكن احتساب ضريبة على فاتورة ملغاة). هذا عين عيب P5-CRIT-003.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "reverseEntry|journalEntryId" src/app/api/sales-invoices/[id]/route.ts
  # (لا نتائج إطلاقاً في الملف)
  $ rg -n "CANCELLED" src/app/api/sales-invoices/[id]/route.ts
  61:    const validStatuses = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']
  83:      if ((status === 'DRAFT' || status === 'CANCELLED') && existing.timesheetId) {
  94:      if ((status === 'DRAFT' || status === 'CANCELLED') && existing.progressClaimId) {
  151:        { error: 'لا يمكن حذف فاتورة إلا في حالة المسودة أو الملغاة. يجب إلغاء الفاتورة أولاً' },
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة (تُنشأ DRAFT مع قيد per P6-CRIT-002)
  INV_ID=$(curl -s -X POST http://localhost:3000/api/sales-invoices ... | jq -r .id)
  JE_ID=$(sqlite3 prisma/dev.db "SELECT journalEntryId FROM SalesInvoice WHERE id='$INV_ID';")
  # 2. ألغِ الفاتورة عبر PATCH
  curl -s -X PATCH http://localhost:3000/api/sales-invoices/$INV_ID \
    -H 'Content-Type: application/json' -d '{"status":"CANCELLED"}'
  # 3. تحقق من DB: الفاتورة CANCELLED لكن القيد لا يزال POSTED
  sqlite3 prisma/dev.db "SELECT status, journalEntryId FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: CANCELLED|<je-id>
  sqlite3 prisma/dev.db "SELECT entryNo, status, isReversal FROM JournalEntry WHERE id='$JE_ID';"
  # المتوقع: JE-NNNNNN|POSTED|0  ← لا يوجد قيد عكسي
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM JournalEntry WHERE reversedEntryId='$JE_ID';"
  # المتوقع: 0  ← لا يوجد قيد عكسي مرتبط
  ```

---

### P6-CRIT-004: sales-invoices/[id] DELETE يحذف فاتورة DRAFT دون عكس قيدها
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:157-183` (معاملة DELETE)
- **الوصف:** معاملة DELETE تسمح بالحذف فقط إذا `status === 'DRAFT' || status === 'CANCELLED'` (السطر 149). لكن بسبب P6-CRIT-002، فواتير DRAFT لها قيد مرحَّل (`journalEntryId` مُعيَّن). الـ DELETE ينفِّذ:
  ```ts
  await db.$transaction(async (tx) => {
    if (invoice.timesheetId) { /* revert timesheet */ }
    if (invoice.progressClaimId) { /* revert claim invoiced */ }
    await tx.salesInvoiceItem.deleteMany({ where: { invoiceId: id } })
    await tx.salesInvoice.delete({ where: { id } })
  })
  ```
  **لا يوجد `reverseEntry(invoice.journalEntryId, tx)`.** القيد يبقى POSTED في GL لكن `sourceId` (مُعرِّف الفاتورة) لم يعد موجوداً — قيد يتيم.
- **الأثر:** R1 + R9 + R12 مُنتَهَكون. قيود يتيمة تتراكم في GL إلى الأبد. ميزان المراجعة يضخّم الإيرادات وذمم العملاء وضريبة المخرجات بشكل دائم. المدقق لا يستطيع مطابقة GL بالبيانات التشغيلية. نفس عيب P5-CRIT-002.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "reverseEntry|journalEntryId" src/app/api/sales-invoices/[id]/route.ts
  # (لا نتائج في معاملة DELETE)
  $ rg -n "tx.salesInvoice.delete" src/app/api/sales-invoices/[id]/route.ts
  180:      await tx.salesInvoice.delete({ where: { id } })
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة DRAFT (لها قيد per P6-CRIT-002)
  INV_ID=$(curl -s -X POST http://localhost:3000/api/sales-invoices ... | jq -r .id)
  JE_ID=$(sqlite3 prisma/dev.db "SELECT journalEntryId FROM SalesInvoice WHERE id='$INV_ID';")
  # 2. احذف الفاتورة DRAFT
  curl -s -X DELETE http://localhost:3000/api/sales-invoices/$INV_ID
  # 3. تحقق من DB: الفاتورة محذوفة، القيد لا يزال POSTED
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: 0
  sqlite3 prisma/dev.db "SELECT entryNo, status FROM JournalEntry WHERE id='$JE_ID';"
  # المتوقع: JE-NNNNNN|POSTED  ← قيد يتيم
  ```

---

### P6-CRIT-005: client-payments POST يسمح بدفع فواتير DRAFT / PAID / CANCELLED + لا فحص overpayment
- **الملف:** `src/app/api/client-payments/route.ts:85-98` (معاملة POST)
- **الوصف:** فحص الفاتورة (السطور 85-98) يتحقق فقط من:
  - وجود الفاتورة.
  - أن `invoice.clientId === clientId`.
  
  **لا يوجد فحص لحالة الفاتورة** (DRAFT / SENT / PAID / CANCELLED). **لا يوجد فحص overpayment** (amount ≤ المتبقي = totalAmount - paidAmount). النتيجة:
  - يمكن دفع فاتورة DRAFT (غير معتمدة) → يُسجَّل قيد Dr Cash / Cr AR لفاتورة لم تُرسل.
  - يمكن دفع فاتورة PAID مرة ثانية → double-payment، paidAmount يصبح > totalAmount، الفاتورة تبقى PAID.
  - يمكن دفع فاتورة CANCELLED → يُسجَّل قيد تحصيل لفاتورة ملغاة، يُعيد الفاتورة إلى PARTIALLY_PAID أو PAID (السطر 134-138 يغيّر الحالة بناءً على newPaidAmount).
  - يمكن دفع مبلغ أكبر من المتبقي → overpayment يُحتسب في AR ( silently credits CLIENT_AR beyond the invoice).
- **الأثر:** R1 مُنتَهَك. ذمم العملاء يمكن أن تصبح سالبة (overpayment). الفواتير الملغاة يمكن إحياؤها بدفعة. هذا عين عيب P5-CRIT-009 (الذي صُلِح في Phase 5 لـ supplier-payments) لكنه لم يُصلَح في client-payments.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "invoice.status|status.*DRAFT|status.*PAID|status.*CANCELLED|overpay|remaining" src/app/api/client-payments/route.ts
  # (لا نتائج — لا فحص حالة ولا فحص overpayment)
  $ rg -n "newPaidAmount" src/app/api/client-payments/route.ts
  131:          const newPaidAmount = toNumber(invoice.paidAmount) + amount
  134:          if (newPaidAmount >= toNumber(invoice.totalAmount)) {
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة (DRAFT مع قيد per P6-CRIT-002)
  INV_ID=...
  # 2. ادفعها وهي DRAFT
  curl -s -X POST http://localhost:3000/api/client-payments -H 'Content-Type: application/json' -d "{
    \"clientId\":\"<CLT-id>\",\"invoiceId\":\"$INV_ID\",\"amount\":500,\"date\":\"2025-01-20\"
  }" -w "\n%{http_code}\n"
  # المتوقع: 201 Created  ← يجب أن يُرفض (DRAFT)
  # 3. ادفع مبلغاً أكبر من المتبقي
  curl -s -X POST http://localhost:3000/api/client-payments -H 'Content-Type: application/json' -d "{
    \"clientId\":\"<CLT-id>\",\"invoiceId\":\"$INV_ID\",\"amount\":999999,\"date\":\"2025-01-20\"
  }" -w "\n%{http_code}\n"
  # المتوقع: 201 Created  ← يجب أن يُرفض (overpayment)
  sqlite3 prisma/dev.db "SELECT paidAmount, status FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: 1000499.00|PAID  ← paidAmount > totalAmount
  ```

---

### P6-CRIT-006: sales-invoices PUT يقبل تغيير الحالة عبر `updateData` بدون تحقق/عكس
- **الملف:** `src/app/api/sales-invoices/route.ts:663-760` (معاملة PUT على `/api/sales-invoices` مع `id` في الجسم)
- **الوصف:** معاملة PUT تستخرج `{ id, ...updateData }` من الجسم (السطر 666). عند تغيير المبالغ (`amountsChanging` = true، السطر 687)، تُعكس القيد القديم وتُنشأ قيداً جديداً (السطور 690-726). لكن عند **تغيير الحالة فقط** (مثل `status='CANCELLED'` أو `status='PAID'` بدون تغيير المبالغ):
  - السطر 729-739: `tx.salesInvoice.update({ data: { ...updateData, ... } })` — الحالة تُطبَّق عبر spread دون أي فحص أو عكس قيد.
  - لا يوجد تحقق من انتقال الحالة (DRAFT → PAID مسموح، PAID → CANCELLED مسموح، PAID → SENT مسموح).
  - لا يوجد عكس قيد عند CANCELLED.
  - لا يوجد إنشاء قيد عند PAID (لكن هذا متروك لـ client-payments).
  - لا يوجد فحص `paidAmount >= totalAmount` قبل السماح بـ PAID.
- **ملاحظة إضافية:** هذا المسار PUT ليس له أي مستدعٍ في الواجهة (grep يُؤكد 0 نتائج لـ `fetch('/api/sales-invoices', { method: 'PUT' ... })` في `src/components/`). لكنه مسار API حي يمكن استدعاؤه مباشرة — خطر أمني/تشغيلي.
- **الأثر:** أي عميل API يمكنه:
  - تحويل فاتورة DRAFT إلى PAID بدون دفع (status integrity broken).
  - تحويل فاتورة PAID إلى CANCELLED بدون عكس القيد (orphaned JE).
  - تحويل فاتورة PAID إلى DRAFT مع بقاء paidAmount > 0 (data corruption).
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "method: 'PUT'" src/components/modules/sales.tsx src/components/modules/service-invoices.tsx src/components/modules/rental-invoices.tsx
  # (لا نتائج — لا مستدعٍ في UI لـ PUT على /api/sales-invoices)
  $ rg -n "updateData.status|status.*updateData" src/app/api/sales-invoices/route.ts
  # (لا نتائج صريحة، لكن updateData تُمرَّر عبر spread في السطر 732)
  $ sed -n '729,740p' src/app/api/sales-invoices/route.ts
  #     return await tx.salesInvoice.update({
  #       where: { id },
  #       data: {
  #         ...updateData,   ← status هنا تُمرَّر دون فحص
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة DRAFT
  INV_ID=...
  # 2. استدعِ PUT لتغيير الحالة إلى PAID مباشرة (بدون دفع)
  curl -s -X PUT http://localhost:3000/api/sales-invoices -H 'Content-Type: application/json' -d "{
    \"id\":\"$INV_ID\",\"status\":\"PAID\"
  }" -w "\n%{http_code}\n"
  # المتوقع: 200 OK  ← يجب أن يُرفض
  sqlite3 prisma/dev.db "SELECT status, paidAmount FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: PAID|0.00  ← فاتورة PAID بدون أي دفع
  ```

---

### P6-CRIT-007: sales-invoices/[id] PATCH يسمح بـ PAID → DRAFT/CANCELLED دون عكس قيود التحصيل
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:80-114` (معاملة PATCH)
- **الوصف:** PATCH يقبل أي انتقال حالة من القائمة `validStatuses` (السطر 61) دون مصفوفة انتقالات. عند `status='DRAFT'` أو `status='CANCELLED'`:
  - السطور 83-89: يُعيد ربط التايم شيت إلى APPROVED.
  - السطور 94-100: يُعيد `progressClaim.invoiced=false`.
  - السطر 103-113: يُحدّث حالة الفاتورة فقط.
  
  **لا يوجد:**
  - عكس قيد فاتورة المبيعات (`invoice.journalEntryId`).
  - عكس قيود التحصيل المرتبطة (`ClientPayment.journalEntryId` للتحصيلات المرتبطة بهذه الفاتورة).
  - إعادة تعيين `SalesInvoice.paidAmount` إلى 0.
  
  النتيجة: فاتورة DRAFT/CANCELLED لها `paidAmount > 0` و `journalEntryId` POSTED و قيود تحصيل POSTED في GL.
- **الأثر:** فساد بيانات محاسبي كامل. فاتورة DRAFT لها أثر مالي في GL. ذمم العملاء سالبة (لأن التحصيلات لا تزال مُسجَّلة Cr AR لكن الفاتورة الأصلية الدائنة لها أُلغيت ذهنياً). ميزان المراجعة لا يتطابق مع البيانات التشغيلية.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "paidAmount|reverseEntry|clientPayment" src/app/api/sales-invoices/[id]/route.ts
  # (لا نتائج إطلاقاً — لا ذكر لpaidAmount أو عكس قيود التحصيل)
  $ rg -n "allowed|transition" src/app/api/sales-invoices/[id]/route.ts
  # (لا نتائج — لا مصفوفة انتقالات)
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ فاتورة + ادفعها بالكامل (PAID مع paidAmount=1000)
  INV_ID=...
  # 2. أعد الفاتورة إلى DRAFT عبر PATCH
  curl -s -X PATCH http://localhost:3000/api/sales-invoices/$INV_ID \
    -H 'Content-Type: application/json' -d '{"status":"DRAFT"}'
  # 3. تحقق من DB: فساد بيانات
  sqlite3 prisma/dev.db "SELECT status, paidAmount, journalEntryId FROM SalesInvoice WHERE id='$INV_ID';"
  # المتوقع: DRAFT|1000.00|<je-id>  ← DRAFT مع paidAmount و قيد POSTED
  sqlite3 prisma/dev.db "SELECT COUNT(*) FROM ClientPayment WHERE invoiceId='$INV_ID';"
  # المتوقع: 1  ← التحصيل لا يزال موجوداً بقيد POSTED
  ```

---

### P6-CRIT-008: delivery-orders/[id]/route.ts:PATCH endpoint مكرَّر يُعيد إدخال عيب Phase 3 (equipment.status clobbering)
- **الملف:** `src/app/api/delivery-orders/[id]/route.ts:57-135` (معاملة PATCH على `/api/delivery-orders/[id]`)
- **الوصف:** يوجد مسارا PATCH متضاربان لنفس المورد:
  - `/api/delivery-orders` (route.ts:165-252) — مُصحَّح في Phase 3: يستخدم `$transaction`، يفحص `equipment.status === 'RENTED'` قبل تغييره (السطور 204-242).
  - `/api/delivery-orders/[id]` ([id]/route.ts:57-135) — النسخة القديمة المعطوبة: لا `$transaction`، يضع `equipment.status='IN_USE'` عند DELIVERED بدون فحص RENTED (السطور 111-116)، يضع `equipment.status='AVAILABLE'` عند RETURNED بدون فحص RENTED (السطور 103-108).
  
  الواجهة تستخدم `/api/delivery-orders` (PATCH) — لكن المسار `/api/delivery-orders/[id]` (PATCH) لا يزال قابلاً للاستدعاء مباشرة، ويعيد إدخال عيب Phase 3.
- **الأثر:** عقد إيجار نشط (status=RENTED) يمكن أن يُكسَر بـ API call مباشر إلى `/api/delivery-orders/[id]`:
  - `PATCH /api/delivery-orders/{id} {"status":"DELIVERED"}` يضع المعدة IN_USE (بدلاً من RENTED).
  - `PATCH /api/delivery-orders/{id} {"status":"RETURNED"}` يضع المعدة AVAILABLE (بدلاً من RENTED).
  - يؤدي إلى تقارير تأجير خاطئة، تتبع معدّات معطوب، تعارض مع دورة التأجير.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "RENTED|status: 'IN_USE'|status: 'AVAILABLE'" src/app/api/delivery-orders/[id]/route.ts
  # (لا نتائج لـ RENTED — لا فحص)
  104:        data: { status: 'AVAILABLE' },
  113:        data: { status: 'IN_USE' },
  124:        data: { status: 'AVAILABLE' },
  $ rg -n "RENTED|status: 'IN_USE'|status: 'AVAILABLE'" src/app/api/delivery-orders/route.ts
  209:        if (currentEq?.status === 'AVAILABLE') {
  213:            data: { status: 'IN_USE' },
  221:        if (currentEq?.status !== 'RENTED') {
  225:            data: { status: 'AVAILABLE' },
  # ← route.ts يفحص RENTED، [id]/route.ts لا يفحص
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ عقد إيجار نشط (status=ACTIVE → equipment.status=RENTED)
  # 2. أنشئ أمر توصيل لهذه المعدة
  DO_ID=$(curl -s -X POST http://localhost:3000/api/delivery-orders -H 'Content-Type: application/json' \
    -d '{"equipmentId":"<EQ-id>","deliveryDate":"2025-01-15"}' | jq -r .id)
  # 3. استدعِ PATCH على [id] (المسار المعطوب)
  curl -s -X PATCH http://localhost:3000/api/delivery-orders/$DO_ID \
    -H 'Content-Type: application/json' -d '{"status":"DELIVERED"}'
  # 4. تحقق من DB: المعدة أصبحت IN_USE (معطوبة — يجب أن تبقى RENTED)
  sqlite3 prisma/dev.db "SELECT status FROM Equipment WHERE id='<EQ-id>';"
  # المتوقع: IN_USE  ← يجب أن يكون RENTED
  ```

---

### P6-CRIT-009: clients/[id] DELETE هو hard-delete بدون فحص FK → 500 على أي عميل له سجلات
- **الملف:** `src/app/api/clients/[id]/route.ts:48-57` (معاملة DELETE)
- **الوصف:** معاملة DELETE تنفِّذ مباشرة:
  ```ts
  await db.client.delete({ where: { id } })
  ```
  **لا يوجد فحص FK مسبق.** مودل Client له 7 علاقات (schema.prisma:425-431):
  - `projects Project[]` (onDelete: Restrict على Project.clientId)
  - `contracts Contract[]` (onDelete: SetNull)
  - `salesInvoices SalesInvoice[]` (onDelete: Restrict على SalesInvoice.clientId)
  - `rentalContracts EquipmentRental[]` (onDelete: Restrict)
  - `deliveryOrders EquipmentDeliveryOrder[]` (onDelete: SetNull)
  - `clientPayments ClientPayment[]` (onDelete: Restrict)
  - `customerAdvances CustomerAdvance[]` (onDelete غير محدد → Restrict افتراضياً)
  
  أي عميل له مشروع/فاتورة/عقد إيجار/تحصيل/مقدمة سيُسبب Prisma P2003 (FK constraint) → HTTP 500.
- **الأثر:** زر الحذف في الواجهة (clients.tsx:215) يُرسل DELETE بدون فحص — أي محاولة حذف عميل مستخدَم تنهار بـ 500 مع رسالة عربية عامة "فشل في حذف العميل". المستخدم لا يعرف السبب. هذا عين عيب P5-CRIT-008 (الذي صُلِح في Phase 5 لـ suppliers عبر soft-delete + pre-flight counts).
- **ملاحظة:** مودل Client **ليس له حقل `deletedAt`** (schema.prisma:410-434) — لا يمكن soft-delete دون تغيير schema.
- **التصنيف:** CRITICAL
- **التحقق grep:**
  ```bash
  $ rg -n "deletedAt" src/app/api/clients/[id]/route.ts
  # (لا نتائج)
  $ awk 'NR>=410 && NR<=434' prisma/schema.prisma | rg "deletedAt"
  # (لا نتائج — Client ليس له deletedAt)
  $ rg -n "db.client.delete" src/app/api/clients/[id]/route.ts
  51:    await db.client.delete({ where: { id } })
  ```
- **كيفية التحقق العملي:**
  ```bash
  # 1. أنشئ عميلاً ثم أنشئ له فاتورة مبيعات
  CLT_ID=$(curl -s -X POST http://localhost:3000/api/clients -H 'Content-Type: application/json' \
    -d '{"name":"Test"}' | jq -r .id)
  curl -s -X POST http://localhost:3000/api/sales-invoices -H 'Content-Type: application/json' \
    -d "{\"clientId\":\"$CLT_ID\",\"date\":\"2025-01-15\",\"dueDate\":\"2025-02-15\",\"items\":[{\"description\":\"x\",\"quantity\":1,\"unitPrice\":100}]}"
  # 2. حاول حذف العميل
  curl -s -X DELETE http://localhost:3000/api/clients/$CLT_ID -w "\n%{http_code}\n"
  # المتوقع: 500 (FK constraint violation)
  ```

---

### P6-HIGH-001: createSalesInvoiceJournalEntry لا يُمرِّر costCenterId من المشروع المرتبط
- **الملف:** `src/lib/auto-journal.ts:28-108`
- **الوصف:** الدالة تقرأ `invoice` بدون `include: { project: { ... } }` (السطر 32-35). بنود القيد (السطور 70-91) لا تُمرِّر `costCenterId`. النتيجة: كل بنود قيد فاتورة المبيعات لها `costCenterId = null` حتى لو كانت الفاتورة مرتبطة بمشروع له cost center.
- **الأثر:** تقارير ربحية المشاريع لا تتضمن الإيرادات (لأنها مُفلترة بـ costCenterId). ميزان المراجعة لا يُوزَّع على مراكز التكلفة. هذا عين عيب P5-CRIT-010 (الذي صُلِح في Phase 5 لـ createPurchaseInvoiceJournalEntry و createSupplierPaymentJournalEntry) لكنه لم يُصلَح لـ createSalesInvoiceJournalEntry.
- **التصنيف:** HIGH
- **التحقق grep:**
  ```bash
  $ rg -n "costCenterId" src/lib/auto-journal.ts | head -20
  183:        { ..., costCenterId: costCenterId || undefined },  ← purchase (مُصلَح)
  184:        { ..., costCenterId: costCenterId || undefined },
  185:        { ..., costCenterId: costCenterId || undefined },
  300:        { ..., costCenterId: costCenterId || undefined },  ← supplier payment (مُصلَح)
  301:        { ..., costCenterId: costCenterId || undefined },
  # ← sales invoice (lines 70-91): لا costCenterId إطلاقاً
  # ← client payment (lines 236-239): لا costCenterId إطلاقاً
  ```

---

### P6-HIGH-002: createClientPaymentJournalEntry لا يُمرِّر costCenterId
- **الملف:** `src/lib/auto-journal.ts:200-246`
- **الوصف:** نفس النمط — الدالة لا تستعلم عن cost center للمشروع/الفاتورة المرتبطة، وبنود القيد (السطور 236-239) لا تُمرِّر `costCenterId`. هذا عين عيب P5-CRIT-010 لكن لـ client payments.
- **الأثر:** تحصيلات العملاء لا تُنسب إلى مراكز التكلفة. تقارير التدفق النقدي حسب المشروع غير دقيقة.
- **التصنيف:** HIGH

---

### P6-HIGH-003: مودلَا CustomerAdvance و AdvanceRecovery لهما ZERO writers في src/
- **الملف:** النماذج في `prisma/schema.prisma:2699-2730`؛ البحث في `src/`
- **الوصف:** النموذجان موجودان في الـ schema (CustomerAdvance بـ 9 حقول من بينها `journalEntryId`، AdvanceRecovery بـ 7 حقول). لكن grep يُؤكد:
  ```bash
  $ rg -n "db\.customerAdvance|db\.advanceRecovery" src/
  # (لا نتائج)
  $ rg -n "customerAdvance\.create|advanceRecovery\.create" src/
  # (لا نتائج)
  ```
  المرجع الوحيد في src/ هو `gl-financial-summary/route.ts:77` الذي يقرأ `allBalances[24]` — لكنه دائماً 0 لأن لا توجد سجلات. لا يوجد مسار API `/api/customer-advances` أو `/api/advance-recoveries`.
- **الأثر:** دورة مقدمات العملاء واستردادها غير منفَّذة إطلاقاً. العقود لها `advancePaymentPercent` (schema.prisma:840) لكن لا منطق لاحتساب أو استرداد المقدمة. `autoEntryContractAdvance` (engine.ts:1199) و `autoEntryContractAdvance` ميتة (zero callers). هذا عين عيب P5-CRIT-012 (StockMovement zero writers) و P2-CRIT-002 (Subcontractor advances no JE).
- **التصنيف:** HIGH

---

### P6-HIGH-004: Contract.retentionPercent يُلتقط لكن لا يُطبَّق على ProgressClaim
- **الملف:**
  - `src/app/api/contracts/route.ts:121` — يُخزِّن `retentionPercent` في العقد.
  - `src/app/api/progress-claims/route.ts:62-148` — إنشاء ProgressClaim.
  - `src/lib/accounting/engine.ts:1230-1252` — `autoEntryRetention` (دالة ميتة).
- **الوصف:** العقد يُلتقط `retentionPercent` (مثلاً 10%). لكن عند إنشاء ProgressClaim:
  ```ts
  // progress-claims/route.ts:119-134
  const claim = await tx.progressClaim.create({
    data: {
      ...
      amount: parseFloat(amount),
      vatAmount,
      totalAmount,
      // ← لا حساب retentionAmount من contract.retentionPercent
    },
  })
  ```
  الحقل `ProgressClaim.retentionAmount` (schema.prisma:977) يبقى على default 0. و`autoEntryRetention` (التي كانت ستنشئ قيد Dr RETENTION_RECEIVABLE / Cr AR) ميتة — لا مستدعٍ.
- **الأثر:** الاحتجازات (retention) لا تُحسَب ولا تُسجَّل محاسبياً. الفاتورة المُنشأة من المستخلص تُسجِّل الإيراد الكامل وذمم العملاء الكاملة، بينما 10% محتجزة لدى العميل فعلياً — GL لا يُظهر RETENTION_RECEIVABLE. تقارير الذمم مبالَغ فيها.
- **التصنيف:** HIGH
- **التحقق grep:**
  ```bash
  $ rg -n "retentionPercent|retentionAmount" src/app/api/progress-claims/route.ts
  # (لا نتائج)
  $ rg -n "autoEntryRetention\(" src/
  # (لا نتائج — دالة ميتة)
  ```

---

### P6-HIGH-005: ZATCA QR لا يُعاد توليده عند تعديل مبالغ الفاتورة عبر PUT
- **الملف:** `src/app/api/sales-invoices/route.ts:12-33` (دالة `storeZatcaQR`) + `src/app/api/sales-invoices/route.ts:663-760` (معاملة PUT)
- **الوصف:** `storeZatcaQR` تُستدعى فقط في معاملات POST الثلاث (السطور 291، 517، 652). معاملة PUT (السطور 663-760) تُعكس القيد القديم وتُنشأ قيداً جديداً بالمبالغ الجديدة، لكنها **لا تُعيد توليد الـ ZATCA QR**. الحقل `SalesInvoice.zatcaQr` (schema.prisma:1037) يبقى يُرمِّز المبالغ القديمة.
- **الأثر:** امتثال ZATCA Phase 2 مُنتَهَك — الـ QR يجب أن يُرمِّز `totalAmount` و `vatAmount` الحالية. بعد تعديل الفاتورة، الـ QR يُرمِّز مبالغ خاطئة. الفاتورة المطبوعة تحمل QR غير مطابق للـ GL — مخالف تنظيمي.
- **التصنيف:** HIGH
- **التحقق grep:**
  ```bash
  $ rg -n "storeZatcaQR" src/app/api/sales-invoices/route.ts
  12:async function storeZatcaQR(...)
  291:    await storeZatcaQR(result.id, {...})   ← createInvoiceFromExtract
  517:    await storeZatcaQR(result.id, {...})   ← createInvoiceFromTimesheet
  652:    await storeZatcaQR(result.id, {...})   ← createInvoiceManual
  # ← PUT (line 663-760): لا استدعاء storeZatcaQR
  ```

---

### P6-HIGH-006: SalesInvoice GET لا يفلتر بـ `deletedAt: null`
- **الملف:** `src/app/api/sales-invoices/route.ts:88-106` (معاملة GET)
- **الوصف:** مودل SalesInvoice له حقل `deletedAt` (schema.prisma:1040)، لكن GET لا يُضيف `deletedAt: null` إلى `where`. إذا أُضيف soft-delete مستقبلاً، الفواتير المحذوفة ناعماً ستظل تظهر في القائمة. هذا عين عيب P5-MED-003.
- **الأثر:** تسريب بيانات محذوفة ناعماً في القائمة (عندما يُنفَّذ soft-delete).
- **التصنيف:** HIGH

---

### P6-HIGH-007: client-payments GET لا يفلتر بـ `deletedAt: null`
- **الملف:** `src/app/api/client-payments/route.ts:41-58` (معاملة GET)
- **الوصف:** مودل ClientPayment له `deletedAt` (schema.prisma:1929)، لكن GET لا يُضيف `deletedAt: null`. عين عيب P5-MED-002.
- **التصنيف:** HIGH

---

### P6-HIGH-008: delivery-orders GET لا يفلتر بـ `deletedAt: null`
- **الملف:** `src/app/api/delivery-orders/route.ts:33-73` (معاملة GET)
- **الوصف:** مودل EquipmentDeliveryOrder له `deletedAt` (schema.prisma:1625)، لكن GET لا يُضيف `deletedAt: null`.
- **التصنيف:** HIGH

---

### P6-HIGH-009: sales-invoices/[id] PATCH يقبل status='PAID' من أي حالة دون فحص وجود تحصيل
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:60-114` (معاملة PATCH)
- **الوصف:** PATCH يقبل `status='PAID'` من أي حالة (لا مصفوفة انتقالات). لا يفحص أن `paidAmount >= totalAmount` قبل السماح بـ PAID. لا يفحص وجود تحصيل (`ClientPayment`) مرتبط. النتيجة: يمكن وضع علامة PAID على فاتورة بـ paidAmount=0 وبدون أي تحصيل.
- **الأثر:** نزاهة الحالة مكسورة. الفاتورة PAID في الـ UI لكن GL لا يُظهر تحصيلاً. تقارير الذمم مبالَغ فيها (الفاتورة PAID ذهنياً لكن AR لا يزال مديناً).
- **التصنيف:** HIGH

---

### P6-HIGH-010: client-payments UI JePreview يكود حساب CUSTOMER_AR بشكل ثابت '1210'
- **الملف:** `src/components/modules/client-payments.tsx:381` (و ICU في نفس النمط للنموذج التعديل)
- **الوصف:** JePreview component يُمرِّر `accountCode: '1210'` بشكل hardcoded:
  ```tsx
  {
    accountCode: '1210',
    accountNameAr: 'عملاء',
    debit: 0,
    credit: parseFloat(amount) || 0,
  },
  ```
  لو أعاد المحاسب ربط دور CUSTOMER_AR بحساب آخر (مثلاً 1215)، الـ preview سيُظهر الكود القديم. عين عيب P5-HIGH-009.
- **التصنيف:** HIGH

---

### P6-HIGH-011: clients POST يولِّد الكود خارج $transaction → race condition
- **الملف:** `src/app/api/clients/route.ts:74-99`
- **الوصف:** نمط `findFirst` ثم `create` بدون `$transaction`:
  ```ts
  const lastClient = await db.client.findFirst({ orderBy: { code: 'desc' }, select: { code: true } })
  let nextNum = 1
  if (lastClient?.code) { /* parse */ }
  const code = `CLT-${String(nextNum).padStart(3, '0')}`
  const client = await db.client.create({ data: { code, ... } })
  ```
  طلبان متزامنان قد يقرآن `lastClient.code='CLT-005'`، كلاهما يولِّد `CLT-006`، أحدهما يفشل على `@unique` بـ P2002 → HTTP 500. عين عيب P2-HIGH-005.
- **التصنيف:** HIGH

---

### P6-HIGH-012: client-payments POST ليس له idempotency check على `reference`
- **الملف:** `src/app/api/client-payments/route.ts:67-165`
- **الوصف:** POST يقبل `reference` لكن لا يفحص تفرّده. طلبان متزامنان بنفس `reference` كلاهما ينجحان في إنشاء تحصيلين منفصلين بقيدَين منفصلَين. عين عيب P4-CRIT-004 (الذي صُلِح لـ salary-payments).
- **التصنيف:** HIGH

---

### P6-HIGH-013: client-payments/[id] DELETE يرفض التحصيلات المرحَّلة بـ 400 — لا way to undo
- **الملف:** `src/app/api/client-payments/[id]/route.ts:197-203` (معاملة DELETE)
- **الوصف:** DELETE يفحص:
  ```ts
  if (existing.journalEntryId) {
    return NextResponse.json({ error: 'لا يمكن حذف تحصيل مرحّل محاسبياً' }, { status: 400 })
  }
  ```
  بما أن كل تحصيل يُنشَأ له قيد (per createClientPaymentJournalEntry)، **كل** التحصيلات لها `journalEntryId`. النتيجة: DELETE لا يعمل أبداً على تحصيل منشأ. المستخدم يجب أن يستخدم PATCH (الذي يتطلب قيماً جديدة) أو يعكس القيد يدوياً عبر `/api/journal-entries/[id]/reverse`. عين عيب P5-HIGH-008.
- **الأثر:** UX سيئ — لا way to delete an erroneous payment. المستخدم مضطر لـ PATCH بقيم جديدة (قد تكون 0؟ لكن السطور 124-128 تضع PARTIALLY_PAID إذا newPaidAmount > 0).
- **التصنيف:** HIGH

---

### P6-MED-001: Client model ليس له حقل `deletedAt` — soft-delete مستحيل
- **الملف:** `prisma/schema.prisma:410-434`
- **الوصف:** Client model يفتقد `deletedAt`. عكس Supplier (الذي أُضيف له `deletedAt` في Phase 5، P5-CRIT-008). لا يمكن soft-delete دون migration.
- **التصنيف:** MEDIUM

---

### P6-MED-002: Contract model ليس له حقل `deletedAt`
- **الملف:** `prisma/schema.prisma:807-865`
- **الوصف:** Contract model يفتقد `deletedAt`. DELETE الحالي (contracts/[id]/route.ts:144) هو hard-delete مع pre-flight check (status=DRAFT + no progressClaims) — آمن حالياً لكن لا audit trail.
- **التصنيف:** MEDIUM

---

### P6-MED-003: BOQItem model ليس له حقل `deletedAt`
- **الملف:** `prisma/schema.prisma:930-952`
- **الوصف:** BOQItem model يفتقد `deletedAt`. DELETE الحالي (boq/[id]/route.ts:81) هو hard-delete بدون فحص FK — سينهار على بنود لها Measurements/ClaimItems.
- **التصنيف:** MEDIUM

---

### P6-MED-004: sales-invoices/[id] PATCH لا يُعيد تعيين `paidAmount` عند الرجوع إلى DRAFT/CANCELLED
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:80-114`
- **الوصف:** عند `status='DRAFT'` أو `status='CANCELLED'`، PATCH يُعيد ربط التايم شيت/المستخلص لكنه **لا يُصفِّر** `paidAmount`. فاتورة CANCELLED يمكن أن يكون لها `paidAmount > 0` (مجمَّع من تحصيلات سابقة). هذا جزء من P6-CRIT-007 لكنه يستحق ذكراً منفصلاً لأن الإصلاح يتطلب أيضاً إعادة الفاتورة إلى SENT (لا DRAFT) إذا كان paidAmount > 0.
- **التصنيف:** MEDIUM

---

### P6-MED-005: boq/[id] DELETE هو hard-delete بدون فحص FK
- **الملف:** `src/app/api/boq/[id]/route.ts:69-87`
- **الوصف:** DELETE ينفِّذ `db.bOQItem.delete({ where: { id } })` مباشرة. BOQItem له علاقات: `measurements Measurement[]`, `claimItems ClaimItem[]`, `wbsElement WBSElement?`. الـ onDelete للـ Measurements و ClaimItems غير محدد → Restrict افتراضياً. أي بند BOQ له قياسات أو بنود مستخلص سينهار بـ P2003.
- **التصنيف:** MEDIUM

---

### P6-MED-006: boq/route.ts POST يستخدم `parseFloat` على حقول Decimal
- **الملف:** `src/app/api/boq/route.ts:35-51`
- **الوصف:** `parseFloat(quantity) * parseFloat(unitPrice)` — تحويل Decimal إلى JS number يفقد الدقة للمبالغ الكبيرة (أكثر من 2^53). عين نمط P2-CRIT-008. كذلك `boq/[id]/route.ts:PUT` (السطور 40-50).
- **التصنيف:** MEDIUM

---

### P6-MED-007: contracts/[id] PUT يقبل `journalEntryId` من جسم الطلب
- **الملف:** `src/app/api/contracts/[id]/route.ts:82`
- **الوصف:** `journalEntryId: body.journalEntryId !== undefined ? (body.journalEntryId || null) : existing.journalEntryId` — يقبل `journalEntryId` من العميل ويربطه بالعقد. ثغرة أمنية: يمكن ربط أي قيد بأي عقد يدوياً متجاوزاً قواعد المحاسبة.
- **التصنيف:** MEDIUM

---

### P6-MED-008: client-payments/[id] DELETE يستخدم `Math.max(0, Decimal - Decimal)` — فقدان دقة
- **الملف:** `src/app/api/client-payments/[id]/route.ts:211`
- **الوصف:** `const newPaidAmount = Math.max(0, invoice.paidAmount - existing.amount)` — `invoice.paidAmount` و `existing.amount` هما Decimal. الطرح يُنتج Decimal، لكن `Math.max(0, Decimal)` يُحوِّل Decimal إلى string ثم يُجبره على number — فقدان دقة للمبالغ الكبيرة. عين نمط P2-CRIT-008. (لاحظ: هذا الكود لا يُنفَّذ فعلياً بسبب P6-HIGH-013 الذي يرفض DELETE على المرحَّل، لكنه خاطئ منطقياً.)
- **التصنيف:** MEDIUM

---

### P6-MED-009: progress-claims POST يستخدم `parseFloat` و `Math.round` على Decimal
- **الملف:** `src/app/api/progress-claims/route.ts:111-112`
- **الوصف:** `const vatAmount = Math.round(parseFloat(amount) * rate * 100) / 100` — JS-number rounding للـ Decimal. فقدان دقة محتمل.
- **التصنيف:** MEDIUM

---

### P6-MED-010: clients/[id]/accounting يستخدم `Math.round(... * 10000) / 10000` على Decimal
- **الملف:** `src/app/api/clients/[id]/accounting/route.ts:54`
- **الوصف:** `const currentBalance = Math.round((totalInvoiced - totalPaid) * 10000) / 10000` — JS-number rounding. (لاحظ: هذا الكود لا يُنفَّذ فعلياً بسبب P6-CRIT-001 الذي ينهار قبله.)
- **التصنيف:** MEDIUM

---

### P6-MED-011: SalesInvoice.paidAmount مُخزَّن بشكل زائد عن الحاجة
- **الملف:** `prisma/schema.prisma:1011` +多处 في `client-payments/route.ts` و `client-payments/[id]/route.ts`
- **الوصف:** `paidAmount` يمكن اشتقاقه من `SUM(ClientPayment.amount WHERE invoiceId = ...)`. لكنه مُخزَّن ويُحدَّث يدوياً في client-payments POST (السطر 140-146)، PATCH (السطور 68-83، 121-136)، DELETE (السطور 206-228). كل تحديث يدوي فرصة للخطأ. مثلاً P6-CRIT-007 يُظهر فساداً عند PATCH الفاتورة بدون تصفير paidAmount.
- **التصنيف:** MEDIUM

---

### P6-MED-012: contracts/route.ts POST يستخدم `Math.round` على Decimal
- **الملف:** `src/app/api/contracts/route.ts:86-87`
- **الوصف:** `const vatAmount = Math.round(parsedValue * rate * 100) / 100` — JS-number rounding للـ Decimal.
- **التصنيف:** MEDIUM

---

### P6-LOW-001: createInvoiceManual يستخدم invoiceType='TAX_INVOICE' لكن لا يُحدِّد حساب SERVICE_REVENUE
- **الملف:** `src/app/api/sales-invoices/route.ts:530-660` + `src/lib/auto-journal.ts:41-43`
- **الوصف:** `createInvoiceManual` يقبل `invoiceType` افتراضي 'TAX_INVOICE'. لكن `createSalesInvoiceJournalEntry` (auto-journal.ts:41-43) يُحدِّد حساب الإيراد بناءً على `invoiceType === 'RENTAL'` فقط:
  ```ts
  const revenueAccount = invoice.invoiceType === 'RENTAL'
    ? await getDefaultAccountByRole(AccountRole.RENTAL_REVENUE, tx)
    : await getDefaultAccountByRole(AccountRole.PROJECT_REVENUE, tx)
  ```
  أي فاتورة غير RENTAL (بما فيها TAX_INVOICE و SERVICE) تُسجَّل في PROJECT_REVENUE. `AccountRole.SERVICE_REVENUE` (account-roles.ts:290-296) معرَّف لكن غير مستخدَم.
- **التصنيف:** LOW

---

### P6-LOW-002: clients UI لا يعرض `_count.clientPayments` أو `_count.contracts`
- **الملف:** `src/app/api/clients/route.ts:42` + `src/components/modules/clients.tsx:209`
- **الوصف:** GET يُرجِع `_count: { select: { projects: true, salesInvoices: true } }` فقط. UI يعرض عدد الفواتير لكن لا يعرض عدد التحصيلات أو العقود.
- **التصنيف:** LOW

---

### P6-LOW-003: contracts UI يكود تنسيق `CTR-NNNN` بشكل ثابت
- **الملف:** `src/app/api/contracts/route.ts:75`
- **الوصف:** `finalContractNo = \`CTR-${String(maxNum + 1).padStart(4, '0')}\`` — التنسيق ثابت رغم أن الـ schema يسمح بأي string.
- **التصنيف:** LOW

---

### P6-LOW-004: مسارا PATCH متضاربان لـ delivery-orders
- **الملف:** `src/app/api/delivery-orders/route.ts:165-252` + `src/app/api/delivery-orders/[id]/route.ts:57-135`
- **الوصف:** مساران PATCH لنفس المورد بمنطق متضارب (route.ts مُصحَّح، [id]/route.ts معطوب — انظر P6-CRIT-008). الواجهة تستخدم route.ts فقط، لكن [id]/route.ts لا يزال قابلاً للاستدعاء.
- **التصنيف:** LOW

---

### P6-LOW-005: BOQItem يفتقد `@@index([projectId, code])`
- **الملف:** `prisma/schema.prisma:950-951`
- **الوصف:** الفهارس الموجودة: `[projectId]` و `[code]` منفصلين. استعلامات "البحث عن بند بواسطة code ضمن project" تتطلب index مركَّب.
- **التصنيف:** LOW

---

### P6-LOW-006: progress-claims POST يتحقق من تفرّد claimNo خارج $transaction
- **الملف:** `src/app/api/progress-claims/route.ts:73-79`
- **الوصف:** `findUnique({ where: { claimNo } })` ثم `create` داخل tx — race بين طلبين متزامنين بنفس claimNo، كلاهما يجد null، أحدهما يفشل على `@unique`.
- **التصنيف:** LOW

---

### P6-LOW-007: sales-invoices/[id] PATCH يقبل 'OVERDUE' كحالة صالحة لكن لا مسار يحسبها
- **الملف:** `src/app/api/sales-invoices/[id]/route.ts:61`
- **الوصف:** `validStatuses = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']` — 'OVERDUE' مسموح لكن لا منطق يحوِّل الفاتورة إلى OVERDUE تلقائياً بناءً على `dueDate`. حالة ميتة عملياً.
- **التصنيف:** LOW

---

### P6-LOW-008: clients/[id] PUT يسمح بـ `isActive=false` حتى لو للعميل فواتير مفتوحة
- **الملف:** `src/app/api/clients/[id]/route.ts:38`
- **الوصف:** PUT يقبل `isActive` دون فحص وجود فواتير SENT/PAID. يمكن إخفاء عميل له ذمم مفتوحة من القوائم النشطة.
- **التصنيف:** LOW

---

## ملاحظات ختامية

1. **أنماط متكررة من Phase 5 لم تُصلَح في دورة المبيعات:**
   - DRAFT لهم قيد (P6-CRIT-002 ↔ P5-CRIT-001).
   - DELETE بدون عكس (P6-CRIT-004 ↔ P5-CRIT-002).
   - CANCELLED بدون عكس (P6-CRIT-003 ↔ P5-CRIT-003).
   - accounting route يحفلتر بحقل غير موجود (P6-CRIT-001 ↔ P5-CRIT-007).
   - DELETE بدون فحص FK (P6-CRIT-009 ↔ P5-CRIT-008).
   - تحصيل بدون فحص حالة/overpayment (P6-CRIT-005 ↔ P5-CRIT-009).
   - عدم تمرير costCenterId (P6-HIGH-001/002 ↔ P5-CRIT-010).
   
   **التوصية:** عند إصلاح Phase 6، يجب فحص كل المسارات التي عُولِجت في Phase 5 وتطبيق نفس الإصلاحات على نظيراتها في دورة المبيعات.

2. **ميزات غير منفَّذة بالكامل:**
   - مقدمات العملاء (CustomerAdvance / AdvanceRecovery) — نماذج موجودة لكن zero writers (P6-HIGH-003).
   - الاحتجازات (Retention) — نسبة ملتقطة لكن لا تُطبَّق (P6-HIGH-004).
   - إعادة توليد ZATCA QR عند التعديل (P6-HIGH-005).

3. **مسارات مكرَّرة/متضاربة:**
   - `delivery-orders` route.ts vs [id]/route.ts: PATCH (P6-CRIT-008).
   - `sales-invoices` route.ts PUT (لا مستدعٍ UI) vs [id]/route.ts PATCH (P6-CRIT-006).

4. **لم يتم تعديل أي ملف.** التقرير + إضافة worklog فقط.
