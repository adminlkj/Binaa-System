# Task 2 - Client Payments API Route and VAT Route Bug Fix

## Work Completed

### 1. Created `/src/app/api/client-payments/route.ts`
- **GET**: Lists all client payments with client info and optional filters (`clientId`, `dateFrom`, `dateTo`)
  - Includes `client` (id, name, code) and `invoice` (id, invoiceNo, totalAmount, status) relations
  - Supports date range filtering
  - Ordered by date descending

- **POST**: Creates a new client payment that:
  - Validates required fields (clientId, amount, date)
  - Validates client exists
  - Validates invoice belongs to client (if invoiceId provided)
  - Creates `ClientPayment` record
  - Calls `autoEntryClientPayment` from `@/lib/accounting/engine`
  - Stores `journalEntryId` on the payment record
  - Updates related sales invoice `paidAmount` and status (`PARTIALLY_PAID` or `PAID`)
  - Returns created record with `journalEntryId`

### 2. Created `/src/app/api/client-payments/[id]/route.ts`
- **GET**: Fetches single client payment by ID with client and invoice info
- **PATCH**: Updates client payment (blocks modification of posted payments with journalEntryId)
- **DELETE**: Deletes client payment (blocks deletion of posted payments; reverses invoice paidAmount on delete)

### 3. Fixed VAT Route Bug
- Fixed invalid Prisma syntax in `/src/app/api/vat/route.ts`:
  - Line 104: Changed `vatAmount: { not: null, gt: 0 }` → `vatAmount: { gt: 0 }` (GET breakdown section)
  - Line 249: Changed `vatAmount: { not: null, gt: 0 }` → `vatAmount: { gt: 0 }` (POST calculation section)
- Since `vatAmount` has a default of 0, `{ gt: 0 }` is the correct and sufficient filter

### 4. Updated Prisma Schema
- Added `client Client @relation(...)` and `invoice SalesInvoice? @relation(...)` to `ClientPayment` model
- Added `clientPayments ClientPayment[]` to `Client` model
- Added `clientPayments ClientPayment[]` to `SalesInvoice` model
- Ran `bun run db:push` to sync database

## Verification
- `GET /api/client-payments` → 200 (returns `[]`)
- `GET /api/client-payments/nonexistent` → 404 (returns `{"error":"تحصيل العميل غير موجود"}`)
- `GET /api/client-payments?clientId=test` → 200 (returns `[]` with filter applied)
- `GET /api/vat` → 200 (returns `[]`)
- ESLint passes (only pre-existing `take-screenshots.mjs` error)
