import { db } from '../src/lib/db';

async function q<T = any>(sql: string): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(sql);
}

async function main() {
  const log = (s: string) => console.log(s);
  log('\n========== LEVEL 4: DATA AUDIT ==========\n');

  // ===== 1. REFERENTIAL INTEGRITY =====
  log('--- 1. REFERENTIAL INTEGRITY (orphaned records) ---');

  const checks: [string, string][] = [
    ['JournalLines -> Account', `SELECT COUNT(*) as c FROM JournalLine jl LEFT JOIN Account a ON jl."accountId" = a.id WHERE a.id IS NULL`],
    ['JournalLines -> JournalEntry', `SELECT COUNT(*) as c FROM JournalLine jl LEFT JOIN JournalEntry je ON jl."journalEntryId" = je.id WHERE je.id IS NULL`],
    ['Salaries -> Employee', `SELECT COUNT(*) as c FROM Salary s LEFT JOIN Employee e ON s."employeeId" = e.id WHERE e.id IS NULL`],
    ['PayrollRunLines -> PayrollRun', `SELECT COUNT(*) as c FROM PayrollRunLine l LEFT JOIN PayrollRun p ON l."payrollRunId" = p.id WHERE p.id IS NULL`],
    ['PayrollRunLines -> Employee', `SELECT COUNT(*) as c FROM PayrollRunLine l LEFT JOIN Employee e ON l."employeeId" = e.id WHERE e.id IS NULL`],
    ['SalesInvoiceItems -> SalesInvoice', `SELECT COUNT(*) as c FROM SalesInvoiceItem i LEFT JOIN SalesInvoice s ON i."invoiceId" = s.id WHERE s.id IS NULL`],
    ['SalesInvoices -> Client', `SELECT COUNT(*) as c FROM SalesInvoice s LEFT JOIN Client c ON s."clientId" = c.id WHERE c.id IS NULL`],
    ['PurchaseOrderItems -> PurchaseOrder', `SELECT COUNT(*) as c FROM PurchaseOrderItem i LEFT JOIN PurchaseOrder p ON i."purchaseOrderId" = p.id WHERE p.id IS NULL`],
    ['PurchaseInvoiceItems -> PurchaseInvoice', `SELECT COUNT(*) as c FROM PurchaseInvoiceItem i LEFT JOIN PurchaseInvoice p ON i."purchaseInvoiceId" = p.id WHERE p.id IS NULL`],
    ['GoodsReceiptItems -> GoodsReceipt', `SELECT COUNT(*) as c FROM GoodsReceiptItem i LEFT JOIN GoodsReceipt g ON i."goodsReceiptId" = g.id WHERE g.id IS NULL`],
    ['EmployeeContracts -> Employee', `SELECT COUNT(*) as c FROM EmployeeContract c LEFT JOIN Employee e ON c."employeeId" = e.id WHERE e.id IS NULL`],
    ['Attendance -> Employee', `SELECT COUNT(*) as c FROM Attendance a LEFT JOIN Employee e ON a."employeeId" = e.id WHERE e.id IS NULL`],
    ['TeamMembers -> WorkTeam', `SELECT COUNT(*) as c FROM TeamMember m LEFT JOIN WorkTeam w ON m."workTeamId" = w.id WHERE w.id IS NULL`],
    ['BOQItems -> Project', `SELECT COUNT(*) as c FROM BOQItem b LEFT JOIN Project p ON b."projectId" = p.id WHERE p.id IS NULL`],
    ['ProgressClaims -> Project', `SELECT COUNT(*) as c FROM ProgressClaim p LEFT JOIN Project pr ON p."projectId" = pr.id WHERE pr.id IS NULL`],
    ['ChangeOrders -> Contract', `SELECT COUNT(*) as c FROM ChangeOrder c LEFT JOIN Contract ct ON c."contractId" = ct.id WHERE ct.id IS NULL`],
    ['ClientPayments -> Client', `SELECT COUNT(*) as c FROM ClientPayment p LEFT JOIN Client c ON p."clientId" = c.id WHERE c.id IS NULL`],
    ['SupplierPayments -> Supplier', `SELECT COUNT(*) as c FROM SupplierPayment p LEFT JOIN Supplier s ON p."supplierId" = s.id WHERE s.id IS NULL`],
    ['EquipmentOperations -> Equipment', `SELECT COUNT(*) as c FROM EquipmentOperation o LEFT JOIN Equipment e ON o."equipmentId" = e.id WHERE e.id IS NULL`],
    ['InventoryItems -> Warehouse', `SELECT COUNT(*) as c FROM InventoryItem i LEFT JOIN Warehouse w ON i."warehouseId" = w.id WHERE w.id IS NULL`],
  ];
  for (const [label, sql] of checks) {
    try {
      const r = await q<any>(sql);
      const c = Number(r[0].c);
      log(`[${c > 0 ? 'CRITICAL' : 'OK'}] ${label}: ${c}`);
    } catch (e: any) {
      log(`[SKIP] ${label}: ${e.message.split('\n')[0].slice(0, 80)}`);
    }
  }

  // ===== 2. JOURNAL ENTRY BALANCE =====
  log('\n--- 2. JOURNAL ENTRY BALANCE (sum debit must = sum credit) ---');
  try {
    const unbalanced = await q<any>(`SELECT je.id, je."entryNo", CAST(SUM(jl.debit) AS REAL) as dr, CAST(SUM(jl.credit) AS REAL) as cr FROM JournalEntry je LEFT JOIN JournalLine jl ON jl."journalEntryId" = je.id WHERE je.status = 'POSTED' GROUP BY je.id HAVING ABS(dr - cr) > 0.01 LIMIT 20`);
    if (unbalanced.length) {
      log(`[CRITICAL] Unbalanced POSTED entries: ${unbalanced.length} (showing first 20)`);
      unbalanced.forEach(u => log(`  - ${u.entryNo} (id=${u.id}): Dr=${u.dr} Cr=${u.cr} diff=${(u.dr - u.cr).toFixed(2)}`));
    } else log('[OK] All POSTED entries are balanced');
  } catch (e: any) { log(`[SKIP] balance check: ${e.message.split('\n')[0].slice(0, 80)}`); }

  try {
    const emptyPosted = await q<any>(`SELECT je.id, je."entryNo" FROM JournalEntry je LEFT JOIN JournalLine jl ON jl."journalEntryId" = je.id WHERE je.status = 'POSTED' GROUP BY je.id HAVING COUNT(jl.id) = 0 LIMIT 20`);
    if (emptyPosted.length) {
      log(`[CRITICAL] POSTED entries with ZERO lines: ${emptyPosted.length}`);
      emptyPosted.forEach(e => log(`  - ${e.entryNo} (id=${e.id})`));
    } else log('[OK] No POSTED entries with zero lines');
  } catch (e: any) { log(`[SKIP] zero-line check: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // Single-sided entries (only debit or only credit)
  try {
    const singleSided = await q<any>(`SELECT je.id, je."entryNo", CAST(SUM(jl.debit) AS REAL) as dr, CAST(SUM(jl.credit) AS REAL) as cr FROM JournalEntry je JOIN JournalLine jl ON jl."journalEntryId" = je.id WHERE je.status = 'POSTED' GROUP BY je.id HAVING (dr > 0 AND cr = 0) OR (cr > 0 AND dr = 0) LIMIT 20`);
    if (singleSided.length) {
      log(`[CRITICAL] Single-sided POSTED entries (only debit OR only credit): ${singleSided.length}`);
      singleSided.forEach(u => log(`  - ${u.entryNo}: Dr=${u.dr} Cr=${u.cr}`));
    } else log('[OK] No single-sided POSTED entries');
  } catch (e: any) { log(`[SKIP] single-sided check: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // ===== 3. DUPLICATE DATA =====
  log('\n--- 3. DUPLICATE DATA ---');
  const dups: [string, string, string][] = [
    ['Account codes', 'code', `SELECT code, COUNT(*) as c FROM Account GROUP BY code HAVING c > 1`],
    ['Employee codes', 'code', `SELECT code, COUNT(*) as c FROM Employee WHERE "deletedAt" IS NULL GROUP BY code HAVING c > 1`],
    ['JournalEntry numbers', 'entryNo', `SELECT "entryNo", COUNT(*) as c FROM JournalEntry GROUP BY "entryNo" HAVING c > 1`],
    ['SalesInvoice numbers', 'invoiceNo', `SELECT "invoiceNo", COUNT(*) as c FROM SalesInvoice GROUP BY "invoiceNo" HAVING c > 1`],
    ['InventoryItem codes', 'code', `SELECT code, COUNT(*) as c FROM InventoryItem GROUP BY code HAVING c > 1`],
    ['PayrollRun codes', 'code', `SELECT code, COUNT(*) as c FROM PayrollRun GROUP BY code HAVING c > 1`],
  ];
  for (const [label, col, sql] of dups) {
    try {
      const r = await q<any>(sql);
      log(`[${r.length ? 'CRITICAL' : 'OK'}] Duplicate ${label}: ${r.length}`);
      r.forEach(d => log(`  - ${col}="${d[col]}" x${d.c}`));
    } catch (e: any) { log(`[SKIP] ${label}: ${e.message.split('\n')[0].slice(0, 80)}`); }
  }

  // ===== 4. BUSINESS RULE VIOLATIONS =====
  log('\n--- 4. BUSINESS RULE VIOLATIONS ---');
  const biz: [string, string][] = [
    ['BOQItems negative qty/price', `SELECT COUNT(*) as c FROM BOQItem WHERE quantity < 0 OR "unitPrice" < 0`],
    ['Salaries negative basic/net', `SELECT COUNT(*) as c FROM Salary WHERE "basicSalary" < 0 OR "netSalary" < 0`],
    ['InventoryItems negative quantity', `SELECT COUNT(*) as c FROM InventoryItem WHERE quantity < 0`],
    ['InventoryItems negative prices', `SELECT COUNT(*) as c FROM InventoryItem WHERE "purchasePrice" < 0 OR "sellingPrice" < 0`],
    ['Contracts endDate<startDate', `SELECT COUNT(*) as c FROM EmployeeContract WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate"`],
    ['Projects endDate<startDate', `SELECT COUNT(*) as c FROM Project WHERE "endDate" IS NOT NULL AND "startDate" IS NOT NULL AND "endDate" < "startDate" AND "deletedAt" IS NULL`],
    ['JournalEntries reversedEntry missing', `SELECT COUNT(*) as c FROM JournalEntry je WHERE je."reversedEntryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM JournalEntry j2 WHERE j2.id = je."reversedEntryId")`],
    ['JournalEntries no lines non-system', `SELECT COUNT(*) as c FROM JournalEntry je WHERE NOT EXISTS (SELECT 1 FROM JournalLine jl WHERE jl."journalEntryId" = je.id) AND je."isSystem" = 0`],
  ];
  for (const [label, sql] of biz) {
    try {
      const r = await q<any>(sql);
      const c = Number(r[0].c);
      log(`[${c > 0 ? 'HIGH' : 'OK'}] ${label}: ${c}`);
    } catch (e: any) { log(`[SKIP] ${label}: ${e.message.split('\n')[0].slice(0, 80)}`); }
  }

  // SalesInvoice items total vs subtotal
  try {
    const invMismatch = await q<any>(`SELECT s.id, s."invoiceNo", CAST(s.subtotal AS REAL) as sub, CAST(SUM(i."totalPrice") AS REAL) as items_total FROM SalesInvoice s LEFT JOIN SalesInvoiceItem i ON i."invoiceId" = s.id GROUP BY s.id HAVING ABS(sub - items_total) > 0.01 LIMIT 20`);
    if (invMismatch.length) {
      log(`[HIGH] SalesInvoices where items total != subtotal: ${invMismatch.length}`);
      invMismatch.forEach(m => log(`  - ${m.invoiceNo}: items=${m.items_total} subtotal=${m.sub} diff=${(m.items_total - m.sub).toFixed(2)}`));
    } else log('[OK] All SalesInvoices have items total = subtotal');
  } catch (e: any) { log(`[SKIP] invoice totals: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // PayrollRun totals consistency (totalAmount vs sum of lines.netSalary)
  try {
    const prMismatch = await q<any>(`SELECT p.id, p.code, CAST(p."totalNet" AS REAL) as total_net, CAST(p."totalAmount" AS REAL) as total_amt, (SELECT CAST(COALESCE(SUM(l."netSalary"), 0) AS REAL) FROM PayrollRunLine l WHERE l."payrollRunId" = p.id) as lines_sum FROM PayrollRun p WHERE ABS("totalNet" - COALESCE((SELECT SUM(l."netSalary") FROM PayrollRunLine l WHERE l."payrollRunId" = p.id), 0)) > 0.01 LIMIT 20`);
    if (prMismatch.length) {
      log(`[HIGH] PayrollRuns where totalNet != sum(lines.netSalary): ${prMismatch.length}`);
      prMismatch.forEach(m => log(`  - ${m.code}: totalNet=${m.total_net} linesSum=${m.lines_sum}`));
    } else log('[OK] All PayrollRuns have consistent totals');
  } catch (e: any) { log(`[SKIP] payroll totals: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // ===== 5. NULL/EMPTY REQUIRED FIELDS =====
  log('\n--- 5. NULL/EMPTY REQUIRED FIELDS ---');
  const nulls: [string, string][] = [
    ['Employees null/empty name or code', `SELECT COUNT(*) as c FROM Employee WHERE (name IS NULL OR name = '' OR code IS NULL OR code = '') AND "deletedAt" IS NULL`],
    ['Accounts null/empty name or code', `SELECT COUNT(*) as c FROM Account WHERE name IS NULL OR name = '' OR code IS NULL OR code = ''`],
    ['JournalEntries null date or entryNo', `SELECT COUNT(*) as c FROM JournalEntry WHERE date IS NULL OR "entryNo" IS NULL OR "entryNo" = ''`],
    ['Clients null/empty name', `SELECT COUNT(*) as c FROM Client WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`],
    ['Suppliers null/empty name', `SELECT COUNT(*) as c FROM Supplier WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`],
    ['Projects null/empty name', `SELECT COUNT(*) as c FROM Project WHERE (name IS NULL OR name = '') AND "deletedAt" IS NULL`],
  ];
  for (const [label, sql] of nulls) {
    try {
      const r = await q<any>(sql);
      const c = Number(r[0].c);
      log(`[${c > 0 ? 'HIGH' : 'OK'}] ${label}: ${c}`);
    } catch (e: any) { log(`[SKIP] ${label}: ${e.message.split('\n')[0].slice(0, 80)}`); }
  }

  // ===== 6. FISCAL YEAR OVERLAP =====
  log('\n--- 6. FISCAL YEAR OVERLAP & CLOSED-YEAR DRAFTS ---');
  try {
    const years = await q<any>(`SELECT id, name, "startDate", "endDate", status FROM FiscalYear ORDER BY "startDate"`);
    let overlaps = 0;
    for (let i = 1; i < years.length; i++) {
      if (new Date(years[i].startDate) <= new Date(years[i-1].endDate)) {
        overlaps++;
        log(`  - Overlap: ${years[i-1].name} (ends ${years[i-1].endDate}) vs ${years[i].name} (starts ${years[i].startDate})`);
      }
    }
    log(`[${overlaps > 0 ? 'MEDIUM' : 'OK'}] Overlapping fiscal years: ${overlaps}`);

    const closedDrafts = await q<any>(`SELECT fy.name, COUNT(je.id) as c FROM FiscalYear fy LEFT JOIN JournalEntry je ON je.date >= fy."startDate" AND je.date <= fy."endDate" AND je.status = 'DRAFT' WHERE fy.status = 'CLOSED' GROUP BY fy.id HAVING c > 0`);
    if (closedDrafts.length) {
      log(`[MEDIUM] Closed fiscal years with DRAFT entries: ${closedDrafts.length}`);
      closedDrafts.forEach(d => log(`  - ${d.name}: ${d.c} DRAFT entries`));
    } else log('[OK] No DRAFT entries in closed fiscal years');
  } catch (e: any) { log(`[SKIP] fiscal year: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // ===== 7. CLIENT/SUPPLIER BALANCE INTEGRITY =====
  log('\n--- 7. CLIENT/SUPPLIER BALANCE INTEGRITY ---');
  try {
    const clientBal = await q<any>(`SELECT c.id, c.name, CAST(COALESCE(c.balance, 0) AS REAL) as bal, (SELECT CAST(COALESCE(SUM(i."totalAmount"), 0) AS REAL) FROM SalesInvoice i WHERE i."clientId" = c.id) as inv_total, (SELECT CAST(COALESCE(SUM(p.amount), 0) AS REAL) FROM ClientPayment p WHERE p."clientId" = c.id) as pay_total FROM Client c WHERE (SELECT COUNT(*) FROM SalesInvoice i WHERE i."clientId" = c.id) + (SELECT COUNT(*) FROM ClientPayment p WHERE p."clientId" = c.id) > 0 AND ABS(COALESCE(c.balance, 0) - ((SELECT COALESCE(SUM(i."totalAmount"), 0) FROM SalesInvoice i WHERE i."clientId" = c.id) - (SELECT COALESCE(SUM(p.amount), 0) FROM ClientPayment p WHERE p."clientId" = c.id))) > 0.01 LIMIT 20`);
    if (clientBal.length) {
      log(`[MEDIUM] Clients with balance != invoices-payments: ${clientBal.length}`);
      clientBal.forEach(c => log(`  - ${c.name}: balance=${c.bal} expected=${(c.inv_total - c.pay_total).toFixed(2)} (inv=${c.inv_total} pay=${c.pay_total})`));
    } else log('[OK] All clients with transactions have consistent balances');
  } catch (e: any) { log(`[SKIP] client balance: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // ===== 8. SALARY STATUS CONSISTENCY =====
  log('\n--- 8. SALARY STATUS CONSISTENCY ---');
  try {
    // Salary marked PAID but no journal entry
    const paidNoJE = await q<any>(`SELECT COUNT(*) as c FROM Salary WHERE status = 'PAID' AND "journalEntryId" IS NULL`);
    log(`[${Number(paidNoJE[0].c) > 0 ? 'HIGH' : 'OK'}] Salaries PAID but no journalEntry: ${paidNoJE[0].c}`);
  } catch (e: any) { log(`[SKIP] salary status: ${e.message.split('\n')[0].slice(0, 80)}`); }

  // ===== SUMMARY =====
  log('\n========== SUMMARY ==========');
  const stats: [string, string][] = [
    ['Accounts', `SELECT COUNT(*) as c FROM Account`],
    ['JournalEntries', `SELECT COUNT(*) as c FROM JournalEntry`],
    ['JournalLines', `SELECT COUNT(*) as c FROM JournalLine`],
    ['Employees', `SELECT COUNT(*) as c FROM Employee`],
    ['SalesInvoices', `SELECT COUNT(*) as c FROM SalesInvoice`],
    ['Clients', `SELECT COUNT(*) as c FROM Client`],
    ['Projects', `SELECT COUNT(*) as c FROM Project`],
    ['PayrollRuns', `SELECT COUNT(*) as c FROM PayrollRun`],
  ];
  for (const [label, sql] of stats) {
    try { const r = await q<any>(sql); log(`  ${label}: ${r[0].c}`); } catch {}
  }

  await db.$disconnect();
}
main().catch(e => { console.error('AUDIT ERROR:', e.message); process.exit(1); });
