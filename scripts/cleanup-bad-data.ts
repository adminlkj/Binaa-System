import { db } from '../src/lib/db';

async function q<T = any>(sql: string, ...params: any[]): Promise<T[]> { return db.$queryRawUnsafe<T[]>(sql, ...params); }
async function x(sql: string, ...params: any[]): Promise<number> {
  const r = await db.$executeRawUnsafe(sql, ...params);
  return Number(r);
}

async function main() {
  console.log('=== CLEANING BAD TEST DATA ===\n');

  // 1. Bad BOQ items (negative qty/price)
  const boqBefore = await q<any>(`SELECT COUNT(*) as c FROM BOQItem WHERE quantity < 0 OR "unitPrice" < 0`);
  const boqDeleted = await x(`DELETE FROM BOQItem WHERE quantity < 0 OR "unitPrice" < 0`);
  console.log(`[${boqDeleted > 0 ? 'CLEANED' : 'OK'}] Deleted ${boqDeleted} BOQ items with negative qty/price (was ${boqBefore[0].c})`);

  // 2. Bad EmployeeContract (endDate < startDate)
  const contractBefore = await q<any>(`SELECT COUNT(*) as c FROM EmployeeContract WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate"`);
  const contractDeleted = await x(`DELETE FROM EmployeeContract WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate"`);
  console.log(`[${contractDeleted > 0 ? 'CLEANED' : 'OK'}] Deleted ${contractDeleted} contracts with endDate < startDate (was ${contractBefore[0].c})`);

  // 3. Bad Project (endDate < startDate) — soft-delete to preserve FK
  const projBefore = await q<any>(`SELECT COUNT(*) as c FROM Project WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate" AND "deletedAt" IS NULL`);
  const projUpdated = await x(`UPDATE Project SET "deletedAt" = CURRENT_TIMESTAMP WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate" AND "deletedAt" IS NULL`);
  console.log(`[${projUpdated > 0 ? 'CLEANED' : 'OK'}] Soft-deleted ${projUpdated} projects with endDate < startDate (was ${projBefore[0].c})`);

  // 4. Bad Employees (empty name) — hard-delete if no relations, else soft-delete
  const empBefore = await q<any>(`SELECT COUNT(*) as c FROM Employee WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`);
  const badEmps = await q<any>(`SELECT id FROM Employee WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`);
  let empHardDeleted = 0, empSoftDeleted = 0;
  for (const e of badEmps) {
    // Always soft-delete employees to preserve FK integrity (TeamMember, Timesheet, etc.)
    try {
      await x(`UPDATE Employee SET "deletedAt" = CURRENT_TIMESTAMP, "isActive" = 0, status = 'TERMINATED' WHERE id = ?`, e.id);
      empSoftDeleted++;
    } catch (err: any) {
      console.log(`  WARN: could not soft-delete employee ${e.id}: ${err.message}`);
    }
  }
  console.log(`[${(empHardDeleted + empSoftDeleted) > 0 ? 'CLEANED' : 'OK'}] Employees with empty name: hard-deleted ${empHardDeleted}, soft-deleted ${empSoftDeleted} (was ${empBefore[0].c})`);

  // 5. Bad Clients (empty name)
  const clientBefore = await q<any>(`SELECT COUNT(*) as c FROM Client WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`);
  const badClients = await q<any>(`SELECT id FROM Client WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`);
  let clientHardDeleted = 0, clientSoftDeleted = 0;
  for (const c of badClients) {
    const rels = await q<any>(`SELECT (SELECT COUNT(*) FROM Project p WHERE p."clientId" = ?) + (SELECT COUNT(*) FROM SalesInvoice i WHERE i."clientId" = ?) + (SELECT COUNT(*) FROM ClientPayment p WHERE p."clientId" = ?) as total`, c.id, c.id, c.id);
    const total = Number(rels[0]?.total || 0);
    if (total === 0) {
      await x(`DELETE FROM Client WHERE id = ?`, c.id);
      clientHardDeleted++;
    } else {
      await x(`UPDATE Client SET "deletedAt" = CURRENT_TIMESTAMP, "isActive" = 0 WHERE id = ?`, c.id);
      clientSoftDeleted++;
    }
  }
  console.log(`[${(clientHardDeleted + clientSoftDeleted) > 0 ? 'CLEANED' : 'OK'}] Clients with empty name: hard-deleted ${clientHardDeleted}, soft-deleted ${clientSoftDeleted} (was ${clientBefore[0].c})`);

  console.log('\n=== CLEANUP COMPLETE ===\n');
  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
