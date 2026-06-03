# Task 12: Fix English Digits and Add Bilingual Support

**Agent:** Fix Agent
**Date:** 2025-03-06

## Summary
Fixed all 12 module components to display numbers in English digits (0-9) instead of Arabic digits (٠-٩), and added basic bilingual (AR/EN) support.

## Key Changes
1. Removed all `toLocaleString('ar-SA')` and `toLocaleDateString('ar-SA')` calls
2. Imported `formatSAR`, `formatNumber`, `formatDate` from `@/stores/app-store`
3. Added `const { lang } = useAppStore()` to all 12 modules
4. Added bilingual page titles using `lang === 'ar' ? 'Arabic' : 'English'`
5. Used `formatSAR(value, lang)` and `formatDate(dateStr, lang)` for locale-aware formatting

## Files Modified
- dashboard.tsx, expenses.tsx, labor.tsx, projects.tsx, contracts.tsx, boq.tsx
- progress-claims.tsx, clients.tsx, suppliers.tsx, subcontractors.tsx, sales.tsx, purchases.tsx

## Verification
- Zero `ar-SA` locale calls remain in module files
- `bun run lint` passes cleanly
- All numbers display in English digits
