import { db } from '../src/lib/db';

async function main() {
  const roleCodeMap: Record<string, string[]> = {
    PETTY_CASH: ['1130'],
    LABOR_COST: ['7110'],
    ADMIN_EXPENSE: ['8120', '8130', '8140', '8150', '8160', '8170'],
    PROJECT_WIP: ['1320'],
    CONTRACT_ASSET: ['1310'],
    CONTRACT_LIABILITY: ['3410'],
    UNBILLED_REVENUE: ['4210'],
    FX_GAIN: ['4290'],
    FX_LOSS: ['5290'],
    RETAINED_EARNINGS: ['5200'],
    SUBCONTRACTOR_ADVANCE: ['1230'],
    SUBCONTRACTOR_RETENTION_PAYABLE: ['3500'],
    DELAY_PENALTY_REVENUE: ['4280'],
    VAT_SETTLEMENT: ['2305'],
  };

  console.log('=== Checking accounts for unmapped roles ===\n');
  const updates: Array<{ code: string; role: string; currentRole: string | null; name: string; nameAr: string | null }> = [];

  for (const [role, codes] of Object.entries(roleCodeMap)) {
    console.log(`\n--- ${role} (default codes: ${codes.join(', ')}) ---`);
    for (const code of codes) {
      const acct = await db.account.findUnique({
        where: { code },
        select: { id: true, code: true, name: true, nameAr: true, type: true, isActive: true, allowPosting: true, accountRole: true },
      });
      if (!acct) {
        console.log(`  code ${code}: NOT FOUND — will need to create`);
      } else {
        console.log(`  code ${code}: ${acct.nameAr || acct.name} | type=${acct.type} | active=${acct.isActive} | posting=${acct.allowPosting} | currentRole=${acct.accountRole || 'null'}`);
        if (!acct.accountRole) {
          updates.push({ code: acct.code, role, currentRole: acct.accountRole, name: acct.name, nameAr: acct.nameAr });
        } else if (acct.accountRole !== role) {
          console.log(`    ⚠️ CONFLICT: account has role "${acct.accountRole}" but we want "${role}"`);
        }
      }
    }
  }

  console.log('\n=== PROPOSED UPDATES (assign role to accounts with null accountRole) ===\n');
  for (const u of updates) {
    console.log(`  ${u.code} (${u.nameAr || u.name}): null → ${u.role}`);
  }

  // Special cases analysis
  console.log('\n=== SPECIAL CASES (conflicts) ===');
  // PETTY_CASH wants 1130 but 1130 is CASH
  const cash1130 = await db.account.findUnique({ where: { code: '1130' }, select: { code: true, name: true, nameAr: true, accountRole: true } });
  console.log(`1130 (PETTY_CASH conflict): current role=${cash1130?.accountRole}`);
  // Check if 1110 is also CASH (then 1130 can become PETTY_CASH)
  const cash1110 = await db.account.findUnique({ where: { code: '1110' }, select: { code: true, name: true, nameAr: true, accountRole: true } });
  console.log(`1110: current role=${cash1110?.accountRole}`);

  // SUBCONTRACTOR_ADVANCE wants 1230 but 1230 is EMPLOYEE_ADVANCE
  const adv1230 = await db.account.findUnique({ where: { code: '1230' }, select: { code: true, name: true, nameAr: true, accountRole: true } });
  console.log(`1230 (SUBCONTRACTOR_ADVANCE conflict): current role=${adv1230?.accountRole}`);
  // Check if 1240 exists for subcontractor advance
  const adv1240 = await db.account.findUnique({ where: { code: '1240' } });
  console.log(`1240 exists: ${!!adv1240}`);

  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
