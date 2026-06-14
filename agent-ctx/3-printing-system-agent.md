# Task 3 - Printing System Agent

## Task: Fix printing system and add ZATCA QR

## What was done:

### 1. Created ZATCA QR Utility (`/src/lib/zatca-qr.ts`)
- Standalone ZATCA QR code generation per ZATCA e-invoicing specification
- TLV (Tag-Length-Value) encoding: Tag 1 (Seller Name), Tag 2 (VAT Number), Tag 3 (Invoice Date), Tag 4 (Total Amount), Tag 5 (VAT Amount)
- Three exported functions:
  - `generateZatcaTLV()` - Generates Base64-encoded TLV string
  - `generateZatcaQR()` - Generates TLV + QR image data URL using `qrcode` package
  - `generateZatcaQRForInvoice()` - Convenience function for API routes using company settings

### 2. Created Unified Print Engine (`/src/lib/unified-print-engine.ts`)
- Single entry point `generateDocument(documentType, data, companySettings, lang)` for all document types
- Wraps the existing modular `@/printing` system
- Extended document types: `sales-invoice`, `boq`, `change-order`, `employee-contract`
- Type aliases: `sales-invoice→service-invoice`, `extract→progress-claim`, `timesheet-report→timesheet`, `tax-declaration→vat-return`
- Custom template generators for:
  - **BOQ (Bill of Quantities)**: Items table with description, quantity, unit, unit price, total; signatures section
  - **Change Order**: Change details, before/after values, approval section
  - **Employee Contract**: Employee info, salary breakdown, terms, signatures
- Automatic ZATCA QR integration for invoice types (sales-invoice, rental-invoice, supplier-invoice)
- Document category classification (operational, project, accounting, hr)
- Utility functions: `getDocumentCategory()`, `requiresZatcaQR()`, `getSupportedDocumentTypes()`

### 3. Updated Print API Route (`/src/app/api/print/route.ts`)
- Replaced direct `@/printing` imports with unified-print-engine
- Uses `generateDocument()` for HTML generation
- Added data fetching for new document types:
  - **BOQ**: Fetches from BOQItem model, calculates subtotal/VAT/total
  - **Change Order**: Fetches from ChangeOrder model with project/contract relations
  - **Employee Contract**: Fetches from Employee/EmployeeContract/Branch models
- Server-side ZATCA QR generation via `generateZatcaQR()` for invoice types
- All Prisma Decimal values converted to Number() for print templates
- Added `lang` query parameter support

### 4. Added ZATCA QR to Sales Invoice API (`/src/app/api/sales-invoices/route.ts`)
- Added `storeZatcaQR()` helper function that:
  - Fetches company settings (nameAr/nameEn/taxNumber)
  - Generates ZATCA TLV using `generateZatcaQRForInvoice()`
  - Stores result in `SalesInvoice.zatcaQr` field
- Called after all 3 invoice creation modes:
  - `createInvoiceFromExtract()` - Progress claim invoices
  - `createInvoiceFromTimesheet()` - Rental invoices
  - `createInvoiceManual()` - Manual invoices

### 5. Added ZATCA QR to Supplier Invoice API (`/src/app/api/supplier-invoices/route.ts`)
- Added `storeZatcaQRForPurchaseInvoice()` helper function
- Generates and stores ZATCA QR after purchase invoice creation
- Uses company settings for seller name and VAT number

### 6. Fixed Invoice Preview Component (`/src/components/invoice/invoice-preview.tsx`)
- Updated import from `generateZATCAQR` to `generateZatcaQR`
- Updated function call parameters to match new API (invoiceDate, totalAmount, vatAmount)
- Fixed return type handling (qrDataUrl is now inside an object)

## Key Results:
- ZATCA QR codes are now automatically generated and stored on invoice creation
- Unified print engine provides single entry point for all document types
- New document types supported: BOQ, Change Order, Employee Contract
- All changes pass ESLint with no errors
- No new TypeScript errors introduced in modified files
