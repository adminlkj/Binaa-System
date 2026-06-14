# Task 2c - Print Template Update Agent

## Task
Update print templates (PurchaseOrder, DeliveryOrder, Timesheet) to match the new professional ERP-level design.

## Changes Made

### 1. PurchaseOrder.ts
- **Removed emojis**: "🏢 الطالب" → "الطالب / Buyer", "🏭 المورد" → "المورد / Supplier"
- **Bilingual labels**: Added Arabic/English labels throughout all sections
- **Removed status badge**: Status is internal, not for printed documents
- **Added currency**: getCurrencySymbol used in table headers and totals
- **Shared helpers**: Replaced inline totals HTML with `totalsSection()` helper
- **Added fields**: Supplier address, tax number, payment terms

### 2. DeliveryOrder.ts
- **Removed emojis**: "⚙️ بيانات المعدة" → "بيانات المعدة / Equipment", "👤 العميل" → "العميل / Client", "📍" removed
- **Bilingual labels**: All party-card rows and info-grid items now bilingual
- **Removed status badge**: Completely removed doStatusMap and status badge HTML
- **Removed unused imports**: statusBadge no longer imported
- **Cleaner structure**: Project name moved to info-grid, site section conditional on data.site

### 3. Timesheet.ts
- **Removed emojis**: "⚙️ بيانات المعدة" → "بيانات المعدة / Equipment", "👤 العميل" → "العميل / Client", "⏱️" removed
- **Bilingual labels**: All sections now have Arabic/English labels
- **Removed status badge**: Removed tsStatusMap and status badge HTML
- **Added currency**: Currency info item, currency in hourly rate and totals labels
- **Shared helpers**: Replaced inline totals HTML with `totalsSection()` helper
- **Cleaner structure**: Body broken into named sections (infoGrid, partiesHtml, operatingDataHtml, totalsHtml)

## Verification
- Lint passes clean with zero errors
- Dev server running without issues
- All existing functionality preserved (data bindings, calculations, conditional rendering)
