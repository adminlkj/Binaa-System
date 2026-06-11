# Task 4-c: Replace window.print() with PrintButton (Batch 3)

## Summary
Replaced all 9 `window.print()` occurrences across 7 module files with the centralized `PrintButton` component.

## Files Modified
1. **purchase-requests.tsx** - 1 replacement (list view icon-only)
2. **purchase-orders.tsx** - 2 replacements (detail view with label + list view icon-only)
3. **supplier-invoices.tsx** - 1 replacement (list view icon-only)
4. **goods-receipt.tsx** - 1 replacement (list view icon-only)
5. **delivery-orders.tsx** - 2 replacements (detail view with label + list view with handlePrint)
6. **rental-invoices.tsx** - 1 replacement (detail view with label)
7. **service-invoices.tsx** - 1 replacement (list view with handlePrint; Printer kept for preview)

## Replacement Patterns Used
- List view icon-only: `<PrintButton type="generic-table" size="icon" />`
- Detail view with label: `<PrintButton type="<doc-type>" documentId={item.id} />`

## Key Decisions
- Printer import removed from 6 files where no longer used
- Printer import kept in service-invoices.tsx (still used for InvoicePreview navigation)
- handlePrint functions removed from delivery-orders.tsx and service-invoices.tsx
- InvoicePreview component in service-invoices.tsx left unchanged (not a window.print call)

## Verification
- No window.print() calls remain in the 7 target files
- Lint passes with no new errors
- Dev server compiles successfully
