# Task 4-a: Replace window.print() with PrintButton in batch 1

## Summary
Replaced all `window.print()` calls with the `PrintButton` component in 7 module files:
1. `clients.tsx` → `<PrintButton type="generic-table" data={printData} size="icon" />`
2. `suppliers.tsx` → `<PrintButton type="generic-table" data={printData} size="icon" />`
3. `employees.tsx` → `<PrintButton type="generic-table" data={printData} size="icon" />`
4. `equipment.tsx` → `<PrintButton type="equipment-report" data={printData} size="icon" />`
5. `equipment-maintenance.tsx` → `<PrintButton type="maintenance-report" data={printData} size="icon" />`
6. `equipment-operations.tsx` → `<PrintButton type="equipment-report" data={printData} size="icon" />`
7. `fuel.tsx` → `<PrintButton type="fuel-report" data={printData} size="icon" />`

## Changes Per File
- Added `PrintButton` import from `@/components/shared/print-button`
- Added `useMemo` to React import (where not already present)
- Removed `Printer` from lucide-react imports (no longer used)
- Replaced `<Button onClick={() => window.print()}>` with `<PrintButton type="..." data={printData} size="icon" />`
- Added `printData` object/memo with columns, rows, and infoItems

## Notes
- Used plain objects (not useMemo) for equipment.tsx and equipment-operations.tsx to avoid React Compiler memoization errors
- All 7 files pass lint with no new errors
- Dev server compiles successfully
