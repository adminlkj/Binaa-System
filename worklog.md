---
Task ID: 1
Agent: Main
Task: Restructure entire بِنَاء ERP around two hub-centric activities

Work Log:
- Restructured app-store.ts with new hub-centric navigation: 8 nav groups organized around Construction Hub and Rental Hub
- Added CONSTRUCTION_WORKFLOW, RENTAL_WORKFLOW, PURCHASE_WORKFLOW chain definitions
- Added ActivityType ('construction' | 'rental' | 'both') mapping for all nav items
- Added selectProject() and selectEquipment() actions for hub drill-down
- Rebuilt sidebar.tsx with hub-centric design: emerald for construction, cyan for rental
- Created rental-payments.tsx module for rental collections
- Updated page.tsx with complete module map for all 36 navigation items
- Added ActivityType enum to Prisma schema
- Added activityType field to Expense, PurchaseInvoice, Salary models
- Added equipmentId to Expense and PurchaseInvoice models
- Added projectId to Salary model
- Added purchaseInvoices and costExpenses relations to Equipment model
- Added salaries relation to Project model
- Business Flow Engine created by subagent with 9 validation functions, 5 cost routing functions, 2 profitability calculators
- Dashboard rebuilt by subagent with two hub panels (Construction + Rental)
- Projects module rebuilt by subagent with كرت المشروع and 5 tabs including workflow chain
- Equipment module rebuilt by subagent with كرت المعدة and 5 tabs including rental workflow
- Business Flow Validation API created at /api/business-flow/validate
- Verified with Agent Browser: Dashboard shows both hubs, Project detail shows workflow chain with step status, Equipment detail shows rental workflow with all 9 steps
- No browser errors, all APIs returning 200 OK

Stage Summary:
- System restructured from flat module list to hub-centric architecture
- Two main hubs: المشاريع التنفيذية (Construction) and تأجير المعدات (Rental)
- كرت المشروع shows: financial overview, workflow chain, costs, revenue, resources
- كرت المعدة shows: financial overview, rental workflow, costs, revenue, operations
- Business Flow Engine enforces workflow chains (no skipping)
- ActivityType added to key entities for automatic classification
- All supporting modules (HR, Supply Chain, Operations) feed into both hubs
