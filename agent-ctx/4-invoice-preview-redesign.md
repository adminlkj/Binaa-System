# Task 4 - Invoice Preview Redesign Agent

## Task Summary
Completely redesigned the InvoicePreview component with a corporate document template system featuring fixed header/footer that repeats on every printed page.

## Files Modified
1. `/src/components/invoice/invoice-preview.tsx` - Complete rewrite with corporate template
2. `/src/app/globals.css` - New corporate invoice CSS + print styles
3. `/src/components/modules/sales.tsx` - Updated defaultCompany with new fields

## Key Changes
- CompanySettings interface: added headerImage, footerImage, headerHeight, footerHeight
- Removed status bar (DRAFT/SENT color bar) - internal only, not on printed invoice
- Removed "متوافق مع هيئة الزكاة والضريبة والجمارك" - internal only
- Fixed header (position: absolute on screen, position: fixed in print) repeats on every page
- Fixed footer (position: absolute on screen, position: fixed in print) repeats on every page
- Custom headerImage/footerImage support: replaces default header/footer (avoids duplication)
- Default header: logo, company name (AR+EN), CR, VAT, address, phone, email
- Default footer: bank info, IBAN, account name, website, payment terms
- Larger QR code (88x88px) centered prominently
- Professional items table with emerald header and alternating rows
- CSS custom properties for dynamic header/footer heights
- Print CSS: @page margin: 0, position:fixed for header/footer
