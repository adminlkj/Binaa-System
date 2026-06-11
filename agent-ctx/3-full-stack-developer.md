# Task 3: Professional Rental Invoice Template

## Summary
Redesigned the rental invoice print template in `/home/z/my-project/src/lib/print-service.ts` with a complete professional A4 portrait layout.

## Key Changes
1. **New `generateRentalInvoiceBody()` function** - Complete professional rental invoice body with 9 sections
2. **New `getRentalInvoiceCSS()` function** - 500+ lines of professional CSS for A4 layout
3. **New `generateRentalInvoiceHeader()` function** - Dual-language header with logo, company details, document title
4. **New `generateRentalInvoiceFooter()` function** - Footer with company info and ERP branding
5. **`encodeZATCATLV()` function** - Server-side ZATCA TLV base64 encoding for QR codes
6. **Updated `generateDocumentBody()` dispatcher** - Routes rental-invoice to new template
7. **Updated `generatePrintHTML()` function** - Specialized rental invoice HTML with QR/HTML2Canvas CDNs and export buttons

## Features Implemented
- A4 portrait (210mm × 297mm) with professional styling
- Company header with logo, bilingual name, CR/VAT numbers, address, phone, email
- Invoice info grid (9 fields in 2 columns)
- Parties section (Company/From + Client/To cards)
- Items table with 6 columns (#, Description, Qty, Unit, Unit Price, Total)
- Billing summary (subtotal, delivery fees, VAT 15%, grand total)
- Amount in words (Arabic + English)
- ZATCA QR code with TLV encoding rendered client-side via qrcode.js CDN
- Currency symbol image support
- Bank account info
- Signature boxes (Company + Customer)
- Terms and conditions
- Export buttons: Print, JPG, PNG, Close (using html2canvas)
- RTL support for Arabic

## Dependencies Added
- html2canvas@1.4.1 (for image export)

## Backward Compatibility
- Service invoices and all other document types use original template unchanged
- Only `rental-invoice` type uses the new specialized template
