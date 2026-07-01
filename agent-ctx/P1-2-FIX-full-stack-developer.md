# Task ID: P1-2-FIX
## Agent: Full-Stack Developer (Subcontractor Routes + Delete Fixes)

### Task
Phase 1.2 — Create 4 subcontractor financial route groups (CRIT-1 to CRIT-4) + fix 4 broken DELETE/PUT/POST routes (CRIT-5, CRIT-6, HIGH-1, HIGH-2, HIGH-3).

### Context (inherited from prior agents)
- `getNextEntryNo(tx)` HARD-REQUIRES tx — uses Sequence table
- `reverseJournalEntry(entryId, tx, reason)` HARD-REQUIRES tx
- `createJournalEntry(template, tx)` auto-generates `entryNo` when omitted
- `decimal.js` + `src/lib/safe-money.ts` available
- 4 `autoEntrySubcontractor*` functions exist in engine.ts but have ZERO API callers (CRIT-1..4)
- equipment/operations/[id] DELETE leaves orphan JE + EquipmentCost (CRIT-5)
- labor-costs/[id] DELETE hard-deletes without reversing JE (CRIT-6)
- labor-costs/[id] PUT updates without reversing+recreating JE when amounts change (HIGH-3)
- petty-cash/[id] DELETE has 2 non-tx calls (HIGH-1)
- provisions POST has 4 non-tx calls + hardcoded account codes (HIGH-2)

### Plan
- See /home/z/my-project/worklog.md for the P1-2 audit section detailing each fix.

### Files to create
1. src/app/api/subcontractor-invoices/route.ts (GET + POST)
2. src/app/api/subcontractor-invoices/[id]/route.ts (GET + PUT + DELETE)
3. src/app/api/subcontractor-payments/route.ts (GET + POST)
4. src/app/api/subcontractor-payments/[id]/route.ts (GET + DELETE)
5. src/app/api/subcontractor-advances/route.ts (GET + POST)
6. src/app/api/subcontractor-advances/[id]/route.ts (GET + DELETE)
7. src/app/api/subcontractor-retentions/route.ts (GET + POST)
8. src/app/api/subcontractor-retentions/[id]/route.ts (GET + DELETE)

### Files to modify
1. src/app/api/equipment/operations/[id]/route.ts — DELETE: reverseEntry on linked EquipmentCost JE
2. src/app/api/labor-costs/[id]/route.ts — DELETE: reverseEntry before delete; PUT: reverse+recreate on amount change
3. src/app/api/petty-cash/[id]/route.ts — DELETE: wrap reverseEntry + delete in single tx
4. src/app/api/provisions/route.ts — POST: wrap in tx + use requireAccountCodeByRole

### autoEntry function signatures (from engine.ts)
- `autoEntrySubcontractorInvoice(data: { invoiceNo, subcontractorName, amount, vatRate, vatAmount, totalAmount, date, costCenterId? }, tx)` (L698)
- `autoEntrySubcontractorAdvance(data: { advanceNo, subcontractorName, amount, date, paymentMethod?, costCenterId? }, tx)` (L1369)
- `autoEntrySubcontractorPayment(data: { paymentNo, subcontractorName, amount, date, paymentMethod?, costCenterId? }, tx)` (L1404)
- `autoEntrySubcontractorRetention(data: { retentionNo, subcontractorName, withheldAmount, date, costCenterId? }, tx)` (L1438)
- `autoEntryLaborCost(data: { description, amount, date, costCenterId?, paymentSource?, paymentAccountCode? }, tx)` (L1507)
