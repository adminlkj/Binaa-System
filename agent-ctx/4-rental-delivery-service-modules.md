# Task 4: Rental Invoices, Delivery Orders, and Service Invoices Modules

**Agent**: Main Developer
**Date**: 2026-03-05
**Status**: COMPLETED

## Summary
Developed three full modules from placeholder "Under Development" screens to fully functional CRUD modules following the established sales.tsx pattern with ViewState discriminated union.

## Changes Made

### 1. Prisma Schema Updates (`prisma/schema.prisma`)
- Added `EquipmentDeliveryOrder` model with fields: id, orderNo, rentalId, equipmentId, clientId, projectId, site, deliveryDate, returnDate, status, notes
- Added `deliveryOrders` relation to `Equipment` model
- Added `deliveryOrders` relation to `EquipmentRental` model
- Ran `bun run db:push` successfully

### 2. API Route Updates

#### `/src/app/api/sales-invoices/route.ts`
- Added `invoiceType` query parameter filtering to GET handler
- Added `SERVICE` invoice type prefix (`SVC`) to auto-numbering in POST handler
- Now supports: `?invoiceType=RENTAL`, `?invoiceType=SERVICE`, `?invoiceType=TAX_INVOICE`

#### `/src/app/api/delivery-orders/route.ts` (NEW)
- **GET**: Fetches delivery orders with equipment, rental, client, and project data
- **POST**: Creates new delivery order with auto-generated order number (DO-YYYY-NNNN)
- **PATCH**: Updates order status (PENDING → DELIVERED → RETURNED)
- Automatically updates equipment status (IN_USE on delivery, AVAILABLE on return)

### 3. Module: Rental Invoices (`/src/components/modules/rental-invoices.tsx`)
**Before**: Placeholder "Under Development" card
**After**: Full module with 4 views:
- **List View**: Table with search, status filter, summary cards (total revenue, paid, outstanding), print & export buttons
- **Create View**: Full-page form with client, project, equipment, rate type (hourly/daily/monthly), contract data, delivery & VAT, line items, summary, notes
- **Detail View**: Invoice details with items table, totals, paid/outstanding
- **Preview View**: InvoicePreview component with ZATCA QR code for printing

**Features**:
- Auto-fills rate when equipment is selected based on rate type
- Filters to `invoiceType: 'RENTAL'` only
- Invoice numbering: RNT-YYYY-NNNN format
- Bilingual support (Arabic/English)
- Uses MoneyDisplay component for all money values
- CSV export and print functionality

### 4. Module: Delivery Orders (`/src/components/modules/delivery-orders.tsx`)
**Before**: Placeholder "Under Development" card
**After**: Full module with 3 views:
- **List View**: Table with search, status filter, summary cards (pending, delivered, returned counts), print & export buttons
- **Create View**: Full-page form with equipment, client, project, delivery site, delivery date, expected return date, notes
- **Detail View**: Full order details with status update actions (confirm delivery, confirm return, cancel)

**Features**:
- Status workflow: PENDING → DELIVERED → RETURNED
- Quick status action buttons in table rows
- Status icons (Truck, CheckCircle, RotateCcw, XCircle)
- Invoice numbering: DO-YYYY-NNNN format
- Auto-updates equipment status (IN_USE on delivery, AVAILABLE on return)
- Bilingual support
- CSV export and print functionality

### 5. Module: Service Invoices (`/src/components/modules/service-invoices.tsx`)
**Before**: Placeholder "Under Development" card
**After**: Full module with 4 views:
- **List View**: Table with search, status filter, summary cards (total service revenue, paid, outstanding), print & export buttons
- **Create View**: Full-page form with client, project, contract data, VAT, service items with unit selection (hour/day/week/month/visit/project), discount, summary, notes
- **Detail View**: Invoice details with items table showing unit column, totals, paid/outstanding
- **Preview View**: InvoicePreview component with ZATCA QR code for printing

**Features**:
- Filters to `invoiceType: 'SERVICE'` only
- Invoice numbering: SVC-YYYY-NNNN format
- Service-specific unit options (hour, day, week, month, visit, project)
- Discount support (percentage or fixed amount)
- Bilingual support
- Uses MoneyDisplay component
- CSV export and print functionality

### 6. Invoice Preview Updates (`/src/components/invoice/invoice-preview.tsx`)
- Added `SERVICE` type to `invoiceTypeLabels` map for proper display in invoice preview

## Architecture Pattern
All three modules follow the ViewState discriminated union pattern:
```typescript
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'detail'; id: string }
  | { type: 'preview'; id: string }  // (rental & service invoices only)
```

## Technical Notes
- Rental and Service invoices use the existing `SalesInvoice` model with different `invoiceType` values
- Delivery orders use the new `EquipmentDeliveryOrder` model
- All modules use the same API pattern (TanStack Query + mutations)
- ESLint passes with no errors
- All modules are properly wired in `page.tsx` ModuleRouter
