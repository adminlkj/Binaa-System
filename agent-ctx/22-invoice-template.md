# Task 22 - ZATCA-Compliant Saudi Invoice Template

## Task Summary
Built a professional ZATCA-compliant Saudi invoice template component for the "بِنَاء" (Binaa) Construction ERP system.

## Files Created/Modified

### Created Files
1. `/src/app/api/company-settings/route.ts` - Company Settings API (GET/PUT)
2. `/src/lib/amount-to-words.ts` - Number to Arabic/English words converter
3. `/src/lib/zatca-qr.ts` - ZATCA QR code generation with TLV encoding
4. `/src/components/invoice/invoice-preview.tsx` - Professional Saudi invoice preview component

### Modified Files
1. `/src/app/api/sales-invoices/route.ts` - Extended with discount fields, client data, contractId
2. `/src/components/modules/sales.tsx` - Added invoice preview dialog, discount fields, unit field
3. `/src/app/globals.css` - Added print CSS styles
4. `/prisma/schema.prisma` - Added netAmount default value
5. `/src/app/api/seed/route.ts` - Fixed inventory items and sales invoice data

## Key Features
- ZATCA-compliant QR code using TLV encoding
- Amount in words (Arabic & English)
- Professional invoice layout matching Odoo/enterprise ERP quality
- RTL Arabic layout with bilingual labels
- Print support with @media print CSS (A4 size)
- Status bar with color coding
- Company header with tax/commercial registration info
- Items table with unit column
- Discount support (percentage or fixed amount)
- Payment info section with bank details
- Signature lines for sales rep and client
- ZATCA compliance footer with QR code

## Technical Notes
- Prisma client needed restart after schema changes (Turbopack caching issue)
- Used `no-print` CSS class instead of Tailwind's `print:hidden` (not valid in raw CSS)
- Company settings API auto-creates default record on first GET
- netAmount field given default value of 0 in Prisma schema
