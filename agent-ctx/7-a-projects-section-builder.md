# Task 7-a: Projects Section Builder

## Task
Build the Projects section component at `/home/z/my-project/src/components/sections/projects-section.tsx`

## Completed
- Created comprehensive ProjectsSection component with:
  - ProjectListView: Search/filter, summary cards, project card grid
  - ProjectDetailView: Back button, 11 horizontal tabs via SectionLayout
  - 5 tabs with real data (overview, contracting, boq, extracts, costs)
  - 6 tabs with professional placeholders (planning, execution, quality, safety, correspondence, documents)
  - Full Arabic/English bilingual support
  - Loading skeletons, error states
  - MoneyDisplay for all monetary values
  - Status color coding (amber/emerald/orange/teal/rose)
  - Circular completion gauge in overview
  - Cost Sheet card with gradient header in costs tab

## Files Created
1. `src/components/sections/projects-section.tsx` - Main component (~850 lines)

## Lint
- Passes cleanly with no errors

## Dependencies
- Uses SectionLayout from '@/components/sections/section-layout'
- Uses store: useAppStore, SubModuleKey, formatSAR, formatNumber, formatDate, commonText, Lang
- Uses existing APIs: GET /api/projects, GET /api/projects/[id]
- Uses shadcn/ui: Card, Badge, Button, Input, Progress, Table, Select, Skeleton, ScrollArea, Separator, MoneyDisplay
