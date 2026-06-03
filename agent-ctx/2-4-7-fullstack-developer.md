# Task 2,4,7 - Sidebar Reorganization, Project Card Report, Expenses Enhancement

## Task 2: Sidebar Reorganization with 3 Business Workflows

### Changes Made:
1. **app-store.ts** - Updated ModuleKey type, labels, sectionLabels
   - Added new ModuleKeys: 'rental-invoices', 'delivery-orders', 'service-invoices', 'purchase-orders', 'supplier-invoices'
   - Kept legacy keys ('sales', 'purchases') for backward compatibility
   - Updated labels with bilingual AR/EN for all 26 module keys
   - New section labels: equipmentRental, projectsSection, services, purchases, costs, accounting, inventory, reportsSettings

2. **sidebar.tsx** - Complete navigation restructure
   - 9 sections: Main, Equipment Rental, Projects, Services, Purchases, Costs, Accounting, Inventory, Reports & Settings
   - New icons: FileCheck (delivery-orders), FileSpreadsheet (rental-invoices), FileMinus (supplier-invoices), CreditCard (service-invoices), Wrench (equipment)
   - Section headers use emerald color theme
   - All labels bilingual

3. **New module placeholders** (5 files created):
   - `rental-invoices.tsx` - فواتير الإيجار with emerald theme
   - `delivery-orders.tsx` - أوامر التوصيل with amber theme
   - `service-invoices.tsx` - فواتير الخدمات with teal theme
   - `purchase-orders.tsx` - أوامر الشراء with orange theme
   - `supplier-invoices.tsx` - فواتير الموردين with rose theme

4. **placeholder.tsx** - Updated moduleInfoMap with all 26 module entries and icons

5. **page.tsx** - Added routing for all new module keys with imports

## Task 4: Enhanced Project Card Report (كرت المشروع)

### Changes Made:
1. **API route `/api/projects/[id]/route.ts`**:
   - Added contractValue to cost sheet computation
   - Added profitMargin calculation (profit/revenue * 100)
   - Updated PUT handler to accept and save contractValue
   - Proper cost sheet: contractValue, revenue (progress claims), purchases, expenses, subcontractors, labor, equipment, totalCosts, profit, profitMargin

2. **API route `/api/projects/route.ts`**:
   - Added contractValue to POST handler for project creation

3. **projects.tsx** - CostSheetView completely rebuilt:
   - Professional card-style layout with emerald gradient header
   - Two sections: Revenue (الإيرادات) and Costs (التكاليف)
   - Revenue shows: قيمة العقد (Contract Value), المستخلصات الصادرة (Progress Claims)
   - Costs shows: المشتريات, مصروفات المشروع, مقاولو الباطن, تكاليف العمالة, تكاليف المعدات
   - Total Cost with rose background highlight
   - Profit section with large profit margin percentage badge
   - All amounts use MoneyDisplay component
   - Color-coded: emerald for revenue, rose for costs
   - Fully bilingual

4. **Project Form Dialog** - Added contractValue input field

5. **Project Detail View** - Added contract value card, bilingual tab labels, 5-column info cards

## Task 7: Expenses Module Enhancement

### Changes Made:
1. **expenses.tsx** - Complete overhaul:
   - Split expense categories into project vs admin
   - Project categories: RENT, MAINTENANCE, TRANSPORT, DELIVERY, CONSUMABLES, SERVICES, INSURANCE, FUEL, PERMITS, OTHER
   - Admin categories: SALARIES, INTERNET, ELECTRICITY, WATER, MANAGEMENT_CARS, RENT, OFFICE, HOSPITALITY, OTHER
   - Tab-based layout: مصروفات المشاريع | مصروفات إدارية
   - Project tab: shows project selector, project-specific category dropdown
   - Admin tab: no project selector, admin-only categories, info banner explaining admin expenses
   - ExpenseFormDialog has internal tab selector with visual toggle
   - Admin expenses automatically set projectId to null
   - Summary cards: Total, Project, Admin, This Month
   - All amounts use MoneyDisplay component
   - Fully bilingual

## Lint & Build Status
- ✅ ESLint: Zero errors
- ✅ Dev server: No compilation errors
- ✅ Database: In sync with Prisma schema
