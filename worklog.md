# Construction ERP Worklog

---
Task ID: 1
Agent: Main
Task: Explore existing project structure and understand current state

Work Log:
- Examined project structure, package.json, prisma schema, layout, page.tsx, db.ts
- Identified existing components and dependencies
- Confirmed Next.js 16 with App Router, Tailwind CSS 4, shadcn/ui, Prisma, Zustand, TanStack Query

Stage Summary:
- Project is a fresh Next.js scaffold with basic structure
- All shadcn/ui components already installed
- Prisma configured with SQLite

---
Task ID: 2-3
Agent: Main
Task: Design and build comprehensive Prisma schema for construction ERP

Work Log:
- Designed complete schema with 30+ models covering all construction ERP needs
- Added enums: ProjectStatus, ContractStatus, InvoiceStatus, PurchaseOrderStatus, ClaimStatus, etc.
- Core models: Branch, Warehouse, Currency, CostCenter, Attachment, AuditLog
- Business models: Client, Supplier, Subcontractor, Employee
- Project models: Project, Contract, BOQItem, ProgressClaim
- Sales/Purchase: SalesInvoice, SalesInvoiceItem, PurchaseOrder, PurchaseOrderItem, PurchaseInvoice, PurchaseInvoiceItem
- Subcontractor: SubcontractorInvoice
- Cost models: Expense, LaborCost, EquipmentCost
- Equipment: Equipment, EquipmentUsage, EquipmentMaintenance, EquipmentFuelLog
- Cash: PettyCash, EmployeeAdvance
- Inventory: InventoryItem
- Accounting: Account, JournalEntry, JournalLine
- VAT: VATReturn
- Fixed optional relation fields for SQLite compatibility
- Successfully pushed schema with `bun run db:push`

Stage Summary:
- Complete construction ERP database schema with 30+ models
- All foreign keys and relations properly defined
- SQLite database in sync

---
Task ID: 4
Agent: Subagent (full-stack-developer)
Task: Build core app shell, sidebar, layout, navigation

Work Log:
- Created layout with RTL support (lang="ar" dir="rtl")
- Built professional sidebar with 7 grouped sections and 20 navigation items
- Dark emerald gradient header with Construction icon and "ERP مقاولات" branding
- Responsive sidebar: Desktop fixed + mobile slide-in drawer
- Header with breadcrumbs, search, notifications, user avatar
- Providers with QueryClient and TooltipProvider
- Module placeholder component for unbuilt modules

Stage Summary:
- Complete app shell with RTL Arabic layout
- Professional sidebar navigation
- Responsive design for mobile/desktop

---
Task ID: 5-a
Agent: Subagent (full-stack-developer)
Task: Build Seed API, Dashboard API, and Dashboard Module

Work Log:
- Created POST /api/seed endpoint with comprehensive sample data
- Created GET /api/dashboard endpoint with KPI statistics
- Built Dashboard module with KPI cards, line chart, pie chart, and data tables
- Added seed button for empty database state

Stage Summary:
- Dashboard fully functional with charts and KPIs
- Seed API provides realistic Saudi construction company data

---
Task ID: 5-b
Agent: Subagent (full-stack-developer)
Task: Build Projects, Contracts, BOQ, and Progress Claims modules

Work Log:
- Built 7 API routes for projects, contracts, BOQ, progress claims
- Built Projects module with table, detail view, and Cost Sheet (كرتة المشروع)
- Built Contracts module with summary card and VAT calculation
- Built BOQ module with category grouping
- Built Progress Claims module with running totals

Stage Summary:
- All project management modules complete
- Cost Sheet shows Revenue - Costs = Profit

---
Task ID: 5-c
Agent: Subagent (full-stack-developer)
Task: Build Clients, Suppliers, Subcontractors, Sales, and Purchases modules

Work Log:
- Built 12 API routes for all entity CRUD operations
- Built Clients, Suppliers, Subcontractors modules with search and CRUD dialogs
- Built Sales module with line items and auto-VAT
- Built Purchases module with tabbed PO/PI view and PO→PI linking

Stage Summary:
- All sales and purchase modules complete
- Auto-generated codes (CLT-001, SUP-001, etc.)

---
Task ID: 6-8 (User Feedback Fix)
Agent: Main
Task: Fix scrolling, add Amiri font, bilingual support, English digits

Work Log:
- Replaced Geist font with Amiri (Arabic/Latin) in layout.tsx
- Added bilingual support (AR/EN) to Zustand store with lang state and toggleLang
- Added labels, sectionLabels, commonText bilingual dictionaries to store
- Added formatSAR, formatNumber, formatDate helper functions with English digits
- Fixed sidebar scrolling: replaced ScrollArea with native overflow-y-auto + overscroll-contain
- Fixed main content scrolling: added overscroll-contain + WebkitOverflowScrolling
- Added language toggle button in sidebar footer
- Updated header with bilingual breadcrumb
- All numbers now use toLocaleString('en-US') instead of 'ar-SA'

Stage Summary:
- Amiri font as primary font
- Full bilingual AR/EN support with toggle
- All numbers display in English digits (0-9)
- Sidebar and content areas have proper scrolling

---
Task ID: 9-11
Agent: Subagent (full-stack-developer)
Task: Build all missing modules and API routes

Work Log:
- Built Equipment module with detail view (Usage, Maintenance, Fuel tabs)
- Built Petty Cash module with category filter
- Built Advances module with settle functionality
- Built Inventory module with low stock alerts
- Built Accounting module with Chart of Accounts and Journal Entries tabs
- Built VAT module with returns management
- Built Reports module with 8 report types
- Built Settings module with 5 tabs (Branches, Warehouses, Cost Centers, Currencies, Employees)
- Created API routes: /api/accounts, /api/journal-entries, /api/vat, /api/cost-centers, /api/currencies, /api/reports
- Updated existing routes: /api/branches, /api/warehouses, /api/employees
- All modules wired in page.tsx - no placeholders remaining

Stage Summary:
- All 20 modules built and functional
- 25+ API routes created
- Complete construction ERP system

---
Task ID: 12
Agent: Subagent (full-stack-developer)
Task: Fix existing modules to use English digits and bilingual support

Work Log:
- Updated all 12 existing module files
- Replaced all toLocaleString('ar-SA') with toLocaleString('en-US')
- Imported formatSAR, formatNumber, formatDate from store
- Added bilingual support (lang variable) for page titles and labels
- Verified with grep - zero ar-SA locale calls remain

Stage Summary:
- All numbers display in English digits across all modules
- Bilingual support added to all modules
- ESLint passes with zero errors

---
Task ID: 13
Agent: Main
Task: Final integration testing and verification

Work Log:
- Ran ESLint - zero errors
- Checked dev server logs - all API routes working
- Agent Browser testing:
  - Dashboard loads with KPIs, charts, and data tables
  - Language toggle works (AR↔EN)
  - Numbers display in English digits (950,000.00 ر.س / SAR 950,000.00)
  - All 20 module navigations work
  - Sidebar scrolling is functional (scrollHeight > clientHeight)
  - Main content scrolling works
  - No console errors

Stage Summary:
- System fully functional and verified
- All user requirements met: scrolling, Amiri font, bilingual, English digits, all screens built

---
Task ID: 22
Agent: Main
Task: Build professional ZATCA-compliant Saudi invoice template component

Work Log:
- Created Company Settings API (`/src/app/api/company-settings/route.ts`) with GET/PUT endpoints
  - Returns default company settings if no record exists in database
  - Supports full CRUD with all company fields (nameAr, nameEn, taxNumber, commercialReg, bank info, etc.)
- Created amount-to-words utility (`/src/lib/amount-to-words.ts`)
  - `numberToArabicWords()`: Converts numbers to Arabic words (e.g., "سبعة وثلاثون ألفاً...")
  - `numberToEnglishWords()`: Converts numbers to English words (e.g., "Thirty-seven thousand...")
  - Handles riyals and halalas, supports up to billions
- Created ZATCA QR code utility (`/src/lib/zatca-qr.ts`)
  - Implements TLV (Tag-Length-Value) encoding per ZATCA requirements
  - Tags: Seller Name, VAT Number, Invoice Date, Invoice Total, VAT Total
  - Base64 encodes TLV data and generates QR code using `qrcode` library
- Updated Sales Invoices API (`/src/app/api/sales-invoices/route.ts`)
  - Extended client select to include: nameAr, taxNumber, phone, email, address
  - Added project nameAr to project select
  - Added support for discount fields (discountRate, discountAmount, netAmount)
  - Added invoiceType and paymentTerms fields
  - Added contractId support
  - Invoice numbers now use INV- prefix
- Created Invoice Preview Component (`/src/components/invoice/invoice-preview.tsx`)
  - Professional Saudi invoice template matching Odoo/enterprise ERP quality
  - Full RTL Arabic layout with bilingual labels
  - Status bar (colored: DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, CANCELLED=gray)
  - Company header with logo placeholder, company names (AR/EN), tax number, commercial reg
  - Invoice info + client info in two columns
  - Items table with #, description, quantity, unit, price, total columns
  - Totals section with subtotal, discount, net amount, VAT, total due
  - Amount in words (Arabic & English) in amber box
  - Payment info section (bank name, IBAN, account name)
  - Notes section
  - Signature lines (sales rep + client approval)
  - ZATCA compliance footer with QR code and compliance text
  - Print support with @media print CSS
  - "طباعة الفاتورة" (Print) button
- Updated Sales Module (`/src/components/modules/sales.tsx`)
  - Added "عرض الفاتورة" (View Invoice) button with Printer icon for each invoice row
  - Opens InvoicePreview in a dialog when clicked
  - Passes invoice data, client data, company settings, and project info to preview
  - Added discount fields in create invoice dialog (none/rate/amount)
  - Added unit field to line items
  - Shows discount, net amount in summary calculation
  - Fetches company settings from API for invoice preview
- Added print CSS styles to `globals.css`
  - A4 paper size (210mm × 297mm)
  - Minimal margins (8mm)
  - Hides non-print elements (.no-print class)
  - Forces exact color printing
  - Prevents page breaks inside important sections
  - Removes shadows for print
- Fixed seed data for new schema fields
  - Added netAmount default value in Prisma schema
  - Updated inventory items to use purchasePrice/sellingPrice instead of unitPrice

Stage Summary:
- ZATCA-compliant Saudi invoice template fully built
- Company settings API operational
- Invoice preview with print support
- Amount-to-words in Arabic & English
- ZATCA QR code with TLV encoding
- Discount support in invoice creation
- All lint checks pass

---
Task ID: 24
Agent: Main
Task: Enhance Equipment and Inventory modules for rental companies and product/service types

Work Log:

### Equipment API Routes (Rebuilt)
- **`/api/equipment/route.ts`** - Rebuilt GET/POST:
  - GET: Now includes supplier relation in response
  - POST: Supports all new fields (supplierId, clientId, purchasePrice, sellingPrice, hourlyRate, dailyRate, monthlyRate, purchaseDate, warrantyExpiry)
  - Returns supplier info with equipment data
- **`/api/equipment/[id]/route.ts`** - Rebuilt GET/PUT/DELETE:
  - GET: Includes supplier, usages, maintenance, fuelLogs, rentals, expenses
  - PUT: Supports all new fields dynamically
  - DELETE: Also deletes rentals and expenses before deleting equipment
- **`/api/equipment/rentals/route.ts`** - NEW:
  - GET: List rentals with equipment info, optional filter by equipmentId and status
  - POST: Create rental contract (auto-sets equipment status to RENTED)
- **`/api/equipment/expenses/route.ts`** - NEW:
  - GET: List equipment expenses with equipment info
  - POST: Create equipment expense with ExpenseCategory enum

### Equipment Module (Complete Rebuild)
- Dual business model support:
  - **شركات المقاولات (Construction)** - Equipment for own projects
  - **تأجير المعدات (Equipment Rental)** - Equipment for rent to clients
- Summary cards: إجمالي المعدات/Total, متاحة/Available, مؤجرة/Rented, صيانة/Maintenance
- Table columns: الكود, الاسم, النوع, المورد, سعر الشراء, سعر البيع/التأجير, الحالة
- RENTED status with purple badge
- New Equipment Dialog with 3 sections:
  - Basic Information (name, type, model, serial, status)
  - Purchase Information (supplier dropdown, purchase price, selling price, purchase date, warranty expiry)
  - Rental Rates (hourly, daily, monthly)
- Equipment Detail View with 6 tabs:
  - **نظرة عامة (Overview)** - Purchase info, warranty, rates in 3-column display
  - **عقود التأجير (Rental Contracts)** - Table with client, dates, rate type, rate, total, status
  - **الاستخدام (Usages)** - Usage records for construction projects
  - **الصيانة (Maintenance)** - Maintenance records
  - **الوقود (Fuel)** - Fuel logs
  - **المصروفات (Expenses)** - Equipment-specific expenses with ExpenseCategory badges
- Add Rental Dialog (client selector, project, dates, rate type, rate, total, notes)
- Add Equipment Expense Dialog (category, description, amount, date, reference)

### Inventory API (Updated)
- **`/api/inventory/route.ts`** - Updated GET/POST:
  - GET: Added itemType filter support, now returns purchasePrice/sellingPrice
  - POST: Now supports itemType (PRODUCT/SERVICE), purchasePrice, sellingPrice
- **`/api/inventory/[id]/route.ts`** - Updated PUT to handle new fields

### Inventory Module (Complete Rebuild)
- Type badges: منتج/PRODUCT (emerald green) vs خدمة/SERVICE (amber)
- Table columns: الكود, الاسم, النوع, الوحدة, سعر الشراء, سعر البيع, الكمية, الحد الأدنى, المستودع
- Purchase price and selling price displayed in SAR
- Low stock alert only for PRODUCT type items
- Type filter (all/products/services) in addition to category filter
- Services card in summary showing count of service items
- Stock value calculated using purchasePrice for products only
- New Item Dialog with type selector and both prices (hides quantity fields for services)

### Expenses API (Updated)
- **`/api/expenses/route.ts`** - Updated:
  - projectId is now optional (null for general expenses)
  - category uses ExpenseCategory enum values
  - Added category filter support in GET

### Expenses Module (Rebuilt)
- Full bilingual support (AR/EN) for all labels
- Category dropdown with all 12 ExpenseCategory values with Arabic labels:
  إيجارات, صيانة, نقل, توصيل, مواد استهلاكية, خدمات, تأمين, وقود, تصاريح, قرطاسية, ضيافة, أخرى
- Color-coded category badges (each category has unique color)
- Project is optional in the form
- Shows "عام" (General) badge for expenses without a project
- 4 summary cards: Total Expenses, This Month, Top Category, General Expenses
- Category filter and project filter (including "عام/General" option)
- Project filter includes "General (No Project)" option

Stage Summary:
- Equipment module fully rebuilt with dual business model (Construction + Rental)
- Equipment API enhanced with rentals and expenses endpoints
- Equipment detail view with 6 tabs including rental contracts and equipment expenses
- Inventory module rebuilt with PRODUCT/SERVICE type support
- Inventory API updated for purchasePrice/sellingPrice and itemType
- Expenses module rebuilt with full ExpenseCategory enum support
- Project is now optional for expenses (general expenses)
- All numbers use English digits (toLocaleString('en-US'))
- Full bilingual AR/EN support throughout
- ESLint passes with zero errors

---
Task ID: 25
Agent: Main
Task: Update seed API for new Prisma schema fields (CompanySetting, EquipmentRental, EquipmentExpense, ExpenseCategory enum, etc.)

Work Log:

### Deletion List Updates
- Added `await db.companySetting.deleteMany()` at the beginning (top-level, no dependents)
- Added `await db.equipmentRental.deleteMany()` before `equipment.deleteMany()` (depends on Equipment)
- Added `await db.equipmentExpense.deleteMany()` before `equipment.deleteMany()` (depends on Equipment)
- Ensured proper foreign key constraint order in deletions

### CompanySetting Creation (NEW)
- Added CompanySetting record at the beginning of seed data (section 0)
- Company: شركة البناء الحديثة للمقاولات / Al Binaa Al Haditha Contracting Co.
- Tax Number: 300123456700003, Commercial Reg: 1234567890
- Bank: الراجحي with full IBAN
- Default VAT rate: 15%, Currency: SAR
- Invoice terms in Arabic

### SalesInvoice Updates
- Added `contractId` linking each invoice to its contract
- Added `discountRate: 0`, `discountAmount: 0` (no discounts in seed data)
- Added `netAmount` (same as subtotal since no discounts)
- Added `invoiceType: 'TAX_INVOICE'` for all invoices
- Added `paymentTerms: '30 days'` for all invoices
- Updated invoice numbers to use INV- prefix (e.g., INV-2024-001)
- Updated SalesInvoiceItem to include `unit` field (م², مقطوعية, etc.)
- Added `itemType: 'SERVICE'` to all invoice items

### Equipment Updates
- Added `supplierId` linking all equipment to SUP-005 (شركة المعدات الثقيلة)
- Added `purchasePrice` for each equipment (realistic Saudi market prices)
- Added `sellingPrice: 0` (for own-use equipment)
- Added `monthlyRate` for each equipment
- Added `warrantyExpiry` for some equipment (EQ-001, EQ-003, EQ-005)
- Changed EQ-004 status to 'RENTED' (linked to rental contract)
- Added 5th equipment: رافعة شوكية Toyota (EQ-005)

### EquipmentRental Records (NEW - 3 records)
1. قلاب فولفو → شركة التطوير العقاري, MONTHLY rate 40,000 SAR, 6 months, ACTIVE
2. رافعة شوكية Toyota → شركة المشاريع الصناعية, MONTHLY rate 22,000 SAR, 3 months, ACTIVE
3. حفارة كاتربيلر → مؤسسة البناء الحديث (project-linked), DAILY rate 2,800 SAR, 30 days, RETURNED

### EquipmentExpense Records (NEW - 4 records)
1. DELIVERY - نقل الحفارة بين المواقع, 8,000 SAR
2. INSURANCE - تأمين شامل للكرين البرجي, 45,000 SAR
3. MAINTENANCE - صيانة دورية للشيول, 12,000 SAR
4. DELIVERY - نقل القلاب لموقع العميل, 5,000 SAR

### InventoryItem Updates
- Added `itemType: 'PRODUCT'` to all existing product items
- Added 3 SERVICE items:
  - INV-011: خدمة النقل (رحلة, sellingPrice: 1,500)
  - INV-012: خدمة التركيب (م², sellingPrice: 45)
  - INV-013: خدمة الفحص الهندسي (زيارة, sellingPrice: 2,000)
- Total inventory items: 13 (10 products + 3 services)

### Expense Updates (ExpenseCategory enum)
- Changed all category strings to ExpenseCategory enum values:
  - 'مواد بناء' → 'CONSUMABLES'
  - 'نقل ومواصلات' → 'TRANSPORT'
  - 'إيجارات' → 'RENT'
  - 'صيانة' → 'MAINTENANCE'
  - 'مواد تشطيب' → 'CONSUMABLES'
- Added 3 general expenses (projectId: null):
  - OFFICE: مستلزمات مكتبية وقرطاسية, 3,500 SAR
  - INSURANCE: تأمين شامل على المعدات, 18,000 SAR
  - HOSPITALITY: ضيافة اجتماع المقاولين, 5,500 SAR
- Total expenses: 10 (7 project + 3 general)

### Response Data Updates
- Added counts: companySettings, equipmentRentals, equipmentExpenses
- Updated inventoryItems count to 13
- Updated expenses count to 10
- Updated equipment count to 5

### Verification
- ESLint passes with zero errors
- Prisma schema is in sync with database (`bun run db:push` confirms)
- Dev server queries show new fields being queried correctly

Stage Summary:
- Seed API fully updated to match new Prisma schema
- CompanySetting creation added with realistic Saudi company data
- SalesInvoice includes all new fields (contractId, discounts, netAmount, invoiceType, paymentTerms)
- Equipment includes supplier linkage, purchase/selling prices, monthly rates, warranty
- EquipmentRental records with DAILY/MONTHLY rate types and ACTIVE/RETURNED statuses
- EquipmentExpense records using ExpenseCategory enum (DELIVERY, INSURANCE, MAINTENANCE)
- InventoryItem supports PRODUCT/SERVICE types with 3 service items added
- Expenses use ExpenseCategory enum with 3 general (non-project) expenses
- All deletion order respects foreign key constraints
- All lint checks pass

---
Task ID: 7
Agent: Schema Update Agent
Task: Update Prisma schema with new fields

Work Log:
- Added 4 new fields to CompanySetting model: currencySymbol (U+FDFC ﷼), currencySymbolEn ("SAR"), currencySymbolAr ("ر.س"), logoUrl (String?)
- Added 9 new fields to SalesInvoice model: referenceNo, contractNo, contractType, contractPeriodStart, contractPeriodEnd, deliveryMonth, includeDelivery, deliveryAmount, includeVat
- Added referenceNo field to PurchaseInvoice model
- Created new Timesheet model with fields: id, contractId, projectId, month, year, status, notes, createdAt, updatedAt + relations to Contract, Project, and TimesheetEntry[]
- Created new TimesheetEntry model with fields: id, timesheetId, description, hours, rate, totalAmount, createdAt + relation to Timesheet with onDelete: Cascade
- Added timesheets Timesheet[] relation to Contract model
- Added timesheets Timesheet[] relation to Project model
- Ran `bun run db:push` — database successfully synced in 27ms
- Prisma Client regenerated successfully

Stage Summary:
- CompanySetting now has currency symbol fields (﷼, SAR, ر.س) and logoUrl
- SalesInvoice now supports contract details (referenceNo, contractNo, contractType, contractPeriod), delivery (deliveryMonth, includeDelivery, deliveryAmount), and VAT toggle (includeVat)
- PurchaseInvoice now has referenceNo field
- Timesheet and TimesheetEntry models created for tracking contract work hours
- Contract and Project models updated with timesheets relations
- All changes pushed to SQLite database successfully

---
Task ID: 2
Agent: Invoice Template Agent
Task: Rebuild corporate invoice template with 10-step layout

Work Log:
- Completely rebuilt `/src/components/invoice/invoice-preview.tsx` with professional 10-step Saudi corporate invoice layout
  - Step 1: Full-width dark emerald gradient header with company logo, Arabic/English names, and company data row
  - Step 2: Centered invoice title + number with invoice type labels (فاتورة ضريبية/فاتورة إيجار/مستخلص), reference number, and status badge
  - Step 3: Two-column layout for Invoice Info (dates, payment terms, delivery month) and Client Info (name, tax number, phone, email, address)
  - Step 4: Project & Contract Data in bordered box (project name/code, contract number, type, work period, delivery month)
  - Step 5: Full-width bordered items table with dark emerald header, alternating row colors, and ﷼ currency symbol on all amounts
  - Step 6: Delivery charges line (conditional, amber box with currency symbol)
  - Step 7: QR Code + Totals SIDE BY SIDE (critical layout) - ZATCA QR minimum 120px×120px on left, totals box on right with subtotal, discount, net, delivery, VAT, and bold emerald total due
  - Step 8: Amount in words in amber box (Arabic + English) with "ريال سعودي/Saudi Riyals"
  - Step 9: Payment info + Notes in two columns (bank info left, notes/terms right)
  - Step 10: Signatures (Sales Rep + Client Approval), company stamp (120-160px), and full-width dark emerald footer with ZATCA compliance text
- Updated CompanySettings interface to include currencySymbol, currencySymbolEn, currencySymbolAr, logoUrl
- All monetary amounts now display with ﷼ currency symbol using getCurrencySymbol() helper
- Supports delivery charges (includeDelivery + deliveryAmount) and VAT toggle (includeVat)
- Shows reference number, contract section, and delivery month when available
- A4 dimensions (210mm × 297mm) with proper print CSS support
- Updated `/src/components/modules/sales.tsx` with new invoice creation fields:
  - Invoice type selector (TAX_INVOICE, PROGRESS_CLAIM, RENTAL)
  - Reference number (auto-suggested REF-YYYY-NNNN format)
  - Payment terms field
  - Contract data section (contract number, type selector with Lump Sum/Unit Rate/Cost Plus/Time & Materials, work period start/end)
  - Delivery toggle + delivery amount with Switch component
  - VAT toggle (default: true) with Switch component
  - Delivery month selector (HTML month input)
  - Updated invoice numbering: SRV-YYYY-NNNN (service), PCL-YYYY-NNNN (progress claim), RNT-YYYY-NNNN (rental)
  - Summary card now shows delivery charges and conditional VAT
  - Invoice detail view shows delivery charges row
  - Invoice preview dialog widened to max-w-5xl
- Updated `/src/app/api/sales-invoices/route.ts`:
  - GET now includes contract relation in response (contractNo from Contract model)
  - POST now accepts and stores all new fields: referenceNo, contractNo, contractType, contractPeriodStart, contractPeriodEnd, deliveryMonth, includeDelivery, deliveryAmount, includeVat
  - Invoice numbering uses TYPE-YEAR-SEQ format (SRV-2026-0001, PCL-2026-0001, RNT-2026-0001)
  - VAT calculation respects includeVat flag
  - Delivery charges included in total calculation when includeDelivery is true
- ESLint passes with zero errors

Stage Summary:
- Professional Saudi corporate invoice template with exact 10-step layout
- QR code side-by-side with totals (not above/below)
- All monetary amounts display with ﷼ currency symbol
- Invoice type-based numbering (SRV/PCL/RNT prefixes)
- New invoice creation fields: reference number, contract data, delivery charges, VAT toggle, delivery month
- API supports all new fields in GET and POST
- Zero lint errors

---
Task ID: 1
Agent: Currency Symbol Fix Agent
Task: Fix currency symbol - load from font, pass from settings, display everywhere

Work Log:
- Created CurrencySymbol component at `/src/components/ui/currency-symbol.tsx`
  - SVG-based Saudi Riyal symbol (﷼) rendering with proper path data
  - Supports configurable size (xs/sm/md/lg) for inline and standalone display
  - Auto-detects Saudi Riyal Unicode symbol (U+FDFC) and renders as SVG
  - Falls back to text rendering for other currencies ($, €, etc.)
  - Uses Cairo/Amiri font family for proper ﷼ text rendering
  - Exports: CurrencySymbol, formatCurrencyString, CurrencyText
- Updated `/src/stores/app-store.ts`
  - Added currencySymbol (default: ﷼), currencySymbolEn (default: SAR), currencySymbolAr (default: ﷼) state
  - Added setCurrencySymbol(ar, en, arAbbr?) action
  - Updated formatSAR to use ﷼ (U+FDFC) instead of "ر.س" for Arabic
  - formatSAR now accepts optional symbol parameter for custom symbols
  - Updated commonText.currency from "ر.س" to "﷼"
- Updated `/src/app/api/company-settings/route.ts`
  - Added currencySymbol, currencySymbolEn, currencySymbolAr, logoUrl to default settings
  - Added these fields to PUT handler for both update and create operations
  - Default values: currencySymbol=﷼, currencySymbolEn=SAR, currencySymbolAr=﷼
- Updated `/src/components/invoice/invoice-preview.tsx`
  - Added currencySymbol, currencySymbolEn, currencySymbolAr, logoUrl to CompanySettings interface
  - Created getCurrencySymbolAr() and getCurrencySymbolEn() helper functions
  - Created fmtWithCurrency() function for formatting amounts with proper symbol
  - Replaced all 6 hardcoded "ر.س" instances with proper currency symbols from settings
  - Uses CurrencySymbol SVG component for inline display in totals and items table
  - ZATCA footer now uses fmtWithCurrency() instead of hardcoded text
- Updated `/src/components/modules/sales.tsx`
  - Updated defaultCompany to include currencySymbol, currencySymbolEn, currencySymbolAr fields
  - Changed currencySymbolAr from "ر.س" to "﷼" (U+FDFC)
- Updated `/src/app/api/seed/route.ts`
  - Updated Currency seed data: symbol from "ر.س" to "﷼"
  - Added currencySymbol, currencySymbolEn, currencySymbolAr to CompanySetting creation
  - Updated contract descriptions to use ﷼ instead of ر.س
- Verified all 16 module files use formatSAR from store (cascading update)
- ESLint passes with zero errors
- Database is in sync with Prisma schema

Stage Summary:
- Currency symbol (﷼) now appears next to every monetary amount across the entire application
- Symbol is configurable from company settings (passed from settings screen as requested)
- Symbol rendered using SVG for the Saudi Riyal (﷼), loaded from font glyph outlines not plain text
- All modules automatically display ﷼ via updated formatSAR function in app-store
- Invoice preview uses CurrencySymbol component with Cairo/Amiri font for proper rendering
- Zero "ر.س" remaining in display code (only in backward-compatible font-family matching)

---
Task ID: 3+5
Agent: Timesheet Module Agent
Task: Build Timesheet module with API and workflow

Work Log:
- Created Timesheet API at `/src/app/api/timesheets/route.ts`:
  - GET: List timesheets with contract, project, and entries data; supports filtering by contractId, projectId, status, month, year
  - POST: Create timesheet with entries; validates contract exists; auto-calculates totalAmount for each entry (hours × rate)
- Created Timesheet Detail API at `/src/app/api/timesheets/[id]/route.ts`:
  - GET: Single timesheet with full details including contract project client info
  - PUT: Update timesheet status, notes, and replace entries (delete old + create new with auto-calculation)
  - DELETE: Delete timesheet (cascade deletes entries)
- Created Timesheets Module at `/src/components/modules/timesheets.tsx`:
  - Summary cards: Total Timesheets, Draft, Submitted, Approved, Invoiced
  - Main table: Delivery Month (Arabic month name + year), Project, Contract, Total Hours, Total Amount, Status
  - Create Timesheet dialog with contract selector (auto-fills project), month/year, entry lines (description, hours, rate, auto-total), notes
  - Detail view with entries table, project/contract/client info cards, and workflow actions
  - Status workflow: DRAFT → SUBMITTED (Submit button) → APPROVED (Approve button) → INVOICED (Generate Invoice button)
  - Generate Invoice action creates SalesInvoice from timesheet entries with deliveryMonth in Arabic format
  - After invoice generation, navigates to Sales module
  - Arabic month names: يناير-ديسمبر for delivery month display
  - Full bilingual AR/EN support using lang from useAppStore
- Updated `src/stores/app-store.ts`:
  - Added 'timesheets' to ModuleKey type
  - Added label: `{ ar: 'ساعات العمل', en: 'Timesheets' }`
- Updated `src/components/layout/sidebar.tsx`:
  - Added Clock icon import
  - Added timesheets nav item with Clock icon in costs section (between boq and expenses)
- Updated `src/app/page.tsx`:
  - Added import for TimesheetsModule
  - Added route for 'timesheets' activeModule
- All timesheets-related files pass ESLint with zero errors
- Pre-existing lint error in settings.tsx is unrelated

Stage Summary:
- Complete Timesheet module implementing Contract → Timesheet → Invoice workflow
- API routes support full CRUD with filtering and auto-calculations
- UI includes summary cards, searchable table, create dialog, detail view with workflow
- Delivery month displayed as Arabic month name + year (e.g., "مايو-2026")
- Generate Invoice creates SalesInvoice from timesheet entries and marks as INVOICED
- Full bilingual AR/EN support with formatSAR and formatNumber
