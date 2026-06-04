# Task 4 - Company Tab & File Upload API

## Summary
Added "الشركة" (Company) tab to Settings module and created file upload API endpoint.

## Files Created
1. `/src/app/api/upload/route.ts` - File upload API (POST, validates PNG/JPG/SVG, max 5MB, saves to public/uploads/)
2. `/agent-ctx/4-main-agent.md` - This work record

## Files Modified
1. `/src/app/api/company-settings/route.ts` - Added POST, PATCH endpoints; Added currencySymbol and currencySymbolImage field handling
2. `/src/components/modules/settings.tsx` - Added Company tab as first tab with 5 section form; Image upload for logo, stamp, currency symbol
3. `/home/z/my-project/worklog.md` - Appended work record

## Key Decisions
- Company tab is the FIRST tab (before branches), default active tab changed to "company"
- Singleton pattern for company settings (create-if-not-exists on GET, upsert on PUT)
- File uploads go to `public/uploads/` with timestamp+random suffix filenames
- Three separate upload areas: logo, stamp, currency symbol image
- Each upload has preview and remove (X) button
- Success banner shown for 3 seconds after save
- Discard Changes button resets form to server data
- PATCH delegates to PUT (same behavior for singleton)

## Verification
- ESLint: zero errors
- Database: in sync with schema
- Dev server: compiles successfully
