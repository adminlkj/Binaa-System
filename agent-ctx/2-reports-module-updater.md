# Task 2 - Reports Module Updater

## Task: Update Reports Module to show Construction vs Equipment Rental Activity Breakdown

### Changes Made

#### 1. API Route (`/home/z/my-project/src/app/api/reports/route.ts`)
- Added `activity-summary` report type with Construction and Rental breakdown
- Updated `project-card` report type to include `projectType` field

#### 2. UI Component (`/home/z/my-project/src/components/modules/reports.tsx`)
- Added `ActivitySummaryTab` component as first tab
- Added Activity icon import
- Updated tabs grid to 7 columns
- Changed default tab to `activity-summary`

### Key Design Decisions
- Construction revenue = progress claims + EXTRACT sales invoices
- Rental revenue = TIMESHEET sales invoices only
- Construction costs: materials (purchase orders), labor, subcontractors, equipment, expenses
- Rental costs: maintenance (for rental equipment), fuel (for rental projects), operations (equipment usages), rental expenses
- Emerald theme for Construction, cyan theme for Rental (matching Projects module)
- Empty array guards on Prisma `in: []` queries for EquipmentMaintenance and EquipmentFuelLog
