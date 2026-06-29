import { db } from '../src/lib/db';
async function main() {
  // Create UNBILLED_REVENUE with code 6360 (6340 is taken by SERVICE_REVENUE)
  const parent6300 = await db.account.findUnique({ where: { code: '6300' } });
  const existing6360 = await db.account.findUnique({ where: { code: '6360' } });
  if (!existing6360 && parent6300) {
    await db.account.create({
      data: {
        code: '6360', name: 'Unbilled Revenue', nameAr: 'إيراد غير مفوتر',
        type: 'REVENUE', parentId: parent6300.id, parentCode: '6300',
        isActive: true, allowPosting: true, level: 2, accountRole: 'UNBILLED_REVENUE',
        description: 'الإيراد المستحق غير المفوتر وفق IFRS 15', isSystem: true,
      },
    });
    console.log('[DONE] Created 6360 (إيراد غير مفوتر) role=UNBILLED_REVENUE');
  } else if (existing6360 && !existing6360.accountRole) {
    await db.account.update({ where: { id: existing6360.id }, data: { accountRole: 'UNBILLED_REVENUE' } });
    console.log('[DONE] 6360 existed, assigned UNBILLED_REVENUE');
  } else if (existing6360) {
    console.log(`[WARN] 6360 exists with role ${existing6360.accountRole}`);
  }

  // Create VAT_SETTLEMENT with code 3130 (3120 is taken by VAT_INPUT)
  const parent3100 = await db.account.findUnique({ where: { code: '3100' } });
  const existing3130 = await db.account.findUnique({ where: { code: '3130' } });
  if (!existing3130 && parent3100) {
    await db.account.create({
      data: {
        code: '3130', name: 'VAT Settlement', nameAr: 'تسوية ضريبة القيمة المضافة',
        type: 'LIABILITY', parentId: parent3100.id, parentCode: '3100',
        isActive: true, allowPosting: true, level: 2, accountRole: 'VAT_SETTLEMENT',
        description: 'حساب تسوية ضريبة القيمة المضافة المستحقة/المستردة', isSystem: true,
      },
    });
    console.log('[DONE] Created 3130 (تسوية ضريبة القيمة المضافة) role=VAT_SETTLEMENT');
  } else if (existing3130 && !existing3130.accountRole) {
    await db.account.update({ where: { id: existing3130.id }, data: { accountRole: 'VAT_SETTLEMENT' } });
    console.log('[DONE] 3130 existed, assigned VAT_SETTLEMENT');
  } else if (existing3130) {
    console.log(`[WARN] 3130 exists with role ${existing3130.accountRole}`);
  }

  // Final verification
  const { AccountRole } = await import('../src/lib/account-roles');
  const allRoles = Object.values(AccountRole) as string[];
  let unmapped = 0;
  for (const role of allRoles) {
    const count = await db.account.count({ where: { accountRole: role, isActive: true } });
    if (count === 0) { console.log(`  [STILL UNMAPPED] ${role}`); unmapped++; }
  }
  console.log(`\nTotal roles: ${allRoles.length}, still unmapped: ${unmapped}`);
  await db.$disconnect();
}
main();
