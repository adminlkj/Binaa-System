import { db } from '../src/lib/db';

async function main() {
  console.log('=== FIXING UNMAPPED ACCOUNT ROLES ===\n');

  // ── Group 1: Direct role assignments to existing accounts (no conflict) ──
  const directAssignments: Array<{ code: string; role: string; reason: string }> = [
    { code: '8120', role: 'ADMIN_EXPENSE', 'reason': 'إيجار مكتب — admin expense' },
    { code: '8130', role: 'ADMIN_EXPENSE', 'reason': 'خدمات — admin expense' },
    { code: '8140', role: 'ADMIN_EXPENSE', 'reason': 'لوازم مكتبية — admin expense' },
    { code: '8150', role: 'ADMIN_EXPENSE', 'reason': 'اتصالات — admin expense' },
    { code: '8160', role: 'ADMIN_EXPENSE', 'reason': 'أتعاب مهنية — admin expense' },
    { code: '8170', role: 'ADMIN_EXPENSE', 'reason': 'أتعاب قانونية — admin expense' },
    { code: '1320', role: 'PROJECT_WIP', 'reason': 'أعمال تحت التنفيذ — project WIP' },
    { code: '1610', role: 'CONTRACT_ASSET', 'reason': 'أصول عقود المشاريع — contract asset' },
    { code: '3610', role: 'CONTRACT_LIABILITY', 'reason': 'التزامات عقود المشاريع — contract liability' },
    { code: '1240', role: 'SUBCONTRACTOR_ADVANCE', 'reason': 'مقدمات للموردين — subcontractor advance' },
    { code: '3500', role: 'SUBCONTRACTOR_RETENTION_PAYABLE', 'reason': 'مبالغ محتجزة لدى الشركة — subcontractor retention' },
    { code: '7120', role: 'LABOR_COST', 'reason': 'تكاليف العمالة — labor cost' },
    { code: '5200', role: 'RETAINED_EARNINGS', 'reason': 'الأرباح المحتجزة — retained earnings' },
    { code: '6320', role: 'DELAY_PENALTY_REVENUE', 'reason': 'إيرادات غرامات — delay penalty revenue' },
  ];

  let assigned = 0;
  for (const a of directAssignments) {
    const acct = await db.account.findUnique({ where: { code: a.code } });
    if (!acct) {
      console.log(`[SKIP] ${a.code}: account not found`);
      continue;
    }
    if (acct.accountRole === a.role) {
      console.log(`[OK]   ${a.code} already has role ${a.role}`);
      continue;
    }
    await db.account.update({ where: { id: acct.id }, data: { accountRole: a.role } });
    console.log(`[DONE] ${a.code} (${acct.nameAr || acct.name}): ${acct.accountRole || 'null'} → ${a.role}`);
    assigned++;
  }

  // ── Group 2: Change 1130 from CASH to PETTY_CASH (1110 already covers CASH) ──
  console.log('\n--- PETTY_CASH conflict resolution ---');
  const cash1110 = await db.account.findUnique({ where: { code: '1110' }, select: { accountRole: true } });
  if (cash1110?.accountRole === 'CASH') {
    const acct1130 = await db.account.findUnique({ where: { code: '1130' } });
    if (acct1130 && acct1130.accountRole === 'CASH') {
      await db.account.update({ where: { id: acct1130.id }, data: { accountRole: 'PETTY_CASH' } });
      console.log(`[DONE] 1130 (${acct1130.nameAr || acct1130.name}): CASH → PETTY_CASH (1110 still covers CASH)`);
      assigned++;
    } else if (acct1130?.accountRole === 'PETTY_CASH') {
      console.log(`[OK]   1130 already has role PETTY_CASH`);
    }
  } else {
    console.log(`[SKIP] 1110 is not CASH (role=${cash1110?.accountRole}), cannot reassign 1130`);
  }

  // ── Group 3: Create missing accounts ──
  console.log('\n--- Creating missing accounts ---');
  const newAccounts: Array<{ code: string; name: string; nameAr: string; type: string; parentCode: string; role: string; description: string }> = [
    {
      code: '6340',
      name: 'Unbilled Revenue',
      nameAr: 'إيراد غير مفوتر',
      type: 'REVENUE',
      parentCode: '6300',
      role: 'UNBILLED_REVENUE',
      description: 'الإيراد المستحق غير المفوتر وفق IFRS 15',
    },
    {
      code: '6350',
      name: 'Foreign Exchange Gain',
      nameAr: 'أرباح فروقات العملة',
      type: 'REVENUE',
      parentCode: '6300',
      role: 'FX_GAIN',
      description: 'أرباح فروقات العملة الأجنبية وفق IAS 21',
    },
    {
      code: '8640',
      name: 'Foreign Exchange Loss',
      nameAr: 'خسائر فروقات العملة',
      type: 'EXPENSE',
      parentCode: '8600',
      role: 'FX_LOSS',
      description: 'خسائر فروقات العملة الأجنبية وفق IAS 21',
    },
    {
      code: '3120',
      name: 'VAT Settlement',
      nameAr: 'تسوية ضريبة القيمة المضافة',
      type: 'LIABILITY',
      parentCode: '3100',
      role: 'VAT_SETTLEMENT',
      description: 'حساب تسوية ضريبة القيمة المضافة المستحقة/المستردة',
    },
  ];

  let created = 0;
  for (const na of newAccounts) {
    const existing = await db.account.findUnique({ where: { code: na.code } });
    if (existing) {
      // If exists but no role, just assign the role
      if (!existing.accountRole) {
        await db.account.update({ where: { id: existing.id }, data: { accountRole: na.role } });
        console.log(`[DONE] ${na.code} existed, assigned role ${na.role}`);
        assigned++;
      } else if (existing.accountRole === na.role) {
        console.log(`[OK]   ${na.code} already has role ${na.role}`);
      } else {
        console.log(`[WARN] ${na.code} exists with role ${existing.accountRole} (wanted ${na.role})`);
      }
      continue;
    }
    const parent = await db.account.findUnique({ where: { code: na.parentCode } });
    if (!parent) {
      console.log(`[SKIP] ${na.code}: parent ${na.parentCode} not found`);
      continue;
    }
    await db.account.create({
      data: {
        code: na.code,
        name: na.name,
        nameAr: na.nameAr,
        type: na.type,
        parentId: parent.id,
        parentCode: parent.code,
        isActive: true,
        allowPosting: true,
        level: 2,
        accountRole: na.role,
        description: na.description,
        isSystem: true,
      },
    });
    console.log(`[DONE] Created ${na.code} (${na.nameAr}) type=${na.type} role=${na.role} parent=${na.parentCode}`);
    created++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Roles assigned to existing accounts: ${assigned}`);
  console.log(`New accounts created: ${created}`);
  console.log(`Total roles mapped: ${assigned + created}`);

  // Verify: re-check unmapped roles
  console.log('\n=== VERIFICATION: re-checking all 14 previously unmapped roles ===');
  const { AccountRole } = await import('../src/lib/account-roles');
  const allRoles = Object.values(AccountRole) as string[];
  let stillUnmapped = 0;
  for (const role of allRoles) {
    const count = await db.account.count({ where: { accountRole: role, isActive: true } });
    if (count === 0) {
      console.log(`  [STILL UNMAPPED] ${role}`);
      stillUnmapped++;
    }
  }
  console.log(`Total roles: ${allRoles.length}, still unmapped: ${stillUnmapped}`);

  await db.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
