# Task 1: Fix PrintButton API URLs, data transformation, and timesheet print template

## Summary
Fixed all 4 critical issues in the Binaa ERP print functionality.

## Changes Made

### 1. PrintButton (`src/components/shared/print-button.tsx`)
- **Fixed 6 API URLs** in `apiMap` to match actual route paths:
  - `timesheet-report`: `/api/timesheets/${id}` → `/api/equipment/timesheets/${id}`
  - `rental-contract`: `/api/rental-contracts/${id}` → `/api/equipment/rental-contracts/${id}`
  - `supplier-invoice`: `/api/purchase-invoices?id=` → `/api/supplier-invoices/${id}`
  - `fuel-report`: `/api/fuel/${id}` → `/api/equipment/fuel/${id}`
  - `maintenance-report`: `/api/equipment-maintenance/${id}` → `/api/equipment/maintenance/${id}`
  - `rental-payment`: `/api/rental-payments/${id}` → `/api/client-payments/${id}`
- **Added `transformDataForPrint()` function** that flattens nested API response objects (client, equipment, project, contract, rental, invoice) into flat fields expected by print service templates. Handles all document types with specific logic for service-invoice, rental-invoice, timesheet-report, rental-contract, equipment-report, and supplier-invoice.
- Integrated transformation step between data fetch and HTML generation

### 2. Print Service (`src/lib/print-service.ts`)
- **Added `generateTimesheetBody()` function** with professional timesheet report template:
  - Contract info (number, period, status badge, invoice number)
  - Equipment & client party cards
  - Operating data section (hours, rate, sales/purchase orders)
  - Billing summary (subtotal with calculation detail, VAT, delivery fees with VAT, grand total)
  - Amount in words, bank info, signatures
- **Updated `generateDocumentBody()` switch** to route `timesheet-report` to dedicated template instead of generic fallback

### 3. Timesheets Module (`src/components/modules/timesheets.tsx`)
- **Removed orphan PrintButton** from list header (had no documentId, served no purpose)

## Verification
- `bun run lint`: 0 errors (1 pre-existing unrelated warning)
- Dev server: running normally, no errors in logs
