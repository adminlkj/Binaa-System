import { db } from '../src/lib/db';

async function q<T = any>(sql: string, ...params: any[]): Promise<T[]> { return db.$queryRawUnsafe<T[]>(sql, ...params); }

async function main() {
  console.log('=== LEVEL 6: PERFORMANCE AUDIT ===\n');

  // ===== 1. N+1 QUERY DETECTION — routes that include deep relations =====
  console.log('--- 1. POTENTIAL N+1 / HEAVY INCLUDES ---');

  // Check projects/[id] which includes ~20 relations
  const projectsCount = await q<any>(`SELECT COUNT(*) as c FROM Project WHERE "deletedAt" IS NULL`);
  console.log(`Projects: ${projectsCount[0].c}`);

  // Count related records for the first project (simulates what projects/[id] loads)
  const firstProject = await q<any>(`SELECT id FROM Project WHERE "deletedAt" IS NULL LIMIT 1`);
  if (firstProject.length) {
    const pid = firstProject[0].id;
    const rels = await q<any>(`
      SELECT
        (SELECT COUNT(*) FROM Contract WHERE "projectId" = ?) as contracts,
        (SELECT COUNT(*) FROM BOQItem WHERE "projectId" = ?) as boq,
        (SELECT COUNT(*) FROM ProgressClaim WHERE "projectId" = ?) as claims,
        (SELECT COUNT(*) FROM SalesInvoice WHERE "projectId" = ?) as invoices,
        (SELECT COUNT(*) FROM PurchaseOrder WHERE "projectId" = ?) as pos,
        (SELECT COUNT(*) FROM PurchaseInvoice WHERE "projectId" = ?) as pis,
        (SELECT COUNT(*) FROM Expense WHERE "projectId" = ?) as expenses,
        (SELECT COUNT(*) FROM LaborCost WHERE "projectId" = ?) as labor,
        (SELECT COUNT(*) FROM EquipmentCost WHERE "projectId" = ?) as eqcosts,
        (SELECT COUNT(*) FROM EquipmentUsage WHERE "projectId" = ?) as equsage,
        (SELECT COUNT(*) FROM SubcontractorInvoice WHERE "projectId" = ?) as subs,
        (SELECT COUNT(*) FROM GoodsReceipt WHERE "projectId" = ?) as grs,
        (SELECT COUNT(*) FROM Timesheet WHERE "projectId" = ?) as timesheets,
        (SELECT COUNT(*) FROM WorkTeam WHERE "projectId" = ?) as teams,
        (SELECT COUNT(*) FROM EquipmentOperation WHERE "projectId" = ?) as eqops,
        (SELECT COUNT(*) FROM ResourceAllocation WHERE "projectId" = ?) as allocs,
        (SELECT COUNT(*) FROM PurchaseRequest WHERE "projectId" = ?) as prs
    `, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid, pid);
    console.log(`First project (${pid}) related records:`);
    const r = rels[0];
    const total = Object.values(r).reduce((s: number, v: any) => s + Number(v), 0);
    Object.entries(r).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log(`  TOTAL related records: ${total}`);
    if (total > 100) console.log(`  ⚠️ HIGH: projects/[id] GET loads ${total} records in a single request with deep includes`);
  }

  // ===== 2. MISSING INDEXES — check for FKs without indexes =====
  console.log('\n--- 2. MISSING INDEXES (FK columns without @@index) ---');
  // SQLite indexes
  const indexes = await q<any>(`SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name`);
  const indexMap = new Map<string, string[]>();
  for (const idx of indexes) {
    if (!indexMap.has(idx.tbl_name)) indexMap.set(idx.tbl_name, []);
    indexMap.get(idx.tbl_name)!.push(idx.name);
  }
  // Check key FK columns that should have indexes
  const fkChecks: Array<{ table: string; col: string }> = [
    { table: 'JournalLine', col: 'accountId' },
    { table: 'JournalLine', col: 'journalEntryId' },
    { table: 'Salary', col: 'employeeId' },
    { table: 'Attendance', col: 'employeeId' },
    { table: 'SalesInvoice', col: 'clientId' },
    { table: 'SalesInvoice', col: 'projectId' },
    { table: 'ClientPayment', col: 'clientId' },
    { table: 'SupplierPayment', col: 'supplierId' },
    { table: 'BOQItem', col: 'projectId' },
    { table: 'ProgressClaim', col: 'projectId' },
    { table: 'Expense', col: 'projectId' },
    { table: 'LaborCost', col: 'projectId' },
    { table: 'PurchaseOrder', col: 'supplierId' },
    { table: 'PurchaseInvoice', col: 'supplierId' },
    { table: 'EmployeeContract', col: 'employeeId' },
    { table: 'PayrollRunLine', col: 'payrollRunId' },
  ];
  // Check via PRAGMA index_list for each table
  for (const fk of fkChecks) {
    const tblIndexes = await q<any>(`PRAGMA index_list(${fk.table})`);
    // Check if any index covers the column
    let covered = false;
    for (const idx of tblIndexes) {
      const cols = await q<any>(`PRAGMA index_info(${idx.name})`);
      if (cols.some((c: any) => c.name === fk.col)) { covered = true; break; }
    }
    if (!covered) console.log(`  [MISSING] ${fk.table}.${fk.col}`);
  }
  console.log('  (only missing indexes shown above)');

  // ===== 3. SLOW QUERY PATTERNS — queries without LIMIT =====
  console.log('\n--- 3. API ROUTES WITHOUT PAGINATION (potential memory bombs) ---');
  // These routes return findMany without pagination on potentially large tables
  // We check if they have a page param
  console.log('  Check src/app/api routes for findMany without take/skip...');

  // ===== 4. ERROR HANDLING — routes that leak stack traces =====
  console.log('\n--- 4. ERROR HANDLING (stack trace leaks) ---');
  console.log('  Check API routes for error.message exposure...');

  // ===== 5. TABLE ROW COUNTS (identify large tables) =====
  console.log('\n--- 5. TABLE ROW COUNTS ---');
  const tables = ['JournalEntry', 'JournalLine', 'Account', 'Employee', 'Salary', 'SalesInvoice',
    'SalesInvoiceItem', 'ClientPayment', 'SupplierPayment', 'PurchaseOrder', 'PurchaseInvoice',
    'BOQItem', 'ProgressClaim', 'Expense', 'LaborCost', 'EquipmentOperation', 'Attendance',
    'EmployeeContract', 'PayrollRun', 'PayrollRunLine', 'Timesheet', 'InventoryItem'];
  for (const t of tables) {
    try {
      const r = await q<any>(`SELECT COUNT(*) as c FROM ${t}`);
      const c = Number(r[0].c);
      if (c > 0) console.log(`  ${t}: ${c} rows${c > 1000 ? ' ⚠️ LARGE' : ''}`);
    } catch {}
  }

  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
