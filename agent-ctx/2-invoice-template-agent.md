# Task ID: 2 - Invoice Template Agent

## Task: Rebuild corporate invoice template with 10-step layout

### Work Completed:

1. **Rebuilt `/src/components/invoice/invoice-preview.tsx`** - Complete professional Saudi corporate invoice with 10-step layout:
   - Step 1: Dark emerald gradient header with logo, company names, and data row
   - Step 2: Centered invoice title, type labels, number, reference, and status badge
   - Step 3: Two-column Invoice Info + Client Info
   - Step 4: Project & Contract Data bordered box
   - Step 5: Full-width bordered items table with emerald header
   - Step 6: Conditional delivery charges line
   - Step 7: QR code + Totals SIDE BY SIDE (critical layout requirement)
   - Step 8: Amount in words (Arabic/English) in amber box
   - Step 9: Payment info + Notes two columns
   - Step 10: Signatures + Stamp + Full-width footer

2. **Updated `/src/components/modules/sales.tsx`** - New invoice form fields:
   - Invoice type selector, reference number, payment terms
   - Contract section (number, type, period)
   - Delivery toggle + amount, VAT toggle
   - Delivery month selector
   - Type-based invoice numbering (SRV/PCL/RNT)

3. **Updated `/src/app/api/sales-invoices/route.ts`** - API changes:
   - Contract relation included in GET response
   - All new fields supported in POST
   - TYPE-YEAR-SEQ invoice numbering
   - Proper VAT/delivery calculation

4. **ESLint**: Zero errors
