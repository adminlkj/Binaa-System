# Task 4 - Export Button Agent

## Task
Add Excel/CSV export buttons to screens that currently lack them, using the existing `exportToCSV` utility.

## Summary of Changes

### Files Modified
1. **rental-invoices.tsx** - Refactored from manual CSV blob creation to `exportToCSV` utility. Added import, upgraded button from icon-only to text+icon with bilingual label.
2. **service-invoices.tsx** - Same refactoring as rental-invoices.
3. **client-payments.tsx** - Added full export: `Download` import, `exportToCSV` import, `handleExport` function (6 columns), export Button in actions bar.
4. **rental-payments.tsx** - Added full export: `Download` import, `exportToCSV` import, `handleExport` function (6 columns), export Button in header.
5. **accounting.tsx** - Added 2 export buttons: JournalEntriesTab (7 columns) and TrialBalanceTab (7 columns), both with inline handlers.

### Files Skipped
- **supplier-payments.tsx** - Already had proper `exportToCSV` integration.

### Pattern Used
All export buttons follow consistent design:
```tsx
<Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
  <Download className="h-4 w-4" />
  {lang === 'ar' ? 'تصدير' : 'Export'}
</Button>
```

### CSV Column Details
- **Rental Invoices**: Invoice No, Client, Project, Date, Total, Paid, Outstanding, Status
- **Service Invoices**: Same as Rental Invoices
- **Client Payments**: Client, Invoice, Amount, Date, Received In, Reference
- **Rental Payments**: Client, Invoice, Amount, Date, Payment Method, Reference
- **Journal Entries**: Entry No, Date, Description, Source, Debit, Credit, Status
- **Trial Balance**: Code, Account Name, Type, Debit, Credit, Net Debit, Net Credit

All columns use bilingual labels. Number columns use `.toFixed(4)` formatting.

## Lint Status
All lint errors are pre-existing (set-state-in-effect in other files). No new errors introduced.
