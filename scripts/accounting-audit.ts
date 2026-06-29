import { db } from '../src/lib/db';
import { accountingHealthCheck } from '../src/lib/accounting/guard';

async function q<T = any>(sql: string, ...params: any[]): Promise<T[]> { return db.$queryRawUnsafe<T[]>(sql, ...params); }

async function main() {
  console.log('=== GUARD HEALTH CHECK (R1-R12) ===\n');
  const hc = await accountingHealthCheck();
  hc.checks.forEach(c => {
    console.log(`[${c.passed ? 'OK' : 'FAIL'}] ${c.name}`);
    console.log(`    ${c.detail}`);
  });
  console.log(`\nOverall: ${hc.healthy ? 'HEALTHY' : 'UNHEALTHY'}\n`);

  console.log('=== UNMAPPED ROLES INVESTIGATION ===\n');
  const mappings = await db.financialMapping.findMany();
  console.log(`Total FinancialMappings: ${mappings.length}`);
  const mappedRoles = new Set(mappings.map(m => m.role));
  console.log(`Mapped roles: ${[...mappedRoles].join(', ')}\n`);

  // Check which accounts could serve the unmapped roles
  const unmappedRoles = ['PETTY_CASH', 'LABOR_COST', 'ADMIN_EXPENSE', 'PROJECT_WIP', 'CONTRACT_ASSET', 'CONTRACT_LIABILITY', 'UNBILLED_REVENUE', 'FX_GAIN', 'FX_LOSS', 'RETAINED_EARNINGS', 'SUBCONTRACTOR_ADVANCE', 'SUBCONTRACTOR_RETENTION_PAYABLE', 'DELAY_PENALTY_REVENUE', 'VAT_SETTLEMENT'];

  // For each unmapped role, suggest an account based on accountRole or name
  for (const role of unmappedRoles) {
    const candidates = await db.account.findMany({
      where: {
        isActive: true,
        allowPosting: true,
        OR: [
          { accountRole: role },
        ],
      },
      select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true },
    });
    console.log(`\n[${role}] candidates by accountRole: ${candidates.length}`);
    candidates.slice(0, 3).forEach(c => console.log(`  - ${c.code} | ${c.nameAr || c.name} | type=${c.type} | role=${c.accountRole}`));

    // Also search by Arabic name keywords
    const keywords: Record<string, string[]> = {
      PETTY_CASH: ['نثر', 'petty'],
      LABOR_COST: ['عمال', 'labor', 'أجور'],
      ADMIN_EXPENSE: ['إداري', 'عمومي', 'admin', 'general'],
      PROJECT_WIP: ['تنفيذ', 'wip', 'تحت التشغيل'],
      CONTRACT_ASSET: ['مستحقات', 'contract asset', 'أصل العقد'],
      CONTRACT_LIABILITY: ['سلف', 'مطلوب العقد', 'contract liab'],
      UNBILLED_REVENUE: ['غير مفوتر', 'unbilled'],
      FX_GAIN: ['أرباح فروقات', 'fx gain'],
      FX_LOSS: ['خسائر فروقات', 'fx loss'],
      RETAINED_EARNINGS: ['أرباح مرحلة', 'retained'],
      SUBCONTRACTOR_ADVANCE: ['سلف مقاولين', 'subcontractor adv'],
      SUBCONTRACTOR_RETENTION_PAYABLE: ['احتجاز مقاولين', 'subcontractor ret'],
      DELAY_PENALTY_REVENUE: ['غرامات', 'penalty'],
      VAT_SETTLEMENT: ['تسوية ضريبة', 'vat settle'],
    };
    if (keywords[role]) {
      const orClauses = keywords[role].map(k => [
        { name: { contains: k } },
        { nameAr: { contains: k } },
      ]).flat();
      const nameMatches = await db.account.findMany({
        where: { isActive: true, allowPosting: true, OR: orClauses },
        select: { id: true, code: true, name: true, nameAr: true, type: true, accountRole: true },
      });
      if (nameMatches.length) {
        console.log(`  name keyword matches: ${nameMatches.length}`);
        nameMatches.slice(0, 3).forEach(c => console.log(`    - ${c.code} | ${c.nameAr || c.name} | type=${c.type} | role=${c.accountRole}`));
      }
    }
  }

  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
