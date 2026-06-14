---
Task ID: 4
Agent: Module Fix Agent
Task: Fix modules with CRUD, ModuleLayout, and rental workflow

Work Log:
- Verified existing modules: rental-payments, BOQ, labor, inventory, client-payments all already have ModuleLayout and full CRUD
- Equipment module: Added ownershipType field (COMPANY_OWNED, LEASED_ASSET, CUSTOMER_OWNED) to NewEquipmentDialog with conditional fields
- Equipment module: Added OwnershipBadge component for displaying ownership type
- Equipment module: Added ModuleLayout wrapper to main EquipmentModule replacing inline header
- Equipment module: Updated equipment API (POST and PUT) to handle ownershipType and ownerId fields
- Equipment module: Added clients query in EquipmentModule for owner selection
- Equipment module: Added ownership column to equipment list table
- Contract module: Added tab selector for "عقود المشاريع" | "عقود التأجير" at the top of the list view
- Contract module: Updated contracts query to use contractTab state for filtering by contractType
- Contract module: Different table columns shown for PROJECT vs RENTAL contracts
- Contract module: Updated create/update mutations to use correct contractType from tab state
- Contract module: Added rental-specific detail section (hourlyRate, deliveryFees, client, salesOrderNo, paymentTerms)
- Contract module: Added labels for rentalContracts, projectContracts, equipment, hourlyRate, deliveryFees
- Change Orders: Created /api/change-orders/route.ts with GET and POST handlers
- Change Orders: Created /api/change-orders/[id]/route.ts with GET, PUT, DELETE handlers
- Change Orders: Created ChangeOrderDialog component at /components/shared/change-order-dialog.tsx
- Change Orders: Integrated ChangeOrderDialog into contract detail view
- Change Orders: Updated contract detail API to include changeOrders relation
- All changes pass lint check with no errors

Stage Summary:
- Equipment module now has ownership type field with conditional behavior (LEASED_ASSET requires supplier, CUSTOMER_OWNED shows owner selector)
- Equipment module now uses ModuleLayout wrapper instead of inline header
- Contract module now has clear separation between Project and Rental contracts with tab selector
- Rental contracts show different table columns (client, hourly rate, delivery fees instead of project, value)
- Rental contract detail view shows dedicated rental info section
- Change Orders feature is fully implemented with CRUD API, dialog component, and integration in contract detail view
- All existing modules (BOQ, labor, inventory, client-payments, rental-payments) were already complete with ModuleLayout and CRUD
