# Task 2 - Prisma Schema Updater

## Task
Update the Prisma schema to add new fields to the Account model that support activity-based accounting.

## Work Done
1. Reviewed current Account model — found it already had `activityType`, `isSystem`, `allowPosting`, `level` from prior work
2. Fixed `allowPosting` default from `false` to `true` per task requirements
3. Added missing `description` (String?) field
4. Added missing `descriptionAr` (String?) field
5. Verified `AccountActivityType` enum already existed with correct values
6. Ran `bun run db:push` successfully

## Final Account Model
```prisma
model Account {
  id            String   @id @default(cuid())
  code          String   @unique
  name          String
  nameAr        String?
  type          String
  parentId      String?
  isActive      Boolean  @default(true)
  activityType  String?  // CONSTRUCTION | EQUIPMENT_RENTAL | BOTH
  isSystem      Boolean  @default(false)
  allowPosting  Boolean  @default(true)
  level         Int      @default(0)
  description   String?
  descriptionAr String?

  parent      Account?      @relation("AccountHierarchy", fields: [parentId], references: [id])
  children    Account[]     @relation("AccountHierarchy")
  journalLines JournalLine[]
}
```

## AccountActivityType Enum
```prisma
enum AccountActivityType {
  CONSTRUCTION
  EQUIPMENT_RENTAL
  BOTH
}
```

## db:push Result
Database synced successfully. Prisma Client regenerated (v6.19.2).
