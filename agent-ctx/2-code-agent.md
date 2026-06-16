# Task ID: 2 - Shared React Components (AccountSelector & JePreview)

## Agent: Code Agent

## Summary
Created two production-ready shared React components for the Binaa ERP system.

## Files Created
1. `/home/z/my-project/src/components/shared/account-selector.tsx` - AccountSelector component
2. `/home/z/my-project/src/components/shared/je-preview.tsx` - JePreview component

## Component Details

### AccountSelector
- **Purpose**: Reusable dropdown for selecting accounts by role or parent code
- **Props**: `roles`, `value`, `onValueChange`, `label`, `placeholder`, `activityType`, `parentCode`, `className`
- **Data Fetching**: TanStack Query `useQuery` → `/api/accounts/by-role?role=CASH,BANK` or `?parentCode=1100`
- **Features**: 
  - Loading skeleton state
  - Error state (Arabic)
  - Empty state ("لا توجد حسابات")
  - O(1) account lookup via Map
  - RTL layout support
  - 60s stale time cache

### JePreview
- **Purpose**: Shows the EXPECTED journal entry BEFORE saving (distinct from `accounting-entry-display.tsx` which shows saved JEs)
- **Props**: `lines`, `title`, `visible`, `className`
- **Features**:
  - Collapsible card with emerald/teal accent border
  - BookOpen icon + title (default: "القيد المحاسبي المتوقع")
  - Table: كود الحساب | اسم الحساب | مدين | دائن
  - Total row with MoneyDisplay
  - Balanced/unbalanced badge (متوازن/غير متوازن)
  - Conditional rendering (visible && lines.length > 0)
  - RTL layout support

## Design Decisions
- Followed existing `accounting-entry-display.tsx` patterns (emerald color scheme, MoneyDisplay usage, badge style)
- Used shadcn/ui Collapsible instead of manual toggle for JePreview
- Used `useMemo` for computed totals in JePreview
- Query key includes all filter params for proper cache isolation
- `onValueChange` callback returns full account object to avoid additional lookups

## Verification
- ESLint: No errors
- Dev server: Running normally
