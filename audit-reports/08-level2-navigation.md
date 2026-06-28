# Level 2 — Navigation & Routing Audit Report

Generated: 2026-06-28 22:30 UTC
Scope: sidebar nav, button routing, breadcrumbs, cross-module links, back button, sidebar UX
Methodology: READ-ONLY static audit — every issue cites the exact file path + line range actually read. No code modifications, no tests executed.

## Summary

- Total issues: **23** (CRITICAL: 5, HIGH: 7, MEDIUM: 7, LOW: 4)
- Modules audited: **47/47** module files + sidebar + app-shell + header + providers + module-layout + dashboard + print-button + entire `src/components/sections/` directory (11 files)
- Cross-module navigation links found (calls to `setActiveItem(...)` inside modules): **11**
- Dead navigation links (no-op buttons with no onClick): **2** (header Search, header Bell)
- Orphaned navigation infrastructure (dead code): **1 entire directory** (`src/components/sections/`, 11 files) + **2 store actions** (`selectProject`, `selectEquipment`) + **1 unused shadcn component** (`src/components/ui/breadcrumb.tsx`)

Architecture confirmed:
- Single Next.js route `/` (`src/app/page.tsx:147-155`).
- `ModuleRouter` (`src/app/page.tsx:141-145`) reads `activeItem` from zustand and renders `moduleMap[activeItem]` — 41 entries + `PlaceholderModule` fallback.
- `setActiveItem(item)` (`src/stores/app-store.ts:394`) is the ONLY navigation primitive; it mutates zustand state and re-renders. No URL change, no history entry.
- 6 modules (purchases, labor, petty-cash, salary-payments, advances, service-invoices) are unreachable from the sidebar — **already reported as L1-CRIT-001, NOT re-reported here**.

Excluded from this report (already covered):
- L1-CRIT-001 (orphaned 6 modules)
- L1-CRIT-002 (projects.tsx dialog titles Arabic-only)
- L1-CRIT-003 (Sonner vs useToast divergence)
- L1-CRIT-004 (projects/delivery-orders skip ModuleLayout)
- L1-CRIT-005/006 (payroll-runs / attendance title mismatch with sidebar)
- L1-MED-008 (dashboard.tsx WorkflowChain `dir="ltr"`)
- L1-MED-017 (English-only `throw new Error('Failed to fetch')` strings)
- All other L1 issues

---

## Issues

### L2-CRIT-001: No URL deep-linking — refresh loses the active module + detail view state
- **File**: `src/stores/app-store.ts`
- **Lines**: 383-408 (entire `useAppStore` create block); also `src/app/page.tsx:141-145` (ModuleRouter)
- **Dimension**: 3 (routes / deep-linking) + 6 (back button)
- **Problem**: متجر zustand لا يستخدم middleware الـ `persist` ولا يكتب إلى `localStorage`/`sessionStorage`. عند تحديث الصفحة (F5/Cmd-R)، يعود المتجر إلى حالته الافتراضية `activeItem: 'dashboard'` (السطر 384)، ويفقد المستخدم الوحدة النشطة AND حالة عرض التفاصيل المحلية (مثل `selectedProjectId` في `projects.tsx:1660`، `selectedEquipmentId` في `equipment.tsx:1465`، `viewState` في 8 وحدات). لا يوجد أي تكامل مع `URL` (لا `?module=projects` ولا `#projects` ولا `useSearchParams`). لا يوجد `useEffect` يقرأ `window.location` عند التحميل.
- **Evidence**: 
  - `grep -rn "persist\|createJSONStorage\|zustand/middleware" src/` → 0 نتائج.
  - `grep -rn "useSearchParams\|usePathname\|useRouter\|window.history\|pushState\|replaceState" src/` → 0 نتائج في وحدات UI (النتيجة الوحيدة `accounting.tsx:2461` تشير إلى `history.length` لـ audit-history داخلي وليس browser history).
  - المتجر يُعاد إنشاؤه من الصفر عند كل تحديث: `activeItem: 'dashboard'` (app-store.ts:384) + `selectedProjectId: null` + `selectedEquipmentId: null` + `activeSubModule: null`.
- **كيفية التحقق العملي**: 
  1. `curl -I http://localhost:3000/` — يُرجع 200.
  2. افتح المتصفح، اذهب إلى `/`، اضغط على "المشاريع" في القائمة الجانبية، اختر مشروعاً، انقر F5.
  3. النتيجة: تعود إلى لوحة التحكم (dashboard) بدلاً من صفحة المشروع التي كنت تتصفحها.
  4. `agent-browser nav http://localhost:3000/ ; agent-browser click sidebar-projects ; agent-browser snapshot ; agent-browser reload ; agent-browser snapshot` — الـ snapshot بعد الـ reload يُظهر dashboard بدلاً من projects.
- **Fix recommendation**: أضِف `zustand/middleware` persist مع `createJSONStorage(() => localStorage)` لحفظ `activeItem` + `selectedProjectId` + `selectedEquipmentId` + `viewState` لكل وحدة. أو — بشكل أفضل — مزامنة `activeItem` مع `window.location.hash` (مثل `#projects`) عبر `useEffect` + `popstate` listener، وحفظ حالة عرض التفاصيل في query params (مثل `?projectId=abc`).

---

### L2-CRIT-002: Browser back button exits the app entirely — no SPA history management
- **File**: `src/app/page.tsx` + `src/stores/app-store.ts`
- **Lines**: `src/app/page.tsx:141-145` (ModuleRouter — no `useEffect` history sync); `src/stores/app-store.ts:394` (`setActiveItem` — no `history.pushState`)
- **Dimension**: 6 (back button behavior)
- **Problem**: النظام لا يستدعي أبداً `window.history.pushState()` ولا يستمع إلى `popstate`. عندما يتنقل المستخدم بين الوحدات (مثلاً: dashboard → projects → project detail)، لا تُنشأ أي إدخالات في تاريخ المتصفح. عند الضغط على زر "رجوع" في المتصفح، يخرج المستخدم من التطبيق بالكامل إلى الموقع السابق (أو يُغلق التبويب إذا لم يكن هناك تاريخ سابق). هذا مخالف لكل توقعات SPA الحديثة.
- **Evidence**: 
  - `grep -rn "history\.pushState\|history\.replaceState\|popstate\|hashchange" src/` → 0 نتائج.
  - `setActiveItem` في `app-store.ts:394` ببساطة `set({ activeItem: item })` بدون أي تأثير جانبي على المتصفح.
  - حتى الـ detail views داخل الوحدات (مثل `projects.tsx:1720` `setSelectedProjectId(null)`) تستخدم state محلي بدون `pushState` — فالزر "رجوع" داخل التطبيق (ArrowRight button) يعمل، لكن زر "رجوع" المتصفح يخرج من التطبيق.
- **كيفية التحقق العملي**: 
  1. `agent-browser nav http://localhost:3000/`
  2. `agent-browser click sidebar-projects` (أصبح الآن على `/` مع عرض projects)
  3. `agent-browser back` (زر رجوع المتصفح)
  4. النتيجة: المتصفح يخرج من التطبيق إلى الصفحة السابقة (أو يعرض "about:blank" إذا لم يكن هناك تاريخ سابق). يجب أن يبقى في التطبيق ويعود إلى dashboard.
- **Fix recommendation**: في `setActiveItem` (app-store.ts:394)، أضِف `window.history.pushState({ activeItem: item }, '', \`/#${item}\`)`. وأضِف `useEffect` في `ModuleRouter` (page.tsx:141) يستمع إلى `popstate` ويستدعي `setActiveItem(event.state?.activeItem || 'dashboard')`. كرّر ذلك لـ `selectedProjectId`/`selectedEquipmentId`/`viewState` إذا أردت دعم الـ detail views أيضاً.

---

### L2-CRIT-003: Entire `src/components/sections/` directory (11 files) is orphaned dead code — `selectProject`/`selectEquipment`/`setActiveSubModule` store actions have zero live callers
- **File**: `src/components/sections/{dashboard-section,projects-section,rental-section,finance-section,warehouses-section,crm-section,resources-section,supply-chain-section,admin-section,reports-section,section-layout}.tsx` (11 files)
- **Lines**: 
  - `src/app/page.tsx:85-139` (moduleMap — لا يستورد أي *Section component)
  - `src/stores/app-store.ts:250-350` (SubModuleKey + subModuleLabels — يستخدم فقط داخل sections/)
  - `src/stores/app-store.ts:401-402` (`selectProject`/`selectEquipment` — caller الوحيد هو `projects-section.tsx:439,543` الذي هو نفسه orphan)
  - `grep -rn "from '@/components/sections" src/` → 9 نتائج، كلها داخل `src/components/sections/` (imports بينية بين الأشقاء)
- **Dimension**: 1 (menu → page correctness) + 5 (cross-module navigation infrastructure)
- **Problem**: توجد بنية تنقل كاملة موازية في `src/components/sections/` تستخدم نظام `activeSubModule` و `SectionLayout` مع تبويبات أفقية (tab bar) و `selectProject(id)` للتنقل بين قائمة المشاريع وكرت المشروع. هذه البنية لم تُستخدم إطلاقاً في `src/app/page.tsx` — فالـ moduleMap يستورد فقط من `src/components/modules/`. النتيجة:
  - 11 ملفاً (آلاف الأسطر) dead code.
  - 3 إجراءات في المتجر (`selectProject`، `selectEquipment`، `setActiveSubModule`) بدون أي caller حقيقي.
  - `SubModuleKey` union (السطور 253-275) و `subModuleLabels` (السطور 277-350) — 73 سطراً من الأنواع والترجمات بدون استخدام.
  - `SectionLayout` component (section-layout.tsx) بتبويباته الأفقية غير مستخدم — فالوحدات الفعلية تستخدم `ModuleLayout` البسيط بدون tab bar.
  - المستخدم لا يستطيع استخدام `selectProject(id)` كـ cross-module navigation (مثلاً: من dashboard إلى تفاصيل مشروع محدد) لأن الإجراء غير مستدعى من أي مكان حي.
- **Evidence**: 
  - `grep -rn "ProjectsSection\|RentalSection\|FinanceSection\|WarehousesSection\|CrmSection\|ResourcesSection\|SupplyChainSection\|AdminSection\|ReportsSection\|DashboardSection" src/` → كل النتائج تعريفات `export function` داخل ملفات `sections/` نفسها، 0 imports خارجية.
  - `grep -rn "selectProject(" src/` → النتائج الوحيدة: `projects-section.tsx:439` و `projects-section.tsx:543` — كلاهما داخل sections/ الميْتة.
  - `grep -rn "selectEquipment(" src/` → 0 نتائج إطلاقاً (حتى داخل sections/).
- **كيفية التحقق العملي**: 
  - `rg "from '@/components/sections" src/app/ src/components/modules/ src/components/layout/` → 0 نتائج (تأكيد أن sections/ غير مستوردة من أي مكان حي).
  - `rg "selectProject|selectEquipment|setActiveSubModule" src/components/modules/ src/components/layout/ src/app/` → 0 نتائج.
- **Fix recommendation**: احذف دليل `src/components/sections/` بالكامل (11 ملفاً)، احذف `selectProject` و `selectEquipment` و `setActiveSubModule` و `activeSubModule` و `SubModuleKey` و `subModuleLabels` من `src/stores/app-store.ts` (السطور 250-350 + 357 + 371 + 377-378 + 385 + 395 + 401-402). هذا ينظّف ~1500 سطر dead code و يبسّط المتجر. أما إذا كان الهدف استخدامه مستقبلاً، فيجب ربطه بـ moduleMap في page.tsx.

---

### L2-CRIT-004: "Create Invoice" button in progress-claims detail navigates to sales module WITHOUT passing the claim ID — pre-fill claim is non-functional
- **File**: `src/components/modules/progress-claims.tsx`
- **Lines**: 478-484 (button onClick) — inside `ProgressClaimsModule` detail view (~line 470-490)
- **Dimension**: 2 (button → route correctness) + 5 (cross-module navigation)
- **Problem**: زر "إنشاء فاتورة" في عرض تفاصيل المستخلص (للمستخلصات المعتمدة غير المفوترة) يستدعي `setActiveItem('sales')` فقط — دون تمرير `claim.id` إلى وحدة المبيعات. التعليق الكودي في السطر 481 يقول `// Navigate to sales module with extract pre-fill` لكن الـ pre-fill لا يحدث فعلياً. عند وصول المستخدم إلى وحدة المبيعات، يرى قائمة الفواتير العادية، وعليه اختيار "إنشاء من مستخلص" يدوياً ثم تحديد المستخلص الصحيح من قائمة منسدلة. هذا يكسر سير العمل المتوقع ويزيد خطر اختيار مستخلص خاطئ.
- **Evidence**: 
  - `progress-claims.tsx:478-484`:
    ```tsx
    <Button
      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
      onClick={() => {
        // Navigate to sales module with extract pre-fill
        setActiveItem('sales')
      }}
    >
    ```
  - تحققت من `sales.tsx`: `grep -n "prefill\|preselected\|claimId\|extractId\|searchParams\|useSearchParams" src/components/modules/sales.tsx` → 0 نتائج. وحدة المبيعات لا تتلقى أي معرّف من الخارج.
  - `sales.tsx:1123` `const [viewState, setViewState] = useState<ViewState>({ type: 'list' })` — الحالة الابتدائية دائماً list، ولا توجد آلية لاستقبال `progressClaimId` من متجر zustand أو من URL.
- **كيفية التحقق العملي**: 
  1. افتح "المستخلصات" ← اختر مستخلصاً معتمداً غير مفوتر (status=APPROVED و invoiced=false).
  2. اضغط زر "إنشاء فاتورة" (أخضر).
  3. النتيجة: ينتقل المستخدم إلى قائمة فواتير المبيعات (list view)، WITHOUT أي تحديد مسبق للمستخلص. يجب على المستخدم ضغط "إنشاء من مستخلص" ثم اختيار المستخلص يدوياً.
  4. `curl 'http://localhost:3000/api/progress-claims?status=APPROVED'` ← ابحث عن مستخلص مع `invoiced: false`، ثم تتبّع زر "إنشاء فاتورة" في UI.
- **Fix recommendation**: أضِف حقل `prefillProgressClaimId: string | null` إلى المتجر (أو استخدم URL search param `?claimId=xxx`). عند الضغط على الزر، استدعِ `setActiveItem('sales'); setPrefillProgressClaimId(claim.id)`. في `SalesModule`، اقرأ `prefillProgressClaimId` في `useState` الابتدائي وابدأ مباشرة في `viewState: { type: 'create', step: 2, sourceType: 'EXTRACT', selectedSourceId: prefillId }`. امسح الحقل بعد الاستخدام.

---

### L2-CRIT-005: Workflow chain click inside ProjectDetailView / EquipmentDetailView navigates AWAY and silently loses the detail context
- **File**: `src/components/modules/projects.tsx` + `src/components/modules/equipment.tsx`
- **Lines**: 
  - `projects.tsx:614-740` (WorkflowChainView component) + `projects.tsx:637-639` (`handleNavigate` calls `setActiveItem(navItem)` without preserving selectedProjectId)
  - `projects.tsx:1660` (`const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)` — component-local state, lost on unmount)
  - `projects.tsx:1719-1723` (`if (selectedProjectId && projectDetail) return <ProjectDetailView ... />` — when activeItem changes to e.g. 'contracts', ProjectsModule unmounts and selectedProjectId is lost)
  - `equipment.tsx:845-847` (`handleNavigate` calls `setActiveItem(navItem)` without preserving selectedEquipmentId) + `equipment.tsx:1465` (`selectedEquipmentId` is local state) + `equipment.tsx:1548-1549` (`if (selectedEquipmentId) return <EquipmentDetailView ... />`)
- **Dimension**: 5 (cross-module navigation) + 4 (breadcrumb / context preservation)
- **Problem**: داخل `ProjectDetailView` يوجد "سلسلة العمل" (Workflow Chain) التي تعرض خطوات المشروع (العميل ← المشروع ← العقد ← BOQ ← ...). كل خطوة قابلة للنقر (line 679-734) وتستدعي `handleNavigate(step.navItem)` الذي ينفّذ `setActiveItem('contracts')` مثلاً. المشكلة: `selectedProjectId` هو state محلي للمكوّن (line 1660)، فحين يتنقل المستخدم إلى وحدة العقود ثم يعود إلى المشاريع (via القائمة الجانبية)، يرى قائمة المشاريع بدلاً من تفاصيل المشروع الذي كان يتصفحه. نفس المشكلة في `equipment.tsx` — النقر على "أمر توصيل" / "سجل ساعات" / "فاتورة تأجير" (السطور 1085/1089/1093) داخل EquipmentDetailView يفقد سياق المعدة المحددة. هذا يحرم المستخدم من سير عمل طبيعي: "أرى تفاصيل المشروع → أحتاج تعديل العقد المرتبط → أعود لتفاصيل المشروع".
- **Evidence**: 
  - `projects.tsx:1660` `const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)` — useState محلي.
  - `projects.tsx:1720` `return <ProjectDetailView project={projectDetail} onBack={() => setSelectedProjectId(null)} lang={lang} />` — بدون تمرير أي carry-over للـ store.
  - عند `setActiveItem('contracts')`، يُلغى تثبيت `ProjectsModule` (لأن moduleMap في page.tsx:143 يبدّل إلى ContractsModule)، وحين العودة يُعاد إنشاء `ProjectsModule` من الصفر بـ `selectedProjectId = null`.
  - نفس النمط في `equipment.tsx:1465` و `equipment.tsx:1548-1549`.
- **كيفية التحقق العملي**: 
  1. افتح "المشاريع" ← اختر مشروعاً (يظهر ProjectDetailView).
  2. في تبويب "سلسلة العمل"، اضغط خطوة "العقود".
  3. النتيجة: ينتقل المستخدم إلى قائمة العقود (✅ متوقع).
  4. اضغط "المشاريع" في القائمة الجانبية للعودة.
  5. النتيجة: يرى المستخدم قائمة المشاريع، NOT تفاصيل المشروع الذي كان يتصفحه. السياق ضاع.
  6. `agent-browser nav http://localhost:3000/ ; agent-browser click sidebar-projects ; agent-browser click project-card-0 ; agent-browser click workflow-step-contracts ; agent-browser click sidebar-projects ; agent-browser snapshot` — الـ snapshot الأخير يُظهر قائمة المشاريع بدلاً من ProjectDetailView.
- **Fix recommendation**: انقل `selectedProjectId` و `selectedEquipmentId` من state محلي إلى المتجر الزوستاند (السطور 362-363 من app-store.ts تعرّف الحقول فعلاً، لكن `selectProject`/`selectEquipment` المُعرَّفة في 401-402 غير مستدعاة). استدعِ `selectProject(project.id)` قبل `setActiveItem('contracts')` في `handleNavigate` (projects.tsx:637). وفي `ProjectsModule`، اقرأ `selectedProjectId` من المتجر بدلاً من `useState`. كذلك في `EquipmentModule`.

---

### L2-HIGH-001: No detail-level breadcrumb — 18+ detail views render only a back button + record name, never "Hub > Module > Record"
- **File**: `src/components/layout/header.tsx`
- **Lines**: 41-54 (breadcrumb render — only 2 levels: group + item)
- **Dimension**: 4 (breadcrumb correctness)
- **Problem**: الـ breadcrumb في الـ header يعرض فقط `<Group> / <Item>` (مثلاً: "المشاريع التنفيذية / المشاريع"). عند الدخول إلى عرض تفصيلي (ProjectDetailView في projects.tsx:1453، EquipmentDetailView في equipment.tsx:819، ContractDetailView في contracts.tsx:848، PayrollRunDetail في payroll-runs.tsx:540، JournalEntryDetail في accounting.tsx:2526، و~13 عرض تفصيلي آخر — انظر قائمة `onBack=` في المنهجية)، يبقى الـ breadcrumb كما هو دون إظهار اسم السجل الحالي. المستخدم لا يرى "المشاريع التنفيذية / المشاريع / مشروع الرياض - فيلا 1" بل يرى فقط "المشاريع التنفيذية / المشاريع". هذا يُربك المستخدم الذي يتنقل بين عدة سجلات تفصيلية.
- **Evidence**: 
  - `header.tsx:42-54` يعرض `<span>{currentGroup.label[lang]}</span> <span>/</span> <span>{currentLabel[lang]}</span>` — لا يقرأ أي state متعلق بالـ detail.
  - `grep -rn "onBack=" src/components/modules/ | wc -l` → 45 نتيجة عبر 18 وحدة، كلها تستخدم نمط `<Button onClick={onBack}><ArrowRight /></Button> + <h2>{record.name}</h2>` بدون breadcrumb.
  - `grep -rn "Breadcrumb\|breadcrumb" src/components/modules/` → 0 نتائج (لا توجد وحدة تستخدم Breadcrumb component).
- **كيفية التحقق العملي**: 
  1. افتح "المشاريع" ← اختر مشروعاً (يظهر ProjectDetailView مع زر رجوع + اسم المشروع).
  2. انظر إلى الـ header في أعلى الصفحة: يعرض "المشاريع التنفيذية / المشاريع" فقط.
  3. يجب أن يعرض "المشاريع التنفيذية / المشاريع / <اسم المشروع>" مع إمكانية النقر على "المشاريع" للعودة إلى القائمة.
- **Fix recommendation**: أضِف state `detailLabel: { ar, en } | null` و `detailOnBack: (() => void) | null` إلى المتجر. عند الدخول إلى عرض تفصيلي، استدعِ `setDetailBreadcrumb({ label, onBack })`. في `header.tsx`، إذا كان `detailLabel` موجوداً، أضِف `<span>/</span> <button onClick={detailOnBack}>{detailLabel}</button>` إلى الـ breadcrumb. امسح الحقل عند الخروج من العرض التفصيلي. أو — بشكل أبسط — استخدم `src/components/ui/breadcrumb.tsx` (shadcn) الموجود فعلاً وغير المستخدم (انظر L2-HIGH-002).

---

### L2-HIGH-002: Breadcrumb items are non-clickable `<span>` — no way to navigate back via breadcrumb
- **File**: `src/components/layout/header.tsx`
- **Lines**: 41-54 (entire breadcrumb block)
- **Dimension**: 4 (breadcrumb correctness)
- **Problem**: عناصر الـ breadcrumb مجرد `<span>` نصية بدون `onClick` وبدون `cursor-pointer`. المستخدم لا يستطيع:
  - النقر على "المجموعة" لتصفية القائمة الجانبية لتلك المجموعة.
  - النقر على "الوحدة" للعودة من عرض تفصيلي إلى القائمة.
  - النقر على "الرئيسية" للعودة إلى dashboard (لا توجد أصلاً).
  هذا يُلغي الوظيفة الأساسية للـ breadcrumb كأداة تنقل. الـ breadcrumb الحالي هو display-only.
- **Evidence**: 
  - `header.tsx:42-54`:
    ```tsx
    <div className="flex items-center gap-2 text-sm" dir="rtl">
      {currentGroup && (
        <>
          <span className="text-muted-foreground">{currentGroup.label[lang]}</span>
          <span className="text-muted-foreground">/</span>
        </>
      )}
      <span className="font-medium">{currentLabel[lang]}</span>
    </div>
    ```
  - `grep -n "Breadcrumb\|<Breadcrumb" src/components/layout/header.tsx` → 0 نتائج.
  - `src/components/ui/breadcrumb.tsx` يوفّر `BreadcrumbLink` بـ `asChild` prop يدعم `onClick` — لكنه غير مستورد في أي مكان (`grep -rn "from '@/components/ui/breadcrumb" src/` → 0 نتائج).
- **كيفية التحقق العملي**: 
  1. افتح أي وحدة (مثلاً "الموظفون").
  2. مرر المؤشر فوق "الموارد البشرية" في الـ breadcrumb — لا يتغير شكل المؤشر إلى pointer، لا يحدث شيء عند النقر.
  3. افتح DevTools ← Accessibility tab ← الـ span ليس role="link" ولا لديه clickable semantics.
- **Fix recommendation**: استبدل الـ spans بـ `<Breadcrumb>` shadcn component الموجود فعلاً في `src/components/ui/breadcrumb.tsx`:
  ```tsx
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem><BreadcrumbLink onClick={() => setActiveItem('dashboard')}>الرئيسية</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbLink onClick={() => { /* filter sidebar by group */ }}>{currentGroup.label[lang]}</BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbPage>{currentLabel[lang]}</BreadcrumbPage></BreadcrumbItem>
      {detailLabel && (<><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{detailLabel[lang]}</BreadcrumbPage></BreadcrumbItem></>)}
    </BreadcrumbList>
  </Breadcrumb>
  ```

---

### L2-HIGH-003: Dashboard WorkflowChain steps are non-clickable — visual-only, no navigation despite having `navItem` field
- **File**: `src/components/modules/dashboard.tsx`
- **Lines**: 162-188 (`WorkflowChain` function component)
- **Dimension**: 9 (workflow chain on dashboard)
- **Problem**: دالة `WorkflowChain` في dashboard.tsx تعرض خطوات الـ CONSTRUCTION_WORKFLOW / RENTAL_WORKFLOW كـ `<div>` بسيط بدون `onClick`. الثوابت في `app-store.ts:210-236` تعرّف كل خطوة مع `navItem: '...' as NavItem` لكن الـ WorkflowChain في الـ dashboard تتجاهل هذا الحقل. النتيجة: المستخدم يرى سلسلة بصرية لـ "العميل ← المشروع ← العقد ← BOQ ← ..." لكن لا يستطيع النقر على أي خطوة للانتقال إلى الوحدة المعنية. هذا يخالف التوقّع المباشر من أي workflow chain في ERP. بالتناقض، `WorkflowChainView` في `projects.tsx:614-740` و `RentalWorkflowChain` في `equipment.tsx:695-745` كلاهما قابلان للنقر (`<button onClick={() => onNavigate(step.navItem)}>`) — فالـ pattern موجود لكنه لم يُطبَّق في الـ dashboard.
- **Evidence**: 
  - `dashboard.tsx:172-180`:
    ```tsx
    <div
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-colors ${activeColor}`}
    >
      {lang === 'ar' ? step.label.ar : step.label.en}
    </div>
    ```
    — `<div>` بدون `onClick`.
  - `dashboard.tsx:206-208`: `function ConstructionHubPanel({ data, lang, onNavigate }: { ...; onNavigate: (item: NavItem) => void })` — `onNavigate` موجود في الـ signature لكنه لا يُمرَّر إلى `WorkflowChain`.
  - `dashboard.tsx:217`: `<WorkflowChain steps={CONSTRUCTION_WORKFLOW} theme="emerald" lang={lang} />` — لا يُمرَّر `onNavigate`.
  - مقارنة بـ `projects.tsx:679-734`: `<button onClick={() => handleNavigate(step.navItem)} ...>` — قابل للنقر.
- **كيفية التحقق العملي**: 
  1. افتح الـ dashboard.
  2. انزل إلى "سير العمل" في لوحة "المشاريع التنفيذية".
  3. حاول النقر على أي خطوة (العميل، المشروع، العقد، ...).
  4. النتيجة: لا يحدث شيء. المؤشر لا يتغير إلى pointer.
  5. افتح DevTools ← الـ div ليس role="button" وليس clickable.
- **Fix recommendation**: أضِف prop `onNavigate?: (item: NavItem) => void` إلى `WorkflowChain` (dashboard.tsx:162). غيّر الـ `<div>` إلى `<button>` مع `onClick={() => onNavigate?.(step.navItem)}`. مرّر `onNavigate={setActiveItem}` من `ConstructionHubPanel` (dashboard.tsx:217) و `RentalHubPanel` (dashboard.tsx:462).

---

### L2-HIGH-004: Header Search button has no onClick — dead button
- **File**: `src/components/layout/header.tsx`
- **Lines**: 61-63 (`<Button variant="ghost" size="icon" className="size-9"><Search className="size-4" /></Button>`)
- **Dimension**: 2 (button → route correctness) — dead navigation
- **Problem**: زر البحث في الـ header (أيقونة Search) لا يحتوي على `onClick`. المستخدم يضغطه ولا يحدث شيء. لا يوجد global search feature في النظام رغم أن الأيقونة موحية بوجودها. هذا dead navigation link.
- **Evidence**: 
  - `header.tsx:61-63`:
    ```tsx
    <Button variant="ghost" size="icon" className="size-9">
      <Search className="size-4" />
    </Button>
    ```
    — لا `onClick`، لا `title`، لا `aria-label`.
  - `grep -rn "global.*search\|searchAll\|searchModal" src/` → 0 نتائج (لا توجد ميزة بحث شاملة).
- **كيفية التحقق العملي**: 
  1. افتح أي صفحة في التطبيق.
  2. انقر أيقونة البحث في أعلى اليسار من الـ header.
  3. النتيجة: لا يحدث شيء. لا يفتح dialog، لا ينتقل إلى صفحة بحث، لا يظهر input.
  4. `agent-browser click header-search-button ; agent-browser snapshot` — لا تغيير.
- **Fix recommendation**: إما أضِف `onClick` يفتح `<CommandDialog>` (shadcn) مع بحث شامل عبر الوحدات والسجلات، أو أزِل الزر من الـ header لتفادي إرباك المستخدم. يُفضَّل الأول لأن البحث الشامل ميزة أساسية في ERP.

---

### L2-HIGH-005: Header Notification bell has hardcoded badge "3" and no onClick — dead button
- **File**: `src/components/layout/header.tsx`
- **Lines**: 64-69 (`<Button variant="ghost" size="icon" className="relative size-9"><Bell className="size-4" /><Badge ...>3</Badge></Button>`)
- **Dimension**: 2 (button → route correctness) — dead navigation
- **Problem**: زر الإشعارات (أيقونة Bell) في الـ header لا يحتوي على `onClick`. الـ badge يعرض رقم "3" ثابت hardcoded. المستخدم يضغطه ولا يحدث شيء. لا توجد ميزة إشعارات فعلية في النظام. هذا dead navigation link. الـ badge "3" مضلِّل لأنه يوحي بوجود 3 إشعارات غير مقروءة.
- **Evidence**: 
  - `header.tsx:64-69`:
    ```tsx
    <Button variant="ghost" size="icon" className="relative size-9">
      <Bell className="size-4" />
      <Badge className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[9px] bg-emerald-600">
        3
      </Badge>
    </Button>
    ```
    — لا `onClick`، الـ "3" hardcoded literal.
  - `grep -rn "notification\|Notification" src/components/modules/ src/components/layout/ src/app/api/` → 0 نتائج (لا يوجد model عائلة Notification في prisma/schema.prisma).
- **كيفية التحقق العملي**: 
  1. افتح أي صفحة في التطبيق.
  2. انقر أيقونة الجرس في أعلى اليسار.
  3. النتيجة: لا يحدث شيء. الـ badge "3" لا يتغير مهما فعل المستخدم.
- **Fix recommendation**: إما أضِف `onClick` يفتح `<Popover>` مع قائمة الإشعارات (يجب إنشاء model Notification + API أولاً)، أو أزِل الزر + الـ badge من الـ header حتى تُبنى الميزة. لا تترك badge مضلِّل برقم ثابت.

---

### L2-HIGH-006: print-button.tsx silent failure when popup blocker prevents `window.open`
- **File**: `src/components/shared/print-button.tsx`
- **Lines**: 477-481 (`const printWindow = window.open('', '_blank', 'width=800,height=1000'); if (printWindow) { ... }`)
- **Dimension**: 2 (button → route correctness) + 6 (feedback)
- **Problem**: `window.open('', '_blank', ...)` يُرجع `null` عندما يمنع المتصفح النوافذ المنبثقة (popup blocker، معظم المتصفحات الحديثة تمنع `window.open` غير المُفعَّل من user gesture مباشر، خاصة بعد `await`). الكود يتحقق `if (printWindow)` ثم يتجاهل الحالة `null` بصمت — لا toast، لا alert، لا fallback. المستخدم يضغط "طباعة"، يرى loading قصير، ثم لا يحدث شيء. لا يعرف لماذا فشلت الطباعة.
- **Evidence**: 
  - `print-button.tsx:477-481`:
    ```tsx
    const printWindow = window.open('', '_blank', 'width=800,height=1000')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
    }
    // لا else — silent failure
    ```
  - قبل هذا السطر، يوجد `await` للـ QR generation (line 395-407) و `await` لـ background removal (line 413-427) و `await` لـ print HTML generation (line 430-474). هذه الـ awaits تكسر "user gesture" context في Chrome، مما يجعل `window.open` يُحجب غالباً.
- **كيفية التحقق العملي**: 
  1. فعِّل popup blocker في المتصفح (Chrome: Settings → Privacy → Site Settings → Pop-ups → "Don't allow sites to send pop-ups").
  2. افتح أي وحدة بها زر طباعة (مثلاً "فواتير العملاء").
  3. اضغط زر الطباعة.
  4. النتيجة: loading قصير ثم لا شيء. لا رسالة خطأ. المستخدم لا يعرف أن popup blocker منع الطباعة.
  5. `curl 'http://localhost:3000/api/sales-invoices/SRV-2026-0001'` (احصل على invoiceId) ثم في UI اضغط زر الطباعة لـ SRV-2026-0001.
- **Fix recommendation**: أضِف `else { toast.error(t('فشل في فتح نافذة الطباعة — يرجى السماح بالنوافذ المنبثقة', 'Failed to open print window — please allow pop-ups', lang)) }` بعد `if (printWindow)`. أو — بشكل أفضل — استبدل `window.open` بـ iframe مخفي + `iframe.contentWindow.print()` الذي لا يحتاج popup permission. أو اعرض HTML في modal داخل التطبيق مع زر "اطبع" يدوي.

---

### L2-HIGH-007: Active group highlighting only for hub groups — 5 of 8 groups don't highlight when their child is active
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 177-181 (group header className conditional — only highlights if `isHub && hasActiveItem`)
- **Dimension**: 8 (active item highlighting)
- **Problem**: في الـ sidebar المكتبي، يُبرَز رأس المجموعة فقط إذا كانت المجموعة هي `construction-hub` أو `rental-hub` (المعرّفة كـ `isHub` في line 166). باقي المجموعات (hr، supply-chain، operations، accounting-reports، settings-data) لا تُبرَز حتى لو كان العنصر النشط ينتمي إليها. هذا يُضعف الـ wayfinding: المستخدم الذي يتنقل إلى "الموظفون" لا يرى أي إشارة بصرية في رأس مجموعة "الموارد البشرية" تشير إلى أن المجموعة نشطة.
- **Evidence**: 
  - `sidebar.tsx:166` `const isHub = group.key === 'construction-hub' || group.key === 'rental-hub'`
  - `sidebar.tsx:177-181`:
    ```tsx
    hasActiveItem && isHub
      ? cn(colors.text, colors.border, colors.light, 'border-r-4')
      : hasActiveItem
        ? 'text-foreground'
        : 'text-muted-foreground hover:text-foreground',
    ```
    — رأس المجموعة غير الـ hub مع `hasActiveItem` يحصل فقط على `text-foreground` (تغيير طفيف في لون النص)، بدون `colors.light` خلفية ولا `colors.border`.
  - مقارنة بالـ mobile sidebar (`sidebar.tsx:367-372`): نفس النمط — `isHub && hasActiveItem` فقط.
- **كيفية التحقق العملي**: 
  1. افتح التطبيق ← اضغط "الموظفون" في القائمة الجانبية.
  2. لاحظ رأس مجموعة "الموارد البشرية" — يظل بنفس اللون الرمادي المعتاد، بدون خلفية ملوَّنة.
  3. بالتناقض، اضغط "المشاريع" — رأس مجموعة "المشاريع التنفيذية" يحصل على خلفية `bg-emerald-50` + لون نص `text-emerald-600` + border.
  4. `agent-browser click sidebar-employees ; agent-browser snapshot` — رأس "الموارد البشرية" لا يُبرَز.
- **Fix recommendation**: أزِل شرط `isHub` من الـ conditional في line 177. دع كل المجموعات تحصل على `colors.light + colors.text + colors.border` عند `hasActiveItem`. أو على الأقل أضِف `colors.text` + `bg-muted/50` لكل المجموعات.

---

### L2-MED-001: Header breadcrumb forces `dir="rtl"` even in English mode
- **File**: `src/components/layout/header.tsx`
- **Lines**: 42 (`<div className="flex items-center gap-2 text-sm" dir="rtl">`)
- **Dimension**: 4 (breadcrumb — RTL/LTR)
- **Problem**: الـ breadcrumb container مجبر على `dir="rtl"` بغض النظر عن لغة الواجهة. في الوضع الإنجليزي، يجب أن يظهر الـ breadcrumb بترتيب LTR (Home > Group > Item) من اليسار إلى اليمين. مع `dir="rtl"` الإجباري، يظهر بترتيب معكوس بصرياً ("Item / Group" بدلاً من "Group / Item")، والـ "/" separator يظهر في موضع غير متوقع.
- **Evidence**: السطر 42 أعلاه — `dir="rtl"` hardcoded بدون شرط على `lang`.
- **كيفية التحقق العملي**: بدِّل للإنجليزية (اضغط زر "English" في أسفل القائمة الجانبية) ← انظر إلى الـ breadcrumb في الـ header — الترتيب البصري معكوس.
- **Fix recommendation**: استبدل `dir="rtl"` بـ `dir={lang === 'ar' ? 'rtl' : 'ltr'}`.

---

### L2-MED-002: Desktop sidebar initial state collapses 5 of 8 groups — discoverability problem
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 111-113 (`useState<Set<NavGroup>>(new Set(['home', 'construction-hub', 'rental-hub']))`)
- **Dimension**: 7 (sidebar collapse/expand behavior)
- **Problem**: الـ desktop sidebar يبدأ بحالة `expandedGroups = {home, construction-hub, rental-hub}` فقط. باقي 5 مجموعات (hr، supply-chain، operations، accounting-reports، settings-data) تكون مطويةّة افتراضياً، مما يخفي ~25 عنصر تنقل. المستخدم الجديد قد لا يدرك وجود هذه المجموعات إذا لم ينقر على رؤوسها. بالتناقض، الـ mobile sidebar (line 309-311) يبدأ بكل المجموعات مفتوحة — سلوك غير متسق بين desktop و mobile.
- **Evidence**: 
  - `sidebar.tsx:111-113` (desktop): `new Set(['home', 'construction-hub', 'rental-hub'])` — 3 مجموعات.
  - `sidebar.tsx:309-311` (mobile): `new Set(['home', 'construction-hub', 'rental-hub', 'hr', 'supply-chain', 'operations', 'accounting-reports', 'settings-data'])` — 8 مجموعات (الكل).
- **كيفية التحقق العملي**: افتح التطبيق على desktop (≥1024px) — المجموعات الـ 5 (HR, supply-chain, operations, accounting-reports, settings-data) تكون مطوية. على الموبايل (≤768px) — تكون كلها مفتوحة.
- **Fix recommendation**: وحِّد السلوك الابتدائي بين desktop و mobile (الأفضل: ابدأ بكل المجموعات مفتوحة على كلاهما، أو على الأقل افتح مجموعة `home` + المجموعة التي تحتوي على `activeItem`). أو احفظ حالة التوسيع في localStorage للمستخدم.

---

### L2-MED-003: Sidebar desktop collapse button — inconsistent title vs label text
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 287-299 (collapse toggle button)
- **Dimension**: 8 (active item / sidebar UX)
- **Problem**: زر تصغير/توسيع القائمة في أسفل الـ sidebar المكتبي يستخدم نصاً غير متسق بين الـ `title` attribute و الـ label الظاهر:
  - `title={sidebarCollapsed ? 'توسيع' : 'تصغير'}` (line 293)
  - `{sidebarCollapsed ? 'توسيع' : 'تصغير القائمة'}` (line 297)
  عندما يكون الـ sidebar موسَّعاً، الـ `title` يقول "تصغير" لكن الـ label الظاهر يقول "تصغير القائمة". هذا تناقض بسيط لكنه قد يُربك قارئي الشاشة.
- **Evidence**: السطور 293 و 297 أعلاه.
- **كيفية التحقق العملي**: مرر المؤشر فوق زر "تصغير القائمة" في أسفل الـ sidebar — الـ tooltip يقول "تصغير" بينما الزر يقول "تصغير القائمة".
- **Fix recommendation**: وحِّد على "تصغير القائمة" / "Expand Menu" في كلا الموقعين، أو "تصغير" / "توسيع" في كليهما.

---

### L2-MED-004: Mobile sidebar drawer has no max-height safeguard — internal scroll only
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 332-336 (`<div className="fixed inset-y-0 right-0 z-50 w-72 bg-card shadow-xl lg:hidden overflow-y-auto" dir="rtl">`)
- **Dimension**: 7 (sidebar collapse/expand — mobile)
- **Problem**: الـ drawer يستخدم `inset-y-0` (full height) + `overflow-y-auto`، وهو سليم تقنياً. لكن الـ header sticky (line 338) و الـ footer sticky (line 421) يقتطعان من المساحة المتاحة للـ nav بينهما. على موبايل صغير (375×667 مثلاً) مع كل المجموعات مفتوحة (افتراضياً على mobile — انظر L2-MED-002)، قد يحتاج المستخدم إلى scroll داخلي طويل للوصول إلى عناصر أسفل (مثل settings-data). لا يوجد indicator بصري يوضح أن هناك محتوى أسفل/أعلى الـ drawer.
- **Evidence**: السطور 332-336 + 338 + 421. الـ nav بينهما (~line 357-418) بدون scroll indicator.
- **كيفية التحقق العملي**: افتح التطبيق على viewport 375×667 ← افتح الـ sidebar (hamburger) ← حاول الوصول إلى "الإعدادات والبيانات" ← "الربط المحاسبي" (آخر عنصر) — ستحتاج إلى scroll داخل الـ drawer بدون indicator واضح.
- **Fix recommendation**: أضِف `shadow-inner` أو gradient overlay في أعلى/أسفل الـ nav للإشارة إلى وجود محتوى قابل للـ scroll. أو قلّص الـ padding الافتراضي للعناصر على الموبايل لاحتواء المزيد بدون scroll.

---

### L2-MED-005: Dashboard "View All Projects" / "View All Equipment" buttons use `ArrowLeft` icon (LTR semantics) in RTL layout
- **File**: `src/components/modules/dashboard.tsx`
- **Lines**: 322-325 (`<Button onClick={() => onNavigate('projects')} ...>{t('عرض جميع المشاريع', 'View All Projects', lang)}<ArrowLeft className="size-4" /></Button>`) + 463-466 (same for equipment)
- **Dimension**: 7 (RTL/LTR icon semantics) + 9 (workflow navigation)
- **Problem**: في الـ RTL layout، السهم الذي يشير إلى "التالي" أو "المتابعة" يجب أن يكون `ArrowLeft` (يشير إلى اليسار = اتجاه القراءة في RTL). الكود يستخدم `ArrowLeft` بالفعل — هذا صحيح. لكن في الوضع الإنجليزي (LTR)، يجب أن يكون `ArrowRight` للإشارة إلى "view all →". الكود يستخدم `ArrowLeft` في كلا الوضعين. هذا قد يُربك المستخدم الإنجليزي. (ملاحظة: هذا تكرار جزئي لـ L1-MED-008 الذي ركّز على `dir="ltr"` للـ workflow chain — هنا نتحدث عن أيقونة زر منفصل).
- **Evidence**: 
  - `dashboard.tsx:323` `<ArrowLeft className="size-4" />` — بدون شرط على `lang`.
  - `dashboard.tsx:465` `<ArrowLeft className="size-4" />` — نفس النمط.
- **كيفية التحقق العملي**: بدِّل للإنجليزية ← انظر إلى زر "View All Projects" — السهم يشير يساراً (←) بدلاً من يميناً (→) كما هو متوقع في LTR.
- **Fix recommendation**: استبدل بـ `{lang === 'ar' ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}`.

---

### L2-MED-006: When sidebarCollapsed (desktop), nav items don't show activity color dot — only icon
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 215-245 (collapsed-mode nav item render — only Icon + className)
- **Dimension**: 8 (active item highlighting — collapsed mode)
- **Problem**: في وضع الـ sidebar المُصغَّر (`sidebarCollapsed=true`، عرض 64px)، يُعرض كل عنصر تنقل كأيقونة فقط داخل زر. لا توجد نقطة لونية تشير إلى نوع النشاط (construction=emerald / rental=cyan) كما في الوضع الموسَّع (lines 238-243). كذلك، العنصر النشط يحصل على `colors.light + colors.text` (line 226) لكن بدون border-r-4 الذي يظهر في الوضع الموسَّع (line 227). الفرق البصري بين العنصر النشط وغير النشط في الوضع المُصغَّر أقل وضوحاً.
- **Evidence**: 
  - `sidebar.tsx:224-230`:
    ```tsx
    isActive
      ? sidebarCollapsed
        ? cn(colors.light, colors.text)        // collapsed active — no border, no dot
        : cn(colors.light, colors.text, 'border-r-4 font-medium', isHub ? colors.border : 'border-emerald-500')
      : sidebarCollapsed
        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
    ```
  - في الوضع الموسَّع، يوجد `border-r-4` للعنصر النشط (line 227). في الوضع المُصغَّر، لا يوجد.
  - activity dot (lines 238-243) يُعرض فقط `!sidebarCollapsed &&` — يُحجب في الوضع المُصغَّر.
- **كيفية التحقق العملي**: اضغط زر "تصغير القائمة" في أسفل الـ sidebar ← العناصر تصبح أيقونات فقط ← العنصر النشط له خلفية ملوَّنة طفيفة لكن بدون border ولا نقطة نشاط.
- **Fix recommendation**: أضِف `border-r-2` أو `ring-2` للعنصر النشط في الوضع المُصغَّر. أضِف نقطة صغيرة (size-1.5) في زاوية الزر للإشارة إلى نوع النشاط حتى في الوضع المُصغَّر.

---

### L2-MED-007: Sidebar items don't have `title=` attribute when expanded — no tooltip on hover
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 232 (`title={sidebarCollapsed ? label[lang] : undefined}`)
- **Dimension**: 8 (active item / accessibility)
- **Problem**: في الوضع الموسَّع، عناصر الـ sidebar لا تحتوي على `title=` attribute (`undefined`). هذا يعني:
  - لا tooltip عند الـ hover لعرض الاسم الكامل إذا كان مقطوعاً بـ `truncate` (line 236).
  - قارئات الشاشة تعتمد على النص الظاهر، لكن إذا كان مقطوعاً بصرياً، قد لا يُقرأ كاملاً في بعض الحالات.
  - بالتناقض، في الوضع المُصغَّر، الـ `title` موجود (line 232).
- **Evidence**: السطر 232 — `title={sidebarCollapsed ? label[lang] : undefined}`.
- **كيفية التحقق العملي**: مرر المؤشر فوق عنصر "جدول الكميات BOQ" في الـ sidebar الموسَّع — لا يظهر tooltip. اذا ضاقت الشاشة وقُص الاسم إلى "جدول الكميات..."، المستخدم لا يستطيع رؤية الاسم الكامل بدون النقر.
- **Fix recommendation**: استبدل `undefined` بـ `label[lang]` دائماً: `title={label[lang]}`. الـ tooltip لا يؤذي في الوضع الموسَّع ويُحسّن accessibility.

---

### L2-LOW-001: Breadcrumb uses plain "/" separator instead of shadcn `BreadcrumbSeparator` with `ChevronRight`
- **File**: `src/components/layout/header.tsx`
- **Lines**: 48 (`<span className="text-muted-foreground">/</span>`)
- **Dimension**: 4 (breadcrumb — visual consistency)
- **Problem**: الـ breadcrumb يستخدم حرف "/" نصي بدلاً من `<BreadcrumbSeparator>` من shadcn الذي يستخدم أيقونة `ChevronRight`. هذا غير متسق بصرياً مع نمط shadcn المستخدم في بقية التطبيق. كذلك، حرف "/" يظهر بنفس الحجم والوزن كالنص العادي، بينما الـ separator المتوقع أن يكون أصغر وأخفت.
- **Evidence**: السطر 48. `src/components/ui/breadcrumb.tsx:56-71` يوفّر `BreadcrumbSeparator` مع `ChevronRight` default.
- **كيفية التحقق العملي**: قارن الـ breadcrumb في الـ header بأي تطبيق shadcn قياسي — هنا "/" نصي، هناك أيقونة ChevronRight.
- **Fix recommendation**: استخدم `<BreadcrumbSeparator>` من shadcn عند迁移 الـ breadcrumb إلى `<Breadcrumb>` component (انظر L2-HIGH-002).

---

### L2-LOW-002: `src/components/ui/breadcrumb.tsx` (110 lines) is dead code — shadcn component never imported
- **File**: `src/components/ui/breadcrumb.tsx`
- **Lines**: 1-110 (entire file — exports Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage)
- **Dimension**: 4 (breadcrumb — component reuse)
- **Problem**: مكوّن `breadcrumb.tsx` من shadcn مثبَّت ويصدّر 6 sub-components، لكنه غير مستورد في أي مكان في `src/`:
  - `grep -rn "from '@/components/ui/breadcrumb" src/` → 0 نتائج.
  - `grep -rn "from '../ui/breadcrumb" src/` → 0 نتائج.
  النتيجة: 110 سطر dead code + إضاعة فرصة إعادة الاستخدام. الـ header يستخدم spans مخصصة بدلاً من هذا المكوّن الجاهز.
- **Evidence**: `Read src/components/ui/breadcrumb.tsx` يُظهر تصديرات قياسية. `grep` يؤكد 0 imports.
- **كيفية التحقق العملي**: `rg "ui/breadcrumb" src/ --files-with-matches` → 0 نتائج.
- **Fix recommendation**: استخدم `<Breadcrumb>` في `header.tsx` (انظر L2-HIGH-002 fix recommendation) — هذا يُعيد استخدام المكوّن ويُلغي 110 سطر dead code + يُحسّن الـ UX بـ tooltips و keyboard navigation و ARIA semantics.

---

### L2-LOW-003: Mobile sidebar `setSidebarOpen(true)` is exposed but never called from desktop Header (which is `lg:hidden`) — dead code path on desktop
- **File**: `src/components/layout/header.tsx`
- **Lines**: 31-39 (mobile hamburger button — `lg:hidden` className)
- **Dimension**: 7 (sidebar UX)
- **Problem**: زر الـ hamburger في الـ header مرئي فقط على الموبايل (`lg:hidden`). على الـ desktop، لا يوجد way لفتح الـ MobileSidebar (ولا حاجة لذلك). لكن `setSidebarOpen(true)` يمكن استدعاؤه برمجياً من أي مكان. هذا ليس خطأً لكنه dead-code path على desktop. غير حرج.
- **Evidence**: 
  - `header.tsx:32-39` `<Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>` — `lg:hidden` يخفي الزر على desktop.
  - على desktop، `sidebarOpen` يبقى دائماً `false` (initial state) — لا caller لـ `setSidebarOpen(true)` في سياق desktop.
- **كيفية التحقق العملي**: افتح DevTools على desktop (≥1024px) ← ابحث عن زر الـ hamburger — `display: none`. الـ MobileSidebar (sidebar.tsx:322) `if (!sidebarOpen) return null` — لا تُرسم.
- **Fix recommendation**: لا إجراء مطلوب — مقبول. مذكور للتوعية فقط.

---

### L2-LOW-004: Sidebar activity legend only shown when `!sidebarCollapsed` — collapsed mode loses the legend
- **File**: `src/components/layout/sidebar.tsx`
- **Lines**: 252-269 (activity legend block — `{!sidebarCollapsed && (...)}`)
- **Dimension**: 8 (sidebar UX — collapsed mode)
- **Problem**: في الوضع المُصغَّر، تختفي activity legend (النقطة الخضراء = تنفيذي، النقطة السماوية = تأجير). المستخدم الذي يرى نقطة ملونة بجانب عنصر في الوضع الموسَّع ثم يُصغِّر القائمة، لن يجد تفسيراً للنقاط (التي تختفي أيضاً في الوضع المُصغَّر — انظر L2-MED-006). مقبول لكنه non-ideal wayfinding.
- **Evidence**: `sidebar.tsx:253` `{!sidebarCollapsed && (` — يحجب الـ legend بأكملها في الوضع المُصغَّر.
- **كيفية التحقق العملي**: اضغط "تصغير القائمة" — الـ legend في الأسفل تختفي.
- **Fix recommendation**: لا إجراء مطلوب — مقبول لأن الوضع المُصغَّر مصمَّم لتقليل الـ visual clutter. مذكور للتوعية فقط.

---

## Cross-module navigation inventory (verified by grep)

كل استدعاءات `setActiveItem(...)` داخل الوحدات (لا تشمل sidebar.tsx و header.tsx):

| # | Source file | Line | Target | Carries context? |
|---|---|---|---|---|
| 1 | `dashboard.tsx` | 799 | `'employees'` | ❌ no |
| 2 | `dashboard.tsx` | 806 | `'purchase-requests'` | ❌ no |
| 3 | `dashboard.tsx` | 813 | `'equipment-operations'` | ❌ no |
| 4 | `dashboard.tsx` | 820 | `'accounting'` | ❌ no |
| 5 | `dashboard.tsx` | 779 | `setActiveItem` (passed as `onNavigate` to ConstructionHubPanel) | n/a |
| 6 | `dashboard.tsx` | 780 | `setActiveItem` (passed as `onNavigate` to RentalHubPanel) | n/a |
| 7 | `dashboard.tsx` | 323 | `'projects'` (View All Projects button) | ❌ no |
| 8 | `dashboard.tsx` | 465 | `'equipment'` (View All Equipment button) | ❌ no |
| 9 | `projects.tsx` | 638 | 13 NavItems (workflow chain steps) | ❌ no — **loses selectedProjectId** (L2-CRIT-005) |
| 10 | `equipment.tsx` | 846 | NavItem (workflow chain + quick action buttons) | ❌ no — **loses selectedEquipmentId** (L2-CRIT-005) |
| 11 | `progress-claims.tsx` | 480 | `'sales'` (Create Invoice button) | ❌ no — **misleading "pre-fill" comment** (L2-CRIT-004) |

**Dead navigation buttons (no onClick at all)**:
| # | Source file | Line | Button | Issue |
|---|---|---|---|---|
| 1 | `header.tsx` | 61-63 | Search icon | no onClick — L2-HIGH-004 |
| 2 | `header.tsx` | 64-69 | Bell icon + hardcoded "3" badge | no onClick — L2-HIGH-005 |

**No Next.js routing primitives found anywhere**:
- `grep -rn "next/navigation\|useRouter\|usePathname\|useSearchParams" src/components/` → 0 نتائج
- `grep -rn "next/link\|<Link" src/components/` → 0 نتائج
- `grep -rn "history\.pushState\|history\.replaceState\|popstate\|hashchange" src/` → 0 نتائج
- `grep -rn "persist\|createJSONStorage\|zustand/middleware" src/` → 0 نتائج

التطبيق SPA نقي بدون أي تكامل مع URL/history المتصفح.

---

## Top 5 CRITICAL issues (priority order)

1. **L2-CRIT-001**: No URL deep-linking — refresh loses the active module + detail view state. Zustand store has no persistence, no `useEffect` syncing to URL.
2. **L2-CRIT-002**: Browser back button exits the app entirely — no `history.pushState`, no `popstate` listener.
3. **L2-CRIT-003**: Entire `src/components/sections/` directory (11 files, ~1500 LOC) is dead code; `selectProject`/`selectEquipment`/`setActiveSubModule` store actions have zero live callers.
4. **L2-CRIT-004**: progress-claims.tsx "Create Invoice" button navigates to sales WITHOUT passing the claim ID — pre-fill claim is non-functional despite the code comment claiming it does.
5. **L2-CRIT-005**: Workflow chain click inside ProjectDetailView / EquipmentDetailView navigates AWAY and silently loses the detail context (selectedProjectId/selectedEquipmentId is component-local state, lost on unmount).
