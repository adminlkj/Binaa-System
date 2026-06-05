# نظام بِنَاء ERP - Work Log

---
Task ID: 1
Agent: Main Orchestrator
Task: Restructure and rebuild the Binaa ERP system

Work Log:
- Analyzed current project state (Prisma schema, modules, sidebar, store, API routes)
- Identified key issues: old 10-section sidebar, missing accounting integration, placeholder modules
- Updated Prisma schema with:
  - Added journalEntryId fields on all source documents (invoices, claims, expenses, etc.)
  - Added ClientPayment, SupplierPayment models
  - Added VATReturn with snapshot fields (salesInvoiceIds, purchaseInvoiceIds, expenseIds)
  - Added TimesheetStatus enum, DeliveryOrderStatus, VATReturnStatus
  - Added EquipmentRental with contractId unique link
  - Removed Currency model (unified through CompanySetting.currencySymbolImage)
  - Added sourceType and sourceId on JournalEntry for tracing
  - Added isReversal and reversedEntryId for modification tracking
- Restructured sidebar to 5 groups:
  - الرئيسية (Dashboard)
  - المبيعات والمشتريات (Sales, Purchases, Extracts, Clients, Suppliers, Subcontractors)
  - المشاريع والتكاليف (Projects, Contracts, Timesheets, BOQ, Expenses, Labor, Equipment, Advances, Petty Cash)
  - المخزون والمحاسبة (Inventory, Accounting, VAT)
  - التقارير والإعدادات (Reports, Settings)
- Rewrote app-store.ts with new NavItem types and navigation
- Rewrote sidebar.tsx with collapsible group headers and item icons
- Rewrote header.tsx with group-based breadcrumbs
- Rewrote page.tsx as a module router with 21 module imports
- Created shared module-layout.tsx with ModuleLayout, EmptyState, StatusBadge
- Built 21 functional module components (delegated to subagents):
  - Core: Dashboard, Accounting, VAT, Reports, Settings
  - Sales: Sales, Purchases, Extracts, Clients, Suppliers, Subcontractors
  - Projects: Projects, Contracts, Timesheets, BOQ, Expenses, Labor, Equipment, Advances, Petty Cash
  - Inventory: Inventory module with items and warehouses
- Built unified print service (print-service.ts) with:
  - A4 portrait document templates
  - Company header/footer/stamp integration
  - ZATCA-compliant formatting
  - PrintButton component for all modules
- Updated accounting API routes with auto-entry integration:
  - Sales invoices → autoEntrySalesInvoice/autoEntryRentalInvoice
  - Purchase invoices → autoEntryPurchaseInvoice
  - Progress claims → autoEntryProgressClaim
  - Expenses → autoEntryExpense
  - Reversal logic for modifications (never modify original entries)
  - VAT return auto-generation from invoices/expenses
  - Timesheet INVOICED lock
- Updated seed route with accounting entries for all seeded data

Stage Summary:
- Complete restructuring from 10-section to 5-group navigation
- All 21 modules have functional CRUD with proper forms
- Accounting engine integrated into all business transaction APIs
- Unified print service created
- VAT return auto-calculation implemented
- Lint passes with zero errors
- Database schema fully updated and pushed

---
Task ID: 4
Agent: API Routes Builder
Task: Create API routes for employees, contracts, attendance, salaries, work teams, equipment operations, maintenance, fuel, and resource distribution

Work Log:
- Rewrote `/api/employees/route.ts`:
  - GET: list with search (code, name, nameAr, phone, email, profession), activeOnly, branchId, status filters
  - POST: auto-generate EMP-XXX code, include branch relation
- Created `/api/employees/[id]/route.ts`:
  - GET: single employee with branch, contracts, attendance, salaries, teamMemberships
  - PUT: update all employee fields
  - DELETE: remove employee
- Created `/api/employee-contracts/route.ts`:
  - GET: list with employee relation, filter by employeeId
  - POST: create contract, auto-update employee basicSalary
- Created `/api/attendance/route.ts`:
  - GET: list with employee relation, filter by employeeId, dateFrom, dateTo
  - POST: auto-calculate workHours from checkIn/checkOut if both provided
- Created `/api/salaries/route.ts`:
  - GET: list with employee relation, filter by employeeId, month, year, status
  - POST: auto-calculate netSalary (basicSalary + allowances + overtime - deductions)
  - POST: when status=APPROVED, auto-create accounting entry via autoEntryExpense (Dr 8110 Salaries / Cr 1110 Cash)
- Created `/api/work-teams/route.ts`:
  - GET: list with members (with employee details) and project relation, filter by projectId, activeOnly
  - POST: auto-generate TM-XXX code, support initial members array
- Created `/api/work-teams/[id]/route.ts`:
  - GET: single team with project and members
  - PUT: update team info + addMembers/removeMembers arrays for member management
  - DELETE: cascade delete team and members
- Created `/api/equipment/operations/route.ts`:
  - GET: list with equipment, operator (employee), project relations, filter by equipmentId, projectId, operatorId
  - POST: auto-update equipment status from AVAILABLE→IN_USE, auto-create accounting entry via autoEntryEquipmentCost (OPERATION)
- Updated `/api/equipment/maintenance/route.ts`:
  - Added supplierId field support (include supplier relation in GET/POST)
  - GET: filter by supplierId, include supplier in response
  - POST: save supplierId, update equipment status to MAINTENANCE, auto accounting entry (cost>0): Dr 7420 Maintenance / Cr 3110 (if supplier) or 1110 (if cash)
  - Links journalEntryId to maintenance record
- Updated `/api/equipment/fuel/route.ts`:
  - Added project relation in GET response
  - GET: filter by projectId, include project in response
  - POST: auto accounting entry via autoEntryEquipmentCost (FUEL): Dr 7430 Fuel / Cr 1110 Cash
  - Links journalEntryId to fuel log record
- Created `/api/resource-distribution/route.ts`:
  - GET: list with project relation, enriches response with resource details (Employee/Team/Equipment) based on resourceType
  - POST: validates resourceType (EMPLOYEE/TEAM/EQUIPMENT), validates resource existence, create allocation

Stage Summary:
- 11 API route files created/updated
- All routes follow Next.js 16 patterns (NextResponse.json, Promise params)
- Auto-code generation: EMP-XXX, TM-XXX
- Auto-calculations: workHours (attendance), netSalary (salaries)
- Accounting integration: salaries (APPROVED), equipment maintenance (cost>0), fuel (totalCost>0), operations (hourlyRate×hours)
- Equipment status auto-updates: AVAILABLE→IN_USE (operations), →MAINTENANCE (maintenance)
- Work team member management via addMembers/removeMembers in PUT
- Resource distribution with polymorphic resource details enrichment
- Lint passes with zero errors on all modified files

---
Task ID: 5
Agent: Supply Chain API Builder
Task: Create supply chain workflow API routes (Purchase Requests, Purchase Orders, Goods Receipts, Supplier Invoices, Supplier Payments)

Work Log:
- Updated `/api/purchase-requests/route.ts`:
  - Fixed status from DRAFT to NEW (matching PurchaseRequestStatus enum)
  - Added `source` field support (PROJECT/INVENTORY/WORKSHOP/ADMIN)
  - Added `source` filter in GET
  - Auto-generate PR-XXXX code
  - Include project relation and items in GET/POST response
- Created `/api/purchase-requests/[id]/route.ts`:
  - GET: single PR with project, items, and linked purchaseOrders
  - PUT: approve (NEW→APPROVED), convert (APPROVED→CONVERTED_TO_PO), cancel, or update NEW requests
  - PUT: block modification of approved/converted PRs (only status transitions allowed)
  - DELETE: only for NEW or CANCELLED PRs, blocks approved/converted
- Updated `/api/purchase-orders/route.ts`:
  - Added `purchaseRequestId` field in POST data
  - Added PR validation: purchaseRequestId must point to an APPROVED PR
  - Added `purchaseRequestId` and `purchaseRequest` relation in GET/POST response
  - Added `goodsReceipts` in GET include (id, receiptNo, status, date)
  - Added `purchaseRequestId` filter in GET
  - Supply chain rule: no PO without approved PR
- Created `/api/goods-receipt/route.ts`:
  - GET: list with purchaseOrder, supplier, project, items relations
  - Filters: purchaseOrderId, supplierId, projectId, status
  - POST: auto-generate GR-XXXX code
  - POST: validate purchaseOrderId exists and is APPROVED or PARTIALLY_RECEIVED
  - POST: auto-update PO status to PARTIALLY_RECEIVED or RECEIVED based on total received vs ordered
  - POST: if item destination=INVENTORY, increment matching inventory item quantity
  - POST: if item destination=PROJECT, create EquipmentCost as project cost entry
  - Supply chain rule: no GR without approved PO
- Created `/api/goods-receipt/[id]/route.ts`:
  - GET: single GR with PO, supplier, project, items, and linked purchaseInvoice
  - PUT: update notes/date/status, allow COMPLETED and CANCELLED transitions
  - PUT: block modification of COMPLETED GRs (except cancel), block if linked to invoice
  - DELETE: only for PENDING/PARTIAL status, block if COMPLETED or linked to invoice
- Created `/api/supplier-invoices/route.ts`:
  - GET: list only invoices with goodsReceiptId (supply chain invoices)
  - GET includes: supplier, purchaseOrder, goodsReceipt, project, items
  - Filters: supplierId, purchaseOrderId, goodsReceiptId, projectId, status
  - POST: auto-generate SI-XXXX code
  - POST: RULE - must have goodsReceiptId, cannot create without GR
  - POST: system auto-pulls from GR: supplierId, projectId, purchaseOrderId
  - POST: system calculates subtotal, vatAmount, totalAmount from GR items
  - POST: user provides: supplierInvoiceNo, date, dueDate, attachmentPath, notes
  - POST: creates PurchaseInvoiceItem entries from GR items
  - Supply chain rule: no supplier invoice without goods receipt
- Created `/api/supplier-invoices/[id]/route.ts`:
  - GET: single invoice with all relations
  - PUT: approve (DRAFT→SENT) creates accounting entry via autoEntryPurchaseInvoice
  - PUT: modification after approval creates reversal + new entry (same pattern as purchase-invoices)
  - DELETE: only for DRAFT status, block after approval
- Created `/api/supplier-payments/route.ts`:
  - GET: list with supplier relation, filters: supplierId, invoiceId, paidFrom
  - POST: create payment with accounting entry via autoEntrySupplierPayment
  - POST: auto-update PurchaseInvoice paidAmount and status (DRAFT→PARTIALLY_PAID→PAID)
  - POST: stores journalEntryId on the payment record
  - Validates supplier exists, validates invoice belongs to supplier
- Created `/api/supplier-payments/[id]/route.ts`:
  - GET: single payment with supplier relation
  - PUT: update payment fields (block if journalEntryId exists - posted)
  - DELETE: block if journalEntryId exists, reverse invoice paidAmount on delete

Stage Summary:
- 9 API route files created/updated (3 updated, 6 new)
- Full supply chain workflow enforced:
  - No PO without approved PR
  - No GR without approved PO
  - No supplier invoice without GR
  - No deletion after approval
  - Modification after approval creates reversal + new entry
- Auto-code generation: PR-XXXX, PO-XXXX, GR-XXXX, SI-XXXX
- Auto-calculations: PO totals from items, GR→PO status updates, SI from GR items
- Accounting integration:
  - Supplier invoice approval → autoEntryPurchaseInvoice (Dr Expense+VAT / Cr AP)
  - Supplier payment → autoEntrySupplierPayment (Dr AP / Cr Cash/Bank)
  - Reversal entries for modifications on approved invoices
- Inventory integration: GR items with INVENTORY destination auto-increment inventory quantities
- Project cost integration: GR items with PROJECT destination auto-create EquipmentCost entries
- Invoice payment tracking: paidAmount auto-updated, status transitions (DRAFT→PARTIALLY_PAID→PAID)
- Lint passes with zero errors on all supply chain API route files

---
Task ID: 6
Agent: Frontend Modules Builder
Task: Create 10 React component modules for the Resources and Supply Chain sections

Work Log:
- Created `/src/components/modules/employees.tsx` (EmployeesModule):
  - Full CRUD table: code, name, nationality, profession, residenceExpiry, hireDate, basicSalary, status, actions
  - Status badges: ACTIVE (emerald), ON_LEAVE (yellow), TERMINATED (red), RESIGNED (gray)
  - Create/Edit dialog with sections: Basic Info, Residence Info, Work Info, Contact Info
  - Fetches branches from `/api/branches` for dropdown
  - Search by name, code, profession, phone
  - CSV export, print, refresh buttons
- Created `/src/components/modules/employee-contracts.tsx` (EmployeeContractsModule):
  - Full CRUD table: employee name, startDate, endDate, basicSalary, housingAllowance, transportAllowance, otherAllowances, totalCompensation
  - Create dialog with employee selector, dates, salary + allowances
  - Auto-calculates total compensation in dialog
  - Fetches employees from `/api/employees?activeOnly=true`
  - On create, auto-updates employee basicSalary via API
- Created `/src/components/modules/attendance.tsx` (AttendanceModule):
  - Full CRUD table: employee, date, checkIn, checkOut, workHours, overtimeHours
  - Create dialog with employee selector, date, checkIn/checkOut time inputs, overtimeHours
  - Auto-calculates workHours from checkIn/checkOut in dialog preview
  - Work hours shown as emerald badge, overtime as amber badge
- Created `/src/components/modules/salaries.tsx` (SalariesModule):
  - Full CRUD table: employee, month/year, basicSalary, totalAllowances, overtimeAmount, deductions, netSalary, status
  - Status badges: DRAFT (yellow), APPROVED (emerald), PAID (blue)
  - Summary cards at top: total net salaries, total overtime, total deductions
  - Create dialog: select employee, month, year → auto-loads from contract (basicSalary + allowances)
  - Auto-calculates netSalary = basic + allowances + overtime - deductions
  - Approve button (DRAFT→APPROVED) with accounting entry indicator (BookOpen icon)
  - Mark as paid button (APPROVED→PAID)
  - Only DRAFT salaries can be deleted
- Created `/src/components/modules/work-teams.tsx` (WorkTeamsModule):
  - Full CRUD table: code, name, specialty, project, member count, status
  - Create/Edit dialog with name, nameAr, specialty, projectId, member selection (checkboxes)
  - Edit uses addMembers/removeMembers arrays for member management
  - Expandable row showing team members as badges
  - Fetches projects from `/api/projects/list`, employees from `/api/employees`
- Created `/src/components/modules/equipment-operations.tsx` (EquipmentOperationsModule):
  - Full CRUD table: equipment, operator, project, date, hours, notes
  - Create dialog: select equipment, operator (employee), project, date, hours
  - Fetches equipment, employees, projects for dropdowns
  - On create, auto-updates equipment status and creates accounting entry via API
- Created `/src/components/modules/equipment-maintenance.tsx` (EquipmentMaintenanceModule):
  - Full CRUD table: equipment, date, description, cost, supplier, next date
  - Create/Edit dialog with equipment selector, date, description, cost, supplier (optional), next date
  - Summary card showing total maintenance cost
  - Fetches equipment from `/api/equipment`, suppliers from `/api/suppliers`
- Created `/src/components/modules/fuel.tsx` (FuelModule):
  - Full CRUD table: equipment, project, date, liters, cost/liter, total cost
  - Create dialog with equipment selector, project (optional), date, liters, costPerLiter
  - Auto-calculates total = liters × costPerLiter in dialog preview
  - Summary cards: total liters and total cost
- Created `/src/components/modules/resource-distribution.tsx` (ResourceDistributionModule):
  - Most important screen in resources section
  - Summary cards at top: allocated employees, allocated teams, allocated equipment
  - Visual grid of resource allocations grouped by project (cards with colored left border)
  - Table view: project, resource type badge, resource name, start date, end date
  - Create dialog: select project, resource type (EMPLOYEE/TEAM/EQUIPMENT), then specific resource, dates
  - Project filter dropdown
  - Resource type badges with icons: Employee (teal/Users), Team (violet/Users2), Equipment (orange/Truck)
- Created `/src/components/modules/placeholder.tsx` (PlaceholderModule):
  - Simple fallback component with "Coming Soon" message
  - Uses ModuleLayout for consistent appearance
  - Backward-compatible ModulePlaceholder export maintained
- Also created 3 missing supply chain module files referenced by page.tsx:
  - `/src/components/modules/purchase-requests.tsx` (PurchaseRequestsModule)
  - `/src/components/modules/goods-receipt.tsx` (GoodsReceiptModule)
  - `/src/components/modules/supplier-payments.tsx` (SupplierPaymentsModule)
- Fixed sidebar.tsx: replaced non-existent `Sitemap` icon from lucide-react with `Network`

Stage Summary:
- 13 module component files created (10 required + 3 supply chain missing files)
- All modules follow consistent pattern: ModuleLayout, bilingual t() helper, tanstack/react-query, CRUD with Dialog forms
- MoneyDisplay used for all monetary values
- All number inputs use dir="ltr"
- Search/filter on all tables, CSV export, print, refresh buttons
- emerald-600 as primary action color throughout
- Auto-calculations: workHours (attendance), netSalary (salaries), totalCompensation (contracts), totalCost (fuel)
- Status workflows: salaries (DRAFT→APPROVED→PAID), PRs (NEW→APPROVED→CONVERTED_TO_PO)
- Accounting entry indicators where applicable
- Lint passes with zero errors on all module files
- App returns HTTP 200

---
Task ID: 7
Agent: Supply Chain Frontend Builder
Task: Create 5 enhanced React component modules for the Supply Chain section

Work Log:
- Rewrote `/src/components/modules/purchase-requests.tsx` (PurchaseRequestsModule):
  - ViewState pattern: list/create/detail views with back navigation
  - Table: requestNo, project, source (colored badge), date, requestedBy, items count badge, status, actions
  - Source badges: PROJECT (blue), INVENTORY (teal), WORKSHOP (amber), ADMIN (gray)
  - Status badges: NEW (yellow), APPROVED (emerald), CONVERTED_TO_PO (blue), CANCELLED (red)
  - Create form: projectId, source dropdown, date, description, requestedBy, dynamic items list (add/remove)
  - Detail view: all PR info, items table, linked POs, workflow status indicator (PR→Approved→PO→GR→Invoice)
  - Approve button (NEW→APPROVED), Cancel button
  - Summary cards: total requests, new, approved
  - Search + status filter, CSV export
- Rewrote `/src/components/modules/purchase-orders.tsx` (PurchaseOrdersModule):
  - ViewState pattern: list/create/detail views
  - Table: orderNo, supplier, project, date, delivery date, total, status, receipt status, actions
  - Status badges: DRAFT (yellow), PENDING_APPROVAL (orange), APPROVED (emerald), PARTIALLY_RECEIVED (blue), RECEIVED (teal), CANCELLED (red)
  - Create: select approved PR → auto-load items + project; select supplier; add unit prices; auto-calc totals
  - Detail: financial summary (total/paid/balance), items table with subtotals/VAT/total, linked GRs, linked PR badge
  - Summary cards: total POs, approved count, pending count
- Rewrote `/src/components/modules/goods-receipt.tsx` (GoodsReceiptModule):
  - ViewState pattern: list/create/detail views
  - Table: receiptNo, PO (badge), supplier, project, date, status, actions
  - Status badges: PENDING (yellow), PARTIAL (orange), COMPLETED (emerald), CANCELLED (red)
  - Create: select approved PO → auto-loads supplier, project, items; fill quantityReceived per item; auto-calc remaining; select destination (INVENTORY/PROJECT) per item
  - Detail: ordered vs received comparison table with remaining badges
  - Complete button (PENDING→COMPLETED)
  - Summary cards: total receipts, total units, total amount
- Rewrote `/src/components/modules/supplier-invoices.tsx` (SupplierInvoicesModule):
  - IMPORTANT: GR-first workflow enforced in UI (select GR → auto-pulls everything)
  - Table: invoiceNo, supplier, PO, GR, date, subtotal, VAT, total, status + accounting entry indicator
  - Status badges: DRAFT (yellow), SENT (blue), PARTIALLY_PAID (orange), PAID (emerald), CANCELLED (red)
  - Create: select GR first → auto-pulls supplier, PO, project, items; user adds supplierInvoiceNo, date, dueDate; system auto-calculates from GR items
  - Detail: approve button (DRAFT→SENT) creates accounting entry; BookOpen purple indicator; payment status (total/paid/balance)
  - Summary cards: total invoices, paid, outstanding, paid count
- Rewrote `/src/components/modules/supplier-payments.tsx` (SupplierPaymentsModule):
  - Table: supplier, invoice (badge), amount, date, paid from, payment method, reference, actions
  - Create dialog: select supplier → filter invoices (unpaid/partially paid) → select invoice → auto-show remaining amount; amount, date, paidFrom (TREASURY/BANK), bankAccount (conditional), paymentMethod (CASH/CHECK/TRANSFER/LOC), reference
  - Summary cards: total payments, payments today, payments this month
  - Accounting entry indicator (BookOpen purple badge) on posted payments
  - Cannot delete payments with journalEntryId

Stage Summary:
- 5 supply chain module files fully rewritten with enhanced features
- Full supply chain workflow visually connected: PR → PO → GR → Invoice → Payment
- All modules use ViewState pattern for list/create/detail navigation
- MoneyDisplay used for ALL monetary values
- All number inputs use dir="ltr"
- Search/filter on all tables, CSV export, print, refresh buttons
- emerald-600 as primary action color throughout
- Workflow reference badges (Link2 icon) show connections between steps
- Accounting entry indicators (BookOpen purple badge) where applicable
- Auto-calculations: PO totals, GR remaining amounts, SI from GR items, remaining invoice amounts
- Bilingual (ar/en) with t() helper
- Lint passes with zero errors on all 5 module files

---
Task ID: Main-Integration
Agent: Main Orchestrator
Task: Integrate Resources + Supply Chain sections into the Binaa ERP system

Work Log:
- Updated Prisma schema with new models:
  - Employee: added nationality, profession, residenceNumber, residenceExpiry, hireDate, basicSalary, status (EmployeeStatus enum)
  - EmployeeContract: employeeId, startDate, endDate, basicSalary, housingAllowance, transportAllowance, otherAllowances
  - Attendance: employeeId, date, checkIn, checkOut, workHours, overtimeHours
  - Salary: employeeId, month, year, basicSalary, housingAllowance, transportAllowance, otherAllowances, overtimeAmount, deductions, netSalary, status (SalaryStatus), journalEntryId
  - WorkTeam + TeamMember: code, name, specialty, projectId, members with role/isLeader
  - EquipmentOperation: equipmentId, operatorId, projectId, date, hours
  - EquipmentMaintenance: added supplierId, journalEntryId
  - EquipmentFuelLog: added journalEntryId
  - PurchaseRequest/PurchaseRequestItem: source (PROJECT/INVENTORY/WORKSHOP/ADMIN), status (NEW/APPROVED/CONVERTED_TO_PO)
  - PurchaseOrder: added purchaseRequestId, linked PR
  - GoodsReceipt/GoodsReceiptItem: receiptNo, PO link, destination (INVENTORY/PROJECT)
  - PurchaseInvoice: added goodsReceiptId (@unique), supplierInvoiceNo, supplierInvoiceDate, attachmentPath
  - SupplierPayment: bankAccount, paymentMethod
  - SubcontractorContract: subcontractorId, projectId, contractNo, value, retentionRate
  - ResourceAllocation: projectId, resourceType (EMPLOYEE/TEAM/EQUIPMENT), resourceId, startDate, endDate
- Updated app-store.ts with 7 navigation groups:
  - الرئيسية: Dashboard
  - المبيعات والمشتريات: Sales, Purchases, Extracts, Clients, Suppliers, Subcontractors
  - المشاريع والتكاليف: Projects, Contracts, Timesheets, BOQ, Expenses, Labor, Advances, Petty Cash
  - الموارد: Equipment, Operations, Resource Distribution, Employees, Salaries, Attendance, Maintenance, Fuel, Work Teams, Employee Contracts
  - سلسلة التوريد: Purchase Requests, Purchase Orders, Goods Receipt, Supplier Invoices, Supplier Payments
  - المخزون والمحاسبة: Inventory, Accounting, VAT
  - التقارير والإعدادات: Reports, Settings
- Updated sidebar.tsx with new icon mapping (Network, Cog, FuelIcon, CalendarDays, Banknote, etc.)
- Updated page.tsx with module router for all 33 nav items
- Fixed Prisma client stale cache issue by restarting dev server
- Verified Employees API returns data correctly after schema push

Stage Summary:
- Complete Resources + Supply Chain sections integrated
- 7 navigation groups with 33 nav items
- 20+ new Prisma models covering HR, Equipment, Supply Chain
- All API routes built with workflow validation and accounting integration
- All frontend modules built with bilingual support and auto-calculations
- App renders correctly on port 3000
- Prisma schema fully pushed to database
