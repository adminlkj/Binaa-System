# Task 1c: Print Engine Fixer

## Assignment
Activate the new modular printing system and add ZATCA QR support.

## Problem
The new modular printing system at `/src/printing/` (16 template files, ~3000+ lines) was DEAD CODE. Both the API route and PrintButton imported from the OLD monolithic `/src/lib/print-service.ts` (3853 lines).

## Changes Made

### Files Modified (7 files)

1. **`/src/app/api/print/route.ts`** — Switched import from `@/lib/print-service` to `@/printing`
   - Removed unused `path` and `fs/promises` imports
   - Expanded valid document types from 6 to 28
   - Added backward compatibility aliases (extract → progress-claim, timesheet-report → timesheet, tax-declaration → vat-return)
   - Extended server-side QR generation to cover supplier-invoice

2. **`/src/components/shared/print-button.tsx`** — Switched imports from `@/lib/print-service` to `@/printing`
   - `PrintDocumentType` type import
   - Dynamic `generatePrintHTML` import
   - Extended client-side QR generation to cover supplier-invoice

3. **`/src/printing/shared/sections.ts`** — Added prefix parameter to QR functions
   - `qrCodeSection(qrDataUrl, tlvBase64, settings, lang, prefix='ri')` — now prefix-aware
   - `qrCodeScript(tlvBase64, prefix='ri')` — now prefix-aware

4. **`/src/printing/shared/css.ts`** — Added ZATCA QR CSS for doc prefix
   - `.doc-totals-qr-wrapper`, `.doc-qr-box`, `.doc-qr-image`, `.doc-qr-label`

5. **`/src/printing/invoices/ServiceInvoice.ts`** — Added ZATCA QR rendering
   - Imports: `formatMoneyPrint`, `encodeZATCATLV`, `qrCodeSection`, `qrCodeScript`
   - Totals+QR side-by-side layout when tax number present

6. **`/src/printing/invoices/SupplierInvoice.ts`** — Added ZATCA QR rendering
   - Changed `requiresQR: false` → `requiresQR: true`
   - Same QR implementation as ServiceInvoice

7. **`/src/printing/print-service.ts`** — Template-driven QR CDN inclusion
   - Now checks `template.requiresQR && settings.taxNumber` for QR library
   - Rental invoice still gets QR + html2canvas; other templates get just QR

## Result
- The new modular printing system is now the active system (old `@/lib/print-service` is no longer imported by any active path)
- All 28 document types are supported (was only 6)
- ZATCA QR is rendered on service, rental, and supplier invoices
- No new lint/TypeScript errors introduced
