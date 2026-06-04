# Task 2 - MoneyDisplay Component Agent

## Task
Create unified MoneyDisplay component and update app store with number formatting settings

## Work Done

### 1. Created `/src/components/ui/money-display.tsx`
- MoneyDisplay React component with full API as specified
- formatAmount() helper function exported
- formatMoney() helper function exported
- Uses CurrencySymbol SVG component for Saudi Riyal (﷼)
- Supports system mode (with separators) and official mode (no separators for ZATCA)
- Bilingual Arabic/English support
- Size variants: xs, sm, md, lg, xl
- Bold, inline, showSymbol options

### 2. Updated `/src/stores/app-store.ts`
- Added numberFormatMode, useThousandSeparatorsSystem, useThousandSeparatorsOfficial state fields
- Added setNumberFormatMode, setThousandSeparatorSettings actions
- Updated formatSAR to accept optional mode parameter (backward compatible)
- Added formatAmount function to store

## Verification
- ESLint: zero errors
- Dev server: no issues
- Backward compatibility: maintained
