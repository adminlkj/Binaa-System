# Task 2-a: Schema Fix - إضافة الحقول والنماذج المفقودة

## Agent: Schema Fix Agent
## Status: ✅ Completed

## Summary
تم إصلاح ملف `prisma/schema.prisma` بناءً على نتائج التدقيق التجاري بإضافة الحقول والنماذج المفقودة.

## Changes Made

### 1. Project ↔ CostCenter Relation
- Added `costCenterId String?` field in `Project` model
- Added `costCenter CostCenter? @relation(fields: [costCenterId], references: [id], onDelete: SetNull)` in `Project`
- Added `projects Project[]` in `CostCenter` model
- Added `@@index([costCenterId])` in `Project`

### 2. ProgressClaimItem Model (NEW)
- Created new `ProgressClaimItem` model after `ProgressClaim`
- Fields: id, claimId, boqItemId, description, quantity, unitPrice, totalPrice, createdAt, updatedAt
- Relations: claim → ProgressClaim (Cascade), boqItem → BOQItem (Restrict)
- Indexes: claimId, boqItemId

### 3. ProgressClaim Enhancements
- Added Arabic comments to existing fields: retentionAmount, advanceDeduction, netPayment
- Added `items ProgressClaimItem[]` relation

### 4. BOQItem Enhancements
- Added `contractId String?` field
- Added `claimedQty Decimal @default(0)` field (الكمية المستخلصة)
- Added `contract Contract?` relation
- Added `claimItems ProgressClaimItem[]` relation
- Added `@@index([contractId])`

### 5. Contract Enhancements (Rental/Operator Fields)
- Added `operatorRate Decimal? @default(0)` - سعر المشغل في الساعة
- Added `fuelRatePerHour Decimal? @default(0)` - تكلفة الوقود في الساعة
- Added `operationMode String? @default("WITHOUT_DRIVER")` - WITHOUT_DRIVER, WITH_DRIVER, WITH_CREW
- Added `fuelResponsibility String? @default("ON_CLIENT")` - ON_CLIENT, ON_COMPANY
- Added `deliveryFeesTaxAmount Decimal? @default(0)` - مبلغ ضريبة النقل
- Added `pricingType String? @default("HOURLY")` - HOURLY, DAILY, MONTHLY, LUMP_SUM
- Added `dailyRate Decimal? @default(0)`
- Added `monthlyRate Decimal? @default(0)`
- Added `lumpSumAmount Decimal? @default(0)`
- Added `boqItems BOQItem[]` relation

## Database Sync
- `bun run db:push` executed successfully
- Prisma Client regenerated

## Worklog Updated
- `/home/z/my-project/worklog.md` updated with Task 2-a details
