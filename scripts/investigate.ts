import { db } from '../src/lib/db';
async function q<T = any>(sql: string): Promise<T[]> { return db.$queryRawUnsafe<T[]>(sql); }

async function main() {
  console.log('=== BAD EMPLOYEES (employeeNumber="undefined" or empty name) ===');
  const badEmp = await q<any>(`SELECT id, name, "employeeNumber", "createdAt" FROM Employee WHERE "employeeNumber" = 'undefined' OR name IS NULL OR name = '' OR "employeeNumber" IS NULL OR "employeeNumber" = ''`);
  badEmp.forEach(e => console.log(`  id=${e.id} name="${e.name}" num="${e.employeeNumber}" created=${e.createdAt}`));

  console.log('\n=== BAD BOQ (negative qty/price) ===');
  const badBOQ = await q<any>(`SELECT id, "projectId", description, quantity, "unitPrice" FROM BOQItem WHERE quantity < 0 OR "unitPrice" < 0`);
  badBOQ.forEach(b => console.log(`  id=${b.id} project=${b.projectId} desc="${b.description}" qty=${b.quantity} price=${b.unitPrice}`));

  console.log('\n=== BAD CONTRACT (endDate < startDate) ===');
  const badContract = await q<any>(`SELECT id, "employeeId", "startDate", "endDate" FROM EmployeeContract WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate"`);
  badContract.forEach(c => console.log(`  id=${c.id} emp=${c.employeeId} start=${c.startDate} end=${c.endDate}`));

  console.log('\n=== BAD PROJECT (endDate < startDate) ===');
  const badProj = await q<any>(`SELECT id, name, "startDate", "endDate" FROM Project WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate"`);
  badProj.forEach(p => console.log(`  id=${p.id} name="${p.name}" start=${p.startDate} end=${p.endDate}`));

  console.log('\n=== BAD CLIENT (null/empty name) ===');
  const badClient = await q<any>(`SELECT id, code, name FROM Client WHERE name IS NULL OR name = ''`);
  badClient.forEach(c => console.log(`  id=${c.id} code="${c.code}" name="${c.name}"`));

  console.log('\n=== PurchaseOrderItem -> PurchaseOrder (orderId) ===');
  const orphanPOI = await q<any>(`SELECT COUNT(*) as c FROM PurchaseOrderItem i LEFT JOIN PurchaseOrder p ON i."orderId" = p.id WHERE p.id IS NULL`);
  console.log(`  orphan POI: ${orphanPOI[0].c}`);

  console.log('\n=== PurchaseInvoiceItem -> PurchaseInvoice (invoiceId) ===');
  const orphanPII = await q<any>(`SELECT COUNT(*) as c FROM PurchaseInvoiceItem i LEFT JOIN PurchaseInvoice p ON i."invoiceId" = p.id WHERE p.id IS NULL`);
  console.log(`  orphan PII: ${orphanPII[0].c}`);

  console.log('\n=== TeamMember -> WorkTeam (teamId) ===');
  const orphanTM = await q<any>(`SELECT COUNT(*) as c FROM TeamMember m LEFT JOIN WorkTeam w ON m."teamId" = w.id WHERE w.id IS NULL`);
  console.log(`  orphan TM: ${orphanTM[0].c}`);

  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
