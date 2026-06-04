# Task 7: Invoice Numbering Agent

## Task
Update sales-invoices API route to use TYPE-YEAR-SEQ invoice numbering format.

## Work Summary
- Reviewed existing `/src/app/api/sales-invoices/route.ts` — already had TYPE-YEAR-SEQ format from prior work
- Applied two improvements to match exact specification:
  1. Added trailing dash to `startsWith` filter for precise year matching (`SRV-2026-` instead of `SRV-2026`)
  2. Replaced regex parsing with `split('-')` + `parseInt(parts[2])` + `isNaN` guard
- Renamed `prefixMap` → `typePrefixMap`, `nextNum` → `seq` for clarity
- ESLint passes with zero errors

## Files Modified
- `/src/app/api/sales-invoices/route.ts` — Updated invoice numbering logic in POST handler

## Result
Invoice numbering now uses exact TYPE-YEAR-SEQ format:
- `TAX_INVOICE` → `SRV-2026-0001`
- `PROGRESS_CLAIM` → `PCL-2026-0001`
- `RENTAL` → `RNT-2026-0001`
- Sequence resets per-type per-year
