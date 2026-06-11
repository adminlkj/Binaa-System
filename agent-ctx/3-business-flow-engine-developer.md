# Task 3: Build Business Flow Engine Service

## Agent
Business Flow Engine Developer

## Task
Build a Business Flow Engine service that enforces workflow chains and connects all modules through two hub centers: Construction Projects and Equipment Rental.

## Files Created
1. `/src/lib/business-flow/engine.ts` - Core business flow engine (1470+ lines)
2. `/src/app/api/business-flow/validate/route.ts` - API route exposing validation functions

## Key Decisions
- Used strict workflow chains with no skipping allowed
- Each validation function returns `ValidationResult` with bilingual messages
- ActivityType is EXECUTION/RENTAL/GENERAL (not CONSTRUCTION/EQUIPMENT_RENTAL for entity-level distinction)
- Cost routing returns `CostRoutingResult` with destination, activityType, targetId, accountCode
- Profitability calculations use 2 decimal precision via round2()
- Workflow progress tracker marks the first incomplete step as "current"
- API route uses single POST endpoint with action-based dispatch pattern

## Dependencies
- Uses `import { db } from '@/lib/db'` for all database queries
- No new packages installed
- No Prisma schema changes required (uses existing models)

## Validation
- ESLint passes with zero new errors
- TypeScript compiles within Next.js build system (path alias @/lib/db resolved at build time)
- Fixed duplicate `client` property in Prisma include (merged into single include with nested clientPayments)
- Added missing includes (equipmentOperations, purchaseOrders) to workflow progress queries
