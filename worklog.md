---
Task ID: 1
Agent: Main Orchestrator
Task: فحص شامل لنظام بِنَاء ERP

Work Log:
- قراءة جميع ملفات المشروع (37 موديول، 72 API route، 42 Prisma model)
- تحليل المحرك المحاسبي (accounting/engine.ts) - 24 دالة قيد تلقائي
- تحليل محرك تدفق الأعمال (business-flow/engine.ts) - 3 سلاسل عمل
- تحليل خدمة الطباعة الموحدة (print-service.ts) - 27 نوع مستند
- فحص جميع مكونات الوحدات الـ37
- فحص APIs عبر curl
- اكتشاف وإصلاح 5 أخطاء حرجة + إضافة أزرار طباعة مفقودة

Stage Summary:
- Bug#1 CRITICAL: إصلاح حساب معدات بالأجل يخصم ضريبة مخرجات (3110) بدل الدائنين (3210) ✅
- Bug#2 CRITICAL: إصلاح فلاتر التاريخ في Trial Balance و General Ledger (spread overwrite) ✅
- Bug#3 MEDIUM: إصلاح Dashboard إيرادات مكررة (فواتير + مستخلصات مفوترة) ✅
- Bug#4 MEDIUM: إصلاح contracts.tsx PrintButton type='extract' → type ديناميكي ✅
- Bug#5 MEDIUM: إصلاح تكلفة الصيانة = 0 في ربحية المشروع ✅
- Bug#6 MEDIUM: إصلاح تكلفة التشغيل = 0 في ربحية المعدات ✅
- Bug#7 MEDIUM: إصلاح purchases = materials (ازدواجية) في ربحية المشروع ✅
- إضافة PrintButton لـ 11 شاشة كانت تفتقر للطباعة ✅
- Lint: صفر أخطاء ✅
- Trial Balance: متوازن (مدين = دائن = 47,437.50) ✅
