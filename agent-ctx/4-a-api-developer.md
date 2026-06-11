# Task 4-a: Update Rental Contracts API Routes

## Agent: API Developer

## Summary
Updated the rental contracts API routes to match the new EquipmentRental Prisma schema with all new fields.

## Files Modified
1. `/home/z/my-project/src/app/api/equipment/rental-contracts/route.ts` - Main list/create endpoint
2. `/home/z/my-project/src/app/api/equipment/rental-contracts/[id]/route.ts` - Single item/update/delete endpoint

## Key Changes

### Critical Fix: Model Name
- Changed `db.equipmentRentalContract` → `db.equipmentRental` to match the Prisma schema model name

### GET (List)
- Added `client`, `project`, `contract` relation includes
- Kept `status`, `equipmentId`, `clientId` filter support
- Added `contract` relation to see contractNo from parent Contract

### POST (Create)
- Auto-generates `contractNo` (RC-0001 format) by querying Contract table
- Auto-generates `salesOrderNo` (SO-0001 format)
- Creates parent Contract record first (required FK), then EquipmentRental
- Calculates `hourlyRate = referenceRate / referenceHours` when pricingType=HOURLY
- Handles all new fields: pricingType, dailyRate, monthlyRate, lumpSumAmount, workCity, workLocation, siteSupervisor, siteSupervisorPhone, deliveryFeesType, deliveryFees, deliveryFeesTaxable, operationMode, fuelResponsibility, insuranceResponsibility, purchaseOrderNo, quotationNo, paymentDuration, additionalTerms, totalAmount
- ProjectId fallback: client's project → any project → 400 error
- Syncs parent contract status to ACTIVE when rental goes ACTIVE
- Updates Equipment status to RENTED when rental is ACTIVE

### PATCH (Update)
- Recalculates hourlyRate when referenceRate/referenceHours change
- Handles all new field updates with proper type conversion
- Syncs parent Contract fields (value, hourlyRate, deliveryFees, dates, reference numbers)
- Handles status transitions: DRAFT→UNDER_REVIEW→ACTIVE→EXPIRED/CANCELLED
- Updates Equipment status: RENTED on ACTIVE, AVAILABLE on EXPIRED/CANCELLED (when no other active rentals)
- Syncs parent Contract status on all status changes

### DELETE (New)
- Only allows deletion of DRAFT status rentals
- Deletes EquipmentRental first, then parent Contract

## Lint Status
- Passes with no new errors
